#!/bin/bash

# Muat variabel dari file .env jika ada
if [ -f .env ]; then
  set -a
  source .env
  set +a
fi

# Tentukan nilai default jika tidak ada di .env
DISP_NUM=${DISPLAY_NUM:-99}
VNC_P=${VNC_PORT:-8080}
RFB_P=${VNC_RFB_PORT:-5900}
WEB_DIR="/opt/noVNC" # Updated for AWS setup

# 0. Bersihkan sisa proses & lock file lama (PENTING untuk AWS)
sudo pkill -9 Xvfb chrome x11vnc websockify node 2>/dev/null
sudo rm -rf /tmp/.X${DISP_NUM}-lock /tmp/.X11-unix/X${DISP_NUM} 2>/dev/null

# 1. Menyalakan Xvfb (Virtual Display) di background
echo "-> Menyalakan Virtual Display :${DISP_NUM}..."
Xvfb :${DISP_NUM} -screen 0 1366x1024x24 &
sleep 3

# 2. Tambahkan ini agar bot tahu layar mana yang digunakan
export DISPLAY=:${DISP_NUM}

# 3. Menyalakan x11vnc (VNC Server) di background
# Ditambah -shared agar koneksi lebih stabil
echo "-> Menyalakan VNC Server..."
x11vnc -display :${DISP_NUM} -forever -nopw -noxdamage -shared -rfbport ${RFB_P} -bg -o /tmp/x11vnc.log

# 4. Menyalakan websockify (noVNC Bridge) untuk akses browser
echo "-> Menyalakan noVNC Proxy di port ${VNC_P}..."
/opt/noVNC/utils/websockify/run.py --web ${WEB_DIR} ${VNC_P} localhost:${RFB_P} &
sleep 2

echo "=========================================================="
echo "BOT & VNC AKTIF!"
echo "Akses Monitor: http://[IP_AWS]:${VNC_P}/vnc.html"
echo "=========================================================="

# 5. Jalankan bot utama
node bot.js
