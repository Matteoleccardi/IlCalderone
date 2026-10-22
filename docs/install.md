# Installing Il Calderone

Il Calderone is a recipe, menu and shopping-list web app for a family or a small group. It runs on almost any
web host with PHP. It needs **no database**: everything is stored as JSON files in one `data/` folder.

This guide has three parts:
1. **[General installation](#1-general-installation)**, which works on any host.
2. **[Example A: Altervista](#2-example-a-altervista-free-hosting)**, free Italian hosting with FTP only.
3. **[Example B: your own Linux server](#3-example-b-your-own-linux-server)**, with Apache, HTTPS and the data kept
   outside the web root.

After those: [first steps in the app](#4-after-installing-first-steps), [upgrades](#5-upgrading),
[backups](#6-backups), [troubleshooting](#7-troubleshooting).

---

## Requirements

### The server
| | Needed | Notes |
|---|---|---|
| PHP | **8.1 or newer** | Uses the standard extensions `json`, `session` and `fileinfo`, which almost every host has. **No** Composer, database, `mbstring` or GD is needed. |
| Web server | Apache (or LiteSpeed) with `.htaccess` and `mod_rewrite`, or Nginx | Most shared PHP hosts are Apache. For Nginx, see [3.6](#36-nginx-instead-of-apache). |
| Disk | a few MB, plus about 150–300 KB per recipe photo | |
| Writable folder | `data/`, or a folder of your choice | PHP must be able to create files in it. |
| HTTPS | strongly recommended | Needed for safe logins, and browsers only allow timer notifications on HTTPS. |
| Python, Node.js, a shell, cron | **not needed** | |

### The computer you build on (only to run `deploy.sh`)
| | Needed |
|---|---|
| bash | Linux, macOS, or Windows with WSL or Git Bash |
| Node.js | **22.22.3+ or 24.15+**, or 26+. npm comes with it. Get it from [nodejs.org](https://nodejs.org) or with `nvm install 24`. |
| Internet | the first run downloads the build tools (about 300 MB into `web/node_modules`) |
| `zip` | optional, to also get a zip of the release |
| PHP | optional, to syntax-check the API before uploading |

### The people using it
Any recent browser: Chrome, Firefox, Safari or Edge, on a phone or a computer. The app is designed for phones first.

---

## 1. General installation

### 1.1 Build the release
```bash
git clone https://github.com/Matteoleccardi/IlCalderone.git
cd IlCalderone
./deploy.sh
```

This writes **`release/IlCalderone-<version>/`**, plus a `.zip` of the same folder:

```
index.html, *.js, *.css, favicon.svg, sw.js   the web app
.htaccess                                     routing rules, and blocks web access to data/
api/                                          the PHP back end
data/                                         empty except .htaccess and index.php: your data goes here
INSTALL.md, BUILD-INFO.txt                    this guide, and what was built
```

Useful options (run `./deploy.sh --help` for all):

| Option | When |
|---|---|
| `--base-href /ricette/` | The site lives in a sub-folder (`https://example.org/ricette/`) and not at the root of a domain. |
| `--data-dir /var/lib/ilcalderone` | On your own server: the data is stored outside the web root. This writes `api/config.local.php`. |
| `--with-data` | Moves an existing installation (default: `public/data`) to the server. It copies accounts, recipes, photos, menus and diaries. **The result contains private data: don't share it.** |
| `--test` | Runs the front-end tests before building. |

### 1.2 Upload
Copy the **contents** of the release folder to the web root of your site, or to the sub-folder you built for.
- **Include the hidden files** `.htaccess` and `data/.htaccess`. They make the app's addresses work, and they stop
  anyone from downloading your data.
- Don't upload `release/` itself as a folder. `index.html` must sit directly at the root of the site, or of the
  sub-folder.

### 1.3 Make the data folder writable
PHP must be able to write to `data/`, or to your `--data-dir`.
- **Shared hosting:** permissions are usually already right. If not, set the folder to `755`, or `775`, with the FTP
  client.
- **Your own server:** make the web server's user the owner of the folder (see [3.4](#34-data-folder-outside-the-web-root)).

### 1.4 Open the site
1. Go to `https://<your site>/`. The **first visit** asks you to create the **administrator account**.
   - Do this right after uploading: until an admin exists, anyone who opens the site could create one.
2. Open **Amministrazione → Controllo installazione** (Administration → Installation check). Every line should be
   green:

| Check | Expected |
|---|---|
| Versione PHP | 8.1 or newer |
| Cartella dati scrivibile | the folder path |
| Cartella dati non pubblica | **HTTP 403** on `…/data/users.json`, or "fuori dalla cartella web" (outside the web folder) |
| GD | either value is fine: photos are shrunk in the browser |

3. **Check that the data is private.** Open `https://<your site>/data/users.json` in the browser.
   - It **must** show an error page (403 Forbidden).
   - If it shows a file, the host is ignoring `.htaccess` and your data is public. **Stop, don't add data**, and see
     [troubleshooting](#7-troubleshooting).
   - The installation check does this test by itself, but some hosts don't let a site call itself. If the check says
     "impossibile verificare" (cannot check), do it by hand as described here.

Then continue with [first steps](#4-after-installing-first-steps).

---

## 2. Example A: Altervista (free hosting)

[Altervista](https://it.altervista.org) gives you PHP, FTP and a free HTTPS certificate on `https://<name>.altervista.org`.
That's all Il Calderone needs. There is no shell, so everything goes through the control panel and FTP.

### 2.1 Create and set up the site
1. Sign up and create a site; its name becomes `<name>.altervista.org`.
2. In the **control panel**:
   - **PHP version:** Altervista stores it as a line in the site's `.htaccess`, and uploading Il Calderone's
     `.htaccess` replaces that file. So the version is set by the build instead (`--altervista`, next step). The
     panel setting no longer matters.
   - **HTTPS:** turn on the free certificate. It can take a few minutes to become active.
3. Note your **FTP details**, shown in the panel:
   - host `ftp.<name>.altervista.org`;
   - user `<name>`;
   - your account's password.

### 2.2 Build
On your computer:
```bash
./deploy.sh --altervista
```
`--altervista` adds `AddHandler av-php84 .php` at the top of `.htaccess`, which makes Altervista run PHP 8.4. Without it
the site runs Altervista's default (8.0 at the time of writing) and the API answers *"Il Calderone needs PHP 8.1 or
newer"*. For another version, use e.g. `--php-handler av-php83`.
If you want the app in a sub-folder (e.g. `https://<name>.altervista.org/ricette/`), use
`./deploy.sh --base-href /ricette/` and upload into that folder in the next step.

`--data-dir` can't be used on Altervista, because you can only write inside your site. The default `data/` folder,
protected by `.htaccess`, is the right choice.

### 2.3 Upload with FileZilla
1. Connect with the FTP details above. Use *FTP over explicit TLS* if offered.
2. **Server → Force showing hidden files**. Without this, the `.htaccess` files are skipped.
3. On the server side, open the site root, usually `/`. **Delete Altervista's sample `index.html`/`index.php`**, if
   there is one.
4. On the local side, open `release/IlCalderone-<version>/`, select **everything inside it** (including `.htaccess`)
   and upload.
5. Right-click `data/` on the server → **File permissions** → `755`. If the installation check later says the folder
   is not writable, use `775`.

### 2.4 Finish
- Do [1.4](#14-open-the-site) at `https://<name>.altervista.org`: create the admin account, run the installation check
  and test `/data/users.json`.
- On Altervista's free plan the site usually can't call itself, so expect "impossibile verificare" (cannot check) on
  the privacy line. **The manual test of `/data/users.json` is the one that counts.**

### 2.4b Upgrading with the script
After the first install, `./deploy-altervista.sh` upgrades the site from your computer and replaces **only the program**.
`data/` and `api/config.local.php` (and any other `*.local.php` in `api/`) are never uploaded, overwritten or deleted,
so accounts, sessions, recipes, photos and your settings stay as they are.

It needs `lftp` and `curl` (`sudo dnf install lftp`, or `sudo apt install lftp`). Altervista offers plain FTP only (no
SFTP, no rsync).
```bash
./deploy-altervista.sh              # builds, then only SHOWS what would change (dry run)
./deploy-altervista.sh --apply      # does it
```
- It asks for the FTP host (`ftp.<name>.altervista.org`; just `<name>` is enough), user and password every time. Nothing is stored; the
  password is never put on a command line. It tries an encrypted (explicit TLS) connection first; if the server
  refuses, it asks you to type `plain` before sending anything unencrypted.
- With `--apply` it first saves `api/config.local.php` and `data/` (without sessions and photos; `--backup-media` adds
  the photos) to `backups/altervista-<date>/` (git-ignored, owner-only), and stops if that fails.
- The order keeps the site usable: all program files first, then `index.html`, `sw.js` and `manifest.webmanifest`,
  then the outdated `chunk-*.js`, `main-*.js`, `styles-*.css` files and files that are gone from `api/`, `logos/` and
  `media/` are removed. Read the dry run first: it lists what would be deleted.
- Before sending anything it checks that your FTP login can write to the site folder and `api/` (a temporary empty file is sent and removed) and stops with the fix if it cannot.
- Afterwards it opens `<site>/api/session` to check the new version is live, and `<site>/data/users.json`, which must
  NOT be readable (a 200 there is reported as DANGER).
- Options: `--host`, `--user`, `--remote-dir` (with `--base-href` for a sub-folder), `--url`, `--no-build`,
  `--no-backup`, `--insecure-tls`, `--yes` (skips the "type upload" question; the password is still asked).
- Limits: Altervista has no shell, so migration scripts in `api/bin/` can't run there. When the minor version changes, the
  script reminds you to read the release notes. If you edited `.htaccess` by hand on the server, the upload replaces it.
- The first install (empty server folder) still works with the script, which then also creates the empty `data/`.
  Create the admin account in the browser afterwards.

> **Version 0.3.x and ratings:** if your server's `api/config.local.php` sets its own `modules` list, add `'ratings'` to it, or the star ratings stay hidden. Without a `modules` line nothing is needed.

### 2.5 Bringing recipes and menus from a local installation
Use the app's own import, not FTP. It sets the owners and checks every file:
1. **On the local site, export:**
   - **Ricette → Importa / esporta → Le mie ricette:** recipes with photos and icons.
   - **Menu → Importa / esporta menu → Esporta tutti i menu**.
2. **On Altervista, import:**
   - the recipe file into **Ricette → Importa / esporta**;
   - the menu file into **Menu → Importa / esporta menu**.
   - You can pick many files at once. Large uploads are sent in parts automatically.

To move *everything* instead, accounts and diaries included, build with `./deploy.sh --with-data`. Upload `data/`
along with the rest, and log in with your old accounts.

### 2.6 Altervista notes
- **Disk space:** data and photos count against your quota.
- **Backups:** download the `data/` folder with FileZilla from time to time (see [6](#6-backups)).
- **Upgrades:** see [5](#5-upgrading). Never overwrite `data/` on the server.

---

## 3. Example B: your own Linux server

This example uses Apache and PHP-FPM, keeps the data outside the web root and adds HTTPS with Let's Encrypt.

The paths used:
- **app:** `/srv/ilcalderone`;
- **data:** `/var/lib/ilcalderone`;
- **domain:** `ricette.example.org`.

The commands are given for **Debian/Ubuntu** and **Fedora/RHEL**.

### 3.1 Install Apache and PHP
```bash
# Debian / Ubuntu
sudo apt install apache2 php-fpm php-curl
sudo a2enmod rewrite headers proxy_fcgi setenvif
sudo a2enconf "$(ls /etc/apache2/conf-available | grep -m1 -o 'php.*-fpm')"
sudo systemctl restart apache2

# Fedora / RHEL / Rocky
sudo dnf install httpd php php-fpm php-cli
sudo systemctl enable --now httpd php-fpm
sudo firewall-cmd --permanent --add-service=http --add-service=https && sudo firewall-cmd --reload
```
Check the version with `php -v`: it must be 8.1 or newer.
- `php-curl` is optional. It lets the installation check test the data folder by itself.

### 3.2 Build with the data folder outside the web root
On your computer, or on the server if it has Node.js:
```bash
./deploy.sh --data-dir /var/lib/ilcalderone
```
`api/config.local.php` then tells the app where the data is. The `data/` folder in the release stays empty and unused.

### 3.3 Copy the release to the server
```bash
rsync -av release/IlCalderone-<version>/ user@server:/tmp/ilcalderone/
ssh user@server 'sudo mkdir -p /srv/ilcalderone && sudo rsync -a /tmp/ilcalderone/ /srv/ilcalderone/'
```

### 3.4 Data folder outside the web root
The web server's user is `www-data` on Debian/Ubuntu and `apache` on Fedora/RHEL.
```bash
sudo mkdir -p /var/lib/ilcalderone
sudo chown www-data: /var/lib/ilcalderone      # Fedora: sudo chown apache: /var/lib/ilcalderone
sudo chmod 750 /var/lib/ilcalderone
```
**Fedora/RHEL with SELinux** must also allow PHP to write there, otherwise you get "not writable" even with the
right owner:
```bash
sudo semanage fcontext -a -t httpd_sys_rw_content_t '/var/lib/ilcalderone(/.*)?'
sudo restorecon -Rv /var/lib/ilcalderone
sudo restorecon -Rv /srv/ilcalderone
```

### 3.5 Apache site
Create `/etc/apache2/sites-available/ilcalderone.conf` (Debian) or `/etc/httpd/conf.d/ilcalderone.conf` (Fedora):
```apache
<VirtualHost *:80>
    ServerName ricette.example.org
    DocumentRoot /srv/ilcalderone
    <Directory /srv/ilcalderone>
        AllowOverride All
        Require all granted
    </Directory>
</VirtualHost>
```
Turn it on:
```bash
sudo a2ensite ilcalderone && sudo systemctl reload apache2     # Debian / Ubuntu
sudo systemctl reload httpd                                     # Fedora
```
**HTTPS** with Let's Encrypt. The domain must already point to the server.
```bash
sudo apt install certbot python3-certbot-apache   # Fedora: sudo dnf install certbot python3-certbot-apache
sudo certbot --apache -d ricette.example.org
```
Now do [1.4](#14-open-the-site). The privacy line of the installation check should say **"fuori dalla cartella web"**
(outside the web folder).

### 3.6 Nginx instead of Apache
Nginx ignores `.htaccess`, so the same rules go into the server block:
```nginx
server {
    server_name ricette.example.org;
    root /srv/ilcalderone;
    index index.html;
    client_max_body_size 32m;                      # large recipe imports with photos

    location ^~ /data/ { deny all; }
    location ~ ^/api/(?!index\.php) { rewrite ^ /api/index.php last; }
    location = /api/index.php {
        include fastcgi_params;
        fastcgi_param SCRIPT_FILENAME $document_root/api/index.php;
        fastcgi_param SCRIPT_NAME /api/index.php;
        fastcgi_pass unix:/run/php/php-fpm.sock;   # Fedora: unix:/run/php-fpm/www.sock
    }
    location ~ \.php$ { deny all; }
    location / { try_files $uri $uri/ /index.html; }
}
```
Then run `sudo certbot --nginx -d ricette.example.org`.

### 3.7 Only at home, or behind a VPN
Il Calderone can also run on a home PC or a Raspberry Pi with PHP's built-in server, no Apache needed.
1. Build with `./deploy.sh --no-zip`.
2. From the repository, run:
   ```bash
   PHP_CLI_SERVER_WORKERS=4 php -S 127.0.0.1:8080 -t public public/api/router-dev.php
   ```
   This serves `public/` after `cd web && npm run build`.
3. To reach it from outside, use a private network such as Tailscale, WireGuard or NetBird, rather than opening a
   router port.
   - Bind to the VPN address instead of `127.0.0.1`.
   - Over plain `http`, timer notifications don't work. Use HTTPS for that.

### 3.8 Accounts from the command line (optional)
```bash
cd /srv/ilcalderone
sudo -u www-data php api/bin/create-user.php alice --display "Alice"        # asks for the password
sudo -u www-data php api/bin/create-user.php bob --admin
```

---

## 4. After installing: first steps
1. **Accounts:** under **Amministrazione** (Administration), create an account for each person and send them their
   password. Everyone can change their password under their name, top right.
2. **Family:** under **Famiglie** (Households), create a household and add its members. Members share menus, the
   shopping list, the pantry and diaries, and can edit each other's recipes.
3. **Recipes:**
   - add them by hand, under **Ricette → Nuova ricetta** (Recipes → New recipe);
   - or import JSON files, under **Ricette → Importa / esporta** (Recipes → Import and export). You can pick many
     files, a whole folder (on a computer), or drag them in.
4. **Menu:**
   - create one under **Menu**: a cycle of one or more weeks, with the meals you choose (breakfast, lunch, dinner);
   - or import a menu file under **Menu → Importa / esporta menu**.
   - The home page then shows tonight's dish, and **Spesa** (Shopping) shows the shopping list for the week.
5. **Language and look:** set the language at the bottom of each page (Italiano, English, Deutsch, Français), or per
   account. Under your name → **Aspetto** (Appearance), choose a favourite light and dark theme; by default the site
   follows the phone's night mode.
6. **Timers:** the tab on the right edge opens up to 5 kitchen timers. Tap **＋** and turn the wheels (hours,
   minutes, seconds) or pick a preset. Allow notifications when asked. Timers ring only while the site is open in a tab.

---

## 5. Upgrading
1. **Back up** `data/`, or your `--data-dir` (see [6](#6-backups)).
2. Build the new version:
   ```bash
   git pull
   ./deploy.sh        # add the same --base-href / --data-dir you used the first time
   ```
3. Upload the new release **over the old one, but without `data/`**:
   - **FTP:** upload everything except the `data` folder. Delete the old `*.js` files first, or leave them: they are
     harmless.
   - **rsync:** run this:
     ```bash
     rsync -av --delete --exclude data/ --exclude api/config.local.php release/IlCalderone-<version>/ server:/srv/ilcalderone/
     ```
4. Reload the site. Reopen the installation check if the release notes say a format changed.

Every data file carries a format version. A future release that changes a format will include a migration script in
`api/bin/`.

## 6. Backups
Everything lives in **one folder**: `data/`, or your `--data-dir`. A backup is a copy of it.
- **FTP:** download `data/` from time to time.
- **Linux server:** run this, or put it in a daily cron:
  ```bash
  sudo tar czf ~/calderone-$(date +%F).tar.gz -C /var/lib ilcalderone
  ```
- **From the app:** **Ricette → Importa / esporta → Le mie ricette** (or **Tutte quelle che vedo**, all visible
  recipes) saves the recipes with their photos as one file. This doesn't include accounts, menus or diaries.

**To restore:** put the folder back, and make sure the web server still owns it.
- The `sessions/` subfolder can be deleted: users just log in again.
- If you edited recipe files by hand, rebuild the search index with `php api/bin/reindex.php`.

## 7. Troubleshooting
| Problem | Fix |
|---|---|
| **`/data/users.json` opens in the browser** | The server ignores `.htaccess`. Upload the hidden `data/.htaccess` (and the root `.htaccess`). On your own Apache, set `AllowOverride All`. On Nginx, add the `location ^~ /data/` rule. **Until this is fixed, the data is public.** |
| White page, or "404" when reloading a page | `.htaccess` is missing or `mod_rewrite` is off. On Nginx, use the `try_files` line. |
| The page loads, but no styles/scripts (in a sub-folder) | Build again with `--base-href /your-folder/`. |
| "Cartella dati scrivibile" (data folder writable) is red | Set the permissions of `data/` (755/775). On your own server, check the owner. On Fedora, check SELinux ([3.4](#34-data-folder-outside-the-web-root)). |
| "Versione PHP" (PHP version) is red, the API says "needs PHP 8.1 or newer", or a 500 error with a syntax error in the log | Choose PHP 8.1 or newer in the host's panel. On Altervista (and hosts that pick the version in `.htaccess`), build with `./deploy.sh --altervista` (or `--php-handler NAME`) and upload `.htaccess` again. |
| An import with many photos fails | It is sent in parts, so this is rare. A single recipe with a huge photo can still be over the host's limit: export it without photos, or use a smaller one. On Nginx, raise `client_max_body_size`. |
| The timer doesn't notify | Notifications need HTTPS and your permission (browser site settings). iPhones allow web notifications only for apps installed on the home screen, which Il Calderone doesn't support yet: there you get the beep and the flashing tab. On any phone, keep the site open: a closed tab can't ring. |
| Forgot the admin password | Another admin can reset it under Amministrazione. With a shell, create a new admin with `php api/bin/create-user.php NAME --admin` (run as the web server user). |
