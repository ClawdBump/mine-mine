const path = require('path');
const { chromium } = require('playwright');
require('dotenv').config({ path: path.join(__dirname, '.env') });

const METAMASK_PATH = path.join(__dirname, 'metamask-extension').replace(/\\/g, '/');
const USER_DATA_DIR = path.join(__dirname, 'chrome_data').replace(/\\/g, '/');

// DIAGNOSTIK: Cek apakah .env terbaca
const fs = require('fs');
const dotEnvPath = path.join(__dirname, '.env');
const dotEnvExists = fs.existsSync(dotEnvPath);

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

// Variabel global untuk mereferensikan halaman game utama
let mainGamePage = null;

// ============================================================
// GLOBAL MONITOR: Menangani PopUp MetaMask di Latar Belakang
// ============================================================
let monitorEnabled = false; 
let extensionId = ""; // Global
const handledPopups = new Set();
const popupQueue = [];

async function startMetaMaskMonitor(context) {
    log("[SYSTEM] Monitor MetaMask Latar Belakang Aktif.");
    
    while (true) {
        if (!monitorEnabled) {
            await new Promise(resolve => setTimeout(resolve, 1000));
            continue;
        }

        // Ambil dari Queue (Event-driven) atau Scan (Fallback) - SATU PER SATU
        let popup = popupQueue.shift() || context.pages().find(p => p.url().includes('chrome-extension://') && !p.url().includes('home.html') && !handledPopups.has(p));
        
        if (popup) {
            // JANGAN PERNAH PROSES ATAU TUTUP TAB UTAMA GAME
            if (mainGamePage && popup === mainGamePage) {
                // Jangan shift lagi, popup sudah di-shift di baris 61
                continue;
            }
            if (handledPopups.has(popup)) continue;
            
            log(`\n[POPUP] Memproses Jendela MetaMask (${popup.url()})...`);
            handledPopups.add(popup);
            
            try {
                // Tunggu render awal (Meningkatkan kesabaran untuk VPS)
                log(`  [POPUP] Membuka jendela: ${popup.url()}`);
                await popup.waitForLoadState('load', { timeout: 30000 }).catch(() => {});
                await popup.bringToFront().catch(() => {});
                
                // TUNGGU SAMPAI UI INTERNAL SIAP (Sangat Penting)
                log("  [POPUP] Menunggu UI MetaMask selesai inisialisasi...");
                const uiReady = await popup.locator('.app, #app-content, .main-container').isVisible({ timeout: 20000 }).catch(() => false);
                if (!uiReady) {
                    log("  [POPUP] Peringatan: UI belum sepenuhnya siap, tapi bot akan tetap mencoba mencari tombol.");
                } else {
                    log("  [POPUP] UI siap. Memulai pemrosesan.");
                }
                
                await popup.waitForTimeout(5000); // Jeda ekstra agar stabil

                // SUB-LOOP: Step-by-step di dalam jendela
                let stepCount = 0;
                while (!popup.isClosed() && stepCount < 12) {
                    stepCount++;
                    // Proteksi ekstra: pastikan bukan tab game
                    if (popup === mainGamePage) break;
                    
                    await popup.bringToFront().catch(() => {});
                    
                    // Pastikan scroll ke bawah agar tombol terlihat (Fokus pada container utama MetaMask)
                    await popup.evaluate(() => { 
                        window.scrollTo(0, document.body.scrollHeight);
                        const scrollEl = document.querySelector('.request-signature__scroll, .signature-request-message--signable, .confirm-page-container-content');
                        if (scrollEl) scrollEl.scrollTop = scrollEl.scrollHeight;
                    }).catch(() => {});
                    await popup.waitForTimeout(1000);

                    // 1. Cari tombol POSITIF (Connect, Sign, dll) - Tambah 'Allow' dan 'Got it'
                    const confirmBtn = popup.locator('button:has-text("Next"), button:has-text("Connect"), button:has-text("Approve"), button:has-text("Confirm"), button:has-text("Sign"), button:has-text("Sign-in"), button:has-text("Tanda Tangan"), button:has-text("Setuju"), button:has-text("Konfirmasi"), button:has-text("Permisi"), button:has-text("Allow"), button:has-text("I understand"), button:has-text("Got it")').first();
                    
                    log(`  [POPUP] Mencari tombol aksi (Percobaan ke-${stepCount})...`);
                    if (await confirmBtn.isVisible({ timeout: 5000 }).catch(() => false)) {
                        const btnText = await confirmBtn.innerText().catch(() => "Aksi");
                        log(`  [POPUP] >>> MENCOBA KLIK PAKSA: [${btnText}]`);
                        
                        // Tunggu sampai tombol benar-benar stabil & aktif
                        await confirmBtn.waitFor({ state: 'visible', timeout: 5000 }).catch(() => {});
                        
                        await confirmBtn.focus().catch(() => {});
                        // Klik dengan opsi agresif agar tidak tertahan
                        await confirmBtn.click({ force: true, noWaitAfter: true }).catch(e => log(`  [POPUP] Klik error: ${e.message}`));
                        
                        await popup.waitForTimeout(4000); 
                        continue; 
                    } 

                    // 2. Jika tidak ada konfirmasi, cari tombol NEGATIF (Cancel, Reject, dll)
                    const cancelBtn = popup.locator('button:has-text("Cancel"), button:has-text("Reject"), button:has-text("Reject all"), button:has-text("Tolak"), button:has-text("Batal"), button:has-text("Tutup"), button:has-text("Ignore")').first();
                    if (await cancelBtn.isVisible({ timeout: 2000 }).catch(() => false)) {
                        const btnText = await cancelBtn.innerText().catch(() => "Batal");
                        log(`  [POPUP] >>> KLIK BATAL: [${btnText}]`);
                        await cancelBtn.focus().catch(() => {});
                        await cancelBtn.click({ force: true, noWaitAfter: true }).catch(() => {});
                        await popup.waitForTimeout(3000);
                        continue;
                    }
                    
                    if (stepCount > 4) {
                        log(`  [POPUP] Tidak ada tombol ditemukan. Menunggu sebentar...`);
                    }
                    await popup.waitForTimeout(2000);
                }
                
                log(`  [POPUP] Selesai. Kembali ke Game.`);
                if (mainGamePage && !mainGamePage.isClosed()) {
                    await mainGamePage.bringToFront().catch(() => {});
                }
            } catch (err) {
                log(`  [POPUP] Error: ${err.message}`);
            }
            
            // JEDA AMAN SEBELUM PROSES POPUP BERIKUTNYA
            await new Promise(resolve => setTimeout(resolve, 3000));
        }
        
        await new Promise(resolve => setTimeout(resolve, 1000));
    }
}

