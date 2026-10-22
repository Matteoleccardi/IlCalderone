#!/usr/bin/env bash
# Il Calderone: build the folder to upload to a web server.
#
#   ./deploy.sh                      -> release/IlCalderone-<version>/  (+ .zip), ready to upload; guide: INSTALL.md
#   ./deploy.sh --help               -> all options
#
# It needs Node.js + npm on THIS computer (to build the web app). The server only needs PHP >= 8.1.
# Nothing in public/ or in your data is changed; the release contains no data unless you ask for --with-data.
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
WEB="$ROOT/web"
PUB="$ROOT/public"

BASE_HREF="/"
OUT=""
DATA_DIR=""
WITH_DATA=""
INSTALL_DEPS="auto"
MAKE_ZIP=1
RUN_TESTS=0
PHP_HANDLER=""

usage() {
  cat <<'EOF'
Usage: ./deploy.sh [options]

Builds the web app and puts everything the server needs into one folder (and a zip next to it).
Upload the CONTENTS of that folder to your site; then follow INSTALL.md inside it.

Options:
  --base-href PATH   the site lives in a sub-folder, e.g. --base-href /ricette/   (default: /)
  --data-dir PATH    keep the data OUTSIDE the web root on your own server: writes api/config.local.php
                     with this path (recommended for self-hosting; not possible on Altervista)
  --with-data [DIR]  also copy an existing data folder (default: public/data) into the release, to move a
                     local installation to a server. It contains the accounts (password hashes), recipes,
                     photos, menus and diaries; login sessions are left out.
  --altervista       Altervista: select PHP 8.4 in .htaccess (same as --php-handler av-php84)
  --php-handler NAME add "AddHandler NAME .php" to .htaccess, for hosts that pick the PHP version that way
  --out DIR          where to write the release (default: release/IlCalderone-<version>)
  --install          always run "npm ci" first      --no-install  never run it (default: only if needed)
  --test             run the front-end tests before building
  --no-zip           don't make the .zip
  -h, --help         this help
EOF
}

say()  { printf '\033[1;32m==>\033[0m %s\n' "$*"; }
warn() { printf '\033[1;33mwarning:\033[0m %s\n' "$*" >&2; }
die()  { printf '\033[1;31merror:\033[0m %s\n' "$*" >&2; exit 1; }

while [[ $# -gt 0 ]]; do
  case "$1" in
    --base-href) BASE_HREF="${2:?--base-href needs a path}"; shift 2 ;;
    --data-dir)  DATA_DIR="${2:?--data-dir needs a path}"; shift 2 ;;
    --with-data)
      if [[ -n "${2:-}" && "${2:0:1}" != "-" ]]; then WITH_DATA="$2"; shift 2; else WITH_DATA="$PUB/data"; shift; fi ;;
    --altervista)  PHP_HANDLER="av-php84"; shift ;;
    --php-handler) PHP_HANDLER="${2:?--php-handler needs a name, e.g. av-php84}"; shift 2 ;;
    --out)        OUT="${2:?--out needs a folder}"; shift 2 ;;
    --install)    INSTALL_DEPS="yes"; shift ;;
    --no-install) INSTALL_DEPS="no"; shift ;;
    --test)       RUN_TESTS=1; shift ;;
    --no-zip)     MAKE_ZIP=0; shift ;;
    -h|--help)    usage; exit 0 ;;
    *) usage >&2; die "unknown option: $1" ;;
  esac
done

# the base href must start and end with "/"
[[ "$BASE_HREF" == /* ]] || BASE_HREF="/$BASE_HREF"
[[ "$BASE_HREF" == */ ]] || BASE_HREF="$BASE_HREF/"

