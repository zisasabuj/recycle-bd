#!/bin/bash
# Stop backend + tunnel
LOG_DIR="$HOME/.recycle-logs"
if [ -f "$LOG_DIR/backend.pid" ]; then
  kill -9 $(cat "$LOG_DIR/backend.pid") 2>/dev/null && echo "✅ Backend stopped"
  rm "$LOG_DIR/backend.pid"
fi
if [ -f "$LOG_DIR/tunnel.pid" ]; then
  kill -9 $(cat "$LOG_DIR/tunnel.pid") 2>/dev/null && echo "✅ Tunnel stopped"
  rm "$LOG_DIR/tunnel.pid"
fi
pkill -9 -f "node server.js" 2>/dev/null || true
pkill -9 -f "cloudflared tunnel" 2>/dev/null || true
echo "Done."