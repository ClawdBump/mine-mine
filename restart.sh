#!/bin/bash
echo "Menghentikan semua proses bot GemMiner..."
pkill -f node
pkill -f Xvfb
pkill -f x11vnc
pkill -f websockify
sleep 2

# Hapus cache browser agar fresh
rm -rf chrome_data

echo "Memulai ulang bot..."
./start.sh
