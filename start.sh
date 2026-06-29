#!/bin/bash
# ============================================================================
#  ESP Device Manager — Production Start Script
# ============================================================================
#  Runs both the Next.js dashboard and the device-service on a single server.
#  Use this with PM2, systemd, or any process manager.
#
#  Prerequisites:
#    - bun installed
#    - .env file configured with Turso credentials
#    - bun run build has been run (for Next.js production build)
# ============================================================================

set -e

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
cd "$SCRIPT_DIR"

echo "=========================================="
echo "  ESP Device Manager — Starting"
echo "=========================================="

# Verify .env exists
if [ ! -f .env ]; then
  echo "ERROR: .env file not found. Copy .env.example to .env and fill in your Turso credentials."
  exit 1
fi

# Verify DATABASE_URL is set to Turso (not local file)
source .env
if [[ "$DATABASE_URL" != libsql://* ]]; then
  echo "WARNING: DATABASE_URL is not a Turso URL ($DATABASE_URL)"
  echo "         For production, set DATABASE_URL=libsql://esp-manager-xxx.turso.io"
  echo "         Continuing anyway..."
fi

# Start device-service in background
echo ""
echo "[1/2] Starting device-service (ports 3003 + 3004)..."
cd mini-services/device-service
bun run index.ts &
DEVICE_SERVICE_PID=$!
cd "$SCRIPT_DIR"
echo "    PID: $DEVICE_SERVICE_PID"

# Give device-service a moment to start
sleep 2

# Start Next.js in foreground
echo ""
echo "[2/2] Starting Next.js dashboard (port 3000)..."
echo "=========================================="
exec bun run start
