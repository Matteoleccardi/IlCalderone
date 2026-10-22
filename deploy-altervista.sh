#!/usr/bin/env bash
# Il Calderone: upgrade a site on Altervista (plain FTP) from this computer, code only.
#
#   ./deploy-altervista.sh              -> builds, then shows what WOULD change (dry run, nothing is sent)
#   ./deploy-altervista.sh --apply      -> backs up, uploads, deletes outdated code files, checks the site
#   ./deploy-altervista.sh --help       -> all options
#
# It replaces only the program: data/ and api/config.local.php (and any other *.local.php in api/) are never
# uploaded, overwritten or deleted, so users, sessions, recipes, photos and your settings stay as they are.
# FTP details are asked for every time; nothing is stored. Needs lftp (sudo dnf install lftp) and curl.
# Guide: docs/install.md, "Upgrading on Altervista with the script".
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
APPLY=0
BUILD=1
BACKUP=1
BACKUP_MEDIA=0
HOST=""
FTP_USER=""
RDIR="/"
SITE_URL=""
BASE_HREF=""
TLS="force"          # force | plain (asked for, never silent)
VERIFY_CERT="yes"
TEST_TARGET=""       # a local folder standing in for the server (used by the tests of this script)
ASSUME_YES=0

usage() {
  cat <<'EOF'
Usage: ./deploy-altervista.sh [options]

Builds the release (./deploy.sh --altervista) and brings the site on Altervista up to date by FTP.
Without --apply it only SHOWS what it would do. Never touches data/ or api/config.local.php on the server.

Options:
  --apply            really upload (default: dry run)
  --host HOST        FTP host (asked if missing), e.g. ftp.myname.altervista.org
  --user NAME        FTP user (asked if missing)       (the password is always asked, never read from a file)
  --remote-dir DIR   folder of the site on the server (default: /); needs --base-href /DIR/ if not /
  --base-href PATH   build for a sub-folder, like deploy.sh
  --url URL          the site's address for the final check (default: https://<user>.altervista.org<remote-dir>)
  --no-build         use the newest folder in release/ instead of building
  --no-backup        skip the backup of config.local.php and data/ before uploading
  --backup-media     also download the photos (data/media) in the backup (can be large)
  --insecure-tls     do not verify the server's TLS certificate (only if the check fails and you know why)
  --yes              do not ask "type upload" (still asks for the password)
  -h, --help         this help
EOF
}

say()  { printf '\033[1;32m==>\033[0m %s\n' "$*"; }
warn() { printf '\033[1;33mwarning:\033[0m %s\n' "$*" >&2; }
die()  { printf '\033[1;31merror:\033[0m %s\n' "$*" >&2; exit 1; }

while [[ $# -gt 0 ]]; do
  case "$1" in
    --apply) APPLY=1; shift ;;
    --host) HOST="${2:?--host needs a name}"; shift 2 ;;
    --user) FTP_USER="${2:?--user needs a name}"; shift 2 ;;
    --remote-dir) RDIR="${2:?--remote-dir needs a path}"; shift 2 ;;
    --base-href) BASE_HREF="${2:?--base-href needs a path}"; shift 2 ;;
    --url) SITE_URL="${2:?--url needs an address}"; shift 2 ;;
    --no-build) BUILD=0; shift ;;
    --no-backup) BACKUP=0; shift ;;
    --backup-media) BACKUP_MEDIA=1; shift ;;
    --insecure-tls) VERIFY_CERT="no"; shift ;;
    --yes) ASSUME_YES=1; shift ;;
    --test-target) TEST_TARGET="${2:?--test-target needs a folder}"; shift 2 ;;   # internal
    -h|--help) usage; exit 0 ;;
    *) usage >&2; die "unknown option: $1" ;;
  esac
done

command -v lftp >/dev/null 2>&1 || die "lftp is not installed (Fedora: sudo dnf install lftp, Debian/Ubuntu: sudo apt install lftp)"
command -v curl >/dev/null 2>&1 || die "curl is not installed"
[[ "$RDIR" == /* ]] || RDIR="/$RDIR"
[[ "$RDIR" == */ ]] || RDIR="$RDIR/"
if [[ "$RDIR" != "/" && -z "$BASE_HREF" ]]; then
  warn "the site is in $RDIR but no --base-href was given: the app would be built for the root. Use --base-href $RDIR"
fi

