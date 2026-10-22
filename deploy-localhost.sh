#!/usr/bin/env bash
# Il Calderone: bring the LOCAL site (the PHP server on :8080 that serves public/) up to date with the code.
#
#   ./deploy-localhost.sh            -> builds the web app into public/ and checks the local server
#   ./deploy-localhost.sh --test     -> runs the front-end tests first (stops if they fail)
#   ./deploy-localhost.sh --help
#
# Same idea as deploy-altervista.sh, for your own computer: only the program changes. public/data/ (your recipes, accounts,
# sessions), public/api/ (the PHP code is already live there) and api/config.local.php are never touched.
# It does NOT start the server: keep yours running, e.g.   php -S 127.0.0.1:8080 -t public public/api/router-dev.php
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
WEB="$ROOT/web"
URL="http://127.0.0.1:8080"
RUN_TESTS=0
INSTALL_DEPS="auto"

usage() {
  cat <<'EOF2'
Usage: ./deploy-localhost.sh [options]

Builds the web app into public/ (what your local PHP server serves) and checks that the server answers.

Options:
  --test        run the front-end tests first
  --url URL     where your local server listens (default: http://127.0.0.1:8080)
  --install     run "npm ci" first      --no-install  never run it (default: only if needed)
  -h, --help    this help
EOF2
}
say()  { printf '\033[1;32m==>\033[0m %s\n' "$*"; }
warn() { printf '\033[1;33mwarning:\033[0m %s\n' "$*" >&2; }
die()  { printf '\033[1;31merror:\033[0m %s\n' "$*" >&2; exit 1; }

while [[ $# -gt 0 ]]; do
  case "$1" in
    --test) RUN_TESTS=1; shift ;;
    --url) URL="${2:?--url needs an address}"; shift 2 ;;
    --install) INSTALL_DEPS="yes"; shift ;;
    --no-install) INSTALL_DEPS="no"; shift ;;
    -h|--help) usage; exit 0 ;;
    *) usage >&2; die "unknown option: $1" ;;
  esac
done

# Angular 22 needs a recent Node (nvm's default is loaded when the system one is too old, like deploy.sh does)
node_ok() {
  command -v node >/dev/null 2>&1 || return 1
  local major minor patch; IFS=. read -r major minor patch <<<"$(node -p 'process.versions.node' 2>/dev/null)" || return 1
  (( major >= 26 )) && return 0
  (( major == 24 && minor >= 15 )) && return 0
  (( major == 22 && (minor > 22 || (minor == 22 && patch >= 3)) )) && return 0
  return 1
}
if ! node_ok && [[ -s "${NVM_DIR:-$HOME/.nvm}/nvm.sh" ]]; then
  set +u
  # shellcheck disable=SC1091
  source "${NVM_DIR:-$HOME/.nvm}/nvm.sh" >/dev/null 2>&1; nvm use default >/dev/null 2>&1 || true
  set -u
fi
node_ok || die "Node.js ^22.22.3, ^24.15 or >= 26 is needed (found: $(command -v node >/dev/null && node -v || echo none))"

cd "$WEB"
if [[ "$INSTALL_DEPS" == "yes" || ( "$INSTALL_DEPS" == "auto" && ( ! -d node_modules || package-lock.json -nt node_modules ) ) ]]; then
  say "Installing the build tools (npm ci)"
  npm ci --no-audit --no-fund
fi
if (( RUN_TESTS )); then
  say "Running the front-end tests"
  npm test
fi
say "Building into public/ (data/ and api/ are protected by the build)"
npm run build 2>&1 | grep -E "error|Error|Published" || true
[[ -f "$ROOT/public/index.html" ]] || die "the build produced no public/index.html"
VERSION="$(sed -n "s/.*const VERSION = '\([^']*\)'.*/\1/p" "$ROOT/public/api/lib/App.php")"

say "Checking the local server at $URL"
if code="$(curl -s -o /tmp/calderone-local.$$ -w '%{http_code}' --max-time 5 "$URL/api/session" 2>/dev/null)" && [[ "$code" == 200 ]]; then
  if grep -q "\"version\": *\"$VERSION\"" /tmp/calderone-local.$$; then
    echo "    OK: it answers and reports version $VERSION"
  else
    warn "it answers, but not with version $VERSION. Is it serving this folder (public/)?"
  fi
  mods="$(grep -o '"modules": *\[[^]]*\]' /tmp/calderone-local.$$ || true)"; [[ -n "$mods" ]] && echo "    $mods"
else
  warn "nothing answers at $URL (HTTP ${code:-none}). Start it with:  php -S 127.0.0.1:8080 -t public public/api/router-dev.php"
fi
rm -f /tmp/calderone-local.$$
say "Done. In the browser, hard-refresh once (Ctrl+Shift+R) so the new files are picked up."
