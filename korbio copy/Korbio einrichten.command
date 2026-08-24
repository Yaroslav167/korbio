#!/bin/zsh

SCRIPT_DIR="${0:A:h}"
NODE_BIN="$(command -v node 2>/dev/null)"

if [[ -z "$NODE_BIN" ]]; then
  BUNDLED_NODE="$HOME/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin/node"
  if [[ -x "$BUNDLED_NODE" ]]; then
    NODE_BIN="$BUNDLED_NODE"
  else
    echo "Node.js wurde nicht gefunden."
    read -k 1 "?Taste drücken zum Schließen …"
    exit 1
  fi
fi

cd "$SCRIPT_DIR" || exit 1
"$NODE_BIN" scripts/setup-family.js
read -k 1 "?Taste drücken zum Schließen …"
