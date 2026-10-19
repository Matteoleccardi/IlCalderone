from conftest import PRIVATE, RECIPE, make_user


def test_setup_login_and_csrf(client, admin):
    s = admin.get("/session").json()
    assert s["user"]["admin"] and not s["needs_setup"] and "recipes" in s["modules"]
    assert admin.post("/setup", {"username": "x", "password": "password123"}).status_code == 409
    anon = client()
    assert anon.get("/recipes").status_code == 401  # login required for everything
    assert anon.post("/login", {"username": "admin", "password": "wrong-pass"}).status_code == 401
    # a mutating request without the XSRF header is refused
    assert admin.http.post("/api/recipes", json=RECIPE).status_code == 403
    assert admin.post("/recipes", RECIPE).status_code == 200
    assert admin.post("/logout").status_code == 200
    assert admin.get("/recipes").status_code == 401


def test_login_throttling(client, admin):
    c = client()
    codes = [c.post("/login", {"username": "admin", "password": "nope-nope"}).status_code for _ in range(11)]
    assert codes[:10] == [401] * 10 and codes[10] == 429


def test_recipe_content_is_cleaned(admin):
    r = admin.post("/recipes", RECIPE).json()
    assert r["ingredients"][0] == {"name": "Pasta", "qty": 180.0, "unit": "g", "optional": False, "note": ""}
    assert r["ingredients"][1]["qty"] == 1.5
    assert r["ingredients"][2] == {"name": "Sale", "qty": None, "unit": "q.b.", "optional": False, "note": ""}
    # new recipes are visible to everyone by default; "source" from older files is read as "taken_from"
    assert r["tags"] == ["veloce", "pasta"] and r["visibility"] == "shared" and r["can_edit"]
    assert r["rev"] == 1 and r["taken_from"] == "" and "source" not in r
    assert admin.post("/recipes", {"title": "x", "source": "Nonna"}).json()["taken_from"] == "Nonna"
    bad = admin.post("/recipes", {"title": "  "})
    assert bad.status_code == 400 and bad.json()["code"] == "recipe_title_required"
    bad = admin.post("/recipes", {"title": "x", "ingredients": [{"name": "a", "qty": "tanto"}]}).json()
    assert bad["code"] == "qty_invalid" and bad["params"] == {"value": "tanto"} and "tanto" in bad["error"]


def test_visibility_and_owner_only_edit(admin, client):
    bob = make_user(admin, client, "bob")
    private = admin.post("/recipes", PRIVATE).json()
    shared = admin.post("/recipes", RECIPE | {"title": "Condivisa"}).json()
    titles = {r["title"] for r in bob.get("/recipes").json()}
    assert titles == {"Condivisa"}
    assert bob.get(f"/recipes/{private['id']}").status_code == 404
    assert bob.get(f"/recipes/{shared['id']}").json()["can_edit"] is False
    assert bob.put(f"/recipes/{shared['id']}", RECIPE).status_code == 403
    assert bob.delete(f"/recipes/{shared['id']}").status_code == 403
    assert admin.put(f"/recipes/{shared['id']}", RECIPE | {"title": "Nuovo titolo"}).json()["title"] == "Nuovo titolo"
    # search by ingredient, tag, title
    assert [r["title"] for r in admin.get("/recipes", params={"q": "pomodori"}).json()]
    assert len(admin.get("/recipes", params={"q": "veloce"}).json()) == 2
    assert admin.get("/recipes", params={"q": "zzz"}).json() == []


def test_households(admin, client):
    bob = make_user(admin, client, "bob")
    carl = make_user(admin, client, "carl")
    h = admin.post("/households", {"name": "Casa"}).json()
    assert bob.post(f"/households/{h['id']}/members", {"username": "carl"}).status_code == 403  # not a member
    assert admin.post(f"/households/{h['id']}/members", {"username": "bob"}).status_code == 200
    assert bob.post(f"/households/{h['id']}/members", {"username": "carl"}).status_code == 403  # members can't add
    r = admin.post("/recipes", RECIPE | {"visibility": "household", "household": h["id"]}).json()
    assert r["visibility"] == "household" and r["household"] == h["id"]
    assert bob.get(f"/recipes/{r['id']}").status_code == 200
    assert carl.get(f"/recipes/{r['id']}").status_code == 404
    # a household you are not in falls back to private
    r2 = carl.post("/recipes", RECIPE | {"visibility": "household", "household": h["id"]}).json()
    assert r2["visibility"] == "private"
    bob_id = bob.get("/session").json()["user"]["id"]
    assert bob.delete(f"/households/{h['id']}/members/{bob_id}").status_code == 200  # leave
    assert bob.get(f"/recipes/{r['id']}").status_code == 404


