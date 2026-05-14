# Lumexia Racing Game - Gelistirme Plani

> Son guncelleme: 2026-05-14 (v15)

## Mevcut Durum Ozeti

Proje, **calisir ve oyunabilir** durumda bir 3D yaris oyunu. **LMX token** (mint `ELaSG...pump`, Sprint 8 sonrası 2026-05-09) ile odeme akisi end-to-end calisiyor. Sprint 0-4 + Sprint 4.5 + Sprint 6 + Sprint 7-mini + **Sprint 8 (token launch)** + **Sprint 9 (price chain hardening + magnet-aware anti-cheat)** tamamlandi. Cycle reward payout pipeline operasyonel; cycle anchor 2026-05-09. Render hattı Faz-1/Faz-2 ile selector pattern'a alındı; yan çevre CC0 asset pack'lerle gerçek 3D'ye geçti. Buy ekranı price fetch'i 4-source chain (DexScreener → Jupiter v2 → on-chain bonding curve → pump.fun frontend-api) + Edge Function proxy ile hardened.

**Aktif sprint durumu (2026-05-14):**

| Sprint | Durum | Not |
|--------|-------|-----|
| 0-4 | ✅ Tamam | Otonomluk altyapısı, landing migration, anti-cheat, kod kalitesi |
| 4.5 | ✅ Tamam | Payment self-healing |
| 5 (E2E test) | ❌ İPTAL | Kullanıcı kararı 2026-05-02 |
| 6 (48h cycle + UI) | ✅ KAPALI | Tüm PR'lar prod'da |
| 7-mini (manual payout) | ✅ KAPALI | 3 PR (#106, #107, #108) prod'da; pipeline operasyonel |
| 7 (tam otomatik transfer) | ⏸️ ASKIDA | Treasury Vault + distribute-rewards + retry queue + monitoring (memory: `project_payment_process_pending.md`) |
| Faz-1/Faz-2 render perf | ✅ KAPALI | `d6cd4f6` + `bcfd091` — selector pattern + module-level laneOccupancy cache |
| UI cleanup | ✅ KAPALI | PR #110 — launcher dead bottom-nav bar |
| Asset env (CC0) | ✅ KAPALI | `2d48460` + `2d8e584` — KayKit + Quaternius asset packs |
| 8 (Token launch) | ✅ KAPALI | PR #112 (4U24...pump) → re-launch PR #113 (ELaSG...pump aktif) + Landing PR #20 senkron + Phase 1b ops; aktif token: LMX mint `ELaSGbXf6KMcw9wzyLgG78Tef6BLrHwkGpH5euLSpump`, anchor 2026-05-09 |
| **9 (Price chain hardening + anti-cheat tuning)** | **✅ KAPALI** | **4 PR — #115 Jupiter v2 + pump.fun fallback (frontend + 3 Edge Function), #116 server-side price proxy, #117 on-chain bonding curve fallback + diagnostic logging, #118 `coin_density` 10 → 3 m/coin (magnet-aware)** |

**Son merge edilen PR'lar / commit'ler (kronolojik):**
- Racing PR #99/#100/#101: Payment self-healing — 2026-05-01
- Racing PR #102: Sprint 6 PR 6.1 — 48h cycle reset (backend + UI legal) — 2026-05-01
- Racing PR #103: Anti-cheat coin density 1/50m → 1/10m relax — 2026-05-01
- Landing PR #17: Sprint 6 PR 6.5 — 48h cycle copy + Cycle Ranking reorder — 2026-05-02 (squash `74ec528`)
- Racing PR #104: docs sync — 2026-05-02 (squash `a249a06`)
- Landing PR #18: Cycle Ranking UI fix (48h window + bonus formula + LMX/SOL) — 2026-05-02 (squash `b0f03f7`)
- Racing PR #105: docs sync (Sprint 5/7 status reset) — 2026-05-02 (squash `87b4134`)
- Racing PR #106: Sprint 7-mini PR 1 — payment tracking schema (7 yeni kolon + index + cleanup) — 2026-05-03 (squash `6a6ab97`)
- Racing PR #107: Sprint 7-mini PR 2 — Edge Function 3-tier price fallback + multi-currency INSERT — 2026-05-03 (squash `0fcd08a`)
- Racing PR #108: Sprint 7-mini PR 3 — manual-payout runbook — 2026-05-03 (squash `2f1100a`)
- **Racing `d6cd4f6`: Faz-1 perf — Game/PlayerCar selector pattern + getState in useFrame + module-level laneOccupancy cache — 2026-05-08**
- **Racing `bcfd091`: Faz-2 perf — selector pattern for 7 sibling components — 2026-05-08**
- **Racing PR #110 (`9242b99`): launcher dead bottom-nav bar removal — 2026-05-08**
- **Racing `2d48460`: CC0 asset packs (KayKit + Quaternius, ~28 MB) — 2026-05-09**
- **Racing `2d8e584`: SideObjects asset-based zone-render rewrite (urban/rural/forest, 41 distinct asset, AssetModel clone) — 2026-05-09**
- **Racing PR #111 (`9a5b284`): docs sync (TASK + PLAN + PROJECT_DOCS for 2026-05-08/09 + open Sprint 8) — 2026-05-09**
- **Racing PR #112 (`cb8c56c`): Sprint 8 ilk launch — TOKABU → LMX (mint `4U24...pump`), cycle anchor 2026-05-01 → 2026-05-09 (migration `20260509200000_cycle_reset_token_launch.sql`) — 2026-05-09**
- **Racing PR #113 (`94cadf8`): Sprint 8 re-launch — mint `4U24...pump` → `ELaSG...pump` (LMX), 4 dosya +4/-4 satır — 2026-05-09**
- **Landing PR #20 (`6f5f043`): Sprint 8 landing senkron — TOKEN_CONFIG (TOKABU → LMX, mint ELaSG) + 3 cycle anchor (2026-05-01 → 2026-05-09) + leaderboard hardcoded "$TOKABU" → `${TOKEN_CONFIG.symbol}` — 2026-05-09**
- **Racing PR #115 (`9adada2`): Jupiter v2 + pump.fun frontend-api fallback (frontend + 3 Edge Function: verify-payment, reconcile-payments, calculate-daily-rewards), 22/22 test ✓ — 2026-05-13**
- **Racing PR #116 (`b55798b`): server-side price proxy `get-token-price` Edge Function (DexScreener → Jupiter → pump.fun, CORS allowlist, 8s timeout, JWT verify on) + frontend `getEdgeFunctionPrice()` final tier — 2026-05-13**
- **Racing PR #117 (`0c78448`): on-chain pump.fun bonding curve fallback (Solana RPC `getAccountInfo` + 49-byte Anchor decode, `priceSol = vSol/vTok × 10⁻³`, SOL/USD Jupiter→Coingecko fallback) + per-source `timed()` diagnostic logging — 2026-05-14**
- **Racing PR #118 (`dc72621`): `submit-score` `MIN_M_PER_COIN` 10 → 3 m/coin (magnet power-up false-positive fix; score_anomaly tavanı korunuyor); manuel deploy via Supabase MCP (workflow trigger gecikmesi) — 2026-05-14**

**Tamamlanmis altyapi:**
- Branch protection her iki repo'da aktif (main'e direkt push yasak, force push yasak, 1 review zorunlu, CI status check)
- CI test gate (`.github/workflows/ci.yml`) — her PR'da `npm test` + `npm run build` zorunlu
- Edge Function recovery: `calculate-daily-rewards` Supabase prod'dan repo'ya geri alindi ve CI deploy hattina baglandi; BNB → USD geçişi + JWT bypass yapıldı
- `verify-payment` Edge Function `PAYMENT_RECEIVER_ADDRESS` env var adını destekliyor (geriye uyumlu)
- `reconcile-payments` Edge Function (orphan TX backfill, 100 imza taraması, idempotent UNIQUE constraint)
- `unverified_payments` tablosu (forensic admin log, service-role only)
- Rate limiting (use-credit 30/dk, verify-payment 10/dk) — uretimde calisiyor
- Bug #4 coins_collected — submit_score imzasi guncel, GameOverUI gonderiyor
- Buffer polyfill, Vitest setup (20 test), price tolerance %7 hizalanmis, 11 ESLint hatasi temizlenmis
- 48h cycle: trigger fonksiyon `cycle_start = CURRENT_DATE - ((CURRENT_DATE - DATE '2026-05-01')::int % 2)` hesabi yapar; archive cron prev-cycle rows'unu temizler; calculate-daily-rewards cycle-end day kontrolü ile self-skip eder
- Sprint 7-mini payout pipeline: `reward_pool_distribution` 7 yeni kolon (reward_amount_sol/tokabu, sol/tokabu_price_usd audit snapshots, paid_at/paid_tx_hash/paid_in_token); calculate-daily-rewards 3-tier fiyat fallback (DexScreener → Jupiter → CoinGecko/transactions DB per-wallet); `docs/RUNBOOKS/manual-payout.md` ekip için step-by-step kılavuz
- **Render pipeline (Faz-1/Faz-2):** `Game()`, `PlayerCar()`, ve 7 sibling component (`MobileControls`, `SideObjects`, `StreetLights`, `RoadEnvironment`, `CameraShake`, `SpeedLines`, `SpeedBlurOverlay`) selectorless `useGameStore()` destructure'lerinden Zustand selector pattern'a alındı. PlayerCar `useFrame` içinde high-churn alanları (`enemies`, `coins`, `targetX`, `gameOver`) `useGameStore.getState()` ile çekiyor. `playerPos` mutate-in-place. Module-level `_laneOccupancyCache` `updateGame` her frame `{}+3*[]` allocation'ını sıfırladı.
- **Asset-based side environment:** `public/models/` altında 3 CC0 pack (~28 MB) — KayKit City Builder Bits, Quaternius Nature Pack, Quaternius Farm Buildings. `SideObjects` zone-based render (urban/rural/forest), `AssetModel` `useGLTF` + `clone()` pattern, 41 distinct asset preloaded.
- **UI cleanup:** Launcher'da işlevsiz dekoratif bottom-nav bar (`◂ ✏ ☜ ⊕ ⊞`) kaldırıldı (PR #110).

