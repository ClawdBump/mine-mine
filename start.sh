# 1. Menyalakan Xvfb (Virtual Display) di background
Xvfb :99 -screen 0 1024x768x24 &
sleep 2

# 2. Tambahkan ini agar bot tahu layar mana yang digunakan
export DISPLAY=:99

# 3. Menyalakan x11vnc (VNC Server) di background (Tanpa password)
x11vnc -display :99 -forever -nopw -noxdamage -rfbport 5900 &
sleep 2

# 4. Menyalakan websockify (noVNC Bridge) untuk akses browser
# Secara default novnc di Ubuntu ada di /usr/share/novnc
websockify --web /usr/share/novnc ${PORT:-8080} localhost:5900 &
sleep 2

echo "VNC Server Aktif! Silakan buka: http://IP_VPS:8080/vnc.html"

# 5. Jalankan bot utama
node bot.js