def test_variants_graph(admin, client):
    bob = make_user(admin, client, "bob")
    a = admin.post("/recipes", RECIPE | {"visibility": "shared"}).json()
    b = bob.post(f"/recipes/{a['id']}/variant").json()
    # the copy starts with the original's visibility; the title suffix comes from the client's language
    assert b["title"].endswith("(variante)") and b["visibility"] == "shared" and b["can_edit"]
    assert bob.post(f"/recipes/{a['id']}/variant", {"label": "variant"}).json()["title"].endswith("(variant)")
    b = bob.put(f"/recipes/{b['id']}", b | {"visibility": "private"}).json()
    assert b["parents"] == [{"id": a["id"], "kind": "variant", "note": ""}]
    assert b["parents_info"][0]["title"] == a["title"]
    # the private variant is not shown to the parent's owner
    assert len(admin.get(f"/recipes/{a['id']}").json()["children_info"]) == 1  # only the shared "(variant)" one
    assert b["id"] in [c["id"] for c in bob.get(f"/recipes/{a['id']}").json()["children_info"]]
    c = bob.post(f"/recipes/{b['id']}/variant").json()
    # a -> b -> c: making c a parent of b would close a cycle
    assert bob.post(f"/recipes/{b['id']}/parents", {"parent": c["id"]}).status_code == 409
    assert bob.post(f"/recipes/{c['id']}/parents", {"parent": a["id"], "kind": "inspired"}).status_code == 200
    assert admin.post(f"/recipes/{a['id']}/parents", {"parent": b["id"]}).status_code == 404  # b is private to bob
    # deleting the middle recipe keeps the variant
    assert bob.delete(f"/recipes/{b['id']}").status_code == 200
    cc = bob.get(f"/recipes/{c['id']}").json()
    assert [p["id"] for p in cc["parents"]] == [a["id"]]


def test_import_export_roundtrip(admin):
    a = admin.post("/recipes", PRIVATE).json()
    v = admin.post(f"/recipes/{a['id']}/variant").json()
    dump = admin.get("/recipes/export").json()
    assert {r["id"] for r in dump} == {a["id"], v["id"]} and "owner" not in dump[0]
    # import into a fresh account on the same server: ids exist -> skipped
    res = admin.post("/recipes/import", {"recipes": dump}).json()
    assert res["created"] == [] and [m["code"] for m in res["messages"]] == ["import_exists"] * 2
    # new ids: created, and the parent edge is restored in the second pass
    for r in dump:
        r["id"] = r["id"][::-1]
        for p in r["parents"]:
            p["id"] = p["id"][::-1]
    res = admin.post("/recipes/import", {"recipes": dump, "visibility": "shared"}).json()
    assert len(res["created"]) == 2, res
    child = admin.get(f"/recipes/{v['id'][::-1]}").json()
    assert child["parents"][0]["id"] == a["id"][::-1] and child["visibility"] == "shared"
    one = admin.get(f"/recipes/{a['id']}/json")
    assert one.json()["format"] == "calderone-recipe/1" and "attachment" in one.headers["content-disposition"]


PNG = bytes.fromhex("89504e470d0a1a0a0000000d4948445200000001000000010806000000"
                    "1f15c4890000000d49444154789c6360000002000154a24f5d0000000049454e44ae426082")


def test_photo_access(admin, client, server):
    bob = make_user(admin, client, "bob")
    r = admin.post("/recipes", PRIVATE).json()
    up = admin.post(f"/recipes/{r['id']}/photo", files={"photo": ("a.png", PNG, "image/png")})
    assert up.status_code == 200, up.text
    assert up.json()["photo"] == f"{r['id']}.png"
    assert admin.get(f"/recipes/{r['id']}/photo").content == PNG
    assert bob.get(f"/recipes/{r['id']}/photo").status_code == 404     # private recipe -> private photo
    assert client().get(f"/recipes/{r['id']}/photo").status_code == 401
    bad = admin.post(f"/recipes/{r['id']}/photo", files={"photo": ("a.png", b"not an image", "image/png")})
    assert bad.status_code == 415
    # the variant gets its own copy; export embeds the photo
    v = admin.post(f"/recipes/{r['id']}/variant").json()
    assert admin.get(f"/recipes/{v['id']}/photo").content == PNG
    assert admin.get(f"/recipes/{r['id']}/json").json()["photo_data"].startswith("data:image/png;base64,")
    admin.delete(f"/recipes/{r['id']}")
    assert not (server.data / "media" / f"{r['id']}.png").exists()


