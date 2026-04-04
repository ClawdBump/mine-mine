const path = require('path');
const { chromium } = require('playwright');
require('dotenv').config();

const METAMASK_PATH = path.join(__dirname, 'metamask-extension').replace(/\\/g, '/');
const USER_DATA_DIR = path.join(__dirname, 'chrome_data').replace(/\\/g, '/');

const SEED_PHRASE = process.env.SECRET_SEED_PHRASE;
const PASSWORD = 'BotPassword123!';

// ============================================================
// HELPER: Tunggu kondisi DOM terpenuhi sebelum lanjut
// Mengecek evaluator setiap `interval` ms, timeout setelah `timeout` ms
// ============================================================
async function waitForCondition(page, evaluator, opts = {}) {
    const { timeout = 30000, interval = 500, label = 'kondisi' } = opts;
    const start = Date.now();
    while (Date.now() - start < timeout) {
        try {
            const result = await evaluator();
            if (result) return result;
        } catch (e) { /* abaikan error sementara */ }
        await page.waitForTimeout(interval);
    }
    throw new Error(`Timeout menunggu ${label} setelah ${timeout}ms`);
}

// ============================================================
// HELPER: Log dengan timestamp agar urutan bisa dilacak
// ============================================================
function log(msg) {
    const ts = new Date().toISOString().split('T')[1].split('.')[0];
    console.log(`[${ts}] ${msg}`);
}

