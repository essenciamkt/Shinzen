#!/usr/bin/env bash
# Rodado 1x/dia pelo cron (8h). Busca o digest do Shinzen e, se houver alertas,
# dispara notificação desktop + registra em shinzen.log. NÃO executa nada —
# só notifica (mesmo contrato do tasks/notify.sh).
set -euo pipefail

BASE="/home/dante/Shinzen"
LOG="$BASE/shinzen.log"
URL="http://127.0.0.1:4317/api/digest"

# Necessário pro notify-send funcionar via cron
export DISPLAY="${DISPLAY:-:0}"
export DBUS_SESSION_BUS_ADDRESS="${DBUS_SESSION_BUS_ADDRESS:-unix:path=/run/user/$(id -u)/bus}"

TS="$(date -Iseconds)"

# Servidor no ar? Se não, sai quieto (não é erro — o painel é local).
JSON="$(curl -s -m 5 "$URL" || true)"
if [ -z "$JSON" ]; then
  echo "[$TS] digest: servidor fora do ar — pulei" >> "$LOG"
  exit 0
fi

# Parse com python3 (mesma stack do tasks/notify.sh, comprovada no cron).
DIGEST="$(printf '%s' "$JSON" | python3 -c '
import json, sys
try:
    j = json.load(sys.stdin)
except Exception:
    print("0|-"); sys.exit()
lines = j.get("lines") or []
socio = j.get("socio") or ""
head = " · ".join(lines) if lines else ""
tail = ("  💬 " + socio) if socio else ""
msg = ((head or "-") + tail).replace("\n", " ")
print(str(j.get("count", 0)) + "|" + msg)
')"
COUNT="${DIGEST%%|*}"
MSG="${DIGEST#*|}"

if [ "${COUNT:-0}" = "0" ]; then
  echo "[$TS] digest: 0 alertas — nada a fazer" >> "$LOG"
  exit 0
fi

if command -v notify-send >/dev/null 2>&1; then
  notify-send -u normal -i appointment-soon "Shinzen — hoje" "$MSG" || true
fi

echo "[$TS] digest: $MSG" >> "$LOG"
