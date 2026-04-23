# Lumexia Racing Game - Gorev Takip

> Son guncelleme: 2026-04-23 (v5 - Tokenize rename + Helius env + migration fix + PostProcessing kaldirma)

---

## Ertelenmis / Not Dusulenler (Gelecekte Cozulmek Uzere)

### BUG #4: `coins_collected` submit_score RPC'ye gonderilmiyor (ERTELEND]I)
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

## Sonraki Adimlar (Oncelik Sirasina Gore)

1. ~~**ACIL: Bug #1 duzelt** - use-credit Ethereum -> Solana dogrulama~~ TAMAMLANDI + MERGED
2. ~~**ACIL: Bug #2 duzelt** - quitGame() 'menu' -> 'launcher'~~ TAMAMLANDI + MERGED
3. ~~**ACIL: Bug #3 duzelt** - RainbowKit CSS kaldir~~ TAMAMLANDI + MERGED
4. **Test altyapisi kur** - Vitest + store.js testleri (RISK: bug fix'ler test olmadan merge edildi)
5. **RLS politikalarini sikistir** - wallet bazli erisim kurallari
6. **Sunucu tarafli skor dogrulama** - anti-cheat Edge Function
7. **Coal -> Oiltown isimlendirme** - fonksiyon adlari guncelle
8. **App.jsx bolme** - 2464 satir -> mantiksal alt dosyalar