# ---------------------------------------------------------------- the release to send
VERSION="$(sed -n "s/.*const VERSION = '\([^']*\)'.*/\1/p" "$ROOT/public/api/lib/App.php")"
[[ -n "$VERSION" ]] || die "cannot read the version from public/api/lib/App.php"
if (( BUILD )); then
  say "Building the release"
  build_args=(--altervista)
  [[ -n "$BASE_HREF" ]] && build_args+=(--base-href "$BASE_HREF")
  "$ROOT/deploy.sh" "${build_args[@]}" --no-zip >/dev/null || die "deploy.sh failed (run it by itself to see why)"
  REL="$ROOT/release/IlCalderone-$VERSION"
else
  REL="$(ls -dt "$ROOT"/release/IlCalderone-*/ 2>/dev/null | head -1)"; REL="${REL%/}"
  [[ -n "$REL" ]] || die "no release/ folder: run without --no-build"
fi
[[ -f "$REL/.ilcalderone-release" && -f "$REL/BUILD-INFO.txt" && -f "$REL/index.html" && -d "$REL/api" ]] || die "$REL is not a Il Calderone release"
head -1 "$REL/.htaccess" 2>/dev/null | grep -q '^# PHP version' || warn "the release's .htaccess has no PHP version line: was it built with --altervista?"
# the rules that keep the server's own files safe must hold for what we are about to send
[[ ! -e "$REL/api/config.local.php" ]] || die "$REL/api/config.local.php exists: a release must not carry local settings"
if [[ -n "$(ls -A "$REL/data" 2>/dev/null | grep -v -e '^\.htaccess$' -e '^index\.php$' || true)" ]]; then
  die "$REL/data holds more than the protecting files: it looks built with --with-data. Not sending that"
fi
REL_VERSION="$(head -1 "$REL/BUILD-INFO.txt" | sed 's/^Il Calderone //')"
say "Release $REL_VERSION in ${REL#"$ROOT"/}"

# ---------------------------------------------------------------- the server
if [[ -z "$TEST_TARGET" ]]; then
  [[ -n "$HOST" ]] || read -r -p "FTP host (e.g. ftp.myname.altervista.org): " HOST
  [[ -n "$FTP_USER" ]] || read -r -p "FTP user: " FTP_USER
  [[ -n "$HOST" && -n "$FTP_USER" ]] || die "host and user are needed"
  # a bare site name ("calderone") or the site's own address ("calderone.altervista.org") means Altervista's FTP host
  if [[ "$HOST" != *.* ]]; then HOST="ftp.$HOST.altervista.org"
  elif [[ "$HOST" == *.altervista.org && "$HOST" != ftp.* ]]; then HOST="ftp.$HOST"; fi
  echo "    FTP host: $HOST"
  read -r -s -p "FTP password for $FTP_USER (not shown, not stored): " FTP_PASS; echo
  [[ -n "$FTP_PASS" ]] || die "no password given"
  q() { local s="${1//\\/\\\\}"; printf '"%s"' "${s//\"/\\\"}"; }
  OPEN="open -u $(q "$FTP_USER"),$(q "$FTP_PASS") $(q "$HOST")"
  unset FTP_PASS
  if [[ -z "$SITE_URL" ]]; then
    SITE_URL="https://${FTP_USER%%@*}.altervista.org${RDIR%/}/"
    SITE_URL="${SITE_URL%//}"
  fi
else
  mkdir -p "$TEST_TARGET"
  OPEN="open file:$(cd "$TEST_TARGET" && pwd)"
  RDIR=""
  SITE_URL="${SITE_URL:-}"
fi

settings() {
  cat <<EOF
set cmd:fail-exit yes
set net:max-retries 3
set net:timeout 30
set net:reconnect-interval-base 5
set ftp:passive-mode yes
set ftp:list-options -a
set ssl:verify-certificate $VERIFY_CERT
set ftp:ssl-allow $([[ $TLS == plain ]] && echo no || echo yes)
set ftp:ssl-force $([[ $TLS == plain ]] && echo no || echo yes)
set ftp:ssl-protect-data yes
set ftp:ssl-protect-list yes
EOF
}
# lf "commands": run lftp commands on the server, from the site folder; the password never appears in a command line
lf() { lftp -f <(printf '%s\n' "$(settings)" "$OPEN" "${RDIR:+cd \"$RDIR\"}" "lcd $(printf '"%s"' "$REL")" "$1" "bye"); }

