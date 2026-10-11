#!/bin/zsh
set -e
MEDWATCH_DIR="$(cd -- "$(dirname -- "$0")" && pwd)"
cd "$MEDWATCH_DIR"
if curl --silent --fail http://127.0.0.1:5173/ >/dev/null; then
  open -a "Google Chrome" http://127.0.0.1:5173/
  exit 0
fi
if ! command -v npm >/dev/null; then
  echo "Install Node.js, then run this launcher again."
  read -r "REPLY?Press Enter to close."
  exit 1
fi
if [[ ! -d node_modules ]]; then
  npm ci
fi
(sleep 2; open -a "Google Chrome" http://127.0.0.1:5173/) &
exec npm run dev
