const path = require('path');
const { chromium } = require('playwright');
require('dotenv').config();

const METAMASK_PATH = path.join(__dirname, 'metamask-extension').replace(/\\/g, '/');
const USER_DATA_DIR = path.join(__dirname, 'chrome_data').replace(/\\/g, '/');

const SEED_PHRASE = process.env.SECRET_SEED_PHRASE;
const PASSWORD = 'BotPassword123!';

(async () => {
    if (!SEED_PHRASE || SEED_PHRASE.length < 20) {
        console.error("ERROR: Harap isi variabel SECRET_SEED_PHRASE di Dashboard Railway Anda!");
        process.exit(1);
    }

    console.log("Memulai bot dan MetaMask menggunakan Sistem AI Cerdas...");

    try {
        const context = await chromium.launchPersistentContext(USER_DATA_DIR, {
            headless: false,
            args: [
                `--disable-extensions-except=${METAMASK_PATH}`,
                `--load-extension=${METAMASK_PATH}`,
                '--disable-blink-features=AutomationControlled'
            ]
        });

        // Tunggu tab MetaMask terbuka
        let metamaskPage = context.pages().find(p => p.url().includes('chrome-extension://'));
        if (!metamaskPage) {
            metamaskPage = await context.waitForEvent('page', { timeout: 15000 }).catch(() => null);
        }
        
        if (!metamaskPage || !metamaskPage.url().includes('chrome-extension://')) {
            console.log("\n[WARNING] Tab Setup MetaMask tidak ditemukan otomatis. Melewati Fase Autologin.");
        } else {
            console.log("\n[SETUP] Menjalankan Bot Cerdas (Mencari tombol dengan membaca teks)...");
            
            // Beri waktu bagi halaman React MetaMask selesai memuat secara visual
            await metamaskPage.waitForTimeout(5000); // Paksa tunggu 5 detik penuh

            try {
                // Tahap 1: Persetujuan (I Agree) - Menggunakan Pencari Elemen Mutlak MetaMask
                console.log("- Menuhggu halaman persetujuan (Terms)...");
                const termsCheck = metamaskPage.locator('[data-testid="onboarding-terms-checkbox"]');
                // Tunggu kotak persetujuan sampai benar-benar ada di layar (max 10 detik)
                await termsCheck.waitFor({ state: 'attached', timeout: 10000 });
                // force: true penting karena biasanya kotak aslinya ditutupi oleh CSS hiasan browser
                await termsCheck.click({ force: true });
                console.log("- Berhasil mencentang kotak persetujuan!");

                const importBtn = metamaskPage.locator('[data-testid="onboarding-import-wallet"]');
                await importBtn.waitFor({ state: 'visible', timeout: 5000 });
                await importBtn.click();
                console.log("- Berhasil menekan tombol Import Wallet!");

                // Tahap 2: Telemetry No Thanks
                await metamaskPage.waitForTimeout(2000);
                const noThanks = metamaskPage.locator('button', { hasText: /No Thanks|I agree/i }).first();
                if (await noThanks.isVisible({timeout:3000})) {
                    // Terkadang MetaMask butuh I agree di telemetry, kita tekan tombol yg berlabel No Thanks
                    const exactNoThanks = metamaskPage.locator('button:has-text("No thanks")').first();
                    if(await exactNoThanks.isVisible()) await exactNoThanks.click();
                    else await noThanks.click();
                }

                // Tahap 3: Input Seed phrase
                await metamaskPage.waitForTimeout(2000);
                const words = SEED_PHRASE.trim().split(/\s+/);
                
                // Cari input kotak pertama
                const firstInput = metamaskPage.locator('input').first();
                if (await firstInput.isVisible({timeout: 5000})) {
                    console.log("- Memasukkan kalimat sandi (Tolong LEPAS KURSOR ANDA agar bot fokus mengetik) ...");
                    
                    for (let i = 0; i < 12; i++) {
                        // Memastikan bot mengeklik tepat pada kotak urutan yang benar (Bukan lompat ke ikon Mata/Show)
                        const exactBox = metamaskPage.locator(`[data-testid="import-srp__srp-word-${i}"]`).first();
                        
                        if (await exactBox.isVisible({timeout: 2000})) {
                            // Fokus pada elemen dan isi teks perlahan
                            await exactBox.focus();
                            await exactBox.fill(words[i]);
                            await metamaskPage.waitForTimeout(50);
                        } else {
                            console.log(`Peringatan: Kotak urutan ${i} tidak terdeteksi.`);
                        }
                    }
                    
                    // Klik tombol Confirm
                    await metamaskPage.locator('button', { hasText: /Confirm Secret Recovery Phrase/i }).click();
                }

                // Tahap 4: Bikin Password
                await metamaskPage.waitForTimeout(2000);
                console.log("- Membuat Password dompet...");
                const passInputs = metamaskPage.locator('input[type="password"]');
                await passInputs.nth(0).fill(PASSWORD);
                await passInputs.nth(1).fill(PASSWORD);
                
                const termsPass = metamaskPage.locator('input[type="checkbox"]').first();
                await termsPass.click({ force: true });
                
                await metamaskPage.locator('button', { hasText: /Import my wallet/i }).click();

                // Tahap 5: Done
                await metamaskPage.waitForTimeout(4000);
                const doneBtn = metamaskPage.locator('button', { hasText: /Got it|Done/i }).first();
                if(await doneBtn.isVisible()) await doneBtn.click();

                const nextBtn = metamaskPage.locator('button', { hasText: /Next/i }).first();
                if(await nextBtn.isVisible()) await nextBtn.click();

                const doneBtn2 = metamaskPage.locator('button', { hasText: /Done/i }).first();
                if(await doneBtn2.isVisible()) await doneBtn2.click();

                console.log("=> Setup MetaMask Selesai!");
            } catch (innerErr) {
                console.log(">> Error spesifik dalam mencari tombol: Bot gagal klik (UI MetaMask tidak sesuai tebakan).", innerErr.message);
            }
        }

        console.log("\nMemuat tab https://www.gemminer.app/ ...");
        const gamePage = await context.newPage();
        await gamePage.goto('https://www.gemminer.app/');
        await gamePage.waitForLoadState('networkidle');

        console.log("Skrip memulai skenario eksekusi game (Mint -> Network -> Sign -> Character)...");
        
        // ==========================================
        // SATPAM PENJAGA TAP TO BEGIN (Pembersih Jalan)
        // ==========================================
        // Kita simpan dalam variabel agar bisa "dipensiunkan" saat game sudah dimulai
        let satpamTapToBegin = setInterval(async () => {
            try {
                await gamePage.evaluate(() => {
                    const tapBiasa = document.querySelector('.prompt[data-i18n="startPrompt"]');
                    if (tapBiasa) {
                        tapBiasa.click();
                        console.log("-> Satpam: Menyingkirkan Tap To Begin!");
                    }
                    
                    // Cek iframe
                    const iframes = document.querySelectorAll('iframe');
                    iframes.forEach(ifr => {
                        try {
                            const btn = ifr.contentWindow.document.querySelector('.prompt[data-i18n="startPrompt"]');
                            if (btn) btn.click();
                        } catch(e) {}
                    });
                });
            } catch (ignore) {}
        }, 2500);
        
        try {

            // Fase 1: Klik Mint Access (Wajib Sukses Beruntun)
            console.log("1. Menganalisis layar dan frame tersembunyi untuk mencari '#burnEntryBtn' (Menunggu tanpa batas)...");
            
            let mintKena = false;
            while (!mintKena) {
                // Cari di halaman luar biasa
                const mintLuar = gamePage.locator('#burnEntryBtn');
                if (await mintLuar.isVisible({timeout: 2000}).catch(()=>false)) {
                    await mintLuar.click({ force: true });
                    mintKena = true;
                    console.log("-> Mint sukses di Layar Utama!");
                    break;
                } 
                
                // Cari membabi-buta di setiap Iframe
                for (const frame of gamePage.frames()) {
                     const fBtn = frame.locator('#burnEntryBtn');
                     if (await fBtn.isVisible({timeout: 1000}).catch(()=>false)) {
                         await fBtn.click({ force: true });
                         mintKena = true;
                         console.log("-> Mint Kena! Ditemukan di dalam Iframe tersembunyi!");
                         break;
                     }
                }
                
                if (mintKena) break;
                
                // Bypass injeksi
                console.log("-> (Mencari... Menyuntikkan _burnEntryClick ke semua dimensi layar...)");
                for (const frame of gamePage.frames()) {
                     await frame.evaluate(() => {
                         if (typeof _burnEntryClick === 'function') _burnEntryClick();
                         const btn = document.getElementById('burnEntryBtn');
                         if (btn) btn.click();
                     }).catch(() => {});
                }
                await gamePage.waitForTimeout(3000); // Tunggu hasil klik Bypass, tapi kita tidak tahu 100% apakah berhasil kecuali layar berganti.
                
                // Jika halaman menampakkan popup wallet, artinya Mint Kena tembus tanpa diketahui Playwright
                const curMmLnk = gamePage.locator('button, div').filter({ hasText: /^MetaMask$/i }).first();
                if (await curMmLnk.isVisible({timeout: 2000})) {
                    mintKena = true;
                    console.log("-> Bukti Mint tertembus: Pilihan dompet muncul!");
                }
            }
            
            await gamePage.waitForTimeout(2000);
            console.log("2. Menunggu munculnya pilihan dompet dan memilih MetaMask...");
            let mmKena = false;
            while (!mmKena) {
                const mmLnk = gamePage.locator('button, div').filter({ hasText: /^MetaMask$/i }).first();
                if (await mmLnk.isVisible({timeout: 2000})) {
                    await mmLnk.click();
                    mmKena = true;
                    console.log("-> Berhasil menekan tombol MetaMask!");
                } else {
                    const mmLnk2 = gamePage.locator('text="MetaMask"').first();
                    if (await mmLnk2.isVisible({timeout: 2000})) {
                        await mmLnk2.click();
                        mmKena = true;
                    }
                }
                if (!mmKena) await gamePage.waitForTimeout(1000);
            }

            // Fase 3: Tangkap jendela pop-up berlapis dari MetaMask untuk Add Network (Base) -> Connect -> Sign
            console.log("3. Menunggu Pop-up MetaMask merespons...");
            
            // Kita akan buat fungsi looping pintar yang berjalan selama 15 detik untuk mengamati dan mengklik 
            // semua tombol persetujuan yang dilempar MetaMask (Approve, Switch Network, Connect, Sign)
            // tanpa peduli urutannya, ini sangat bulletproof untuk perubahan Web3!
            
            let timeWaited = 0;
            const maxWait = 25000;
            
            while (timeWaited < maxWait) {
                const popup = context.pages().find(p => p.url().includes('notification.html'));
                
                if (popup) {
                    try {
                        await popup.bringToFront();
                        
                        // Detektor tombol tunggal untuk semua aksi (Approve, Switch, Next, Connect, Sign)
                        // Menggunakan data-testid jauh lebih stabil daripada teks
                        const actionBtn = popup.locator('button[data-testid="page-container-footer-next"], button[data-testid="confirmation-submit-button"], button:has-text("Next"), button:has-text("Connect"), button:has-text("Approve"), button:has-text("Switch network"), button:has-text("Sign")').first();

                        if (await actionBtn.isVisible({timeout: 1000})) {
                            const label = await actionBtn.innerText().catch(() => "Confirm");
                            console.log(`- Mendeteksi perintah MetaMask: [${label}]. Mengklik...`);
                            await actionBtn.click({ force: true });
                            // Tunggu sebentar setelah klik agar UI MetaMask sempat berubah
                            await gamePage.waitForTimeout(2000);
                        }
                    } catch (pErr) {
                        // Popup mungkin tertutup mendadak, abaikan eror
                    }
                }
                
                await gamePage.waitForTimeout(1000);
                timeWaited += 1000;
                
                // Jika selama 8 detik tidak ada popup lagi, kemungkinan besar sudah selesai
                if (!context.pages().find(p => p.url().includes('notification.html')) && timeWaited > 8000) {
                    break;
                }
            }
            
            console.log("\n[SUKSES] Selayaknya dompet telah berhasil masuk!");
            
            // Mengembalikan fokus ke game
            await gamePage.bringToFront();

            // Fase 4: Pilih Bahasa (English / US)
            console.log("4. Menunggu loading game & mencari tombol bahasa 'ENGLISH' (Tertahan sampai muncul)...");
            let langKena = false;
            while (!langKena) {
                const btnUS = gamePage.locator('div.lang-card').filter({ hasText: /ENGLISH/i }).first();
                if (await btnUS.isVisible({timeout: 2000})) {
                    await btnUS.click();
                    console.log("-> Bahasa ENGLISH terpilih secara presisi!");
                    langKena = true;
                    // Jeda tambahan agar gim memuat layar karakter dengan tenang
                    await gamePage.waitForTimeout(3000);
                } else {
                    await gamePage.waitForTimeout(1000);
                }
            }

            // Fase 5: Pilih Karakter (Toad)
            console.log("5. Menunggu Layar Memilih Karakter Main (Toad)...");
            let toadKena = false;
            while (!toadKena) {
                // SENSOR PENCEGAH TERJEBAK: Jika HUD sudah muncul, berarti kita sudah masuk gim!
                const hudGim = gamePage.locator('#hud');
                if (await hudGim.isVisible({timeout: 1000}).catch(() => false)) {
                    console.log("-> [SENSOR] HUD Terdeteksi! Bot menyadari gim sudah dimulai.");
                    toadKena = true;
                    break;
                }

                const charBtn = gamePage.locator('#avatarToad');
                if (await charBtn.isVisible({timeout: 2000}).catch(() => false)) {
                    // Klik paksa untuk memastikan terpilih
                    await charBtn.click({ force: true, delay: 100 });
                    console.log("-> Karakter Toad diklik!");
                    
                    // Menjaga kemungkinan adanya tombol konfirmasi seperti 'Play'
                    const playBtn = gamePage.locator('button, div').filter({ hasText: /Play|Start Game|Enter|Start Mining/i }).first();
                    if (await playBtn.isVisible({timeout: 3000}).catch(() => false)) {
                         await playBtn.click({ force: true });
                         console.log("-> Dan menekan konfirmasi Play/Masuk!");
                         toadKena = true;
                    }
                } else {
                    // Jika tidak nampak, mungkin sudah masuk? Cek ulang di loop berikutnya
                    await gamePage.waitForTimeout(1000);
                }
            }
            // HENTIKAN SATPAM: Matikan pembersihan Tap To Begin agar tidak merusak fokus pergerakan
            clearInterval(satpamTapToBegin);
            console.log("-> Satpam Tap-To-Begin dipensiunkan (Permainan Dimulai).");

            // Fase 6: Perulangan Bermain Otomatis (Gameplay Loop) & Anti-Pupup
            console.log("\n[GAMEPLAY] Mengaktifkan Mesin Penambang (WASD) dan Auto-Clicker...");
            console.log("-> Tekan tombol Ctrl+C pada Windows Anda SEPANJANG WAKTU untuk menyudahi skrip.");
            
            // 6A. Merakit Robot Pengklik Bayangan (Malaikat Pembangkit)
            // Setiap 5 detik, bot akan mengintip apakah layar kematian (Mati) sedang muncul di monitor.
            // PENGAMAN KRUSIAL: Bot DILARANG mengeklik jika tombol restart tidak nampak (Hidden).
            setInterval(async () => {
                try {
                     const matiBtn = gamePage.locator('#deathRestartBtn');
                     // Hanya klik jika tombol benar-benar nampak secara visual (CSS display != none)
                     if (await matiBtn.isVisible({ timeout: 1000 }).catch(() => false)) {
                         await matiBtn.click({ force: true });
                         console.log("-> [ALERT] Karakter dideteksi tewas. Membangkitkan ulang...");
                         // Beri jeda 3 detik agar gim memuat ulang peta dengan tenang
                         await gamePage.waitForTimeout(3000);
                     }
                     
                     // Juga cek apakah ada prompt Tap To Begin yang menghalangi pasca hidup kembali
                     const tapMatiBtn = gamePage.locator('.prompt[data-i18n="startPrompt"]');
                     if (await tapMatiBtn.isVisible({ timeout: 500 }).catch(() => false)) {
                         await tapMatiBtn.click();
                         console.log("-> Menyingkirkan penghalang Tap To Begin pasca Restart.");
                     }
                } catch (err) {
                    // Abaikan err jika halaman sedang transisi
                }
            }, 5000);
            
            // Fase 6B. Merakit Perintah Berjalan dengan RADAR CERDAS (X-Ray)
            console.log("-> [RADAR] Mengaktifkan Pencari Bijih Otomatis...");

            while (true) {
                // 1. Ambil data visual dari memori gim dengan Radar Mata Elang (360 Derajat)
                const radar = await gamePage.evaluate(() => {
                    if (typeof player === 'undefined' || typeof getTile !== 'function') return null;
                    
                    const px = player.x;
                    const py = player.y;
                    const radius = 25; // Jarak pandang diperluas (Mata Elang)
                    let target = null;
                    let minScore = Infinity;

                    // Cari bijih terdekat dengan rumus Euclidean (Garis Lurus)
                    for (let y = py - radius; y <= py + radius; y++) {
                        for (let x = px - radius; x <= px + radius; x++) {
                            const tile = getTile(x, y);
                            const def = BLOCK_DEF[tile];
                            
                            // "Sikat Semua" - Targetkan apa pun yang bukan pengisi (Filler)
                            if (def && def.name && !["AIR", "CAVE", "DIRT", "STONE", "BEDROCK", "LAVA", "GRASS"].includes(def.name.toUpperCase())) {
                                const dx = x - px;
                                const dy = y - py;
                                
                                // Jarak garis lurus (Euclidean)
                                const dist = Math.sqrt(dx * dx + dy * dy);
                                
                                // PRIORITAS KEDALAMAN: Kita berikan 'diskon' jarak untuk target yang di bawah (Y lebih besar)
                                // Semakin dalam posisi target, semakin dianggap "dekat" oleh bot.
                                const depthBonus = dy * 0.15; 
                                const finalScore = dist - depthBonus;

                                if (finalScore < minScore) {
                                    minScore = finalScore;
                                    target = { x, y, name: def.name, realDist: dist };
                                }
                            }
                        }
                    }
                    return { px, py, target };
                });

                // Anti-Idle Jitter: Gerakkan mouse sedikit agar nampak manusiawi
                const jX = 500 + Math.floor(Math.random() * 20) - 10;
                const jY = 500 + Math.floor(Math.random() * 20) - 10;
                await gamePage.mouse.move(jX, jY).catch(()=>{});

                if (!radar || !radar.target) {
                    // Jika Radar Kosong, Gali ke Bawah (Eksplorasi Kedalaman)
                    console.log("-> [RADAR] Area bersih. Menggali lebih dalam...");
                    await gamePage.keyboard.down('ArrowDown');
                    await gamePage.waitForTimeout(1000);
                    await gamePage.keyboard.up('ArrowDown');
                    await gamePage.waitForTimeout(200);
                    continue;
                }

                const { px, py, target } = radar;
                console.log(`-> [RADAR] Target: ${target.name} di (${target.x}, ${target.y}). Meluncur...`);

                // 2. Logika Navigasi GoTo (X dulu baru Y)
                let arah = '';
                if (target.x > px) arah = 'ArrowRight';
                else if (target.x < px) arah = 'ArrowLeft';
                else if (target.y > py) arah = 'ArrowDown';
                else if (target.y < py) arah = 'ArrowUp';

                if (arah) {
                    await gamePage.focus('canvas').catch(() => {});
                    await gamePage.keyboard.down(arah);
                    // Durasi tekan yang bervariasi agar tidak kaku
                    const durasi = Math.floor(Math.random() * 150) + 350; 
                    await gamePage.waitForTimeout(durasi);
                    await gamePage.keyboard.up(arah);
                }
                
                await gamePage.waitForTimeout(100);
            }

        } catch (web3Err) {
            console.log("\n[ERROR WEB3 GAME] Gagal menyambung atau layar tidak terdeteksi bot.");
            console.error("Penyebab:", web3Err.message);
        }
        
    } catch (err) {
        console.error("Gagal menjalankan bot secara fatal:", err);
    }
})();