def test_collections(admin, client):
    bob = make_user(admin, client, "bob")
    r = admin.post("/recipes", RECIPE | {"visibility": "shared"}).json()
    c = admin.post("/collections", {"name": "Cena di Natale", "visibility": "shared"}).json()
    assert admin.post(f"/collections/{c['id']}/items", {"recipe": r["id"]}).json()["items"][0]["title"] == r["title"]
    assert admin.post(f"/collections/{c['id']}/items", {"recipe": r["id"]}).status_code == 200  # no duplicate
    lst = admin.get("/collections", params={"recipe": r["id"]}).json()
    assert lst[0]["count"] == 1 and lst[0]["contains"]
    assert bob.get(f"/collections/{c['id']}").json()["can_edit"] is False
    assert bob.post(f"/collections/{c['id']}/items", {"recipe": r["id"]}).status_code == 403
    admin.delete(f"/recipes/{r['id']}")
    assert admin.get(f"/collections/{c['id']}").json()["items"] == []
    priv = admin.post("/collections", {"name": "Segreta"}).json()
    assert bob.get(f"/collections/{priv['id']}").status_code == 404
    # household collections: every member can change them
    h = admin.post("/households", {"name": "Casa"}).json()
    admin.post(f"/households/{h['id']}/members", {"username": "bob"})
    fam = admin.post("/collections", {"name": "Di casa", "visibility": "household", "household": h["id"]}).json()
    r2 = admin.post("/recipes", RECIPE).json()
    assert {c["id"]: c["can_edit"] for c in bob.get("/collections").json()}[fam["id"]] is True
    assert bob.post(f"/collections/{fam['id']}/items", {"recipe": r2["id"]}).status_code == 200
    assert bob.put(f"/collections/{fam['id']}", {"name": "Di casa nostra"}).json()["name"] == "Di casa nostra"


def test_meallog(admin):
    r = admin.post("/recipes", RECIPE).json()
    e1 = admin.post("/meallog", {"recipe": r["id"], "day": "2026-10-01", "meal": "cena"}).json()
    admin.post("/meallog", {"recipe": r["id"]})
    admin.post("/meallog", {"text": "Pizza fuori", "meal": "pranzo"})
    assert admin.post("/meallog", {}).status_code == 400
    assert admin.post("/meallog", {"text": "x", "day": "2026-02-30"}).status_code == 400
    log = admin.get("/meallog", params={"days": 365}).json()
    assert len(log["entries"]) == 3 and log["top"][0]["count"] == 2
    assert admin.get(f"/meallog/recipe/{r['id']}").json()["count"] == 2
    assert admin.delete(f"/meallog/{e1['id']}").status_code == 200
    assert admin.get(f"/meallog/recipe/{r['id']}").json()["count"] == 1
    # deleting the recipe keeps the diary entry (title snapshot)
    admin.delete(f"/recipes/{r['id']}")
    entries = admin.get("/meallog", params={"days": 365}).json()["entries"]
    assert any(e["title"] == r["title"] and not e["recipe_available"] for e in entries)


def test_admin_only_and_selfcheck(admin, client):
    bob = make_user(admin, client, "bob")
    assert bob.get("/users").status_code == 403 and bob.get("/selfcheck").status_code == 403
    checks = admin.get("/selfcheck").json()
    assert all(c["ok"] for c in checks), checks
    assert {c["name"] for c in checks} >= {"php", "writable", "private"}
    assert admin.post("/users", {"username": "bob", "password": "password123"}).status_code == 409
    assert admin.post("/users", {"username": "x", "password": "password123"}).status_code == 400
    bob_id = bob.get("/session").json()["user"]["id"]
    assert admin.delete(f"/users/{bob_id}").status_code == 200
    assert bob.get("/recipes").status_code == 401