VERSION="$(sed -n "s/.*const VERSION = '\([^']*\)'.*/\1/p" "$PUB/api/lib/App.php")"
[[ -n "$VERSION" ]] || die "cannot read the version from public/api/lib/App.php"
OUT="${OUT:-$ROOT/release/IlCalderone-$VERSION}"
mkdir -p "$(dirname "$OUT")"
OUT="$(cd "$(dirname "$OUT")" && pwd)/$(basename "$OUT")"
case "$OUT/" in
  "$PUB"/*|"$WEB"/*|"$ROOT/") die "--out must not be inside public/ or web/ (or the repository root)" ;;
esac

# ---------------------------------------------------------------- requirements on this computer
say "Il Calderone $VERSION: checking the tools on this computer"

# Angular 22 needs Node ^22.22.3, ^24.15.0 or >= 26
node_ok() {
  command -v node >/dev/null 2>&1 || return 1
  local v; v="$(node -p 'process.versions.node' 2>/dev/null)" || return 1
  local major minor patch; IFS=. read -r major minor patch <<<"$v"
  (( major >= 26 )) && return 0
  (( major == 24 && (minor > 15 || minor == 15) )) && return 0
  (( major == 22 && (minor > 22 || (minor == 22 && patch >= 3)) )) && return 0
  return 1
}
if ! node_ok && [[ -s "${NVM_DIR:-$HOME/.nvm}/nvm.sh" ]]; then
  # nvm is a shell function: load it and use its default Node
  set +u
  # shellcheck disable=SC1091
  source "${NVM_DIR:-$HOME/.nvm}/nvm.sh" >/dev/null 2>&1; nvm use default >/dev/null 2>&1 || true; set -u
fi
if ! node_ok; then
  found="$(command -v node >/dev/null && node -v || echo 'not installed')"
  die "Node.js ^22.22.3, ^24.15 or >= 26 is needed to build (found: $found).
       Install it from https://nodejs.org or with nvm (https://github.com/nvm-sh/nvm): nvm install 24"
fi
command -v npm >/dev/null 2>&1 || die "npm is missing (it comes with Node.js)"
echo "    node $(node -v), npm $(npm -v)"

HAVE_PHP=0
if command -v php >/dev/null 2>&1; then
  HAVE_PHP=1
  echo "    php $(php -r 'echo PHP_VERSION;') (used only to syntax-check the API; the server needs its own PHP >= 8.1)"
else
  echo "    php: not installed here (fine: it is only needed on the server)"
fi

if [[ -n "$WITH_DATA" ]]; then
  [[ -f "$WITH_DATA/users.json" ]] || die "--with-data: $WITH_DATA does not look like a Calderone data folder (no users.json)"
fi

# ---------------------------------------------------------------- build
cd "$WEB"
if [[ "$INSTALL_DEPS" == "yes" || ( "$INSTALL_DEPS" == "auto" && ( ! -d node_modules || package-lock.json -nt node_modules ) ) ]]; then
  say "Installing the build tools (npm ci)"
  npm ci --no-audit --no-fund
fi
if (( RUN_TESTS )); then
  say "Running the front-end tests"
  npm test
fi
say "Building the web app (base href $BASE_HREF)"
node scripts/logos.mjs
npx ng build --base-href "$BASE_HREF"
BUILT="$WEB/dist/web/browser"
[[ -f "$BUILT/index.html" ]] || die "the build produced no $BUILT/index.html"

if (( HAVE_PHP )); then
  say "Checking the PHP files"
  bad=0
  while IFS= read -r -d '' f; do
    php -l "$f" >/dev/null 2>&1 || { php -l "$f" || true; bad=1; }
  done < <(find "$PUB/api" "$PUB/data" -name '*.php' -print0)
  (( bad == 0 )) || die "PHP syntax errors (see above)"
fi

# ---------------------------------------------------------------- assemble the release
say "Writing $OUT"
if [[ -e "$OUT" ]]; then
  [[ -f "$OUT/.ilcalderone-release" ]] || die "$OUT exists and was not made by deploy.sh: remove it or choose another --out"
  rm -rf "$OUT"
fi
mkdir -p "$OUT/data"
touch "$OUT/.ilcalderone-release"

cp -R "$BUILT/." "$OUT/"                         # index.html, *.js, *.css, favicon.svg, sw.js …
if [[ -n "$PHP_HANDLER" ]]; then
  [[ "$PHP_HANDLER" =~ ^[A-Za-z0-9._-]+$ ]] || die "--php-handler: only letters, digits, '.', '_' and '-'"
  { echo "# PHP version chosen by the host (deploy.sh --php-handler / --altervista)"
    echo "AddHandler $PHP_HANDLER .php"
    echo
    cat "$PUB/.htaccess"; } > "$OUT/.htaccess"
else
  cp "$PUB/.htaccess" "$OUT/.htaccess"
fi
cp -R "$PUB/api" "$OUT/api"
rm -f "$OUT/api/router-dev.php"                  # only for "php -S" on a PC
rm -f "$OUT/api/config.local.php"                # never ship your local settings
{ git -C "$ROOT" rev-parse --short=7 HEAD 2>/dev/null || true; } > "$OUT/api/BUILD"   # the commit code shown next to the version
cp "$PUB/data/.htaccess" "$PUB/data/index.php" "$OUT/data/"

if [[ -n "$DATA_DIR" ]]; then
  esc="${DATA_DIR//\\/\\\\}"; esc="${esc//\'/\\\'}"
  cat > "$OUT/api/config.local.php" <<EOF
<?php
// Written by deploy.sh: the data lives outside the web root. Create the folder and make it writable by PHP.
return ['data_dir' => '$esc'];
EOF
fi

if [[ -n "$WITH_DATA" ]]; then
  warn "including the data of $WITH_DATA (accounts with password hashes, recipes, photos, menus, diaries)"
  # sessions and the lock file are per server; the search index is rebuilt automatically
  (cd "$WITH_DATA" && tar cf - --exclude='./sessions/*' --exclude='./.lock' --exclude='./index' --exclude='./.write-test' .) \
    | (cd "$OUT/data" && tar xf -)
  mkdir -p "$OUT/data/sessions"
fi

cp "$ROOT/docs/install.md" "$OUT/INSTALL.md"
[[ -f "$ROOT/LICENSE" ]] && cp "$ROOT/LICENSE" "$OUT/LICENSE.txt"
commit="$(git -C "$ROOT" rev-parse --short HEAD 2>/dev/null || echo unknown)"
dirty="$(git -C "$ROOT" status --porcelain 2>/dev/null | grep -v '^??' | head -1 || true)"
cat > "$OUT/BUILD-INFO.txt" <<EOF
Il Calderone $VERSION
commit:     $commit${dirty:+ (with uncommitted changes)}
built:      $(date '+%Y-%m-%d %H:%M %Z')
base href:  $BASE_HREF
php:        $( [[ -n "$PHP_HANDLER" ]] && echo "AddHandler $PHP_HANDLER .php (in .htaccess)" || echo "the host's default" )
data:       $( [[ -n "$WITH_DATA" ]] && echo "copied from $WITH_DATA" || echo "empty (new installation)" )
data_dir:   $( [[ -n "$DATA_DIR" ]] && echo "$DATA_DIR (api/config.local.php)" || echo "data/ next to index.html (default)" )
EOF

ZIP=""
if (( MAKE_ZIP )); then
  if command -v zip >/dev/null 2>&1; then
    ZIP="$OUT.zip"; rm -f "$ZIP"
    (cd "$OUT" && zip -qr "$ZIP" . -x '.ilcalderone-release')
  else
    warn "zip is not installed: no .zip made (the folder is enough)"
  fi
fi

size="$(du -sh "$OUT" | cut -f1)"
say "Done: Il Calderone $VERSION ($size)"
cat <<EOF

  Folder to upload:  $OUT
${ZIP:+  Same, zipped:      $ZIP
}  Guide:             $OUT/INSTALL.md

  Upload the CONTENTS of the folder (including the hidden .htaccess files) to $( [[ "$BASE_HREF" == "/" ]] && echo "your site's root" || echo "the sub-folder $BASE_HREF of your site" ),
  then open the site and create the admin account.
  Upgrading an existing site: upload everything EXCEPT data/ (and keep your api/config.local.php).
EOF
if [[ -n "$WITH_DATA" ]]; then
  echo
  warn "this release contains private data: don't share the folder or the zip."
fi