// ==============================
// CAPTCHA: Deteksi & Klik Otomatis (Centang "Verify")
// ==============================
async function handleCaptcha(page) {
    try {
        log("[CAPTCHA] Memeriksa apakah ada tantangan Verify...");
        
        // Beri waktu sejenak agar iframe muncul di VPS
        await page.waitForTimeout(3000);

        // 1. Deteksi Cloudflare Turnstile (Sering dipakai gemminer)
        const turnstileFrame = page.frames().find(f => f.url().includes('turnstile') || f.url().includes('challenges.cloudflare.com'));
        if (turnstileFrame) {
            log("  [CAPTCHA] Deteksi Cloudflare Turnstile! Mencoba mengklik checkbox...");
            const checkbox = turnstileFrame.locator('.mark, .checkbox, #challenge-stage, #content').first();
            if (await checkbox.isVisible({ timeout: 5000 }).catch(() => false)) {
                await checkbox.click({ force: true, delay: 150 }).catch(() => {});
                log("  [CAPTCHA] ✓ Checkbox diklik via Turnstile Frame.");
                await page.waitForTimeout(3000);
            }
        }

        // 2. Google reCAPTCHA
        const recaptchaFrame = page.frames().find(f => f.url().includes('api2/anchor') || f.url().includes('recaptcha'));
        if (recaptchaFrame) {
            log("  [CAPTCHA] Deteksi reCAPTCHA! Mencoba mengklik checkbox...");
            const checkbox = recaptchaFrame.locator('#recaptcha-anchor, .recaptcha-checkbox-border').first();
            if (await checkbox.isVisible({ timeout: 5000 }).catch(() => false)) {
                await checkbox.click({ force: true, delay: 150 }).catch(() => {});
                log("  [CAPTCHA] ✓ Checkbox diklik via reCAPTCHA Frame.");
                await page.waitForTimeout(3000);
            }
        }

        // 3. Custom Button Check
        const verifyBtn = page.locator('div, button, span').filter({ hasText: /^Verify|Verify me|I am not a robot$/i }).first();
        if (await verifyBtn.isVisible({ timeout: 2000 }).catch(() => false)) {
            log("  [CAPTCHA] Menemukan tombol pencentang kustom. Mengklik...");
            await verifyBtn.click({ force: true }).catch(() => {});
            log("  [CAPTCHA] ✓ Tombol kustom diklik.");
        }
    } catch (err) {
        log(`  [CAPTCHA] Info: Tidak ada captcha yang aktif atau gagal diklik: ${err.message}`);
    }
}

