# 🍲 Il Calderone

Ricettario web per un piccolo gruppo (≤ 30 persone): ricette private / di famiglia / condivise, **varianti** collegate
tra loro (grafo), **raccolte** con nome ("Cena di Natale") e diario **"Cosa ho mangiato?"**.
Piano completo, scelte tecniche e roadmap: [`PLAN.md`](PLAN.md).

## Avvio (sviluppo)

```bash
conda activate CLAUDE                     # oppure: pip install -e ".[dev]"
uvicorn app.main:create_app --factory --reload
# → http://127.0.0.1:8000 — il primo account registrato diventa amministratore
```

Importare il ricettario di partenza (le 9 ricette di `Ricette.xlsx`, con foto):

```bash
python -m app.cli import seed/recipes --owner <tuo-nome-utente> --visibility shared
```

Altri comandi: `python -m app.cli create-user NOME [--admin]`, `python -m app.cli export CARTELLA [--owner NOME]`.
Rigenerare il seed dal foglio: `python scripts/export_from_ricette.py --xlsx /percorso/Ricette.xlsx`.

Test: `python -m pytest -q`

## Configurazione (variabili d'ambiente)

| Variabile | Default | |
|---|---|---|
| `CALDERONE_DATA_DIR` | `./data` | database SQLite, foto (`media/`), chiave segreta: **è l'unica cartella da salvare** |
| `CALDERONE_DATABASE_URL` | `sqlite:///<data>/calderone.db` | anche `postgresql+psycopg://…` |
| `CALDERONE_ALLOW_SIGNUP` | `1` | `0` chiude le registrazioni (il primo account è sempre possibile) |
| `CALDERONE_HTTPS_ONLY` | `0` | `1` dietro HTTPS (cookie `Secure`) |
| `CALDERONE_MODULES` | `recipes,collections,meallog` | moduli attivi |
| `CALDERONE_SECRET_KEY` | generata in `data/secret_key` | |

## Struttura

```
app/core/        account, sessioni, CSRF, famiglie, registro dei moduli, layout
app/modules/     un pacchetto per funzionalità (recipes, collections, meallog, …) con modelli, rotte, template
seed/            ricette di partenza in formato calderone-recipe/1 + foto
scripts/         conversione da Ricette.xlsx
tests/
```