def test_data_folder_not_served(server, admin):
    import httpx
    for path in ["/data/users.json", "/data/", "/api/lib/Auth.php", "/api/config.php"]:
        assert httpx.get(server.base + path).status_code == 403, path
    assert httpx.get(server.base + "/api/nope").status_code == 404


def household(admin, *members):
    h = admin.post("/households", {"name": "Casa"}).json()
    for m in members:
        assert admin.post(f"/households/{h['id']}/members", {"username": m}).status_code == 200
    return h


def uid(c):
    return c.get("/session").json()["user"]["id"]


def test_household_editing_and_history(admin, client, server):
    bob = make_user(admin, client, "bob")
    carl = make_user(admin, client, "carl")
    h = household(admin, "bob")
    r = admin.post("/recipes", RECIPE | {"visibility": "household", "household": h["id"]}).json()
    assert bob.get(f"/recipes/{r['id']}").json()["can_edit"] is True
    # a member edits the content in place; visibility stays the owner's choice
    e = bob.put(f"/recipes/{r['id']}", RECIPE | {"title": "Pasta di Bob", "visibility": "shared"}).json()
    assert e["title"] == "Pasta di Bob" and e["visibility"] == "household" and e["rev"] == 2
    assert e["updated_by_name"] == "bob" and e["owner_name"] == "Admin" and e["is_owner"] is False
    assert bob.put(f"/recipes/{r['id']}", e).json()["rev"] == 2          # nothing changed: no new version
    assert bob.delete(f"/recipes/{r['id']}").json()["code"] == "recipe_delete_denied"
    assert carl.put(f"/recipes/{r['id']}", RECIPE).status_code == 404
    shared = admin.post("/recipes", RECIPE).json()
    assert bob.put(f"/recipes/{shared['id']}", RECIPE).json()["code"] == "recipe_edit_denied"
    # history: newest first, with what each version changed
    hist = admin.get(f"/recipes/{r['id']}/history").json()
    assert [(x["rev"], x["current"]) for x in hist] == [(2, True), (1, False)]
    assert hist[0]["changes"] == ["title"] and hist[0]["by_name"] == "bob" and hist[1]["first"]
    assert admin.get(f"/recipes/{r['id']}/history/1").json()["title"] == RECIPE["title"]
    assert admin.get(f"/recipes/{r['id']}/history/9").status_code == 404
    back = bob.post(f"/recipes/{r['id']}/history/1/restore").json()
    assert back["title"] == RECIPE["title"] and back["rev"] == 3
    assert len(admin.get(f"/recipes/{r['id']}/history").json()) == 3
    assert carl.get(f"/recipes/{r['id']}/history").status_code == 404
    admin.delete(f"/recipes/{r['id']}")
    assert not (server.data / "history" / r["id"]).exists()


def test_diary_is_visible_in_the_household(admin, client):
    bob = make_user(admin, client, "bob")
    carl = make_user(admin, client, "carl")
    household(admin, "bob")
    e = bob.post("/meallog", {"text": "Risotto", "meal": "pranzo"}).json()
    admin.post("/meallog", {"text": "Zuppa"})
    seen = admin.get("/meallog", params={"user": uid(bob)}).json()
    assert [x["title"] for x in seen["entries"]] == ["Risotto"] and seen["entries"][0]["mine"] is False
    assert {p["name"] for p in seen["people"]} == {"Admin", "bob"}
    both = admin.get("/meallog", params={"user": "all"}).json()["entries"]
    assert {(x["title"], x["user_name"]) for x in both} == {("Risotto", "bob"), ("Zuppa", "Admin")}
    assert carl.get("/meallog", params={"user": uid(bob)}).json()["code"] == "diary_hidden"
    admin.delete(f"/meallog/{e['id']}")  # someone else's entry: nothing happens
    assert len(bob.get("/meallog").json()["entries"]) == 1


