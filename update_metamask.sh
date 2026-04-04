#!/bin/bash
# Script untuk memperbarui MetaMask ke versi terbaru (Manifest V3)
METAMASK_ID="nkbihfbeogaeaoehlefnkodbefgpgknn"
URL="https://clients2.google.com/service/update2/crx?response=redirect&prodversion=120.0&x=id%3D${METAMASK_ID}%26installsource%3Dondemand%26uc"

echo "Step 1: Mengunduh MetaMask Extension (Manifest V3)..."
# Gunakan User-Agent agar tidak diblokir Google
USER_AGENT="Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"
curl -L -A "$USER_AGENT" -o metamask.zip "$URL"

# Cek apakah file terunduh (minimal 5MB untuk MetaMask)
FILE_SIZE=$(stat -c%s "metamask.zip" 2>/dev/null || echo 0)
if [ "$FILE_SIZE" -lt 1000000 ]; then
    echo "❌ Unduhan gagal atau file terlalu kecil ($FILE_SIZE bytes). Cek koneksi internet VPS Anda."
    exit 1
fi

echo "Step 2: Mengekstrak ke folder metamask-extension..."
# Hapus folder lama
rm -rf metamask-extension
mkdir -p metamask-extension

# Mencari offset ZIP menggunakan Python3 (lebih akurat di berbagai versi Linux)
OFFSET=$(python3 -c "import sys; f=open('metamask.zip','rb'); d=f.read(); print(d.find(b'\x50\x4b\x03\x04'))" 2>/dev/null)

if [ "$OFFSET" == "-1" ] || [ -z "$OFFSET" ]; then
    echo "❌ Gagal menemukan data ZIP di dalam file CRX menggunakan Python."
    # Fallback ke grep jika python gagal
    OFFSET=$(grep -aobP "\x50\x4b\x03\x04" metamask.zip | head -n 1 | cut -d: -f1)
fi

echo "Offset ditemukan di: $OFFSET. Memproses..."
# Buat file zip murni tanpa header CRX
dd if=metamask.zip of=metamask_clean.zip bs=1 skip=$OFFSET > /dev/null 2>&1

# Ekstrak file zip murni
unzip -o metamask_clean.zip -d metamask-extension > /dev/null 2>&1

# Cek apakah berhasil
if [ -f metamask-extension/manifest.json ]; then
    echo "✅ MetaMask berhasil diperbarui ke MV3!"
    VERSION=$(cat metamask-extension/manifest.json | grep '"version"' | head -n 1 | cut -d: -f2 | tr -d '", ')
    echo "Versi terpasang: $VERSION"
else
    echo "❌ Ekstraksi gagal meskipun sudah membuang header."
fi

# Cleanup
rm -f metamask.zip metamask_clean.zip
