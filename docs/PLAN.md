# Lumexia Racing Game - Gelistirme Plani

> Son guncelleme: 2026-05-02 (v11)

## Mevcut Durum Ozeti

Proje, **calisir ve oyunabilir** durumda bir 3D yaris oyunu. TOKABU token ile odeme akisi end-to-end calisiyor. Sprint 0-4 + Sprint 4.5 (payment self-healing) + Sprint 6 (48h cycle backend + landing UI + leaderboard fix) tamamlandi.

**Aktif sprint durumu (2026-05-02):**

| Sprint | Durum | Not |
|--------|-------|-----|
| 0-4 | ✅ Tamam | Otonomluk altyapısı, landing migration, anti-cheat, kod kalitesi |
| 4.5 | ✅ Tamam | Payment self-healing |
| 5 (E2E test) | ❌ İPTAL | Kullanıcı kararı 2026-05-02 |
| 6 (48h cycle + UI) | ✅ KAPALI | Tüm PR'lar prod'da |
| 7 (transfer otomasyonu) | ⏸️ ASKIDA | Ödeme süreci kararı bekliyor (memory: `project_payment_process_pending.md`) |

**Son merge edilen PR'lar (kronolojik):**
- Racing PR #99/#100/#101: Payment self-healing (verify-payment hardening + reconcile-payments Edge Function + JWT auth fix) — 2026-05-01
- Racing PR #102: Sprint 6 PR 6.1 — 48h cycle reset (backend + UI legal) — 2026-05-01
- Racing PR #103: Anti-cheat coin density 1/50m → 1/10m relax — 2026-05-01 (kullanıcı 2026-05-02 prod'da test etti, sorun yok ✓)
- Landing PR #17: Sprint 6 PR 6.5 — 48h cycle copy + Cycle Ranking section reorder — 2026-05-02 (squash `74ec528`)
- Racing PR #104: docs sync (TASK + PLAN) — 2026-05-02 (squash `a249a06`)
- Landing PR #18: Cycle Ranking UI fix — 48h window + bonus formula uyumu + LMX/SOL — 2026-05-02 (squash `b0f03f7`)

**Tamamlanmis altyapi:**
- Branch protection her iki repo'da aktif (main'e direkt push yasak, force push yasak, 1 review zorunlu, CI status check)
- CI test gate (`.github/workflows/ci.yml`) — her PR'da `npm test` + `npm run build` zorunlu
- Edge Function recovery: `calculate-daily-rewards` Supabase prod'dan repo'ya geri alindi ve CI deploy hattina baglandi; BNB → USD geçişi + JWT bypass yapıldı
- `verify-payment` Edge Function `PAYMENT_RECEIVER_ADDRESS` env var adını destekliyor (geriye uyumlu)
- `reconcile-payments` Edge Function (orphan TX backfill, 100 imza taraması, idempotent UNIQUE constraint)
- `unverified_payments` tablosu (forensic admin log, service-role only)
- Rate limiting (use-credit 30/dk, verify-payment 10/dk) — uretimde calisiyor
- Bug #4 coins_collected — submit_score imzasi guncel, GameOverUI gonderiyor
- Buffer polyfill, Vitest setup (19 test), price tolerance %7 hizalanmis, 11 ESLint hatasi temizlenmis
- 48h cycle: trigger fonksiyon `cycle_start = CURRENT_DATE - ((CURRENT_DATE - DATE '2026-05-01')::int % 2)` hesabi yapar; archive cron prev-cycle rows'unu temizler; calculate-daily-rewards cycle-end day kontrolü ile self-skip eder

**Landing page (lumexia.net):**
- Tamamen Solana/TOKABU dünyasında (SEO meta + structured-data + UI metinleri + API routes)
- Sprint 6 PR 6.5 ile 48h cycle UI: features-grid "Cycle Reward Distribution" + dashboard-hero "CYCLE RANKING" buton + LeaderboardSection üst seviyede (DashboardHero altında, TransactionsPanel üstünde)
- Realtime subscriptions debounce'lı (Sprint 3b)

