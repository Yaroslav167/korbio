#!/bin/zsh

SCRIPT_DIR="${0:A:h}"
NODE_BIN="$(command -v node 2>/dev/null)"

if [[ -z "$NODE_BIN" ]]; then
  BUNDLED_NODE="$HOME/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin/node"
  if [[ -x "$BUNDLED_NODE" ]]; then
    NODE_BIN="$BUNDLED_NODE"
  else
    echo "Node.js wurde nicht gefunden. Bitte Node.js installieren und erneut starten."
    read -k 1 "?Taste drücken zum Schließen …"
    exit 1
  fi
fi

cd "$SCRIPT_DIR" || exit 1

if [[ ! -f .env ]] || { ! grep -q '^FAMILY_ACCESS_PASSWORD_HASH=.' .env && ! grep -q '^FAMILY_ACCESS_PASSWORD=.' .env; } || { ! grep -q '^FAMILY_ADMIN_PASSWORD_HASH=.' .env && ! grep -q '^FAMILY_ADMIN_PASSWORD=.' .env; }; then
  echo "Die private Familienkasse wird zuerst eingerichtet."
  "$NODE_BIN" scripts/setup-family.js || exit 1
fi

LAN_IP="$(ipconfig getifaddr en0 2>/dev/null)"
if [[ -z "$LAN_IP" ]]; then
  LAN_IP="$(ipconfig getifaddr en1 2>/dev/null)"
fi
if [[ -z "$LAN_IP" ]]; then
  echo "Die lokale Netzwerkadresse konnte nicht gefunden werden."
  read -k 1 "?Taste drücken zum Schließen …"
  exit 1
fi

echo ""
echo "Korbio ist im privaten Heimnetz erreichbar:"
echo "http://${LAN_IP}:4173"
echo "Nur in einem vertrauenswürdigen privaten WLAN verwenden."
echo ""

HOST=0.0.0.0 APP_URL="http://${LAN_IP}:4173" "$NODE_BIN" server.js &
SERVER_PID=$!
sleep 1
open "http://${LAN_IP}:4173"
wait "$SERVER_PID"
