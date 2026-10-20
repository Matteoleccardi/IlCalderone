# Deploying

The installation guide is **[install.md](install.md)**: requirements, `./deploy.sh`, then step-by-step examples for
Altervista and for a self-hosted Linux server (Apache or Nginx, HTTPS, data outside the web root), upgrades, backups
and troubleshooting. `deploy.sh` copies it into every release as `INSTALL.md`.

`./deploy.sh` (repository root) checks Node.js, builds the web app, syntax-checks the PHP and writes
`release/IlCalderone-<version>/` (+ `.zip`): exactly the files to upload, with an empty `data/` folder (or a copy
of your data with `--with-data`). It never touches `public/`. Run `./deploy.sh --help` for the options.

## Loading a menu or recipes made on your PC

The `menu-planner` and `recipe-importer` agents (see README) make JSON files on your PC. To load them, use the website,
not FTP. The import sets the owner and household and checks every recipe:

- a menu: **Menu → Importa / esporta menu** → *File* → choose *Di chi è* (personal or household) → **Importa**;
- recipes: **Ricette → Importa / esporta** → *File* → choose *Chi può vederla* → **Importa**.

To plan from the recipes on a hosted site, first download them (*Ricette → Importa / esporta → Le mie ricette*) and give
that file to the agent. Copying files straight into `data/menus/` or `data/recipes/` skips these checks and the
search index; avoid it.
