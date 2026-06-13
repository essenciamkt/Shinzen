#!/usr/bin/env bash
# Sobe o Shinzen — Visão de Vida em http://127.0.0.1:4317
set -euo pipefail
cd "$(dirname "$0")"
echo "Shinzen rodando em http://127.0.0.1:4317  (Ctrl+C para parar)"
exec node server.js
