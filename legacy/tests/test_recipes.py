import json
import re

import pytest

from app.modules.recipes import service as svc
from tests.conftest import csrf

ING = "Zucca (pulita) | 300 | g\nCipolla | 1 | p. | facoltativo\nMiso | 1/3 | tbs\nSale | q.b."
STEPS = "Preparate il soffritto\nTritate la cipolla.\n\nCuocete la zucca\nAggiungete la zucca."


def create(c, title="Zuppa", visibility="private", household_id=""):
    r = c.post("/ricette/nuova", data=dict(title=title, servings="4", ingredients_text=ING, steps_text=STEPS,
                                           visibility=visibility, household_id=household_id, csrf=csrf(c, "/ricette/nuova")),
               follow_redirects=False)
    assert r.status_code == 303, r.text
    return r.headers["location"].rsplit("/", 1)[1]


def test_parsers():
    ing = svc.parse_ingredients(ING)
    assert ing[0] == dict(name="Zucca (pulita)", qty=300.0, unit="g", optional=False, note="")
    assert ing[1]["optional"] and ing[2]["qty"] == pytest.approx(1 / 3) and ing[3]["qty"] is None and ing[3]["unit"] == "q.b."
    with pytest.raises(ValueError):
        svc.parse_ingredients("Sale | tanto")
    steps = svc.parse_steps("1/2 Primo\nTesto uno\n\nSolo testo")
    assert steps == [dict(title="Primo", text="Testo uno"), dict(title="", text="Solo testo")]
    assert svc.fmt_qty(0.3333, "tbs") == "0.33 tbs" and svc.fmt_qty(None, "q.b.") == "q.b." and svc.fmt_qty(2.0) == "2"


def test_create_view_scale_and_privacy(make_client):
    anna, bruno = make_client("anna"), make_client("bruno")
    rid = create(anna)
    page = anna.get(f"/ricette/{rid}?porzioni=8").text
    assert "600 g" in page and "0.67 tbs" in page                      # scaled ×2
    assert bruno.get(f"/ricette/{rid}").status_code == 404             # private
    shared = create(anna, "Condivisa", visibility="shared")
    assert bruno.get(f"/ricette/{shared}").status_code == 200
    assert bruno.get(f"/ricette/{shared}/modifica").status_code == 403  # owner only


def test_household_visibility(make_client):
    anna, bruno, carla = make_client("anna"), make_client("bruno"), make_client("carla")
    anna.post("/famiglie", data=dict(name="Casa", csrf=csrf(anna, "/famiglie")))
    hid = re.search(r'/famiglie/(\d+)/membri"', anna.get("/famiglie").text).group(1)
    anna.post(f"/famiglie/{hid}/membri", data=dict(username="bruno", csrf=csrf(anna, "/famiglie")))
    rid = create(anna, "Di casa", visibility="household", household_id=hid)
    assert bruno.get(f"/ricette/{rid}").status_code == 200
    assert carla.get(f"/ricette/{rid}").status_code == 404


def test_variant_graph_and_cycles(app, make_client):
    anna, bruno = make_client("anna"), make_client("bruno")
    rid = create(anna, "Originale", visibility="shared")
    r = bruno.post(f"/ricette/{rid}/variante", data=dict(csrf=csrf(bruno, f"/ricette/{rid}")), follow_redirects=False)
    child = r.headers["location"].split("/")[2]
    assert "Deriva da" in bruno.get(f"/ricette/{child}").text
    assert bruno.get(f"/ricette/{child}/modifica").status_code == 200   # bruno owns the variant
    with app.state.sessionmaker() as db:
        with pytest.raises(ValueError):
            svc.add_relation(db, child, rid)                            # would close a cycle
    anna.post(f"/ricette/{rid}/elimina", data=dict(csrf=csrf(anna, f"/ricette/{rid}")))
    assert bruno.get(f"/ricette/{child}").status_code == 200            # variants survive their parent


def test_json_roundtrip_is_idempotent(make_client):
    anna = make_client("anna")
    rid = create(anna, "Esportata")
    data = anna.get(f"/ricette/{rid}/json").json()
    assert data["format"] == "calderone-recipe/1" and data["ingredients"][2]["qty"] == pytest.approx(1 / 3)
    bruno = make_client("bruno")
    files = [("files", ("r.json", json.dumps({**data, "id": "x" * 32}), "application/json"))]
    page = bruno.post("/ricette/importa", data=dict(csrf=csrf(bruno, "/ricette/importa")), files=files).text
    assert "<strong>1</strong> ricette importate" in page
    again = bruno.post("/ricette/importa", data=dict(csrf=csrf(bruno, "/ricette/importa")), files=files).text
    assert "già presente" in again


def test_collections_and_meallog(make_client):
    anna = make_client("anna")
    rid = create(anna, "Cena")
    r = anna.post("/raccolte", data=dict(name="Cena di Natale", csrf=csrf(anna, "/raccolte")), follow_redirects=False)
    cid = r.headers["location"].rsplit("/", 1)[1]
    anna.post("/raccolte/aggiungi", data=dict(cid=cid, recipe_id=rid, csrf=csrf(anna, "/raccolte")))
    assert "Cena di Natale" in anna.get(f"/ricette/{rid}").text
    anna.post("/diario/aggiungi", data=dict(recipe_id=rid, meal="cena", csrf=csrf(anna, "/diario")))
    anna.post("/diario/aggiungi", data=dict(text="Pizza da Gino", meal="pranzo", csrf=csrf(anna, "/diario")))
    diary = anna.get("/diario").text
    assert "Pizza da Gino" in diary and "Le più mangiate" in diary
    assert "mangiata 1 volta" in anna.get(f"/ricette/{rid}").text
