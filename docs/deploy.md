# Deploying

What gets deployed is the **`public/` folder after `cd web && npm run build`**. It contains:

```
index.html, *.js, *.css, favicon.svg   the built Angular app
.htaccess                              routing rules for Apache
api/                                   the PHP back end
data/                                  the data (only .htaccess + index.php at first)
```

The server needs PHP ≥ 8.1 (default extensions are enough: `json`, `session`, `fileinfo`), and the `data/` folder
must be writable by PHP. Nothing else.

After the first deploy, open the site, create the admin account, and go to *Amministrazione → Controllo installazione*.
The self-check confirms that `data/` is writable and **not readable from the web**.

---

## A. Your own PC or home server

### Quickest: PHP's built-in server

```bash
php -S 0.0.0.0:8080 -t public public/api/router-dev.php
```

This is fine at home for a few people. It is single-process; set `PHP_CLI_SERVER_WORKERS=4` to serve requests in parallel.
To reach it from outside your home, prefer a private network such as Tailscale/WireGuard over opening a router port.

### Apache

Point a virtual host at `public/` and allow `.htaccess`:

```apache
<VirtualHost *:80>
    ServerName ricette.example.org
    DocumentRoot /srv/ilcalderone/public
    <Directory /srv/ilcalderone/public>
        AllowOverride All
        Require all granted
    </Directory>
</VirtualHost>
```

Enable `mod_rewrite`, plus `mod_headers` (optional). Then add HTTPS, e.g. with `certbot --apache`.

### Nginx + PHP-FPM

Nginx ignores `.htaccess`, so the same rules go in the server block:

```nginx
server {
    server_name ricette.example.org;
    root /srv/ilcalderone/public;
    index index.html;

    location ^~ /data/ { deny all; }
    location ~ ^/api/(?!index\.php) { rewrite ^ /api/index.php last; }
    location = /api/index.php {
        include fastcgi_params;
        fastcgi_param SCRIPT_FILENAME $document_root/api/index.php;
        fastcgi_param SCRIPT_NAME /api/index.php;
        fastcgi_pass unix:/run/php-fpm/www.sock;
    }
    location ~ \.php$ { deny all; }
    location / { try_files $uri $uri/ /index.html; }
}
```

### Keep the data outside the web root (recommended on your own server)

Create `public/api/config.local.php`:

```php
<?php
return ['data_dir' => '/var/lib/ilcalderone'];
```

Then `sudo mkdir -p /var/lib/ilcalderone && sudo chown www-data /var/lib/ilcalderone`. Use the PHP user of your
distribution: `apache` on Fedora, `www-data` on Debian.

---

## B. Altervista (free plan)

Altervista provides PHP and FTP but no shell, Python or Node, which is exactly what Il Calderone needs.

1. **Build locally**: `cd web && npm run build`.
   If the site lives in a sub-folder, build with `npx ng build --base-href /folder/ && node scripts/publish.mjs`.
2. In the Altervista control panel:
   - set **PHP 8.1 or newer** (*Gestione PHP*, or the panel's PHP settings);
   - turn on **HTTPS** (free certificate).
3. **Upload** the contents of `public/`, **including the hidden `.htaccess` files**, to the site root (or the sub-folder)
   with FTP, e.g. FileZilla. Turn on "show hidden files" in the FTP client.
4. Make sure the `data/` folder is writable (permission 755 or 775, depending on the host).
5. Open the site, create the admin account, then run *Amministrazione → Controllo installazione*. It must say
   **"Cartella dati non pubblica: HTTP 403"**. If it reports that `data/users.json` is readable, the host is ignoring
   `.htaccess`. **Stop and don't add data**, then contact the host's support.

Things to know about free hosting:
- Data and photos count against the disk quota. Photos are shrunk to about 1600 px in the browser, so each is roughly 150–300 KB.
- Back up regularly: download the `data/` folder over FTP, or use *Esporta* in the app.

## C. Any other PHP shared host

The same as Altervista: build, upload `public/` with its `.htaccess` files, and check that `data/` is writable and private.
If the host has no URL rewriting, the API also answers at `api/index.php/…` and `api/index.php?route=/…`,
but the Angular app expects `api/…` and deep links rely on the `index.html` fallback, so rewriting is strongly recommended.

---

## Backups and restore

Everything lives in the data folder: `public/data/`, or your `data_dir`. A backup is a copy of it:

```bash
tar czf calderone-$(date +%F).tar.gz -C public data
```

To restore, put the folder back. Sessions inside it can be deleted safely: users then simply log in again.
If you edit or copy recipe files by hand, rebuild the search index with `php public/api/bin/reindex.php`.

**Moving to another server** = copy `data/` across and deploy the same version of the app.
The in-app **export** (a JSON file with photos) also works for moving recipes between two different Calderone installations.

## Upgrading

1. Back up `data/`.
2. `git pull`, then `cd web && npm ci && npm run build`.
3. Upload or replace `public/` **except `data/`** and your `api/config.local.php`.

Every data file has a `"format"` version. Future versions that change a format will include a migration script in `public/api/bin/`.

## Accounts from the command line

```bash
php public/api/bin/create-user.php alice --display "Alice"           # asks for the password
CALDERONE_PASSWORD=… php public/api/bin/create-user.php bob --admin
```