**Sprint 6 PR durumu (kapalı):**
- PR 6.1 — 48h cycle backend + legal UI ✅ (#102)
- ~~PR 6.2~~ — `reward_distributions` ALTER → **Sprint 7'ye taşındı** (`reward_pool_distribution`'a `paid_at`/`paid_tx_hash` eklemek; askıda)
- ~~PR 6.3~~ — `export-reward-payload` Edge Function → **İPTAL** (calculate-daily-rewards zaten per-wallet ödülü tabloya yazıyor; Dashboard SQL yeterli)
- ~~PR 6.4~~ — Racing UI 48h metinleri → **GEREKSİZ** (UI'da "Daily" referansı yok)
- PR 6.5 — Landing 48h UI ✅ (#17)
- PR 6.6 — Toplu docs sync ✅ (#104, kısmen — tarih bazlı entry'ler güncel)
- Bonus PR — Cycle Ranking UI fix ✅ (#18, leaderboard formula/window/LMX+SOL)

**Açık aksiyonlar (kullanıcı):**
1. **2026-05-03 00:00 UTC** — İlk gerçek 48h cycle reset doğrulaması: pg_cron tetikler, archive Cycle 1 rows'unu süpürür, `calculate-daily-rewards` Cycle 1 reward'ları hesaplar. Edge Function loglarında 200 dönmeli.
2. `reconcile-payments` `dryRun: true` ilk test (PR #99 sonrası açık)
3. `reconcile-payments` cron enable (Dashboard SQL)
4. Google Search Console "Request Indexing" — lumexia.net (Madde 5)
5. Landing PR #18 prod'da test (UI bug fix)

**Açık tartışmalar (ileride):**
- Ödeme süreci tercihi (manuel/hibrit/otomatik) — Sprint 7 plan açma ön koşulu

**Sprint 4 (Kod Kalitesi) tamamlandı:**
- 4.1 ESLint flat config genişletme + CI lint job (PR #96) ✅
- 4.2 jupiterPrice unit test suite (11 test, toplam 19) + plan iptalleri ✅
- 4.3 README + PROJECT_DOCS + PLAN cilalama ✅
- ~~App.jsx bölme~~ ve ~~RealLauncherUI bölme~~ **iptal** (kullanıcı kararı 2026-05-01; çalışan kod, regression riski yüksek, marjinal kazanç).

**Sprint 3 (Otonom Supabase) tamamlandı:**
- 3a Typed client + canonical env names (landing PR #14) ✅
- 3b Realtime hardening (landing PR #15) ✅
- 3 wrap-up Cross-repo integration doc (racing) ✅

**Sprint 2 (Güvenlik) tamamlandı:**
- 2.5 Function search_path mutable → 9 fonksiyona pinned ✅
- 2.4 Migration discipline → CI/CD otomatik apply ✅
- 2.2a Anti-cheat altyapı → submit-score Edge Function + suspicious_scores tablo ✅
- 2.2b + 2.3 Frontend cutover + banner → GameOverUI submit-score'a geçti, doğru cümle ✅
- 2.1 RLS lockdown → INSERT'ler service-role only, duplicate SELECT'ler temizlendi, SECURITY DEFINER fonksiyonlardan EXECUTE revoke ✅

**Anti-cheat akışı:** Frontend → submit-score Edge Function → validate (hız 60 m/s, coin/m, score/m, zaman drift) → suspicious_scores log (anomali) veya scores INSERT (geçerli, service role).

**Migration discipline:** 14 haneli format + CI auto-apply.

Detaylı yol haritası: `~/.claude/plans/ncelikle-t-m-dosyalar-ve-jiggly-naur.md` (v3)

---

## Faz 0: Kritik Bug Duzeltmeleri (TAMAMLANDI)

- [x] `use-credit/index.ts`: Ethereum regex -> Solana base58 regex
- [x] `store.js` quitGame(): `'menu'` -> `'launcher'`
- [x] `index.html`: kullanilmayan RainbowKit CSS import kaldirildi

Detay icin bkz. `TASK.md`.

---

## Faz 1: Temel Altyapi Iyilestirmeleri (Oncelik: Yuksek)

### 1.1 Test Altyapisi (Kismen Tamamlandi)
- [x] Vitest kurulumu ve yapilandirmasi (v6)
- [x] solanaWallet.js icin birim testleri (8 test, balance error path'leri)
- [ ] Store (game logic) icin birim testleri
- [ ] Carpisma algilama testleri (VEHICLE_DIMENSIONS, COLLISION_PADDING)
- [ ] Skor hesaplama testleri (classic vs D/N)
- [ ] Dusman AI testleri (serit degistirme, spawn algoritmasi)
- [ ] Utility fonksiyonlari (jupiterPrice) testleri
- [ ] CI/CD pipeline'a test entegrasyonu (npm test)

### 1.2 Kod Kalitesi
- [ ] ESLint 11 pre-existing hatasi (formatAddress unused, tokenAmount unused, store.js targetX, main.jsx fast-refresh)
- [ ] Prettier entegrasyonu
- [x] Gereksiz console.log'lari uretimde strip (vite pure_funcs ile, v6)
- [x] Tutarsiz isimlendirmelerin duzeltilmesi (Coal -> generic token, v5)
- [ ] App.jsx bolme (2456 satir -> mantiksal alt dosyalar)

### 1.3 TypeScript Gecisi (Opsiyonel - Buyuk is)
- [ ] tsconfig.json olusturma
- [ ] Tip tanimlari (interfaces) yazma
- [ ] Adim adim .jsx -> .tsx donusumu
- [ ] Store tipleri
- [ ] Component prop tipleri

---

## Faz 2: Oyun Mekanikleri Iyilestirmeleri (Oncelik: Orta)

### 2.1 Oyun Deneyimi
- [ ] Ses dosyalari ekleme (motor sesi, arka plan muzigi)
- [ ] Post-processing efektlerin etkinlestirilmesi (bloom, motion blur)
- [ ] Daha fazla arac modeli ve cesitliligi
- [ ] Hava durumu efektleri (yagmur, gece/gunduz)
- [ ] Farkli harita/pist secenekleri

### 2.2 Kontrol Iyilestirmeleri
- [ ] Gamepad/joystick destegi
- [ ] Mobil gyroscope kontrolu
- [ ] Kontrol hassasiyet ayarlari
- [ ] Dokunmatik kontrol geri bildirimi iyilestirme

### 2.3 Zorluk Dengesi
- [ ] Dusman spawn oranlarinin ince ayari
- [ ] Seviye gecis mesafelerinin dengelenmesi
- [ ] Near miss mesafe esiklerinin test edilmesi
- [ ] Double or Nothing modunun dengelenmesi

---

## Faz 3: Backend ve Guvenlik (Oncelik: Yuksek)

### 3.1 Guvenlik Iyilestirmeleri
- [ ] RLS politikalarinin sikistirilmasi (USING(true) -> wallet bazli kurallar)
- [ ] Skor dogrulama (sunucu tarafli anti-cheat, hiz/mesafe tutarliligi)
- [ ] Rate limiting eklenmesi (skor gonderme, kredi kullanma)
- [ ] Edge Function'larda girdi dogrulama guclendirme
- [ ] GameOverUI'daki "Fair Play Protected" iddiasini gercek dogrulama ile destekle
- [ ] submit_score RPC'ye coins_collected parametresi eklemek ve scores tablosuna yazmak
- [ ] Fiyat toleransini hizala (frontend %5 vs backend %10)

### 3.2 Backend Ozellikleri
- [ ] Skor gonderme Edge Function'u (sunucu tarafli dogrulama)
- [ ] Gunluk odul dagitim sistemi
- [ ] Kullanici profil sayfasi
- [ ] Oyun istatistikleri API'si

### 3.3 Veritabani Optimizasyonlari
- [ ] Sorgu performans analizi
- [ ] Gereksiz indexlerin temizlenmesi
- [ ] Arsivleme stratejisi (eski skorlar)

---

## Faz 4: UI/UX Iyilestirmeleri (Oncelik: Orta)

### 4.1 Launcher Ekrani
- [ ] Yukleme animasyonu iyilestirme
- [ ] Cuzdan baglanti akisi sadellestirme
- [ ] Kredi satin alma deneyimini iyilestirme
- [ ] Token fiyat gosterimi ekleme

### 4.2 Oyun Ici UI
- [ ] Minimap veya mesafe gostergesi
- [ ] Combo animasyonu iyilestirme
- [ ] Level up efekti
- [ ] Daha iyi HUD tasarimi

### 4.3 Oyun Sonu Ekrani
- [ ] Detayli istatistikler
- [ ] Paylasim butonlari
- [ ] Tekrar oynama akisini iyilestirme

---

## Faz 5: Performans Optimizasyonu (Oncelik: Orta)

### 5.1 Rendering
- [ ] LOD (Level of Detail) sistemi
- [ ] Frustum culling iyilestirmesi
- [ ] Texture atlasing
- [ ] Model basitlestirme (dusuk poly versiyonlari)

### 5.2 Bellek Yonetimi
- [ ] Material dispose stratejisi gozden gecirme
- [ ] Texture cache optimizasyonu
- [ ] Garbage collection azaltma

### 5.3 Network
- [ ] API cagrisi caching
- [ ] Offline destek (PWA)
- [ ] Asset preloading stratejisi iyilestirme

---

## Faz 6: Yeni Ozellikler (Oncelik: Dusuk)

### 6.1 Sosyal Ozellikler
- [ ] Gercek zamanli cok oyunculu mod
- [ ] Arkadaslik sistemi
- [ ] Oyun ici sohbet
- [ ] Turnuva sistemi

### 6.2 NFT Entegrasyonu
- [ ] NFT araba skinleri
- [ ] NFT odul sistemi
- [ ] Marketplace entegrasyonu

### 6.3 Ek Oyun Modlari
- [ ] Zaman yarisi modu
- [ ] Hayatta kalma modu
- [ ] Gunluk meydan okuma

---

## Oncelik Sirasi

1. **Test altyapisi** - Guvenilir gelistirme icin kritik
2. **Guvenlik iyilestirmeleri** - Uretimde para islemleri var
3. **Kod kalitesi** - Surekli gelistirme icin onemli
4. **Oyun deneyimi** - Kullanici tutma icin kritik
5. **UI/UX** - Kullanici deneyimi
6. **Performans** - Mobil deneyim icin onemli
7. **Yeni ozellikler** - Buyume icin

---

## Teknik Borc (v6 sonrasi guncel)

| Alan | Aciklama | Oncelik |
|------|----------|---------|
| RLS politikalari | Tum tablolarda USING(true) - herkes her seyi okur/yazar | **Kritik** |
| Sunucu tarafli skor dogrulama yok | Frontend'den hile mumkun, "Fair Play Protected" banner'i yaniltici | **Kritik** |
| Rate limiting yok | submit_score, use-credit, verify-payment limitsiz | Yuksek |
| App.jsx 2456 satir | Tek dosyada cok fazla bilesen | Yuksek |
| Test kapsami sinirli | Sadece solanaWallet test'leri var; store/GameOverUI/Edge Function eksik | Yuksek |
| ESLint 11 pre-existing hata | formatAddress unused, tokenAmount/price unused, fast-refresh | Orta |
| coins_collected kaydedilmiyor (BUG #4) | submit_score imzasinda yok, GameOverUI gondermiyor | Orta |
| Tolerans tutarsizligi | Frontend %5 (solana.config.js) vs backend %10 (verify-payment) | Orta |
| Hardcoded degerler | Oyun sabitleri (hiz, mesafe, spawn oranlari) dosyada gomulu | Orta |
| TypeScript yok | Tip guvenligi eksik | Dusuk |
| Kullanilmayan asset'ler | Car1/scene.gltf, suv.glb, coin.glb preload edilir ama render'da kullanilmaz | Dusuk |
| FontAwesome CDN | Dis bagimllik, bundle'a alinabilir | Dusuk |
| three-vendor 1144 KB | Tek chunk, code-split mumkun | Dusuk |

## Yakin Zamanda Duzeltilenler (v6 - 2026-04-30)

| Alan | Durum |
|------|-------|
| ~~TOKABU bakiye 0 gozukuyor~~ | DUZELTILDI - Buffer polyfill (`src/polyfills.js`), kok neden Vite'in Buffer'i polyfill etmemesi |
| ~~`drop_console: true` her seyi gizliyor~~ | DUZELTILDI - sadece log/debug/info strip, error/warn korundu |
| ~~`getTokenBalance` sessiz 0 dondurur~~ | DUZELTILDI - throw ediliyor, UI'da error state + retry butonu |
| ~~use-credit Edge Function eski Ethereum regex~~ | DUZELTILDI - workflow'a deploy adimi eklendi, redeploy yapildi |
| ~~Test altyapisi yok~~ | EKLENDI - Vitest + 8 regression test |

## Yakin Zamanda Duzeltilenler (v5 - 2026-04-23)

| Alan | Durum |
|------|-------|
| ~~Coal/Oiltown isimlendirme~~ | DUZELTILDI - jenerik isimlere rename (getTokenBalance, transferToken) |
| ~~Post-processing bos composer~~ | DUZELTILDI - PostProcessing component tamamen kaldirildi |
| ~~Helius API key git'te commit'li~~ | DUZELTILDI - env var'a tasindi |
| ~~20241216 migration LMX/BNB default'lari~~ | DUZELTILDI - default NULL + yeni migration |
