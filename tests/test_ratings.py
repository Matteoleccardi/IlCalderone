"""Ratings: two opinions per user (taste, ease), 0.5 steps, household averages of the members who voted."""
from conftest import PRIVATE, RECIPE, make_user
from test_api import household, uid


def test_rate_validate_and_clear(admin):
    r = admin.post("/recipes", RECIPE).json()
    url = f"/recipes/{r['id']}/rating"
    assert admin.get(url).json() == {"mine": {"taste": None, "ease": None}, "households": []}
    got = admin.put(url, {"taste": 4.5}).json()
    assert got["mine"] == {"taste": 4.5, "ease": None}
    assert admin.put(url, {"ease": 2}).json()["mine"] == {"taste": 4.5, "ease": 2}     # a missing key stays
    for bad in (0, 5.5, 3.3, "4", -1, True):
        assert admin.put(url, {"taste": bad}).json()["code"] == "rating_invalid", bad
    assert admin.put(url, {"taste": None}).json()["mine"] == {"taste": None, "ease": 2}
    assert admin.put(url, {"ease": None}).json()["mine"] == {"taste": None, "ease": None}
    assert admin.get("/ratings/summary").json() == {}                                  # nothing left: no file, no row


def test_household_average_counts_only_members_who_voted(admin, client):
    bob = make_user(admin, client, "bob")
    carl = make_user(admin, client, "carl")
    dina = make_user(admin, client, "dina")
    h = household(admin, "bob", "carl")            # admin, bob, carl; dina is outside
    r = admin.post("/recipes", RECIPE).json()
    url = f"/recipes/{r['id']}/rating"
    admin.put(url, {"taste": 5, "ease": 2})
    bob.put(url, {"taste": 3})                      # bob gives no ease opinion; carl votes nothing
    dina.put(url, {"taste": 1, "ease": 1})          # not in the household: never counted for it
    fam = admin.get(url).json()["households"]
    assert len(fam) == 1 and fam[0]["id"] == h["id"] and fam[0]["members"] == 3
    assert fam[0]["taste"] == {"avg": 4.0, "n": 2} and fam[0]["ease"] == {"avg": 2.0, "n": 1}
    assert carl.get(url).json()["mine"] == {"taste": None, "ease": None}               # carl sees the family, not who voted
    assert len(carl.get(url).json()["households"]) == 1
    assert dina.get(url).json()["households"] == []                                    # dina has no household
    s = admin.get("/ratings/summary").json()[r["id"]]
    assert s["mine"] == {"taste": 5, "ease": 2} and s["family"]["taste"] == {"avg": 4.0, "n": 2}


def test_cannot_rate_what_you_cannot_see_and_cleanup(admin, client):
    bob = make_user(admin, client, "bob")
    p = admin.post("/recipes", PRIVATE).json()
    assert bob.put(f"/recipes/{p['id']}/rating", {"taste": 4}).status_code == 404
    shared = admin.post("/recipes", RECIPE).json()
    assert bob.put(f"/recipes/{shared['id']}/rating", {"taste": 4}).status_code == 200   # anyone who sees it may rate
    assert (admin.get("/ratings/summary").json()).get(shared["id"]) is None             # admin is not in bob's family: no row
    assert shared["id"] in bob.get("/ratings/summary").json()
    admin.delete(f"/recipes/{shared['id']}")
    assert bob.get("/ratings/summary").json() == {}


def test_deleting_a_user_removes_their_votes(admin, client):
    bob = make_user(admin, client, "bob")
    r = admin.post("/recipes", RECIPE).json()
    bob.put(f"/recipes/{r['id']}/rating", {"taste": 4})
    admin.put(f"/recipes/{r['id']}/rating", {"taste": 2})
    assert admin.delete(f"/users/{uid(bob)}").status_code == 200
    assert admin.get("/ratings/summary").json()[r["id"]]["family"]["taste"] == {"avg": 2.0, "n": 1}
