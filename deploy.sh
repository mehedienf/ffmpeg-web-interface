#!/bin/bash
# deploy.sh — Run this on cPanel SSH Terminal to fully redeploy
# Usage: cd ~/ffmpeg.olivosoft.com && bash deploy.sh

set -e

APP_DIR="$HOME/ffmpeg.olivosoft.com"
cd "$APP_DIR"
echo "=== Working in: $(pwd) ==="

# Step 1: Verify the required Node.js runtime
echo ""
echo "[1/7] Checking Node.js version..."
NODE_MAJOR=$(node -p "process.versions.node.split('.')[0]")
NODE_VERSION=$(node -p "process.versions.node")
if [ "$NODE_MAJOR" != "20" ]; then
  echo "ERROR: Node.js 20 is required; detected Node.js $NODE_VERSION."
  exit 1
fi
echo "Node.js $NODE_VERSION OK."

# Step 2: Install dependencies
echo ""
echo "[2/7] Installing dependencies for the production build..."
npm ci --no-audit --no-fund

# Step 3: Build
echo ""
echo "[3/7] Building Next.js app..."
npm run build

# Step 4: Verify manually uploaded FFmpeg binaries
echo ""
echo "[4/7] Verifying project FFmpeg binaries..."
for binary in "$APP_DIR/bin/ffmpeg" "$APP_DIR/bin/ffprobe"; do
  if [ ! -f "$binary" ]; then
    echo "ERROR: Missing binary: $binary"
    exit 1
  fi
  chmod 755 "$binary"
  "$binary" -version >/dev/null
  echo "Verified: $binary"
done

# Step 5: Remove development dependencies
echo ""
echo "[5/7] Removing development dependencies..."
npm prune --omit=dev --no-audit --no-fund

# Step 6: Fix storage directory permissions
echo ""
echo "[6/7] Setting up storage directories..."
mkdir -p "$APP_DIR/storage/uploads"
mkdir -p "$APP_DIR/storage/outputs"
chmod -R 755 "$APP_DIR/storage"
echo "Storage directories ready."

# Step 7: Complete
echo ""
echo "=== DONE. Now go to cPanel > Node.js > STOP then START your app. ==="
echo "=== Then visit https://ffmpeg.olivosoft.com/api/test to verify ==="