def test_menus_and_plan(admin, client):
    bob = make_user(admin, client, "bob")
    carl = make_user(admin, client, "carl")
    h = household(admin, "bob")
    a = admin.post("/recipes", RECIPE).json()
    m = admin.post("/menus", {"name": "Autunno", "start": "2026-10-14", "weeks": 2, "meals": ["pranzo", "cena"], "items": [
        {"week": 1, "day": 1, "meal": "cena", "recipe": a["id"], "servings": 4},
        {"week": 2, "day": 3, "meal": "pranzo", "text": "Pizza"},
        {"week": 3, "day": 1, "meal": "cena", "text": "out of the cycle"},
        {"week": 1, "day": 2, "meal": "colazione", "text": "meal not in the menu"},
    ]}).json()
    assert m["start"] == "2026-10-12" and m["visibility"] == "private" and len(m["items"]) == 2
    plan = admin.get("/menus/plan", params={"from": "2026-10-12", "days": 15}).json()["days"]
    assert plan[0]["meals"][0]["options"][0]["title"] == RECIPE["title"]
    assert plan[9]["meals"] == [{"meal": "pranzo", "options": [plan[9]["meals"][0]["options"][0]]}]
    assert plan[9]["meals"][0]["options"][0]["text"] == "Pizza"
    assert plan[14]["meals"][0]["options"][0]["recipe"] == a["id"]     # the cycle repeats
    assert plan[1]["meals"] == []
    # a household menu: bob's private recipe would be hidden from the others
    mine = bob.post("/recipes", PRIVATE).json()
    hm = {"name": "Di casa", "visibility": "household", "household": h["id"], "start": "2026-10-12", "weeks": 1}
    bad = bob.post("/menus", hm | {"items": [{"week": 1, "day": 1, "meal": "cena", "recipe": mine["id"]}]}).json()
    assert bad["code"] == "menu_recipe_hidden"
    hm = bob.post("/menus", hm | {"items": [{"week": 1, "day": 1, "meal": "cena", "text": "Minestrone"}]}).json()
    assert admin.get(f"/menus/{hm['id']}").json()["can_edit"] is True
    # both menus are active on Monday: both options are shown
    opts = admin.get("/menus/plan", params={"from": "2026-10-12", "days": 1}).json()["days"][0]["meals"][0]["options"]
    assert {(o["menu_name"], o["space"]) for o in opts} == {("Autunno", "me"), ("Di casa", h["id"])}
    assert carl.get(f"/menus/{hm['id']}").status_code == 404
    assert admin.put(f"/menus/{m['id']}", {"season": {"from": "12-01", "to": "02-28"}}).json()["season"] == {"from": "12-01", "to": "02-28"}
    assert admin.get("/menus/plan", params={"from": "2026-10-12", "days": 1}).json()["days"][0]["meals"][0]["options"][0]["menu_name"] == "Di casa"
    winter = admin.get("/menus/plan", params={"from": "2027-01-04", "days": 1}).json()["days"][0]["meals"][0]["options"]
    assert "Autunno" in {o["menu_name"] for o in winter}
    admin.delete(f"/recipes/{a['id']}")
    assert len(admin.get(f"/menus/{m['id']}").json()["items"]) == 1


def test_add_one_dish_to_a_menu(admin, client):
    bob = make_user(admin, client, "bob")
    carl = make_user(admin, client, "carl")
    h = household(admin, "bob")
    a = admin.post("/recipes", RECIPE).json()
    mine = bob.post("/recipes", PRIVATE).json()
    m = bob.post("/menus", {"name": "Di casa", "visibility": "household", "household": h["id"], "weeks": 2,
                            "items": [{"week": 1, "day": 1, "meal": "cena", "text": "Minestrone"}]}).json()
    # a household member adds a dish; the slot keeps what was there
    r = admin.post(f"/menus/{m['id']}/items", {"week": 2, "day": 5, "meal": "cena", "recipe": a["id"], "servings": 3}).json()
    assert [(i["week"], i["day"], i.get("title") or i["text"], i["servings"]) for i in r["items"]] == \
        [(1, 1, "Minestrone", None), (2, 5, RECIPE["title"], 3)]
    r = admin.post(f"/menus/{m['id']}/items", {"week": 2, "day": 5, "meal": "cena", "text": "Insalata"}).json()
    assert len(r["items"]) == 3
    # refused: a slot outside the menu, nothing to add, a recipe not everyone can see, someone outside the household
    assert admin.post(f"/menus/{m['id']}/items", {"week": 3, "day": 1, "meal": "cena", "text": "x"}).json()["code"] == "menu_slot_invalid"
    assert admin.post(f"/menus/{m['id']}/items", {"week": 1, "day": 1, "meal": "pranzo", "text": "x"}).json()["code"] == "menu_slot_invalid"
    assert admin.post(f"/menus/{m['id']}/items", {"week": 1, "day": 1, "meal": "cena"}).json()["code"] == "menu_dish_required"
    assert bob.post(f"/menus/{m['id']}/items", {"week": 1, "day": 1, "meal": "cena", "recipe": mine["id"]}).json()["code"] == "menu_recipe_hidden"
    assert carl.post(f"/menus/{m['id']}/items", {"week": 1, "day": 1, "meal": "cena", "text": "x"}).status_code == 404
    assert len(bob.get(f"/menus/{m['id']}").json()["items"]) == 3


