#!/usr/bin/env bash
set -u

PORT=5173
LOG=/tmp/pratopronto-vite.log

if curl -fsS "http://127.0.0.1:${PORT}/" >/dev/null 2>&1; then
  echo "PratoPronto já está respondendo na porta ${PORT}."
  exit 0
fi

rm -f "$LOG"
nohup npm run dev -- --host 0.0.0.0 --port "$PORT" >"$LOG" 2>&1 &

for _ in $(seq 1 30); do
  if curl -fsS "http://127.0.0.1:${PORT}/" >/dev/null 2>&1; then
    echo "PratoPronto iniciado na porta ${PORT}."
    exit 0
  fi
  sleep 0.5
done

echo "Falha ao iniciar o PratoPronto. Log do Vite:"
cat "$LOG" 2>/dev/null || true
exit 1
