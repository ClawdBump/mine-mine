# 1. Menyalakan Xvfb (Virtual Display) di background
Xvfb :99 -screen 0 1024x768x24 &
sleep 2

# 2. Menyalakan x11vnc (VNC Server) di background (Tanpa password)
x11vnc -display :99 -forever -nopw -noxdamage -rfbport 5900 &
sleep 2

# 3. Menyalakan websockify (noVNC Bridge) di port publik ($PORT)
# Ini memungkinkan Anda membuka URL bot di browser untuk melihat visualnya
websockify --web /usr/share/novnc ${PORT:-8080} localhost:5900 &
sleep 2

echo "VNC Server Aktif! Silakan buka URL Railway Anda pada /vnc.html"
echo "Contoh: https://bot-anda.railway.app/vnc.html"

# 4. Jalankan bot utama
node bot.js
