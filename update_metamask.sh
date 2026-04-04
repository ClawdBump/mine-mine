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

# Mencari offset tanda tangan ZIP (PK\x03\x04) untuk membuang header CRX
OFFSET=$(grep -aobP "\x50\x4b\x03\x04" metamask.zip | head -n 1 | cut -d: -f1)

if [ -z "$OFFSET" ]; then
    echo "❌ Gagal menemukan data ZIP di dalam file CRX."
    exit 1
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
