#!/bin/bash

# ==============================================================================
# AWS LIGHTSAIL / EC2 (UBUNTU 22.04 LTS) - SETUP SCRIPT FOR GEMMINER BOT
# ==============================================================================

# 1. Update dan Upgrade System
echo "[1/6] Update system & installing basics..."
sudo apt update && sudo apt upgrade -y
sudo apt install -y curl git unzip xvfb libgbm1 libnss3 libasound2 x11-utils x11vnc

# 2. Install Node.js v20 (LTS)
echo "[2/6] Installing Node.js v20..."
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
sudo apt install -y nodejs

# 3. Clone Repository (Ganti URL jika repository Anda berbeda)
# Jika sudah ada folder bot di server, bagian ini bisa dilewati
# git clone https://github.com/[YOUR-USERNAME]/[YOUR-REPO].git
# cd [YOUR-REPO]

# 4. Install Dependencies
echo "[3/6] Installing NPM packages..."
npm install

# 5. Install Playwright Dependencies (Paling Penting!)
echo "[4/6] Installing Playwright Chromium dependencies..."
npx playwright install chromium --with-deps

# 6. Setup noVNC (Untuk monitoring bot dari browser)
echo "[5/6] Setting up noVNC for remote monitoring..."
if [ ! -d "/opt/noVNC" ]; then
    sudo git clone https://github.com/novnc/noVNC.git /opt/noVNC
    sudo git clone https://github.com/novnc/websockify.git /opt/noVNC/utils/websockify
    sudo ln -s /opt/noVNC/vnc.html /opt/noVNC/index.html
fi

# 7. Selesai
echo ""
echo "============================================================"
echo "SINKRONISASI SELESAI!"
echo "============================================================"
echo "1. Pastikan Anda sudah membuat file .env yang berisi:"
echo "   SECRET_SEED_PHRASE=..."
echo "   PROXY_URL=..."
echo ""
echo "2. Cara Menjalankan Bot + Monitor (Gunakan screen agar tetap nyala):"
echo "   xvfb-run --server-args='-screen 0 1280x1024x24' node bot.js"
echo ""
echo "3. Cara Melihat Layar Bot dari Browser (Buka Port 8080 di AWS):"
echo "   x11vnc -display :99 -forever -shared -bg"
echo "   /opt/noVNC/utils/novnc_proxy --vnc localhost:5900 --listen 8080"
echo ""
echo "Akses dari PC Anda: http://[IP-AWS-ANDA]:8080/vnc.html"
echo "============================================================"
