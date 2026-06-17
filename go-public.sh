#!/bin/bash
# Start backend + public tunnel in one shot
# Usage: ./go-public.sh [restart]
set -e

BACKEND_DIR="$HOME/auction-platform/backend"
TUNNEL_BIN="/tmp/cloudflared"
LOG_DIR="$HOME/.recycle-logs"
mkdir -p "$LOG_DIR"

# Kill any old processes
pkill -9 -f "node server.js" 2>/dev/null || true
pkill -9 -f "cloudflared tunnel" 2>/dev/null || true
sleep 2

# Start backend (serves frontend + API on single port 5000)
cd "$BACKEND_DIR"
nohup node server.js > "$LOG_DIR/backend.log" 2>&1 &
BACKEND_PID=$!
echo "✅ Backend started (PID $BACKEND_PID)"
sleep 3

# Health check
if ! curl -sf http://localhost:5000/health > /dev/null; then
  echo "❌ Backend failed to start. Check $LOG_DIR/backend.log"
  exit 1
fi
echo "✅ Backend healthy: http://localhost:5000/health"

# Start Cloudflare quick tunnel
nohup "$TUNNEL_BIN" tunnel --url http://localhost:5000 --no-autoupdate \
  > "$LOG_DIR/tunnel.log" 2>&1 &
TUNNEL_PID=$!
echo "✅ Tunnel started (PID $TUNNEL_PID)"

# Wait for URL to appear
URL=""
for i in {1..15}; do
  URL=$(grep -oE "https://[a-z0-9-]+\.trycloudflare\.com" "$LOG_DIR/tunnel.log" | head -1)
  if [ -n "$URL" ]; then break; fi
  sleep 1
done

if [ -z "$URL" ]; then
  echo "❌ Tunnel URL not found. Check $LOG_DIR/tunnel.log"
  exit 1
fi

echo ""
echo "🌍 PUBLIC URL: $URL"
echo ""
echo "Share this link with anyone. It works as long as your PC stays on."
echo ""
echo "To stop everything: ./go-public.sh stop"
echo "Or manually:"
echo "  kill $BACKEND_PID $TUNNEL_PID"

# Save PIDs for stop
echo "$BACKEND_PID" > "$LOG_DIR/backend.pid"
echo "$TUNNEL_PID" > "$LOG_DIR/tunnel.pid"
echo "$URL" > "$LOG_DIR/url.txt"