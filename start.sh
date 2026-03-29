#!/bin/bash
echo "Menyalakan Televisi Virtual (XVFB) untuk Chrome..."
# Menyalakan simulator monitor dengan resolusi HD
xvfb-run -a --server-args="-screen 0 1280x1024x24" node bot.js
