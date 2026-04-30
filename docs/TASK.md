# Lumexia Racing Game - Gorev Takip

> Son guncelleme: 2026-05-01 (v16)

---

## 2026-05-01: Sprint 3 - Otonom Supabase bağlantısı (3 PR)

Landing repo'daki Supabase entegrasyonu sertleştirildi + cross-repo entegrasyon dokümante edildi.

**3a — Typed Supabase client + canonical env names (landing PR #14):**
- `lib/database.types.ts` (yeni, auto-generated via Supabase MCP) — 9 tablo + 2 view + 7 fonksiyon tipleri
- `lib/supabase.ts` — `createBrowserClient<Database>` ile type-safe; legacy `NEXT_PUBLIC_LEADERBOARD_SUPABASE_*` fallback'ı kaldırıldı; canonical pair: `NEXT_PUBLIC_SUPABASE_URL` + `NEXT_PUBLIC_SUPABASE_ANON_KEY`
- 5 tip alias: DailyLeaderboardEntry, Transaction, Score, User, RewardPoolDistribution
- Bonus keşif: `alltime_leaderboard` ve `daily_team_scores` view'ları (PROJECT_DOCS'ta yoktu)

**3b — Realtime hardening (landing PR #15):**
- `lib/pool-context.tsx` event `*` → `INSERT` (scores write-once); 1sn debounce
- `components/transactions-panel.tsx` 1sn debounce eklendi (event zaten INSERT idi, Sprint 1.6'dan)
- Etki: burst INSERT senaryolarında (verify-payment retry, anti-cheat reject) gereksiz refetch'ler tek çağrıda toplanır

**3 wrap-up — Cross-repo integration doc (racing PR — bu PR):**
- `docs/INTEGRATION.md` (yeni) — iki repo'nun Supabase noktasında nasıl buluştuğunu özetler:
  - Tablo bazlı r/w sorumlulukları
  - Edge Function caller'ları + auth modu
  - Env var adları (Vite vs Next, secrets, CI)
  - Realtime channel'lar + filter + debounce
  - TS tip refresh recipe
  - Migration discipline
  - Cross-repo smoke walk

**Risk:** DÜŞÜK — type-only + subscription filter daraltma + yeni doc. Davranış değişikliği yok.

---

## 2026-05-01: Sprint 2.1 follow-up - REVOKE EXECUTE FROM PUBLIC

**Migration:** `supabase/migrations/20260501000003_revoke_public_execute.sql`

**Sorun:** Sprint 2.1 PR #93'te 5 SECURITY DEFINER fonksiyondan `REVOKE EXECUTE ... FROM anon, authenticated` yaptık. Ama Postgres default grant'i `EXECUTE TO PUBLIC` ve PUBLIC anon/authenticated'i kapsıyor. Targeted revoke no-op oldu; advisor uyarıları düşmedi.

**Çözüm:** `REVOKE EXECUTE FROM PUBLIC` ile aynı 5 fonksiyon kapatıldı. `service_role` kendi explicit grant'i var, etkilenmez (ayrıca RLS bypass eder).

**Etkilenen fonksiyonlar:** submit_score, update_daily_leaderboard, archive_daily_leaderboard, check_rate_limit, cleanup_rate_limits.

**Bonus:** `suspicious_scores` tablosuna açıklayıcı COMMENT eklendi (rate_limits gibi).

**Doğrulama:** Migration apply sonrası advisor `anon_security_definer_function_executable` ve `authenticated_security_definer_function_executable` 0'a düşmeli.

---

## 2026-05-01: Sprint 2.1 - RLS lockdown (INSERT, duplicate SELECT, EXECUTE revoke)

**Migration:** `supabase/migrations/20260501000002_rls_lockdown.sql`

3 bölümlü güvenlik sertleştirmesi:

**1. INSERT policy lockdown:**
- `public.scores` "Anyone can insert scores" DROP — Sprint 2.2b sonrası frontend submit-score Edge Function üzerinden gönderiyor (service role); anon doğrudan INSERT yapamamalı
- `public.users` "Anyone can insert users" DROP — verify-payment Edge Function service role ile user yaratıyor

**2. Duplicate SELECT policy temizliği:**
6 tablodan duplicate policy'ler kaldırıldı (her birinde 3 → 1 SELECT policy):
- daily_leaderboard, daily_leaderboard_history, reward_pool_distribution
- scores, transactions, users

"Allow public read" tutuldu (anon SELECT erişimi sürüyor — landing page leaderboard, transactions panel vs. çalışmaya devam eder).

**3. SECURITY DEFINER EXECUTE revoke:**
5 fonksiyon anon ve authenticated için revoke edildi:
- `submit_score` (Edge Function service role kullanır)
- `check_rate_limit` (Edge Function'lar service role)
- `update_daily_leaderboard` (trigger, role bypass)
- `archive_daily_leaderboard` (pg_cron postgres role)
- `cleanup_rate_limits` (service role admin only)

**4. rate_limits tablosuna açıklayıcı COMMENT:**
RLS aktif, policy yok = tasarım gereği service-role-only. Advisor `rls_enabled_no_policy` INFO uyarısı bu komutla belgeleniyor.

**Etki (advisor warning'leri):**
- ✅ `rls_policy_always_true` (scores, users) → kaybolur
- ✅ `anon_security_definer_function_executable` (5 fonksiyon) → kaybolur
- ✅ `authenticated_security_definer_function_executable` (4 fonksiyon) → kaybolur
- ✅ `multiple_permissive_policies` (6 tablo × 5 role = 30 uyarı) → kaybolur

**Risk:** YÜKSEK — RLS değişiklikleri canlıyı etkileyebilir. Mitigation: tüm Edge Function'lar service_role kullanır (RLS bypass), pg_cron postgres role ile çalışır.

---

## 2026-05-01: Sprint 2.2b + 2.3 - Frontend cutover + banner cümle düzeltme

**Frontend:** `src/components/GameOverUI.jsx`

**Değişiklik:** Skor gönderme akışı Sprint 2.2a'da kurulan `submit-score` Edge Function üzerinden geçiyor.

- Eski: `supabase.rpc('submit_score', {...})` doğrudan RPC, anti-cheat yok
- Yeni: `supabase.functions.invoke('submit-score', { body: {...} })`, anti-cheat doğrulaması + suspicious_scores log

**Kaldırılan kod:** `isMissingCoinsParam` legacy retry akışı (migration applied, gereksiz).

**Yeni hata yönetimi:**
- `score_rejected` (422) → "Score rejected — flagged for review", retry yapma
- `rate_limited` (429) → "Too many submissions. Try again in a minute.", retry yapma
- `invalid_wallet` (400) → "Wallet not recognised. Reconnect and try again.", retry yapma
- Transient hata (network, 5xx, RPC fail) → 3 retry linear backoff

**Banner cümle:**
- Eski: "Fair Play Protected — All scores are verified on-chain. Cheaters will be detected." (yanıltıcı)
- Yeni: "Anti-Cheat Protected — Scores are validated server-side before being recorded." (doğru)

**Risk:** ORTA-YÜKSEK — canlı skor akışı yeni Edge Function'a geçiyor. Anti-cheat kuralları konservatif ama hatalı false positive olursa gerçek skorlar reddedilir. Forensic suspicious_scores log'u var.

**Açık aksiyon:** Sprint 2.1 (RLS + RPC EXECUTE revoke) sırada — frontend Edge Function dışında submit_score RPC'sini de doğrudan çağıramayacak.

---

## 2026-05-01: Sprint 2.2a - Anti-cheat altyapısı (Edge Function + suspicious_scores)

**Sorun:** `submit_score` RPC sadece INSERT yapıyor; tutarlılık kontrolü yok. Oyuncu browser console'dan `supabase.rpc('submit_score', {...})` çağırıp keyfi skor gönderebilir. GameOverUI'daki "Fair Play Protected" banner yanıltıcıydı.

**Çözüm (altyapı kısmı):**

**1. Yeni migration:** `supabase/migrations/20260501000001_suspicious_scores_table.sql`
- `public.suspicious_scores` tablosu (forensic log)
- Sütunlar: wallet, score, distance, duration, coins, near_miss_count, game_mode, reasons[], payload(jsonb)
- RLS aktif, policy yok → service_role only

**2. Yeni Edge Function:** `supabase/functions/submit-score/index.ts`
- POST endpoint, frontend'in `submit_score` RPC çağrısının yerine geçer
- Anti-cheat kuralları:
  - `wallet` base58 doğrulama
  - `duration >= 10` saniye
  - `distance <= 60 m/s × duration` (200 km/h tolerans)
  - `coins <= floor(distance / 50)`
  - `score <= distance × 200`
  - `clientStartTime` drift `<= 5sn`
- Anomali → suspicious_scores INSERT → 422
- Geçer → service role ile `submit_score` RPC → 200
- Rate limit: wallet başına 6/dk

**3. CI workflow:** `.github/workflows/deploy-edge-functions.yml` → submit-score deploy adımı eklendi

**Bu PR sonrası:** Edge Function deploy olur ama frontend hâlâ doğrudan RPC kullanır → davranış değişmez. Sprint 2.2b'de frontend Edge Function'a geçirilir.

**Risk:** ORTA — yeni Edge Function ve tablo, prod davranışı değişmiyor (frontend henüz çağırmıyor).

---

## 2026-05-01: Sprint 2.4 follow-up - Stub migrations + repair listesi genişletme

**Sorun:** PR #89 sonrası `deploy-migrations` workflow ilk kez çalıştığında `supabase db push` adımı şu hatayla fail etti:

> Remote migration versions not found in local migrations directory.
> 20251207161419, 20251207161705

Supabase'de daha önce manuel oluşturulmuş 2 migration (`reward_pool_distribution` tablosu ve `setup_daily_rewards_cron`) yerel git history'de yoktu. CLI yerel ↔ remote inconsistency olarak gördü.

**Çözüm:**

1. **2 stub dosyası eklendi:**
   - `20251207161419_create_reward_pool_distribution_table.sql`
   - `20251207161705_setup_daily_rewards_cron.sql`
   - İçerik: SQL yorumları (zaten apply edilmiş, body boş, repair bunları "applied" işaretliyor)

2. **Workflow repair listesi:** 5 → 7 versiyon (yeni 2 stub eklendi)

**Etki:** Yerel ile remote eşit, `db push` no-op çalışır. Bundan sonra yeni migration'lar disiplinli akışta apply olur.

**Açık not:** İdeal çözüm `supabase db pull` ile gerçek SQL içeriklerini çekmekti, ama CI'da pull yapmak istemiyoruz (yön sorunu). Stub yaklaşımı pragmatik. Gerçek SQL içeriklerini görmek için Supabase Dashboard → Database → Migrations.

---

## 2026-05-01: Sprint 2.4 - Migration discipline (tam CI/CD)

**Sorun:** Yerel `supabase/migrations/` altında 5 SQL dosyası vardı (8 haneli timestamp), Supabase migration tablosunda sadece 2 kayıt (14 haneli timestamp). Yerel migration'lar zaten uygulanmıştı (manuel Dashboard üzerinden) ama disiplinsiz halde — `supabase db reset` yapılırsa rate_limits/coins_collected/search_path sertleştirmesi vb. kaybolurdu.

**Çözüm:**

**1. Yerel dosyaları 14 haneli formata rename:**
- `20241216_add_token_fields.sql` → `20241216000000_*`
- `20260423_fix_token_symbol_defaults.sql` → `20260423000000_*`
- `20260430_rate_limits.sql` → `20260430000000_*`
- `20260430_submit_score_coins_collected.sql` → `20260430000001_*` (saatlik fark, aynı tarihten)
- `20260501_function_search_path.sql` → `20260501000000_*`

**2. CI workflow:** `.github/workflows/deploy-migrations.yml`
- Trigger: push to main + paths `supabase/migrations/**`
- Steps: setup-cli → link → **repair (first-run idempotent)** → `supabase db push`
- Repair adımı: 5 mevcut migration'ı `--status applied` ile işaretler, SQL'i tekrar çalıştırmaz
- Push adımı: yeni eklenen migration'ları otomatik apply eder

**3. GitHub Secret:** `SUPABASE_DB_PASSWORD` eklendi (kullanıcı tarafından, reset edilmiş şifre).

**Etki:** Bundan sonra yeni migration dosyası eklendiğinde, PR merge edilince otomatik prod'a uygulanır. Sprint 2.5'in manuel Dashboard adımı son olur.

**Risk:** ORTA — CI artık prod DB'ye yazabilir. Branch protection (1 review zorunlu) ve CI test gate koruyucu.

---

## 2026-05-01: Sprint 2.5 - Function search_path mutable sertleştirme

**Migration:** `supabase/migrations/20260501_function_search_path.sql`

**Sorun:** Supabase advisor 9 fonksiyonun `search_path` ayarının "mutable" olduğunu işaretliyordu. SECURITY DEFINER fonksiyonlarda search_path injection riski: saldırgan kendi schema'sını öne alıp fonksiyon body'sindeki unqualified `now()`, tablo referansı vb. çağrılarını yakalayabilir.

**Etkilenen fonksiyonlar:**
- `update_updated_at_column` (trigger)
- `distribute_daily_team_bonus`
- `update_team_selection`
- `archive_daily_leaderboard`
- `update_daily_leaderboard`
- `submit_score`
- `check_rate_limit`
- `cleanup_rate_limits`
- `end_the_day`

**Çözüm:** Migration DO bloğu dinamik olarak `pg_proc`'tan imzaları çözer ve her birine `ALTER FUNCTION ... SET search_path = public, pg_temp` uygular. Body değişmiyor, sadece metadata.

**Risk:** DÜŞÜK — davranış aynı kalır, reversible (`RESET search_path`).

**Açık aksiyon:** Migration prod'a kullanıcı tarafından uygulanmalı (Supabase Dashboard SQL Editor ya da `supabase db push`). Sprint 2.4'te migration discipline kurulduktan sonra otomatikleşir.

---

## 2026-05-01: Sprint 1.8 - PAYMENT_RECEIVER env var ad tutarlılığı

**Edge Function:** `supabase/functions/verify-payment/index.ts`
**Sorun:** Supabase Custom Secrets'ta `PAYMENT_RECEIVER_ADDRESS` adıyla tanımlı (2025-12-11) ama Edge Function `PAYMENT_RECEIVER` arıyordu. Edge Function default değere düşüyordu (canlı receiver `T6EkvAVdHPRr6Ngub1vk7VTzqtgw2KoGJwA8RCJmmGg` ile uyumlu — kazara çalışıyordu).

**Çözüm (geriye uyumlu fallback chain):**
```ts
const PAYMENT_RECEIVER =
  Deno.env.get('PAYMENT_RECEIVER_ADDRESS')   // güncel secret adı
  ?? Deno.env.get('PAYMENT_RECEIVER')        // legacy
  ?? 'T6Ekv...';                              // hardcoded fallback
```

**Etkilenen yerler (read-only, dokunulmadı):** Aynı dosyada `PAYMENT_RECEIVER` constant'ı 3 yerde karşılaştırma için kullanılıyor (satır 192, 504, 532) — sadece env okuma genişletildi.

**Etki:** Edge Function v18 olarak deploy olur. Receiver değişikliği artık sadece Secret güncelleyerek yapılabilir.

---

## 2026-05-01: Sprint 1 (Landing Migration) - 6 PR Tamamlandı

Landing page (`v0-lumexia-landing-page-V0`) tamamen BSC/$LMX → Solana/TOKABU'ya geçirildi:

| PR | Sprint | İçerik |
|----|--------|--------|
| #8  | 1.1 | `lib/token-config.ts` — tek doğruluk kaynağı |
| #9  | 1.2 | SEO meta tags + structured-data (organizationSchema, videoGameSchema, faqSchema) |
| #10 | 1.3 | UI metinleri (faq-section, footer, strategy-section): MetaMask → Phantom, PancakeSwap → Jupiter, BNB → SOL, $LMX → $TOKABU |
| #11 | 1.4 | dashboard-hero CONTRACT_ADDRESS placeholder fix (gerçek TOKABU mint), token-stats BSC adresi temizlendi |
| #12 | 1.5 | API routes (`/api/dex`, `/api/ticker`) BSC → Solana, ticker mapping |
| #13 | 1.6 | pool-context BNB → USD, transactions-panel sample data → canlı Supabase verisi |

**Sonuç:** lumexia.net SEO, UI, API, ve canlı veri tamamen Solana/TOKABU dünyasında. Google bir sonraki crawl'da düzeltilmiş içeriği indeksleyecek.

---

## 2026-05-01: Sprint 1.7b - calculate-daily-rewards USD geçişi + 401 fix

**Edge Function:** `supabase/functions/calculate-daily-rewards/index.ts`
- `GAME_TO_BNB = 0.0015` → `GAME_TO_USD = 1.0` (verify-payment ile birim hizalama, $1 USD per game)
- `totalPoolBNB`/`netPoolBNB` → `totalPoolUSD`/`netPoolUSD`
- `unitValue` USD/share cinsinden
- `reward_pool_distribution.reward_amount` artık USD cinsinden yazılıyor

**Deploy workflow:** `.github/workflows/deploy-edge-functions.yml`
- `Deploy calculate-daily-rewards` adımına `--no-verify-jwt` flag eklendi
- pg_cron `pg_net.http_post()` ile çağırıyor; JWT yok → 401 dönüyordu, artık geçecek
- Yorum eklendi: gelecekte `X-Cron-Secret` header kontrolü ile güçlendirme planlanıyor (Sprint 4)

**Etkilenen tablo (write):** `reward_pool_distribution` — yarınki cron'dan sonra USD kayıtlar düşmeli
**Davranis dogrulamasi:** Edge Function logs'ta cron çağrısı 401 yerine 200 dönmeli; yeni kayıtlar `reward_amount` alanı USD cinsinden (örn. 0.5 = $0.50)

**Açık not:** `reward_pool_distribution` tablosunda eski 4 BNB değerli kayıt kalıyor — temizlik isterseniz manuel SQL: `DELETE FROM reward_pool_distribution WHERE reward_date < CURRENT_DATE`

---

## 2026-04-30: Sprint 1.7a - calculate-daily-rewards Edge Function repo'ya kurtarıldı

**Sorun:** `calculate-daily-rewards` 4 ay önce manuel Supabase Dashboard üzerinden deploy edilmiş, repo'da yoktu. Eğer prod'dan silinirse git'te yedek yoktu.

**Çözüm:** `supabase/functions/calculate-daily-rewards/index.ts` prod'daki içeriğin birebir kopyası olarak repo'ya eklendi. `.github/workflows/deploy-edge-functions.yml`'a `Deploy calculate-daily-rewards` adımı eklendi. Içerik aynı, davranış değişmedi.

**PR:** #85 (merged)

---

## 2026-04-30: Sprint 0 - Otonomluk altyapısı

**Branch protection (her iki repo):**
- `main`'e doğrudan push yasak (sadece PR ile)
- Force push yasak, branch silme yasak
- 1 onay zorunlu, stale review dismiss
- Required conversation resolution
- Racing'de status check zorunlu: `test` ve `build`

**CI test gate** (`.github/workflows/ci.yml`):
- Her PR'da `npm test` + `npm run build` paralel job'lar
- Test geçmeden merge mümkün değil
- Lint job dahil değil — `eslint.config.js` eksik (Sprint 4.3'te düzeltilecek)

**Memory altyapısı:** Hafızaya 6 dosya eklendi — prod safety, ekosistem, repo URL'leri, v0.app sync riski, Supabase MCP read-only, docs sync kuralı.

**PR:** #84 (merged)

---

## Ertelenmis / Not Dusulenler (Gelecekte Cozulmek Uzere)

### BUG #4: `coins_collected` submit_score RPC'ye gonderilmiyor (ERTELENDI)
**Dosya:** `src/components/GameOverUI.jsx:50`, `supabase-functions.sql:23` (submit_score)
**Durum:** Ileriki faz icin not dusuldu, simdi dokunulmayacak
**Ozet:**
- `scores.coins_collected` sutunu DB'de var, DEFAULT 0
- `submit_score(p_wallet, p_score, p_duration, p_distance)` imzasinda parametre yok
- GameOverUI bu degeri gondermiyor → tum kayitlarda 0
**Cozumde Yapilacak:**
- `submit_score` imzasina `p_coins INTEGER DEFAULT 0` ekle
- INSERT ifadesine `coins_collected` ekle
- GameOverUI'den toplanan coin sayisini gecir
- Migration: `CREATE OR REPLACE FUNCTION submit_score(...)` ile guncelle

---

## Tamamlanan Gorevler

---

### 2026-04-30: TOKABU Balance Bug Full Fix + CI Redeploy (v6)

**Bulgu zinciri (smoking gun: SOL gosteriliyor, TOKABU=0):**
1. Eski `vite.config.js` -> `drop_console: true` tum console.* call'larini strip ediyordu
2. Eski `getTokenBalance` outer catch RPC hatasini yutup 0 donduruyordu
3. **Vite default'ta Buffer polyfill yok** -> `globalThis.Buffer === undefined`
4. `@solana/spl-token` getAccount deserializer Buffer.from / Buffer.alloc kullaniyor (bundle'da 42 + 14 referans)
5. SOL `connection.getBalance` Buffer kullanmiyordu, calisiyordu - asimetri ipucu
6. `Buffer.from()` cagrisi `ReferenceError: Buffer is not defined` firlatiyordu, sessizce 0 donduruluyordu

**Cozumler (3 commit):**

**Commit `28b4c8b` - surface balance fetch errors:**
- `vite.config.js`: `drop_console: true` -> `pure_funcs: ['console.log', 'console.debug', 'console.info']`. error/warn korundu.
- `src/utils/solanaWallet.js`:
  - `getTokenProgramId`: 3x retry, basarisizlikta throw (sessiz fallback yok)
  - `getTokenBalance`: outer catch kaldirildi; sadece TokenAccountNotFoundError 0 doner, gerisi throw
- `src/components/RealLauncherUI.jsx`:
  - `tokenBalanceError` + `balanceRefreshKey` state
  - Fail durumunda son balance korunur, turuncu border + ↻ retry butonu

**Commit `66d2a43` - Vitest setup + 8 regression test:**
- `vitest@4.1.5` devDep eklendi
- `src/utils/solanaWallet.test.js`: happy path, TokenAccountNotFoundError, RPC error throw, deserialization throw, getTokenProgramId 3x retry, TOKEN_CONFIG sanity
- `npm test` / `npm run test:watch` script'leri

**Commit `d9d4899` - Buffer polyfill (asil bug):**
- `src/polyfills.js` (yeni): `import { Buffer as NodeBuffer } from 'buffer'; if (typeof globalThis.Buffer === 'undefined') globalThis.Buffer = NodeBuffer;`
- `src/main.jsx`: ilk import `./polyfills.js`
- `buffer@6.0.3` zaten transitive dep, yeni paket yok

**Commit `59baf7e` - CI redeploy use-credit:**
- `.github/workflows/deploy-edge-functions.yml`: `Deploy use-credit` step eklendi
- Path filter'a workflow dosyasinin kendisi de eklendi (yoksa workflow degisiklikleri tetiklemiyor)
- PR #77'deki use-credit Solana regex fix'i ilk kez deploy oldu (eskiden Ethereum regex hala canliydi -> tum cuzdanlar "Invalid wallet" aliyordu -> "Failed to start game")

**Etkilenen testler (Playwright + curl probe):**
- ✅ Production browser'da `globalThis.Buffer === function`
- ✅ Helius RPC'den TOKABU balance 3494.123463 doniyor
- ✅ use-credit Solana adresine "User not found" (404) doner (eskiden 400 "Invalid wallet")
- ✅ Vitest 8/8 gecti

**Acik aksiyon (kullaniciya):** YOK - tum stack senkron, oyun oynanabilir.

---

### 2026-04-23: Tokenize Rename + Helius Env + Migration Fix + PostProcessing Kaldirma (v5)

**Hata 6 - Coal/Oiltown jenerik isimlendirme (Secenek A):**
- `getCoalBalance` → `getTokenBalance`
- `transferCoalToken` → `transferToken`
- `getCoalPrice` → `getTokenPrice`
- `calculateCoalAmount` → `calculateTokenAmount`
- `COAL_TOKEN_MINT` → `PAYMENT_TOKEN_MINT` (backend env var)
- Frontend state: `coalBalance` → `tokenBalance`, `coalPrice` → `tokenPrice`, `requiredCoal` → `requiredTokens`
- `AGREEMENT_TEXT` dinamik: `buildAgreementText(TOKEN_CONFIG.symbol)`
- UI metinleri: "OILTOWN" → `${TOKEN_CONFIG.symbol}`, "OIL" abbreviation kaldirildi
- Backend `verify-payment/index.ts` env var destekli (PAYMENT_TOKEN_MINT, TOKEN_SYMBOL, TOKEN_DECIMALS, PAYMENT_RECEIVER)
- Etkilenen dosyalar: `solana.config.js`, `solanaWallet.js`, `jupiterPrice.js`, `RealLauncherUI.jsx`, `verify-payment/index.ts`

**Hata 7 - coins_collected:** Ertelendi, yukarida ayri bolumde not dusuldu

**Hata 8 - Migration:**
- `20241216_add_token_fields.sql`: LMX default'u ve BNB UPDATE'i kaldirildi, default NULL yapildi
- Yeni `20260423_fix_token_symbol_defaults.sql`: Existing DB'deki LMX/BNB kayitlari NULL'a cevrilir

**Hata 11 - Helius API Key:**
- Frontend: `src/solana.config.js` -> `import.meta.env.VITE_HELIUS_API_KEY` (yoksa public RPC'lere duser)
- Backend: `verify-payment/index.ts` -> `Deno.env.get('HELIUS_API_KEY')`
- `.env.example` guncellendi, Edge Function secrets dokumante edildi
- **ACIK AKSIYON:** Eski commit'li key Helius dashboard'dan revoke edilmeli, yeni key olusturulmali, Netlify/Supabase env vars'a eklenmeli

**Hata 14 - PostProcessing component kaldirildi:**
- `src/components/PostProcessing.jsx` silindi
- `App.jsx`'ten import + `<PostProcessing>` cagrisi kaldirildi
- `package.json`'dan `@react-three/postprocessing` dependency cikarildi
- `vite.config.js` three-vendor chunk'tan cikarildi

**Hata 15:** Kullanici talebi uzerine dokunulmadi

**Deploy Notlari:**
- Frontend: `npm install` (postprocessing cikti), `npm run build`, Netlify env vars ekle (VITE_HELIUS_API_KEY)
- Backend: `supabase functions deploy verify-payment`, `supabase secrets set HELIUS_API_KEY=...` (ve opsiyonel PAYMENT_TOKEN_MINT, TOKEN_SYMBOL, TOKEN_DECIMALS, PAYMENT_RECEIVER)
- DB: `supabase db push` ile `20260423_fix_token_symbol_defaults.sql` calistir
- Helius: Eski key'i revoke et, yeni key uret, domain-restricted (lumexia.net) olarak ayarla

---

### 2026-04-16: Dokumantasyon Tutarlilik Gecisi

- [x] PROJECT_DOCS.md'den tamamlanmis Faz 0 bug'lari "KRITIK HATALAR"dan kaldirildi
- [x] PostProcessing aciklamasi duzeltildi (null yerine bos EffectComposer)
- [x] Token fiyat API oncelik siralamasi aciklandi (frontend DexScreener ilk, backend Jupiter ilk)
- [x] Fiyat tolerans tutarsizligi belgelendi (frontend %5, backend %10)
- [x] StreetLights lamba sayisi yorumu 14'e cikarildi (App.jsx:1250 7x2=14)
- [x] store.js:106 yorum kucuk/buyuk harf tutarsizligi giderildi ('gameOver' -> 'gameover')
- [x] Kullanilmayan asset'ler (Car1/scene.gltf, suv.glb, coin.glb) dokumante edildi
- [x] Eski LMX/BNB migration'i dokumante edildi
- [x] GameOverUI submit_score imzasi duzeltildi (coins_collected gonderilmiyor not'u)
- [x] OILTOWN mint ve odeme alici adresleri dokumantasyona eklendi
- [x] PLAN.md teknik borc tablosu guncellendi

### 2026-02-06: Kritik Bug Duzeltmeleri (Faz 0)

#### Bug #1: use-credit Ethereum Dogrulama - DUZELTILDI
- [x] `isValidEthAddress` -> `isValidSolanaAddress` olarak degistirildi
- [x] Regex: `/^0x[a-fA-F0-9]{40}$/` -> `/^[1-9A-HJ-NP-Za-km-z]{32,44}$/`
- [x] Fonksiyon adi ve cagri noktasi guncellendi
- [x] Build basarili

#### Bug #2: quitGame() 'menu' State - DUZELTILDI
- [x] `store.js:273` - `'menu'` -> `'launcher'` olarak degistirildi
- [x] Build basarili

#### Bug #3: RainbowKit CSS Import - DUZELTILDI
- [x] `index.html` - RainbowKit CSS import satiri kaldirildi
- [x] Build basarili

### 2026-02-06: Proje Kesfetme ve Dokumantasyon (v2)

#### Incelenen Dosyalar (Tamami)
- [x] `src/App.jsx` - 2464 satir tamami okundu (tum bilesenler dokumante edildi)
- [x] `src/store.js` - 796 satir tamami okundu (tum state degiskenleri ve action'lar)
- [x] `src/main.jsx` - Giris noktasi ve Solana wallet provider kurulumu
- [x] `src/solana.config.js` - Token mint, RPC endpoints, odeme yapilandirmasi
- [x] `src/components/GameOverUI.jsx` - D/N skor mantigi, retry mekanizmasi, anti-cheat banner
- [x] `src/components/AdvancedParticles.jsx` - Nitro parcacik fizigi, GPU instancing
- [x] `src/components/PostProcessing.jsx` - Devre disi (null dondurur)
- [x] `src/components/PhysicsWorld.jsx` - Rapier3D yapilandirmasi
- [x] `src/components/RealLauncherUI.jsx` - Cuzdan baglanti, kredi satin alma, yasal metinler
- [x] `src/utils/supabaseClient.js` - DB islemleri
- [x] `src/utils/solanaWallet.js` - Token transfer ve bakiye
- [x] `src/utils/jupiterPrice.js` - Fiyat API entegrasyonu
- [x] `supabase/functions/verify-payment/index.ts` - Odeme dogrulama akisi
- [x] `supabase/functions/use-credit/index.ts` - Kredi dusme (KRITIK BUG tespit edildi)
- [x] `supabase-schema.sql` - Veritabani semasi
- [x] `supabase-functions.sql` - Stored procedure'ler ve trigger'lar
- [x] `vite.config.js` - Build yapilandirmasi
- [x] `netlify.toml` - Deploy yapilandirmasi
- [x] `package.json` - Bagimliliklar
- [x] `index.html` - HTML giris noktasi

#### Olusturulan Dokumanlar
- [x] `docs/PROJECT_DOCS.md` (v2) - Kapsamli proje dokumantasyonu
  - Tum state degiskenleri ve action'lar
  - Dusman AI serit degistirme mantigi
  - Spawn algoritmasi detaylari
  - Canvas ve kamera ayarlari
  - HUD elemanlari ve responsive olcekler
  - Carpisma sistemi (AABB boyutlari ve esikleri)
  - Edge Function islem akislari
  - Veritabani sema detaylari (her sutun)
  - RLS politika analizi
  - 15 bilinen hata/eksiklik
- [x] `docs/PLAN.md` (v2) - Guncellenmis gelistirme plani
  - FAZ 0 eklendi: Acil kritik bug duzeltmeleri
  - Teknik borc tablosu guncellendi
- [x] `docs/TASK.md` (v2) - Bu dosya

---

## Tespit Edilen Kritik Buglar (ARSIV - Tamami Duzeltildi)

### BUG #1: use-credit Edge Function - Ethereum Adresi Dogrulama (DUZELTILDI)
**Dosya:** `supabase/functions/use-credit/index.ts`
**Cozum:** `isValidEthAddress` -> `isValidSolanaAddress` (regex: `/^[1-9A-HJ-NP-Za-km-z]{32,44}$/`)

### BUG #2: quitGame() 'menu' State (DUZELTILDI)
**Dosya:** `src/store.js`
**Cozum:** `quitGame()` icinde `'menu'` -> `'launcher'`

### BUG #3: RainbowKit CSS Import (DUZELTILDI)
**Dosya:** `index.html`
**Cozum:** BNB Chain doneminden kalma CSS import satiri kaldirildi.

---

## Tespit Edilen Guvenlik Riskleri

### RISK #1: RLS Politikalari Tamamen Acik
**Ciddiyet:** YUKSEK
**Tablolar:** users, transactions, scores, daily_leaderboard, daily_leaderboard_history
**Sorun:** Tum tablolarda `USING(true)` - herhangi bir kullanici her seyi okuyabilir/yazabilir
**Etki:** Sahte skor ekleme, baska kullanicilarin verilerini goruntuleme

### RISK #2: Sunucu Tarafli Skor Dogrulama Yok
**Ciddiyet:** YUKSEK
**Sorun:** Frontend skor hesaplar ve dogrudan `submit_score` RPC'ye gonderir. Hicbir dogrulama yok.
**Etki:** Kullanici tarayici konsolundan istedigi skoru gonderebilir
**Not:** GameOverUI'daki "Fair Play Protected - All scores are verified on-chain" mesaji YANILTICI

### RISK #3: Edge Function Bypass
**Ciddiyet:** ORTA
**Sorun:** RLS politikalari gevsek oldugu icin frontend, use-credit Edge Function'i yerine dogrudan DB'ye yazabilir
**Etki:** Kredi dusme guvenligi azalir, anti-cheat dogrulama yapilamaz

---

## Dokumantasyon Tamamlanma Durumu

| Dosya/Alan | Tamamlanma | Notlar |
|------------|------------|--------|
| store.js (tum state + action'lar) | %100 | Tum degiskenler, oyun dongusu, AI |
| App.jsx (tum bilesenler) | %95 | Tum 20+ bilesen dokumante edildi |
| GameOverUI.jsx | %100 | D/N mantigi, retry, anti-cheat |
| AdvancedParticles.jsx | %100 | Fizik, GPU instancing |
| PostProcessing.jsx | %100 | Bos EffectComposer render ettigi belgelendi |
| PhysicsWorld.jsx | %100 | Tum parametre |
| RealLauncherUI.jsx | %70 | 1615 satir / ~59KB, ana ozellikler belgelendi |
| verify-payment/index.ts | %100 | Tam islem akisi |
| use-credit/index.ts | %100 | Solana regex duzeltilmis hali |
| supabase-functions.sql | %100 | Tum fonksiyonlar ve trigger'lar |
| supabase-schema.sql | %95 | Tum tablolar, RLS analizi |
| Oyun mekanikleri | %100 | Carpisma, spawn, AI, skor, seviye |
| Canvas/rendering | %100 | DPR, shader warmup, optimizasyonlar |
| HUD/UI | %100 | Tum elemanlar ve responsive olcekler |
| Ses sistemi | %100 | AudioSystem class, frekanslar |

**Genel Tamamlanma: ~%97**
Eksik: RealLauncherUI'nin detayli UI bilesenleri (~59KB dosya, cok buyuk)

---

## Sonraki Adimlar (Oncelik Sirasina Gore - v6 sonrasi)

1. ~~Bug #1-3 (Faz 0)~~ TAMAMLANDI + MERGED
2. ~~Coal/Oiltown isimlendirme jenerik tokenize~~ TAMAMLANDI (v5)
3. ~~Test altyapisi kur~~ TAMAMLANDI (v6) - Vitest + 8 test mevcut
4. ~~Buffer polyfill / TOKABU balance bug~~ TAMAMLANDI (v6)
5. ~~use-credit Edge Function redeploy~~ TAMAMLANDI (v6)
6. **GUVENLIK - YUKSEK: RLS politikalarini sikistir** - wallet bazli erisim kurallari (USING(true) -> wallet match)
7. **GUVENLIK - YUKSEK: Sunucu tarafli skor dogrulama** - anti-cheat Edge Function (frontend skor gondermesi serbest, GameOverUI banner yaniltici)
8. **GUVENLIK - ORTA: Rate limiting** - submit_score, use-credit, verify-payment
9. **BUG #4 (ertelenmis): coins_collected** - submit_score imzasi + GameOverUI gecisi
10. **TUTARLILIK: Frontend %5 vs backend %10 fiyat tolerans** - tek degere hizala
11. **REFACTOR: App.jsx bolme** - 2456 satir -> mantiksal alt dosyalar
12. **KOD KALITESI: ESLint** - 11 pre-existing hata var (formatAddress unused, tokenAmount unused vs)
13. **TEST GENISLET** - store.js, GameOverUI, Edge Function entegrasyon testleri
14. **TYPESCRIPT** - opsiyonel, kademeli .jsx -> .tsx