// ==============================
// TRIGGER: Paksa Buka Jendela MetaMask yang tertahan (Safe Mode)
// ==============================
async function triggerMetaMaskPopup(context) {
    if (!extensionId) return;
    
    // Cari apakah sudah ada tab MetaMask yang terbuka (biar tidak bikin tab baru terus)
    let existingPage = context.pages().find(p => p.url().includes(extensionId));
    
    if (existingPage) {
        log(`[SYSTEM] Menemukan tab MetaMask lama. Melakukan Reload untuk memicu notifikasi...`);
        await existingPage.reload().catch(() => {});
        await existingPage.bringToFront().catch(() => {});
    } else {
        log(`[SYSTEM] Membuka Dashboard MetaMask untuk memicu notifikasi tertunda...`);
        const page = await context.newPage().catch(() => null);
        if (page) {
            // Gunakan home.html karena jauh lebih stabil daripada notification.html di VPS
            await page.goto(`chrome-extension://${extensionId}/home.html`).catch(() => {});
        }
    }
}

(async () => {
    log("Memulai bot dan MetaMask menggunakan Sistem AI Cerdas...");
    
    // DIAGNOSTIK STARTUP
    log(`[DIAGNOSTIK] File .env ditemukan: ${dotEnvExists ? 'Ya' : 'TIDAK'}`);
    if (dotEnvExists) {
        log(`[DIAGNOSTIK] Path: ${dotEnvPath}`);
        
        // Cek semua key yang ada di process.env (untuk mendeteksi typo)
        const keys = Object.keys(process.env).filter(k => k.includes('SEED') || k.includes('PHRASE') || k.includes('SECRET'));
        if (keys.length > 0) {
            log(`[DIAGNOSTIK] Variabel terkait ditemukan: [${keys.join(', ')}]`);
        } else {
            log(`[DIAGNOSTIK] PERINGATAN: Tidak ada variabel mengandung 'SEED' atau 'PHRASE' di process.env!`);
        }
    }
    
    // Fuzzy matching: Jika SECRET_SEED_PHRASE tidak ada, coba cari yang mirip
    let effectiveSeedPhrase = SEED_PHRASE;
    if (!effectiveSeedPhrase) {
        const potentialKey = Object.keys(process.env).find(k => k.toUpperCase().includes('SEED') && k.toUpperCase().includes('PHRASE'));
        if (potentialKey) {
            log(`[DIAGNOSTIK] Menggunakan fallback dari key: ${potentialKey}`);
            effectiveSeedPhrase = process.env[potentialKey];
        }
    }

    if (!effectiveSeedPhrase || effectiveSeedPhrase.trim().length < 20) {
        const words = effectiveSeedPhrase ? effectiveSeedPhrase.trim().split(/\s+/).length : 0;
        log(`[DIAGNOSTIK] SECRET_SEED_PHRASE terdeteksi: ${effectiveSeedPhrase ? 'Ya' : 'TIDAK'}`);
        if (effectiveSeedPhrase) log(`[DIAGNOSTIK] Indikasi: Hanya ditemukan ${words} kata.`);
        
        console.error("\n============================================================");
        console.error("ERROR: SEED PHRASE BELUM TERISI ATAU TIDAK TERDETEKSI!");
        console.error("Pastikan nama variabel di file .env adalah: SECRET_SEED_PHRASE");
        console.error("Contoh isi file .env:");
        console.error("SECRET_SEED_PHRASE=word1 word2 word3 ... word12");
        console.error("============================================================\n");
        process.exit(1);
    } else {
        const words = effectiveSeedPhrase.trim().split(/\s+/).length;
        log(`[DIAGNOSTIK] Status: OK (${words} kata terdeteksi)`);
    }

    try {
        const context = await chromium.launchPersistentContext(USER_DATA_DIR, {
            headless: false,
            viewport: { width: 1366, height: 768 },
            userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/123.0.0.0 Safari/537.36',
            ignoreDefaultArgs: ['--enable-automation'],
            args: [
                `--disable-extensions-except=${METAMASK_PATH}`,
                `--load-extension=${METAMASK_PATH}`,
                '--disable-blink-features=AutomationControlled',
                '--no-sandbox',
                '--disable-setuid-sandbox',
                '--disable-gpu',
                '--disable-dev-shm-usage',
                '--disable-software-rasterizer',
                '--disable-infobars',
                '--window-position=0,0'
            ]
        });

        // ==============================
        // STEALTH: Sembunyikan jejak bot
        // ==============================
        await context.addInitScript(() => {
            // Hapus properti webdriver (tidak ganggu MetaMask)
            Object.defineProperty(navigator, 'webdriver', { get: () => undefined });
            // JANGAN override window.chrome - MetaMask butuh chrome.runtime untuk berfungsi
        });
        
        // ==============================
        // DEBUG TELEMETRY: Pantau penutupan tab
        // ==============================
        context.on('page', (newPage) => {
            const url = newPage.url() || "";
            log(`[DEBUG] Tab Baru Dibuka: ${url}`);
            
            if (url.includes('chrome-extension://')) {
                log(`[SYSTEM] Halaman MetaMask terdeteksi: ${url}`);
                popupQueue.push(newPage);
            }
            
            // Catat jika tab ditutup
            newPage.on('close', () => {
                log(`[DEBUG] Tab ditutup: ${newPage.url()}`);
            });
        });

        context.on('close', () => {
            log("[CRITICAL] Browser Context TELAH TERTUTUP! Sesuatu mematikan Chrome.");
        });

        // Jalankan monitor di latar belakang (Non-blocking)
        startMetaMaskMonitor(context).catch(err => log(`[CRITICAL] Monitor Error: ${err.message}`));

        // ==============================
        // FASE 0: SETUP METAMASK
        // ==============================
        log("[SETUP] Mendeteksi ekstensi MetaMask...");
        
        // Cari halaman MetaMask yang sudah terbuka
        let metamaskPage = context.pages().find(p => p.url().includes('chrome-extension://'));
        // extensionId dikelola secara global sekarang

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
                    // Cek dulu apakah Jaringan sudah Base
                    const currentNet = metamaskPage.locator('[data-testid="network-display"], .network-display').first();
                    const netName = await currentNet.innerText().catch(() => "");
                    
                    if (netName.includes("Base")) {
                        log("  [0.7] ✅ Jaringan sudah Base Mainnet. Lanjut...");
                    } else {
                        // 1. Klik opsi Ethereum Mainnet (Pojok kiri atas)
                        log("  [0.6] Klik pemilih jaringan (Top-left)...");
                        await currentNet.click();
                        await metamaskPage.waitForTimeout(1500);

                        // 2. Klik button "Add network" (seperti yang Anda tunjukkan)
                        log("  [0.6] Klik button 'Add network'...");
                        const addNetworkBtn = metamaskPage.locator('button:has-text("Add network")').first();
                        await addNetworkBtn.click();
                        await metamaskPage.waitForLoadState('domcontentloaded');
                        await metamaskPage.waitForTimeout(3000);

                        // 3. Cari Base di daftar jaringan populer menggunakan struktur HTML yang Anda berikan
                        log("  [0.7] Mencari 'Base Mainnet' di daftar populer...");
                        const baseRow = metamaskPage.locator('.add-network__list-of-networks', { hasText: 'Base Mainnet' }).first();
                        const addBtn = baseRow.locator('button.add-network__add-button, button:has-text("Add")').first();

                        if (await addBtn.isVisible({ timeout: 15000 }).catch(() => false)) {
                            log("  [0.7] Klik 'Add' untuk Base...");
                            await addBtn.click();
                            await metamaskPage.waitForTimeout(3000);

                            // Tambahan: Tangani popup konfirmasi detail jaringan
                            const approveBtn = metamaskPage.locator('button:has-text("Approve")').first();
                            if (await approveBtn.isVisible({ timeout: 10000 }).catch(() => false)) {
                                await approveBtn.click();
                                log("  [0.7] ✓ Detail Jaringan Approve!");
                                await metamaskPage.waitForTimeout(2000);
                            }

                            // Klik "Switch to Base"
                            const switchBtn = metamaskPage.locator('button', { hasText: /Switch to Base|Switch/i }).first();
                            if (await switchBtn.isVisible({ timeout: 10000 }).catch(() => false)) {
                                await switchBtn.click();
                                log("  [0.7] ✓ Klik tombol Switch!");
                            }

                            // VERIFIKASI AKHIR
                            log("  [0.7] Memverifikasi jaringan aktif...");
                            const finalNetwork = metamaskPage.locator('[data-testid="network-display"], .network-display', { hasText: /Base/i }).first();
                            await finalNetwork.waitFor({ state: 'visible', timeout: 15000 });
                            log("  [0.7] ✅ KONFIRMASI: Jaringan sekarang adalah Base Mainnet.");
                        } else {
                            throw new Error("Tombol 'Add' untuk Base Mainnet tidak ditemukan di daftar.");
                        }
                    }
                    
                    await metamaskPage.waitForTimeout(2000);
                    log("  [SETUP] Persiapan MetaMask Selesai. Menutup Tab MetaMask...");
                    await metamaskPage.close().catch(() => {});
                    
                    // AKTIFKAN MONITOR OTOMATIS SEKARANG
                    monitorEnabled = true;
                    log("[SYSTEM] Monitor MetaMask Latar Belakang TELAH DIAKTIFKAN.");
                } catch (netErr) {
                    log(`  [ERROR] Gagal memastikan jaringan Base: ${netErr.message}`);
                    log("  [ERROR] Bot berhenti di sini agar tidak terjadi error koneksi di Game.");
                    return; // Berhenti di sini, jangan lanjut ke pembukaan game
                }
            } catch (innerErr) {
                log(`  >> Error setup MetaMask: ${innerErr.message}`);
            }
        }

        // ==============================
        // FASE 1: MUAT GAME
        // ==============================
        log("\n[FASE 1] Memuat https://www.gemminer.app/ ...");
        const gamePage = await context.newPage();
        mainGamePage = gamePage; // Set referensi global untuk monitor
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
            
            log("[FASE 2] ✓ Tombol '#burnEntryBtn' diklik.");

            // ==============================
            // FASE 3: PILIH METAMASK DI WEBSITE
            // ==============================
            log("\n[FASE 3] Mencari dan memilih 'MetaMask' di website...");
            
            await gamePage.waitForTimeout(4000); // Tunggu modal muncul

            await waitForCondition(gamePage, async () => {
                // Cari opsi "MetaMask" di website — HANYA KLIK SEKALI
                const metaMaskOption = gamePage.locator('div, button, span').filter({ hasText: /^MetaMask$/i }).first();
                
                if (await metaMaskOption.isVisible({ timeout: 2000 }).catch(() => false)) {
                    log("  [3.0] Tombol MetaMask ditemukan di website! Mengklik...");
                    await metaMaskOption.click({ force: true });
                    return true; 
                }
                
                // Fallback JS click
                const clickedJS = await gamePage.evaluate(() => {
                    const el = Array.from(document.querySelectorAll('div, button, span')).find(x => x.innerText.trim() === 'MetaMask');
                    if (el && el.offsetParent !== null) { el.click(); return true; }
                    return false;
                }).catch(() => false);
                
                return clickedJS;
            }, { timeout: 30000, interval: 3000, label: 'opsi MetaMask di website' });

            log("[3.0] ✓ MetaMask di website diklik. Menunggu popup koneksi...");
            await gamePage.waitForTimeout(5000); 

            // TRIGGER FALLBACK: Jika popup tidak muncul dalam 15 detik, paksa buka
            const checkPopup = async () => {
                await gamePage.waitForTimeout(10000);
                if (popupQueue.length === 0) {
                    await triggerMetaMaskPopup(context);
                }
            };
            checkPopup(); // Run in parallel

            // Bersihkan overlay (seperti layar pembuka) jika masih ada
            await gamePage.evaluate(() => {
                const screen = document.getElementById('burnEntryScreen');
                if (screen) { screen.style.pointerEvents = 'none'; screen.style.display = 'none'; }
            }).catch(() => {});
            
            // ==============================
            // FASE 4: HANDLING POPUP & CAPTCHA
            // ==============================
            log("\n[FASE 4] Menunggu koneksi wallet...");
            
            // Tunggu 10 detik agar koneksi benar-benar selesai di server
            await gamePage.waitForTimeout(10000);
            
            // JALANKAN AUTO-CAPTCHA (Centang "Verify")
            await handleCaptcha(gamePage);

            // Tunggu hingga game masuk ke pemilihan bahasa (Tunggu lebih lama: 120 detik)
            log("[FASE 4] Menunggu menu bahasa muncul (English)...");
            const langMenu = await waitForCondition(gamePage, async () => {
                const langReady = await gamePage.locator('div.lang-card').isVisible({ timeout: 2000 }).catch(() => false);
                if (!langReady) {
                    // Cek lagi captcha kali saja baru muncul setelah delay
                    await handleCaptcha(gamePage);
                }
                return langReady;
            }, { timeout: 120000, interval: 5000, label: 'menu bahasa (Koneksi Berhasil)' }).catch(() => null);

            if (!langMenu) {
                log("\n!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!");
                log("PERINGATAN: MENU BAHASA TIDAK MUNCUL!");
                log("Kemungkinan CAPTCHA tertahan atau butuh solving manual di noVNC.");
                log("Halaman saat ini akan dibiarkan menyala agar Anda bisa memperbaikinya.");
                log("!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!\n");
                // Stay alive loop (sudah ada di catch global, tapi di sini biar lebih jelas)
                await new Promise(() => {});
            }
            
            log("[FASE 4] ✓ Koneksi Wallet Berhasil Terdeteksi!");

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
            // Jangan tutup browser agar user bisa lihat apa yang tersangkut
            await new Promise(() => {});
        }
        
    } catch (err) {
        log(`\n[FATAL ERROR] Terjadi kesalahan fatal: ${err.message}`);
        // Jangan tutup browser agar user bisa lihat apa yang tersangkut
        await new Promise(() => {});
    }
})();
