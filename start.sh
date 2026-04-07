#!/bin/bash

# Muat variabel dari file .env jika ada
if [ -f .env ]; then
  set -a
  source .env
  set +a
fi

# Tentukan nilai default
DISP_NUM=${DISPLAY_NUM:-99}
VNC_P=${VNC_PORT:-8080}
RFB_P=${VNC_RFB_PORT:-5900}

# 1. Pilih Jalur noVNC (Cek di /opt atau ~/ atau /usr/share)
if [ -d "/opt/noVNC" ]; then
    NOVNC_DIR="/opt/noVNC"
elif [ -d "$HOME/noVNC" ]; then
    NOVNC_DIR="$HOME/noVNC"
else
    NOVNC_DIR="/usr/share/novnc"
fi

# 0. Bersihkan sisa proses lama
sudo pkill -9 Xvfb chrome x11vnc websockify node 2>/dev/null
sudo rm -rf /tmp/.X${DISP_NUM}-lock /tmp/.X11-unix/X${DISP_NUM} 2>/dev/null

# 1. Menyalakan Xvfb
echo "-> Menyalakan Layar Virtual :${DISP_NUM}..."
Xvfb :${DISP_NUM} -screen 0 1366x1024x24 &
sleep 3

export DISPLAY=:${DISP_NUM}

# 2. Menyalakan x11vnc
echo "-> Menyalakan VNC Server..."
x11vnc -display :${DISP_NUM} -forever -nopw -noxdamage -shared -rfbport ${RFB_P} -bg

# 3. Menyalakan noVNC Proxy (Menggunakan novnc_proxy agar lebih kompatibel)
echo "-> Menyalakan noVNC Bridge di port ${VNC_P}..."
if [ -f "${NOVNC_DIR}/utils/novnc_proxy" ]; then
    ${NOVNC_DIR}/utils/novnc_proxy --vnc localhost:${RFB_P} --listen ${VNC_P} &
else
    # Fallback jika tidak ada proxy script
    python3 -m websockify --web ${NOVNC_DIR} ${VNC_P} localhost:${RFB_P} &
fi

sleep 3
echo "=========================================================="
echo "SISTEM AKTIF! Buka: http://[IP_AWS]:${VNC_P}/vnc.html"
echo "=========================================================="

# 4. Jalankan bot utama
node bot.js
