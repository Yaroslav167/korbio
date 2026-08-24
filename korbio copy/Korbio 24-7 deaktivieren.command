#!/bin/zsh

SCRIPT_DIR="${0:A:h}"
NODE_BIN="$(command -v node 2>/dev/null)"

if [[ -z "$NODE_BIN" ]]; then
  NODE_BIN="$HOME/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin/node"
fi

cd "$SCRIPT_DIR" || exit 1
"$NODE_BIN" scripts/autostart.js uninstall
echo ""
read -k 1 "?Taste drücken zum Schließen …"
