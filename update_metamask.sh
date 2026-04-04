#!/bin/bash
# Script untuk memperbarui MetaMask ke versi terbaru (Manifest V3)
METAMASK_ID="nkbihfbeogaeaoehlefnkodbefgpgknn"
URL="https://clients2.google.com/service/update2/crx?response=redirect&prodversion=120.0&x=id%3D${METAMASK_ID}%26installsource%3Dondemand%26uc"

echo "Step 1: Mengunduh MetaMask Extension (Manifest V3)..."
curl -L -o metamask.zip "$URL"

if [ ! -f metamask.zip ]; then
    echo "Gagal mengunduh file!"
    exit 1
fi

echo "Step 2: Mengekstrak ke folder metamask-extension..."
# Hapus folder lama
rm -rf metamask-extension
mkdir -p metamask-extension

# Ekstrak file (ignore error header CRX karena unzip Linux biasanya bisa menangani)
unzip -o metamask.zip -d metamask-extension > /dev/null 2>&1

# Cek apakah berhasil
if [ -f metamask-extension/manifest.json ]; then
    echo "✅ MetaMask berhasil diperbarui ke MV3!"
    cat metamask-extension/manifest.json | grep '"version"' | head -n 1
else
    echo "❌ Ekstraksi gagal. Mencoba metode alternatif..."
    # Jika unzip gagal, biasanya karena header CRX. Kita coba bersihkan foldernya.
    rm -rf metamask-extension
    mkdir -p metamask-extension
    # Gunakan tool 'unzip' dengan paksa atau sarankan manual jika tetap gagal
    echo "Harap pastikan 'unzip' terinstall (sudo apt install unzip)."
fi

# Cleanup
rm -f metamask.zip
