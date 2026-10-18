#!/bin/bash
# deploy.sh — Run this on cPanel SSH Terminal to fully redeploy
# Usage: cd ~/ffmpeg.olivosoft.com && bash deploy.sh

set -e

APP_DIR="$HOME/ffmpeg.olivosoft.com"
cd "$APP_DIR"
echo "=== Working in: $(pwd) ==="

# Step 1: Kill any stuck Node processes
echo ""
echo "[1/5] Killing old Node.js processes..."
pkill -f "node server.js" 2>/dev/null && echo "Killed old process." || echo "No old process found."
sleep 2

# Step 2: Install dependencies
echo ""
echo "[2/5] Installing dependencies..."
npm install --omit=dev

# Step 3: Build
echo ""
echo "[3/5] Building Next.js app..."
npm run build

# Step 4: Fix storage directory permissions
echo ""
echo "[4/5] Setting up storage directories..."
mkdir -p "$APP_DIR/storage/uploads"
mkdir -p "$APP_DIR/storage/outputs"
chmod -R 777 "$APP_DIR/storage"
echo "Storage directories ready."

# Step 5: Fix FFmpeg binary permissions
echo ""
echo "[5/5] Fixing FFmpeg binary permissions..."
FFMPEG_PATH=$(node -e "try { console.log(require('ffmpeg-static')); } catch(e) { console.log(''); }")
if [ -n "$FFMPEG_PATH" ]; then
  chmod 755 "$FFMPEG_PATH"
  echo "ffmpeg-static: $FFMPEG_PATH — chmod 755 done."
fi

FFPROBE_PATH=$(node -e "try { const f = require('@ffprobe-installer/ffprobe'); console.log(f.path); } catch(e) { console.log(''); }")
if [ -n "$FFPROBE_PATH" ]; then
  chmod 755 "$FFPROBE_PATH"
  echo "ffprobe: $FFPROBE_PATH — chmod 755 done."
fi

echo ""
echo "=== DONE. Now go to cPanel > Node.js > STOP then START your app. ==="
echo "=== Then visit https://ffmpeg.olivosoft.com/api/test to verify ==="