# lftp lists as "./name" or "name/" depending on the server: normalise to bare names
names() { sed -e 's|/$||' -e 's|^.*/||'; }
say "Connecting"
if ! REMOTE_LIST="$(lf 'cls -1 .' | names)"; then
  if [[ -z "$TEST_TARGET" && $TLS == force ]]; then
    warn "could not connect with encryption (TLS). A wrong user or password gives the same message (see the line above)."
    echo "    Without TLS the password and files travel unencrypted. Type 'plain' to try anyway, or anything else to stop."
    read -r -p "> " ans
    [[ "$ans" == plain ]] || die "stopped"
    TLS=plain
    REMOTE_LIST="$(lf 'cls -1 .' | names)" || die "could not connect to $HOST (check host, user and password)"
  else
    die "could not connect to ${HOST:-the server}: check the host (ftp.<name>.altervista.org), user and password"
  fi
fi
has() { grep -qx -- "$1" <<<"$REMOTE_LIST"; }
FIRST_INSTALL=0
if ! has api && ! has index.html && ! has data; then
  FIRST_INSTALL=1
  say "The server folder has no Il Calderone yet: this is a first install (data/ will be created, empty)"
elif ! has .ilcalderone-release || ! has api; then
  warn "$RDIR on the server has files but does not look like an Il Calderone install (no .ilcalderone-release or api/)."
  read -r -p "Type 'continue' to go on anyway: " ans; [[ "$ans" == continue ]] || die "stopped"
fi
if has data; then say "Server has data/ : it stays untouched"; elif (( ! FIRST_INSTALL )); then warn "no data/ on the server (the app will create it, or upload the empty one)"; fi
has api && ! lf 'cls -1 api' | names | grep -qx config.local.php && echo "    note: no api/config.local.php on the server (fine unless you use one)"

REMOTE_VERSION="(unknown)"
if has BUILD-INFO.txt; then
  tmpd="$(mktemp -d)"; tmp="$tmpd/BUILD-INFO.txt"; trap 'rm -rf "$tmpd"' EXIT
  lf "get BUILD-INFO.txt -o $tmp" >/dev/null 2>&1 && REMOTE_VERSION="$(head -1 "$tmp" | sed 's/^Il Calderone //')" || true
fi
echo "    server: $REMOTE_VERSION   ->   new: $REL_VERSION"
if [[ "$REMOTE_VERSION" != "(unknown)" && "${REMOTE_VERSION%.*}" != "${REL_VERSION%.*}" ]]; then
  warn "minor/major version change: read the release notes in case a data format changed (migrations in api/bin/ cannot run on Altervista; do that step by hand)"
fi

# can this FTP login write into the site folder and api/? A temporary empty file is sent and removed again. Better to learn it
# here than half way through the upload.
if has api; then
  wt="$(mktemp -d)/.calderone-write-test"; : > "$wt"
  say "Checking that this login can write to the server"
  for d in . api; do
    if lf "put -O $d $(printf '"%s"' "$wt")" >/dev/null 2>&1; then
      lf "rm -f -- $(printf '"%s"' "$d/.calderone-write-test")" >/dev/null 2>&1 || warn "sent a test file to $d/ but could not remove it: delete $d/.calderone-write-test by hand"
      echo "    OK: can write to ${d/#./the site folder}"
    else
      die "this FTP login cannot write to ${d/#./the site folder} on the server. In FileZilla, right-click the folder -> File permissions -> 755 (apply to the folder; for api/ also tick 'recurse into subdirectories' with 'apply to all'), or check the FTP user. Nothing was changed."
    fi
  done
  rm -rf "$(dirname "$wt")"
fi

# ---------------------------------------------------------------- the plan
# never sent, never deleted: the server's data and local settings
KEEP=(-x '^data/' -x '^data$' -x '(^|/)[^/]*\.local\.php$')
# sent last, so that visitors never get a page that points to files not there yet
LATE=(index.html sw.js manifest.webmanifest)
LATE_X=(); for f in "${LATE[@]}"; do LATE_X+=(-x "^${f//./\\.}\$"); done
DRY=(); (( APPLY )) || DRY=(--dry-run)
join() { local o=""; for a in "$@"; do o+=" '${a//\'/\'\\\'\'}'"; done; printf '%s' "$o"; }

# old hashed files in the site root (chunk-*.js, main-*.js, styles-*.css, ...) that the new release no longer has
stale_files() {
  local rx='^(chunk|main|polyfills|styles)-[A-Za-z0-9_-]+\.(js|css)$' f
  while IFS= read -r f; do
    [[ "$f" =~ $rx ]] && [[ ! -e "$REL/$f" ]] && printf '%s\n' "$f"
  done <<<"$REMOTE_LIST"
  return 0
}
STALE="$(stale_files)"