(async () => {
    if (!SEED_PHRASE || SEED_PHRASE.length < 20) {
        console.error("ERROR: Harap isi variabel SECRET_SEED_PHRASE di Dashboard Railway Anda!");
        process.exit(1);
    }

    log("Memulai bot dan MetaMask menggunakan Sistem AI Cerdas...");

    try {
        const context = await chromium.launchPersistentContext(USER_DATA_DIR, {
            headless: false,
            args: [
                `--disable-extensions-except=${METAMASK_PATH}`,
                `--load-extension=${METAMASK_PATH}`,
                '--disable-blink-features=AutomationControlled'
            ]
        });

        // ==============================
        // FASE 0: SETUP METAMASK
        // ==============================
        log("[SETUP] Mendeteksi ekstensi MetaMask...");
        
        // Cari halaman MetaMask yang sudah terbuka
        let metamaskPage = context.pages().find(p => p.url().includes('chrome-extension://'));
        let extensionId = "";

        if (metamaskPage) {
            extensionId = metamaskPage.url().split('/')[2];
            log(`[SETUP] ID ditemukan via Tab: ${extensionId}`);
        }
        
        // Jika tidak ada tab MetaMask, coba tunggu sebentar
        if (!metamaskPage) {
            metamaskPage = await context.waitForEvent('page', { timeout: 10000 }).catch(() => null);
        }

        // Jika MASIH tidak ada tab MetaMask (umum terjadi di VPS), paksa buka secara manual
        if (!metamaskPage) {
            log("[SETUP] Tab MetaMask tidak muncul otomatis. Mencoba membuka paksa...");
            
            // Cari ID ekstensi secara dinamis
            
            // Metode 1: Lewat Service Worker (Manifest V3 - Versi Baru)
            const workers = context.serviceWorkers();
            if (workers.length > 0) {
                const url = workers[0].url();
                extensionId = url.split('/')[2];
                log(`[SETUP] ID ditemukan via Service Worker: ${extensionId}`);
            } 
            
            // Metode 2: Lewat Background Pages (Manifest V2 - Versi Lama)
            if (!extensionId) {
                const bgPages = context.backgroundPages();
                if (bgPages.length > 0) {
                    extensionId = bgPages[0].url().split('/')[2];
                    log(`[SETUP] ID ditemukan via Background Page: ${extensionId}`);
                }
            }

            // Metode 3: Tunggu sebentar jika belum terdeteksi (High Latency VPS)
            if (!extensionId) {
                log("[SETUP] Menunggu Service Worker aktif...");
                const worker = await context.waitForEvent('serviceworker', { timeout: 15000 }).catch(() => null);
                if (worker) extensionId = worker.url().split('/')[2];
            }

            if (extensionId) {
                log(`[SETUP] Membuka paksa onboarding MetaMask...`);
                metamaskPage = await context.newPage();
                await metamaskPage.goto(`chrome-extension://${extensionId}/home.html#onboarding`);
            } else {
                log("[WARNING] Gagal mendapatkan ID Ekstensi MetaMask. Melewati setup.");
            }
        }

        if (!metamaskPage || !metamaskPage.url().includes('chrome-extension://')) {
            log("[WARNING] Gagal mendeteksi halaman MetaMask. Menunggu 15 detik lagi...");
            await context.waitForTimeout(15000);
            metamaskPage = context.pages().find(p => p.url().includes('chrome-extension://'));
        }

        if (!metamaskPage) {
            log("[ERROR] MetaMask tidak dapat ditemukan sama sekali. Melewati Fase Autologin.");
        } else {
            // Pastikan extensionId terisi jika tadi terlewat
            if (!extensionId) {
                extensionId = metamaskPage.url().split('/')[2];
                log(`[SETUP] ID di-ekstrak dari URL: ${extensionId}`);
            }

            log("[SETUP] Halaman MetaMask terdeteksi. Menjalankan Autologin...");
            
            // Paksa tunggu halaman React MetaMask selesai render
            await metamaskPage.waitForLoadState('domcontentloaded');
            await metamaskPage.waitForTimeout(5000);

            try {
                // Tahap 1: Persetujuan (I Agree)
                log("  [0.1] Menunggu halaman persetujuan (Terms)...");
                const termsCheck = metamaskPage.locator('[data-testid="onboarding-terms-checkbox"]');
                await termsCheck.waitFor({ state: 'attached', timeout: 10000 });
                await termsCheck.click({ force: true });
                log("  [0.1] ✓ Berhasil mencentang kotak persetujuan!");

                const importBtn = metamaskPage.locator('[data-testid="onboarding-import-wallet"]');
                await importBtn.waitFor({ state: 'visible', timeout: 5000 });
                await importBtn.click();
                log("  [0.1] ✓ Berhasil menekan Import Wallet!");

                // Verifikasi: Tunggu halaman Import benar-benar muncul
                await metamaskPage.waitForTimeout(2000);

                // Tahap 2: Telemetry No Thanks
                log("  [0.2] Menangani halaman Telemetry...");
                const noThanks = metamaskPage.locator('button', { hasText: /No Thanks|I agree/i }).first();
                if (await noThanks.isVisible({ timeout: 3000 }).catch(() => false)) {
                    const exactNoThanks = metamaskPage.locator('button:has-text("No thanks")').first();
                    if (await exactNoThanks.isVisible().catch(() => false)) {
                        await exactNoThanks.click();
                    } else {
                        await noThanks.click();
                    }
                    log("  [0.2] ✓ Telemetry ditangani!");
                    // Verifikasi: Tunggu halaman seed phrase muncul
                    await metamaskPage.waitForTimeout(2000);
                }

                // Tahap 3: Input Seed phrase
                log("  [0.3] Menunggu form Seed Phrase muncul...");
                const words = SEED_PHRASE.trim().split(/\s+/);
                
                const firstInput = metamaskPage.locator('input').first();
                await firstInput.waitFor({ state: 'visible', timeout: 10000 });
                log("  [0.3] Form Seed Phrase terdeteksi. Mengisi...");
                
                for (let i = 0; i < 12; i++) {
                    const exactBox = metamaskPage.locator(`[data-testid="import-srp__srp-word-${i}"]`).first();
                    if (await exactBox.isVisible({ timeout: 2000 }).catch(() => false)) {
                        await exactBox.focus();
                        await exactBox.fill(words[i]);
                        await metamaskPage.waitForTimeout(50);
                    } else {
                        log(`  [0.3] ⚠ Kotak urutan ${i} tidak terdeteksi.`);
                    }
                }
                
                const confirmSrpBtn = metamaskPage.locator('button', { hasText: /Confirm Secret Recovery Phrase/i });
                await confirmSrpBtn.click();
                log("  [0.3] ✓ Seed phrase dimasukkan dan dikonfirmasi!");
                
                // Verifikasi: Tunggu form password muncul
                await metamaskPage.locator('input[type="password"]').first().waitFor({ state: 'visible', timeout: 10000 });

                // Tahap 4: Bikin Password
                log("  [0.4] Membuat Password dompet...");
                const passInputs = metamaskPage.locator('input[type="password"]');
                await passInputs.nth(0).fill(PASSWORD);
                await passInputs.nth(1).fill(PASSWORD);
                
                const termsPass = metamaskPage.locator('input[type="checkbox"]').first();
                await termsPass.click({ force: true });
                
                await metamaskPage.locator('button', { hasText: /Import my wallet/i }).click();
                log("  [0.4] ✓ Password dibuat dan wallet di-import!");

                // ==============================
                // CLEANUP: Tunggu dan tutup congrats popup
                // ==============================
                log("  [0.5] Menunggu layar konfirmasi (Congrats)...");
                await metamaskPage.waitForTimeout(5000);
                
                for (let i = 0; i < 6; i++) {
                    const infoBtn = metamaskPage.locator(
                        'button:has-text("Got it"), ' +
                        'button:has-text("Next"), ' +
                        'button:has-text("Done"), ' +
                        'button:has-text("Close"), ' +
                        'button[aria-label="Close"]'
                    ).first();
                    
                    if (await infoBtn.isVisible({ timeout: 2000 }).catch(() => false)) {
                        const txt = await infoBtn.innerText().catch(() => "Tombol");
                        log(`  [0.5] Klik: [${txt}]`);
                        await infoBtn.click({ force: true });
                        await metamaskPage.waitForTimeout(1500);
                    } else {
                        break; 
                    }
                }
                log("  [0.5] ✓ Tab MetaMask Bersih.");

                // ==============================
                // SETUP JARINGAN BASE (Manual Flow sesuai saran User)
                // ==============================
                log("\n[SETUP] Menambahkan Jaringan Base sesuai alur visual...");
                
                try {
                    // 1. Klik opsi Ethereum Mainnet (Pojok kiri atas)
                    log("  [0.6] Klik pemilih jaringan (Top-left)...");
                    const networkSelector = metamaskPage.locator('[data-testid="network-display"], .network-display').first();
                    await networkSelector.click();
                    await metamaskPage.waitForTimeout(1500);

                    // 2. Klik button "Add network" (seperti yang Anda tunjukkan)
                    log("  [0.6] Klik button 'Add network'...");
                    const addNetworkBtn = metamaskPage.locator('button:has-text("Add network")').first();
                    await addNetworkBtn.click();
                    await metamaskPage.waitForLoadState('domcontentloaded');
                    await metamaskPage.waitForTimeout(3000);

                    // 3. Cari Base di daftar jaringan populer
                    log("  [0.7] Mencari Base di daftar jaringan populer...");
                    const baseRow = metamaskPage.locator('.networks-tab__item, .network-card, .add-network__network-list-item', { hasText: /Base/i }).first();
                    const addBtn = baseRow.locator('button.add-network__add-button, button:has-text("Add")').first();

                    if (await addBtn.isVisible({ timeout: 5000 }).catch(() => false)) {
                        log("  [0.7] Klik 'Add' untuk Base...");
                        await addBtn.click();
                        await metamaskPage.waitForTimeout(2000);

                        // Klik "Approve" di layar konfirmasi detail
                        const approveBtn = metamaskPage.locator('button:has-text("Approve")').first();
                        if (await approveBtn.isVisible({ timeout: 5000 }).catch(() => false)) {
                            await approveBtn.click();
                            log("  [0.7] ✓ Detail Jaringan Approve!");
                        }

                        // Klik "Switch to Base"
                        await metamaskPage.waitForTimeout(2000);
                        const switchBtn = metamaskPage.locator('button', { hasText: /Switch to Base|Switch/i }).first();
                        if (await switchBtn.isVisible({ timeout: 5000 }).catch(() => false)) {
                            await switchBtn.click();
                            log("  [0.7] ✓ Berhasil berpindah ke jaringan Base!");
                        }
                    } else {
                        log("  [WARNING] 'Base' tidak ditemukan di daftar populer. Mencoba buka langsung lewat URL...");
                        await metamaskPage.goto(`chrome-extension://${extensionId}/home.html#settings/networks/add-network`);
                        await metamaskPage.waitForTimeout(3000);
                    }
                } catch (netErr) {
                    log(`  [WARNING] Gagal alur penambahan jaringan: ${netErr.message}`);
                }
                
                await metamaskPage.waitForTimeout(2000);
                log("  [SETUP] Persiapan MetaMask Selesai. Membuka Game...");
            } catch (innerErr) {
                log(`  >> Error setup MetaMask: ${innerErr.message}`);
            }
        }

        // ==============================
        // FASE 1: MUAT GAME
        // ==============================
        log("\n[FASE 1] Memuat https://www.gemminer.app/ ...");
        const gamePage = await context.newPage();
        await gamePage.goto('https://www.gemminer.app/');
        await gamePage.waitForLoadState('networkidle');
        log("[FASE 1] ✓ Halaman game selesai dimuat (networkidle).");
        
        // Tunggu tambahan agar JavaScript game selesai inisialisasi
        await gamePage.waitForTimeout(3000);

        try {
            // ==============================
            // FASE 2: KLIK MINT ACCESS
            // ==============================
            log("\n[FASE 2] Mencari '#burnEntryBtn' via JavaScript DOM (bypass overlay)...");
            
            await waitForCondition(gamePage, async () => {
                // Metode utama: JavaScript DOM click langsung
                const clicked = await gamePage.evaluate(() => {
                    const btn = document.getElementById('burnEntryBtn');
                    if (btn) {
                        const screen = document.getElementById('burnEntryScreen');
                        if (screen) {
                            screen.style.pointerEvents = 'none';
                            screen.querySelectorAll('div').forEach(d => {
                                if (d.id !== 'burnEntryBtn') d.style.pointerEvents = 'none';
                            });
                        }
                        btn.click();
                        btn.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));
                        return true;
                    }
                    return false;
                }).catch(() => false);
                
                if (clicked) return true;
                
                // Cari di iframes
                for (const frame of gamePage.frames()) {
                    const fClicked = await frame.evaluate(() => {
                        const btn = document.getElementById('burnEntryBtn');
                        if (btn) {
                            const screen = document.getElementById('burnEntryScreen');
                            if (screen) screen.style.pointerEvents = 'none';
                            btn.click();
                            btn.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));
                            return true;
                        }
                        if (typeof _burnEntryClick === 'function') { _burnEntryClick(); return true; }
                        return false;
                    }).catch(() => false);
                    if (fClicked) return true;
                }
                
                // Cek juga "Tap To Begin" yang bisa menghalangi
                await gamePage.evaluate(() => {
                    const tap = document.querySelector('.prompt[data-i18n="startPrompt"]');
                    if (tap) tap.click();
                }).catch(() => {});
                
                return false;
            }, { timeout: 120000, interval: 2000, label: 'burnEntryBtn' });
            
            log("[FASE 2] ✓ Mint Access berhasil diklik!");

            // Bersihkan overlay agar tidak mengganggu fase selanjutnya
            await gamePage.evaluate(() => {
                const screen = document.getElementById('burnEntryScreen');
                if (screen) { screen.style.pointerEvents = 'none'; screen.style.display = 'none'; }
            }).catch(() => {});
            
            // VERIFIKASI: Tunggu hingga popup wallet atau tombol MetaMask benar-benar muncul
            log("[FASE 2] Memverifikasi: Menunggu popup wallet muncul...");
            await waitForCondition(gamePage, async () => {
                return await gamePage.evaluate(() => {
                    const els = document.querySelectorAll('button, div');
                    for (const el of els) {
                        if (el.textContent && el.textContent.trim() === 'MetaMask' && el.offsetParent !== null) return true;
                    }
                    return false;
                }).catch(() => false);
            }, { timeout: 15000, interval: 1000, label: 'popup wallet MetaMask' });
            log("[FASE 2] ✓ Popup wallet terverifikasi muncul!");

            // ==============================
            // FASE 3: PILIH METAMASK
            // ==============================
            log("\n[FASE 3] Memilih MetaMask...");
            
            const mmClicked = await gamePage.evaluate(() => {
                const els = document.querySelectorAll('button, div');
                for (const el of els) {
                    if (el.textContent && el.textContent.trim() === 'MetaMask' && el.offsetParent !== null) {
                        el.click();
                        el.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));
                        return true;
                    }
                }
                return false;
            }).catch(() => false);
            
            if (!mmClicked) {
                // Fallback: Playwright force click
                const mmLnk = gamePage.locator('button, div').filter({ hasText: /^MetaMask$/i }).first();
                await mmLnk.click({ force: true, timeout: 5000 });
            }
            log("[FASE 3] ✓ MetaMask dipilih!");
            
            // VERIFIKASI: Tunggu popup MetaMask notification benar-benar muncul
            log("[FASE 3] Memverifikasi: Menunggu popup notifikasi MetaMask...");
            await gamePage.waitForTimeout(2000);

            // ==============================
            // FASE 4: APPROVE SEMUA POPUP METAMASK (Sekuensial)
            // ==============================
            log("\n[FASE 4] Menangani popup MetaMask (Approve/Connect/Sign)...");
            
            let popupCount = 0;
            let noPopupStreak = 0;
            const MAX_NO_POPUP_STREAK = 10; // 10 detik tidak ada popup = selesai
            
            while (noPopupStreak < MAX_NO_POPUP_STREAK) {
                const popup = context.pages().find(p => p.url().includes('notification.html'));
                
                if (popup) {
                    noPopupStreak = 0; // Reset streak
                    try {
                        await popup.bringToFront();
                        // Tunggu popup selesai render
                        await popup.waitForLoadState('domcontentloaded').catch(() => {});
                        await popup.waitForTimeout(500);
                        
                        const actionBtn = popup.locator(
                            'button[data-testid="page-container-footer-next"], ' +
                            'button[data-testid="confirmation-submit-button"], ' +
                            'button:has-text("Next"), ' +
                            'button:has-text("Connect"), ' +
                            'button:has-text("Approve"), ' +
                            'button:has-text("Switch network"), ' +
                            'button:has-text("Switch"), ' + // Fallback untuk Base
                            'button:has-text("Sign")'
                        ).first();

                        if (await actionBtn.isVisible({ timeout: 2000 }).catch(() => false)) {
                            const label = await actionBtn.innerText().catch(() => "Confirm");
                            log(`  [4.${++popupCount}] Perintah MetaMask: [${label}] — Mengklik...`);
                            await actionBtn.click({ force: true });
                            
                            // VERIFIKASI: Tunggu popup benar-benar tertutup atau berubah
                            log(`  [4.${popupCount}] Menunggu popup selesai diproses...`);
                            await popup.waitForTimeout(2000);
                            
                            // Cek apakah popup sudah tertutup
                            const stillExists = context.pages().find(p => p.url().includes('notification.html'));
                            if (stillExists) {
                                // Popup masih ada, mungkin ada tombol lain (multi-step)
                                log(`  [4.${popupCount}] Popup masih terbuka, lanjut scan...`);
                            } else {
                                log(`  [4.${popupCount}] ✓ Popup tertutup.`);
                            }
                        }
                    } catch (pErr) {
                        // Popup tertutup mendadak = sukses
                        log(`  [4.x] Popup tertutup mendadak (normal).`);
                    }
                } else {
                    noPopupStreak++;
                }
                
                await gamePage.waitForTimeout(1000);
            }
            
            log(`[FASE 4] ✓ Semua popup MetaMask ditangani (${popupCount} aksi).`);
            
            // Kembalikan fokus ke game
            await gamePage.bringToFront();
            await gamePage.waitForTimeout(1000);

            // ==============================
            // FASE 5: PILIH BAHASA (English)
            // ==============================
            log("\n[FASE 5] Menunggu tombol bahasa 'ENGLISH'...");
            
            await waitForCondition(gamePage, async () => {
                const btnUS = gamePage.locator('div.lang-card').filter({ hasText: /ENGLISH/i }).first();
                if (await btnUS.isVisible({ timeout: 1000 }).catch(() => false)) {
                    await btnUS.click();
                    return true;
                }
                // Singkirkan Tap To Begin jika menghalangi
                await gamePage.evaluate(() => {
                    const tap = document.querySelector('.prompt[data-i18n="startPrompt"]');
                    if (tap) tap.click();
                }).catch(() => {});
                return false;
            }, { timeout: 60000, interval: 2000, label: 'tombol bahasa ENGLISH' });
            
            log("[FASE 5] ✓ Bahasa ENGLISH terpilih!");
            
            // VERIFIKASI: Tunggu layar karakter benar-benar muncul
            log("[FASE 5] Memverifikasi: Menunggu layar karakter muncul...");
            await waitForCondition(gamePage, async () => {
                // Cek apakah avatar atau HUD sudah muncul
                const avatarVisible = await gamePage.locator('#avatarToad').isVisible({ timeout: 1000 }).catch(() => false);
                const hudVisible = await gamePage.locator('#hud').isVisible({ timeout: 500 }).catch(() => false);
                return avatarVisible || hudVisible;
            }, { timeout: 30000, interval: 1000, label: 'layar pemilihan karakter' });
            log("[FASE 5] ✓ Layar karakter terverifikasi muncul!");

            // ==============================
            // FASE 6: PILIH KARAKTER (Toad)
            // ==============================
            log("\n[FASE 6] Memilih karakter Toad...");
            
            // Cek dulu apakah sudah langsung masuk game (HUD muncul)
            const sudahMasuk = await gamePage.locator('#hud').isVisible({ timeout: 1000 }).catch(() => false);
            
            if (sudahMasuk) {
                log("[FASE 6] ✓ Skip — HUD sudah terdeteksi (game sudah dimulai).");
            } else {
                const charBtn = gamePage.locator('#avatarToad');
                await charBtn.waitFor({ state: 'visible', timeout: 15000 });
                await charBtn.click({ force: true, delay: 100 });
                log("[FASE 6] Karakter Toad diklik!");
                
                // Cari tombol konfirmasi Play
                const playBtn = gamePage.locator('button, div').filter({ hasText: /Play|Start Game|Enter|Start Mining/i }).first();
                if (await playBtn.isVisible({ timeout: 5000 }).catch(() => false)) {
                    await playBtn.click({ force: true });
                    log("[FASE 6] ✓ Konfirmasi Play ditekan!");
                }
                
                // VERIFIKASI: Tunggu HUD game benar-benar muncul
                log("[FASE 6] Memverifikasi: Menunggu HUD game muncul...");
                await waitForCondition(gamePage, async () => {
                    const hudVisible = await gamePage.locator('#hud').isVisible({ timeout: 500 }).catch(() => false);
                    if (!hudVisible) {
                        // Mungkin ada Tap To Begin lagi
                        await gamePage.evaluate(() => {
                            const tap = document.querySelector('.prompt[data-i18n="startPrompt"]');
                            if (tap) tap.click();
                        }).catch(() => {});
                    }
                    return hudVisible;
                }, { timeout: 30000, interval: 1500, label: 'HUD game' });
                log("[FASE 6] ✓ HUD game terverifikasi muncul!");
            }

            // ==============================
            // FASE 7: GAMEPLAY LOOP (Sekuensial, Tanpa setInterval)
            // ==============================
            log("\n[GAMEPLAY] ===== PERMAINAN DIMULAI =====");
            log("[GAMEPLAY] Mesin Penambang dan Radar Bijih aktif.");
            log("[GAMEPLAY] Ctrl+C untuk menghentikan bot.\n");
            
            // Semua logika dalam SATU loop sekuensial
            // TIDAK ADA setInterval — semua berjalan berurutan
            let loopCount = 0;
            
            while (true) {
                loopCount++;
                
                // ----- CEK 1: Apakah karakter mati? (Prioritas Tertinggi) -----
                const isDead = await gamePage.evaluate(() => {
                    const btn = document.getElementById('deathRestartBtn');
                    return btn && btn.offsetParent !== null;
                }).catch(() => false);
                
                if (isDead) {
                    log("-> [MATI] Karakter tewas! Membangkitkan ulang...");
                    await gamePage.evaluate(() => {
                        document.getElementById('deathRestartBtn').click();
                    }).catch(() => {});
                    
                    // VERIFIKASI: Tunggu layar kematian benar-benar hilang
                    await waitForCondition(gamePage, async () => {
                        const stillDead = await gamePage.evaluate(() => {
                            const btn = document.getElementById('deathRestartBtn');
                            return btn && btn.offsetParent !== null;
                        }).catch(() => true);
                        return !stillDead;
                    }, { timeout: 10000, interval: 500, label: 'respawn selesai' }).catch(() => {});
                    
                    log("-> [MATI] ✓ Respawn selesai.");
                    
                    // Bersihkan Tap To Begin pasca respawn
                    await gamePage.waitForTimeout(1500);
                    await gamePage.evaluate(() => {
                        const tap = document.querySelector('.prompt[data-i18n="startPrompt"]');
                        if (tap) tap.click();
                    }).catch(() => {});
                    await gamePage.waitForTimeout(1000);
                    continue; // Kembali ke awal loop
                }
                
                // ----- CEK 2: Apakah ada Tap To Begin menghalangi? -----
                const hasTap = await gamePage.evaluate(() => {
                    const tap = document.querySelector('.prompt[data-i18n="startPrompt"]');
                    if (tap && tap.offsetParent !== null) {
                        tap.click();
                        return true;
                    }
                    return false;
                }).catch(() => false);
                
                if (hasTap) {
                    log("-> Menyingkirkan Tap To Begin...");
                    await gamePage.waitForTimeout(1000);
                    continue;
                }
                
                // ----- CEK 3: Apakah ada popup MetaMask tiba-tiba? -----
                const unexpectedPopup = context.pages().find(p => p.url().includes('notification.html'));
                if (unexpectedPopup) {
                    log("-> [POPUP] Popup MetaMask tak terduga muncul! Menangani...");
                    try {
                        await unexpectedPopup.bringToFront();
                        await unexpectedPopup.waitForTimeout(500);
                        const actionBtn = unexpectedPopup.locator(
                            'button[data-testid="confirmation-submit-button"], ' +
                            'button:has-text("Approve"), button:has-text("Sign"), button:has-text("Connect")'
                        ).first();
                        if (await actionBtn.isVisible({ timeout: 2000 }).catch(() => false)) {
                            await actionBtn.click({ force: true });
                            log("-> [POPUP] ✓ Popup ditangani.");
                        }
                        await gamePage.bringToFront();
                    } catch (e) { /* popup tertutup sendiri */ }
                    await gamePage.waitForTimeout(1000);
                    continue;
                }

                // ----- OPERASI UTAMA: RADAR & NAVIGASI -----
                const radar = await gamePage.evaluate(() => {
                    if (typeof player === 'undefined' || typeof getTile !== 'function') return null;
                    
                    const px = player.x;
                    const py = player.y;
                    const radius = 25;
                    let target = null;
                    let minScore = Infinity;

                    // Definisikan nilai kelangkaan (Hanya fokus pada target user)
                    const rarityMap = {
                        "EMERALD": 50, 
                        "BAICRYSTAL": 80, 
                        "VOIDORE": 100
                    };

                    const targetGems = ["EMERALD", "BAICRYSTAL", "VOIDORE"];

                    for (let y = py - radius; y <= py + radius; y++) {
                        for (let x = px - radius; x <= px + radius; x++) {
                            const tile = getTile(x, y);
                            const def = BLOCK_DEF[tile];
                            
                            // MODIFIKASI: Hanya ambil target spesifik (Emerald, Baicrystal, Voidore)
                            if (def && def.name && targetGems.includes(def.name.toUpperCase())) {
                                const oreName = def.name.toUpperCase();
                                const dx = x - px;
                                const dy = y - py;
                                const dist = Math.sqrt(dx * dx + dy * dy);
                                
                                const rarityScore = rarityMap[oreName] || 0;
                                
                                // Bonus kedalaman (masih dipertahankan agar bot cenderung ke bawah jika skor sama)
                                const depthBonus = dy * 0.15; 

                                // LOGIKA BARU: Rarity score dikalikan 2 untuk memberikan dampak besar pada prioritas
                                // Semakin besar pengurang, semakin "kecil" finalScore, sehingga menjadi target utama
                                const finalScore = dist - (rarityScore * 2) - depthBonus;

                                if (finalScore < minScore) {
                                    minScore = finalScore;
                                    target = { x, y, name: def.name, realDist: dist, rarity: rarityScore };
                                }
                            }
                        }
                    }
                    return { px, py, target };
                }).catch(() => null);

                // Anti-Idle Jitter
                const jX = 500 + Math.floor(Math.random() * 20) - 10;
                const jY = 500 + Math.floor(Math.random() * 20) - 10;
                await gamePage.mouse.move(jX, jY).catch(() => {});

                if (!radar || !radar.target) {
                    if (loopCount % 5 === 0) log("-> [RADAR] Area bersih. Menggali lebih dalam...");
                    await gamePage.keyboard.down('ArrowDown');
                    await gamePage.waitForTimeout(1000);
                    await gamePage.keyboard.up('ArrowDown');
                    await gamePage.waitForTimeout(200);
                    continue;
                }

                const { px, py, target } = radar;
                if (loopCount % 3 === 0) {
                    const prefix = target.rarity >= 40 ? "⭐ [RARE]" : "-> [RADAR]";
                    log(`${prefix} Target: ${target.name} di (${target.x}, ${target.y}). Jarak: ${target.realDist.toFixed(1)}`);
                }

                // Navigasi GoTo (X dulu baru Y)
                let arah = '';
                if (target.x > px) arah = 'ArrowRight';
                else if (target.x < px) arah = 'ArrowLeft';
                else if (target.y > py) arah = 'ArrowDown';
                else if (target.y < py) arah = 'ArrowUp';

                if (arah) {
                    await gamePage.focus('canvas').catch(() => {});
                    await gamePage.keyboard.down(arah);
                    const durasi = Math.floor(Math.random() * 150) + 350; 
                    await gamePage.waitForTimeout(durasi);
                    await gamePage.keyboard.up(arah);
                }
                
                await gamePage.waitForTimeout(100);
            }

        } catch (web3Err) {
            log("\n[ERROR WEB3 GAME] Gagal menyambung atau layar tidak terdeteksi bot.");
            console.error("Penyebab:", web3Err.message);
        }
        
    } catch (err) {
        console.error("Gagal menjalankan bot secara fatal:", err);
    }
})();