**Landing page (lumexia.net):**
- Tamamen Solana/TOKABU dünyasında (SEO meta + structured-data + UI metinleri + API routes)
- Sprint 6 PR 6.5 ile 48h cycle UI: features-grid "Cycle Reward Distribution" + dashboard-hero "CYCLE RANKING" buton + LeaderboardSection üst seviyede (DashboardHero altında, TransactionsPanel üstünde)
- Realtime subscriptions debounce'lı (Sprint 3b)

**Sprint 6 PR durumu (kapalı):**
- PR 6.1 — 48h cycle backend + legal UI ✅ (#102)
- ~~PR 6.2~~ — `reward_distributions` ALTER → Sprint 7-mini PR #106'ya taşındı (`reward_pool_distribution`'a `paid_at`/`paid_tx_hash` + currency kolonları eklendi)
- ~~PR 6.3~~ — `export-reward-payload` Edge Function → **İPTAL** (calculate-daily-rewards zaten per-wallet ödülü tabloya yazıyor; Dashboard SQL + manual-payout.md runbook yeterli)
- ~~PR 6.4~~ — Racing UI 48h metinleri → **GEREKSİZ** (UI'da "Daily" referansı yok)
- PR 6.5 — Landing 48h UI ✅ (#17)
- PR 6.6 — Toplu docs sync ✅ (#104 + #105 + bu PR)
- Bonus PR — Cycle Ranking UI fix ✅ (#18)

**Sprint 7-mini PR durumu (kapalı, 2026-05-03):**
- ✅ #106 (`6a6ab97`) — Schema: `reward_pool_distribution` 7 yeni kolon + idx_reward_unpaid + 4 eski BNB satırı cleanup
- ✅ #107 (`0fcd08a`) — Edge Function: 3-tier SOL fiyat (DexScreener+Jupiter+CoinGecko) + 2-tier+DB TOKABU (DexScreener+Jupiter+per-wallet transactions fallback) + multi-currency INSERT + observability
- ✅ #108 (`2f1100a`) — `docs/RUNBOOKS/manual-payout.md` (382 satır, 10 bölüm + troubleshooting)

**Açık aksiyonlar (kullanıcı):**
1. **Smoke test:** yeni LMX (mint ELaSG...pump) ile $1 satın alma → credit eklenmeli, transactions tablosunda yeni satır
2. **DexScreener pool indekslenmesi** — Edge Function fiyat fetch'in çalışması için (multi-currency reward yazımı)
3. **SEO/Search Console refresh** — `lumexia.net` yeni LMX bilgisini Google'a tazeletmek (URL Inspection + Sitemap submit)
4. `reconcile-payments` `dryRun: true` ilk test (PR #99 sonrası açık)
5. `reconcile-payments` cron enable (Dashboard SQL)
6. Cycle manual payout dry-run — `docs/RUNBOOKS/manual-payout.md` adım adım uygula

**Açık tartışmalar (ileride):**
- Ödeme süreci tercihi (manuel/hibrit/otomatik) — Sprint 7 tam otomatik transfer plan açma ön koşulu

---

## Sprint 8: Yeni Token Launch (AÇIK — 2026-05-09)

**Hedef:** TOKABU'dan kendi çıkardığımız yeni token'a tek atomic geçiş. Geçiş sırasında pipeline (verify-payment / use-credit / submit-score / reconcile-payments / calculate-daily-rewards) hiç düşmemeli. Tek "kesim noktası" yeni mint adresinin yayınlandığı an — ondan önce her şey hazır olmalı.

### Gereken parametreler (kullanıcıdan alınacak)

| Parametre | Açıklama | Notlar |
|-----------|----------|--------|
| Yeni mint adresi | Solana SPL token mint pubkey | Token oluşturulduktan sonra net |
| Sembol | UI'da gösterilecek (örn. `LUMEX`, `LMXV2`) | Agreement metni + balance UI |
| İsim | Tam isim (`Lumexia`, vs.) | Logo ile birlikte |
| Decimals | 6 (tipik pump.fun) veya 9 (klasik SPL) | `solana.config.js` ve Supabase Secret `TOKEN_DECIMALS` |
| Logo URL | Opsiyonel, public CDN | `TOKEN_CONFIG.logoUrl` |
| Receiver wallet | Aynı `T6Ekv...mmGg` mı? Yeni mi? | Eğer değişiyorsa **kritik:** treasury balance taşıma planı |
| DexScreener / Jupiter listing | İndekslenmiş mi? | Fiyat fallback'leri için kritik |
| Launch zamanı | UTC timestamp | Cron schedule ve "kesim anı" planı |

### Hedef değişiklikler (PR scope)

**Racing repo (bu repo):**

1. `src/solana.config.js` → `TOKEN_CONFIG` block'u tek noktada güncelle
2. `src/components/RealLauncherUI.jsx` → `buildAgreementText()` zaten `TOKEN_CONFIG.symbol`'u parametrize alıyor, otomatik düzelir
3. `supabase/functions/verify-payment/index.ts` → `PAYMENT_TOKEN_MINT` ve `TOKEN_SYMBOL` env'den okuyor, fallback hardcoded değer'i de güncelle (env bozulursa diye)
4. `supabase/functions/reconcile-payments/index.ts` → aynı pattern
5. `supabase/functions/calculate-daily-rewards/index.ts` → `TOKABU_MINT` const'ı env'den okuyor, fallback'i güncelle
6. `docs/PROJECT_DOCS.md` + `README.md` + `docs/INTEGRATION.md` → mint/sembol referansları
7. `.env.example` → değişen env adlarını yansıt (varsa)

**Landing repo (`v0-lumexia-landing-page-V0`, ayrı PR):**

1. `lib/token-config.ts` (varsa) — single source of truth
2. SEO meta + structured-data + UI metinleri (TOKABU referanslı yerler)
3. `/api/ticker` route — yeni mint için DexScreener/Jupiter sorgu

**Supabase tarafı (Dashboard'dan, PR değil):**

1. Edge Function Secrets: `PAYMENT_TOKEN_MINT`, `TOKEN_SYMBOL`, `TOKEN_DECIMALS` güncelle
2. Receiver wallet değişiyorsa `PAYMENT_RECEIVER_ADDRESS` da güncelle
3. `transactions` tablosu eski `token_symbol = 'TOKABU'` satırlarına dokunulmaz; yeni satırlar yeni sembolle yazılır (tarihsel sürekliliğe ihtiyaç var: tx history, cycle ödülleri eski TOKABU değerlerine atıf yapabilir)

### Kesim sırası (zero-downtime cutover)

1. **T-24h:** kullanıcı yeni mint'in DexScreener/Jupiter indekslemesini doğrular (fiyat APIs döndürüyor mu?)
2. **T-1h:** PR açılır (kod değişiklikleri), CI yeşil, **merge edilmez** — sadece beklemede
3. **T-15m:** Supabase Secrets güncellenir (Dashboard) — Edge Function'lar sıcak, env değişikliği yeni invocation'da etkili
4. **T-0:** PR merge → Netlify auto-deploy → frontend yeni token'a geçer
5. **T+15m:** Smoke test:
   - Cüzdana yeni token gönder → `verify-payment` doğrular → kredi eklenir
   - `reconcile-payments` `dryRun: true` çalıştır → yeni TX'leri görüyor
   - Bir oyun oyna → skor kaydedilir → leaderboard güncelleniyor
6. **T+24h:** İlk cycle-end Edge Function çalışmasında `prices.tokabu_usd_api` (artık yeni token sembolü) non-NULL gelmeli

### Risk noktaları

- **Geçici fiyat boşluğu:** Yeni token DexScreener'da indekslenene kadar `verify-payment` ve `calculate-daily-rewards` fiyat fail eder. Mitigasyon: launch öncesi DexScreener listing zorunlu.
- **Receiver wallet değişimi:** Eski TOKABU bakiyeleri eski cüzdanda kalır; treasury manuel taşıma. Receiver değişmezse sıfır risk.
- **Hardcoded mint string'ler:** Edge Function fallback değerleri eski TOKABU mint'i taşıyor. Bunları yeni mint ile değiştirmek **kritik** — env bozulursa fallback eski token için doğrulamaya devam eder.
- **Symbol referansı eski cycle ödüllerinde:** `transactions.token_symbol` eski satırlar `TOKABU` kalır; yeni satırlar yeni sembol. UI'da gösterilirken karışıklık olmaması için landing tarafında "all-time stats" yerine "since launch" filtresi düşünülebilir.

### Öncelikli çıktı

PR açılmadan önce kullanıcıdan **8 parametrelik form** alınacak (yukarıdaki tabloda). Sonra tek atomic PR + Supabase Secrets adımı + cutover smoke test ile sprint kapanır.

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
