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

# 1. Menyalakan Xvfb (Virtual Display) di background
Xvfb :${DISP_NUM} -screen 0 1366x1024x24 &
sleep 2

# 2. Tambahkan ini agar bot tahu layar mana yang digunakan
export DISPLAY=:${DISP_NUM}

# 3. Menyalakan x11vnc (VNC Server) di background (Tanpa password)
x11vnc -display :${DISP_NUM} -forever -nopw -noxdamage -rfbport ${RFB_P} -ncache 10 -ncache_cr &
sleep 2

# 4. Menyalakan websockify (noVNC Bridge) untuk akses browser
websockify --web /usr/share/novnc ${VNC_P} localhost:${RFB_P} &
sleep 2

echo "=========================================================="
echo "VNC Server Aktif! Buka: http://IP_VPS:${VNC_P}/vnc.html"
echo "Info Sistem -> DISPLAY=:${DISP_NUM} | VNC_PORT=${VNC_P}"
echo "=========================================================="

# 5. Jalankan bot utama
node bot.js
