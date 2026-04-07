#!/bin/bash

echo "=========================================================="
echo "HARD RESTART: Membersihkan semua sisa proses bot..."
echo "=========================================================="

# 1. Matikan semua proses paksa (-9)
sudo pkill -9 node 2>/dev/null
sudo pkill -9 chrome 2>/dev/null
sudo pkill -9 Xvfb 2>/dev/null
sudo pkill -9 x11vnc 2>/dev/null
sudo pkill -9 websockify 2>/dev/null

# 2. Hapus file lock layar (PENTING mencegah Xvfb fail)
sudo rm -rf /tmp/.X*-lock /tmp/.X11-unix/X* 2>/dev/null

# 3. Hapus cache browser agar data korup atau session gantung hilang
echo "-> Menghapus folder data browser (chrome_data)..."
rm -rf chrome_data

sleep 2
echo "-> Memulai ulang bot via start.sh..."
chmod +x start.sh
./start.sh
