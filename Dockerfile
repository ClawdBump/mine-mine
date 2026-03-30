FROM mcr.microsoft.com/playwright:v1.39.0-jammy

WORKDIR /app

# Salin file pendaftaran npm dan install
COPY package*.json ./
RUN npm install

# Salin skrip dan MetaMask
COPY . .

# Install alat visual: X Virtual Framebuffer, VNC Server, dan noVNC (Web Client)
RUN apt-get update && apt-get install -y xvfb x11vnc novnc websockify

# Variabel Lingkungan agar Chrome menemukan TV Gaibnya
ENV DISPLAY=:99

# Beri hak akses eksekusi file starter
RUN chmod +x start.sh

# Jalankan game dengan monitor halusinasi
CMD ["./start.sh"]
