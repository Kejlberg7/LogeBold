#!/bin/bash
# Systemets node uden for en login-shell er for gammel (v16), så vi henter nvm's
# standardversion ind først. Turbopack starter hjælpeprocesser via PATH.
export NVM_DIR="$HOME/.nvm"
[ -s "$NVM_DIR/nvm.sh" ] && . "$NVM_DIR/nvm.sh" >/dev/null 2>&1
cd "$(dirname "$0")/.." || exit 1
exec npm run dev -- "$@"