if (( APPLY )); then
  say "Mode: APPLY (the site will be changed)"
  if (( ! ASSUME_YES )) && [[ -z "$TEST_TARGET" ]]; then
    read -r -p "Type 'upload' to send $REL_VERSION to $HOST$RDIR: " ans; [[ "$ans" == upload ]] || die "stopped, nothing was changed"
  fi
else
  say "Mode: DRY RUN (nothing is sent; add --apply to do it)"
fi

# ---------------------------------------------------------------- backup
if (( APPLY && BACKUP )); then
  BK="$ROOT/backups/altervista-$(date +%Y%m%d-%H%M%S)"
  say "Backup of the server's settings and data to ${BK#"$ROOT"/}"
  mkdir -p "$BK"
  bx=(-x '^sessions/' -x '^index/' -x '^ratelimit\.json$')
  (( BACKUP_MEDIA )) || bx+=(-x '^media/')
  if lf 'cls -1 api' | names | grep -qx config.local.php; then
    lf "lcd $(printf '"%s"' "$BK"); get api/config.local.php -o config.local.php" >/dev/null || die "the backup failed: nothing was changed on the server"
    echo "    saved api/config.local.php"
  fi
  if has data; then
    lf "lcd $(printf '"%s"' "$BK"); mirror --parallel=2 $(join "${bx[@]}") data data" >/dev/null || die "the backup failed: nothing was changed on the server"
    echo "    saved data/ (without sessions$( (( BACKUP_MEDIA )) || echo ', photos'))"
  fi
  chmod -R go-rwx "$BK"
fi

# ---------------------------------------------------------------- upload
say "1/4 Program files (everything except data/, *.local.php and the three files sent last)"
lf "mirror -R --parallel=2 ${DRY[*]:-} $(join "${KEEP[@]}" "${LATE_X[@]}") . ."
if (( FIRST_INSTALL )); then
  say "    first install: creating data/ with its protecting files"
  lf "mirror -R ${DRY[*]:-} data data"
fi

say "2/4 Entry files, last: ${LATE[*]}"
for f in "${LATE[@]}"; do
  if (( APPLY )); then lf "put -O . $(printf '"%s"' "$f")" >/dev/null && echo "    sent $f"; else echo "    would send $f"; fi
done

say "3/4 Old program files no longer in the release"
if [[ -z "$STALE" ]]; then echo "    none in the site root"; else
  while IFS= read -r f; do
    if (( APPLY )); then lf "rm -f -- $(printf '"%s"' "$f")" >/dev/null && echo "    deleted $f"; else echo "    would delete $f"; fi
  done <<<"$STALE"
fi
for d in api logos media; do
  [[ -d "$REL/$d" ]] && lf "mirror -R --delete --only-missing ${DRY[*]:-} $(join "${KEEP[@]}") $d $d" | grep -v '^$' | sed "s|^|    $d: |" | { grep -i "rm\|remov\|delet" || true; }
done

# ---------------------------------------------------------------- check
if (( APPLY )) && [[ -n "$SITE_URL" ]]; then
  say "4/4 Checking $SITE_URL"
  sleep 2
  code_session="$(curl -s -o /tmp/calderone-session.$$ -w '%{http_code}' --max-time 30 "${SITE_URL%/}/api/session" || echo 000)"
  if [[ "$code_session" == 200 ]] && grep -q "\"version\": *\"$REL_VERSION\"" /tmp/calderone-session.$$; then
    echo "    OK: the site answers and reports version $REL_VERSION"
  else
    warn "the site answered HTTP $code_session or an unexpected version (see /api/session). Look at it in a browser; the backup is in ${BK:-(no backup made)}"
  fi
  rm -f /tmp/calderone-session.$$
  code_data="$(curl -s -o /dev/null -w '%{http_code}' --max-time 30 "${SITE_URL%/}/data/users.json" || echo 000)"
  if [[ "$code_data" == 200 ]]; then warn "DANGER: ${SITE_URL%/}/data/users.json is publicly readable (HTTP 200). Check data/.htaccess on the server NOW."
  else echo "    OK: /data/users.json is not public (HTTP $code_data)"; fi
elif (( APPLY )); then
  echo "    4/4 no --url: final check skipped"
else
  say "Dry run finished. Nothing was sent. Run again with --apply to do it."
fi
(( APPLY )) && say "Done. In the browser, hard-refresh once (Ctrl+Shift+R) so the new files are picked up."
exit 0