def test_shopping_list_pantry_and_moving(admin, client):
    bob = make_user(admin, client, "bob")
    carl = make_user(admin, client, "carl")
    h = household(admin, "bob")
    p = admin.post("/recipes", RECIPE).json()          # for 2: pasta 180 g, pomodori 1.5 p., sale q.b.
    week = {"start": "2026-10-12", "weeks": 1, "meals": ["cena"]}
    admin.post("/menus", week | {"name": "Mio", "items": [
        {"week": 1, "day": 1, "meal": "cena", "recipe": p["id"], "servings": 4},
        {"week": 1, "day": 2, "meal": "cena", "recipe": p["id"]}]})
    bob.post("/menus", week | {"name": "Casa", "visibility": "household", "household": h["id"],
                               "items": [{"week": 1, "day": 1, "meal": "cena", "recipe": p["id"]}]})

    def items(c, space="me"):
        res = c.get("/shopping", params={"space": space, "week": "2026-10-15"}).json()
        assert res["week"] == "2026-10-12"
        return {i["name"]: i for i in res["items"]}, res

    mine, res = items(admin)
    assert mine["Pasta"]["qty"] == 540 and mine["Pomodori"]["qty"] == 4.5
    assert mine["Sale"]["qty"] is None and mine["Sale"]["unit"] == "q.b."
    assert len(mine["Pasta"]["sources"]) == 2 and [s["id"] for s in res["spaces"]] == ["me", h["id"]]
    # pantry: never on the list
    assert admin.post("/pantry", {"space": "me", "name": "sale"}).json() == ["sale"]
    mine, _ = items(admin)
    assert "Sale" not in mine
    pasta = mine["Pasta"]["key"]
    w = {"week": "2026-10-12"}
    admin.post("/shopping/check", w | {"space": "me", "key": pasta, "checked": True})
    admin.post("/shopping/extra", w | {"space": "me", "name": "Detersivo"})
    mine, _ = items(admin)
    assert mine["Pasta"]["checked"] and mine["Detersivo"]["extra"]
    home, _ = items(bob, h["id"])
    assert home["Pasta"]["qty"] == 180 and home["Sale"]["unit"] == "q.b."
    # move to the household list: pasta stays live, the extra item is handed over
    res = admin.post("/shopping/move", w | {"household": h["id"], "keys": [pasta, mine["Detersivo"]["key"]]}).json()
    assert "Pasta" not in {i["name"] for i in res["items"]} and res["moved"][0]["name"] == "Pasta"
    home, _ = items(bob, h["id"])
    assert home["Pasta"]["qty"] == 720 and home["Pasta"]["from"] == ["Admin"]
    assert home["Detersivo"]["extra"] and home["Detersivo"]["from"] == ["Admin"]
    assert bob.post("/pantry", {"space": h["id"], "name": "Pomodori"}).status_code == 200
    home, _ = items(bob, h["id"])
    assert "Pomodori" not in home
    admin.post("/shopping/unmove", w | {"keys": [pasta]})
    home, _ = items(bob, h["id"])
    assert home["Pasta"]["qty"] == 180
    assert carl.get("/shopping", params={"space": h["id"]}).json()["code"] == "household_not_found"
    res = admin.post("/shopping/move", w | {"household": h["id"], "all": True}).json()
    assert res["items"] == [] and {i["name"] for i in res["moved"]} == {"Pasta", "Pomodori"}
    assert admin.post("/shopping/move", w | {"household": "", "all": True}).json()["code"] == "household_required"


def test_language_preference(admin):
    assert admin.get("/session").json()["user"]["lang"] is None
    assert admin.put("/me", {"lang": "de"}).json()["lang"] == "de"
    assert admin.get("/session").json()["user"]["lang"] == "de"
    assert admin.put("/me", {"lang": "klingon"}).json()["lang"] is None
    assert admin.put("/me", {"display": "Boss"}).json()["display"] == "Boss"
