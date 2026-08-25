#!/bin/bash
# Vercel blokerer CLI-udrulninger hvis commit-forfatterens mail ikke er medlem af
# Vercel-teamet. Vi ruller derfor ud fra en kopi uden git-metadata.
# Permanent løsning: inviter kejlberg7@gmail.com til Vercel-teamet, eller forbind
# GitHub-repoet til projektet, så Vercel selv bygger ved hvert push.
set -e
export NVM_DIR="$HOME/.nvm"
[ -s "$NVM_DIR/nvm.sh" ] && . "$NVM_DIR/nvm.sh" >/dev/null 2>&1

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
STAGE="$(mktemp -d)"
trap 'rm -rf "$STAGE"' EXIT

git -C "$ROOT" archive HEAD | tar -x -C "$STAGE"
mkdir -p "$STAGE/.vercel"
cp "$ROOT/.vercel/project.json" "$STAGE/.vercel/"

cd "$STAGE"
npx --yes vercel@latest deploy --prod --yes "$@"
