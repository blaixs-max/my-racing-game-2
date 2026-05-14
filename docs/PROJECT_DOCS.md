# Lumexia Racing Game - Proje Dokumantasyonu (v8 - 2026-05-09)

## Genel Bakis

Lumexia Racing Game, Solana blockchain uzerinde TOKABU token ile calisan, 3D tarayici tabanli bir araba yarisi oyunudur. Oyuncular kripto cuzdan baglayarak kredi satin alir, trafik arasinda slalom yaparak puan toplar ve liderlik tablosunda yarisirler.

> **2026-05-09 itibariyle güncellemeler:**
> - Render hattı Faz-1/Faz-2 ile selector pattern'a alındı (Game/PlayerCar + 7 ek component); `playerPos` mutate-in-place; module-level `_laneOccupancyCache` `updateGame` allocation'ını sıfırladı.
> - Yan çevre asset-based: 3 CC0 pack (KayKit City Builder Bits + Quaternius Nature Pack + Quaternius Farm Buildings, ~28 MB) + zone-based render (urban/rural/forest, 41 distinct asset, `AssetModel` clone pattern).
> - Launcher'dan dekoratif bottom-nav bar kaldırıldı.
> - Sprint 8 (yeni token launch) açık; plan `docs/PLAN.md`'de.

**Canli URL:** Netlify uzerinden deploy ediliyor (game.lumexia.net)
**Landing site:** lumexia.net (ayrı repo: v0-lumexia-landing-page-V0). İki repo'nun Supabase noktasında nasıl buluştuğu için bkz. `docs/INTEGRATION.md`.
**Veritabani:** Supabase (PostgreSQL 17, project `cldjwajhcepyzvmwjcmz`)
**Blockchain:** Solana Mainnet-Beta
**Token Mint:** `H8xQ6poBjB9DTPMDTKWzWPrnxu4bDEhybxiouF8Ppump` (TOKABU, regular SPL Token, decimals=6)
**Odeme Alicisi:** `T6EkvAVdHPRr6Ngub1vk7VTzqtgw2KoGJwA8RCJmmGg`

**Sprint 0-4 sonrası altyapı durumu (2026-05-01):**
- Branch protection her iki repo'da aktif; PR + 1 review + CI status check zorunlu
- Üç GitHub Actions workflow: `ci.yml` (test/build/lint), `deploy-edge-functions.yml`, `deploy-migrations.yml`
- 5 Edge Function: verify-payment, use-credit, calculate-daily-rewards, submit-score (anti-cheat, Sprint 2.2a), **reconcile-payments (self-healing, Sprint 4.5)**
- 10 Postgres tablo + 2 view (`alltime_leaderboard`, `daily_team_scores`)
- RLS lockdown tamamlandı: scores ve users INSERT service-role-only; SECURITY DEFINER fonksiyonlardan EXECUTE PUBLIC revoke
- Migration discipline: 14-haneli timestamp + CI auto-apply
- Frontend Vitest suite: 19 test (Sprint 4.2 sonrası)
- Landing repo'da Supabase client `Database` tipiyle type-safe (Sprint 3a auto-generated `lib/database.types.ts`)

---

## Teknoloji Yigini

### Frontend
| Teknoloji | Versiyon | Amac |
|-----------|----------|------|
| React | 19.2.0 | UI framework |
| Vite | 7.2.4 | Build araci (ESM, HMR) |
| Three.js | 0.181.2 | 3D rendering |
| @react-three/fiber | 9.4.0 | React Three.js renderer |
| @react-three/drei | 10.7.7 | 3D yardimci bilesenler (Stars, useGLTF, useProgress, useTexture, PerspectiveCamera) |
| @react-three/rapier | 2.2.0 | Fizik motoru wrapper |
| Rapier3D | 0.19.3 | WebAssembly fizik motoru |
| Zustand | 5.0.8 | State management |
| Tailwind CSS | 3.4.0 | CSS framework |
| React Query | 5.90.11 | Sunucu state yonetimi |

### Blockchain (Solana)
| Teknoloji | Amac |
|-----------|------|
| @solana/web3.js 1.98.4 | Solana blockchain etkilesimi |
| @solana/wallet-adapter-react 0.15.39 | Cuzdan baglanti saglayicisi |
| @solana/wallet-adapter-react-ui 0.9.39 | Cuzdan UI bilesenleri |
| @solana/wallet-adapter-wallets 0.19.37 | Coklu cuzdan destegi |
| @solana/spl-token 0.4.14 | SPL token transferleri |
| Desteklenen Cuzdanlar | Phantom, Solflare, Coinbase, Trust |

### Backend
| Teknoloji | Amac |
|-----------|------|
| Supabase | PostgreSQL veritabani + Edge Functions (Deno/TypeScript) |
| Netlify | Hosting ve CI/CD |

---

## Dizin Yapisi

```
my-racing-game-2/
├── src/
│   ├── App.jsx              # Ana oyun bileseni (~2464 satir)
│   ├── App.css              # Oyun stilleri (minimal, #root container)
│   ├── main.jsx             # Giris noktasi (Solana wallet provider)
│   ├── index.css            # Global stiller (Inter font, Tailwind directives)
│   ├── store.js             # Zustand state yonetimi (~796 satir)
│   ├── solana.config.js     # Solana yapilandirmasi (token, RPC, odeme)
│   ├── assets/
│   │   ├── coin_logo.png    # HUD coin ikonu (HUD'da ve SpinningCoin'de kullanilir)
│   │   └── react.svg
│   ├── components/
│   │   ├── RealLauncherUI.jsx      # Oyun baslangic ekrani & cuzdan arayuzu (~59KB, 1615 satir)
│   │   ├── GameOverUI.jsx          # Oyun bitis ekrani (419 satir)
│   │   ├── AdvancedParticles.jsx   # Nitro boost parcacik sistemi
│   │   └── PhysicsWorld.jsx        # Rapier3D fizik wrapper
│   └── utils/
│       ├── supabaseClient.js       # Veritabani islemleri (getOrCreateUser, getUserCredits, useCredit)
│       ├── solanaWallet.js         # Token transfer & bakiye kontrol (getTokenBalance, transferToken - jenerik isimler)
│       └── jupiterPrice.js         # Token fiyat zinciri (frontend: DexScreener → Jupiter v2 → get-token-price Edge Function proxy → stale cache)
├── public/
│   ├── Lumexia.jpg                 # Loading screen banner
│   ├── Lumexia.png                 # Branding asset
│   └── models/
│       ├── sport_car.glb           # Oyuncu araci (F1, scale: 0.16)
│       ├── ferrari.glb             # Dusman: sport araba (scale: 1.21)
│       ├── truck.glb               # Dusman: kamyon (scale: 1.678)
│       ├── suv.glb                 # (preload edilmis ama kullanilmiyor)
│       ├── Car1/scene.gltf         # (preload edilmis ama kullanilmiyor)
│       ├── Car 2/scene.gltf        # Dusman: SUV (scale: 1.53)
│       ├── Car 3/scene.gltf        # Dusman: sedan (scale: 1.35)
│       ├── coin.glb                # (kullanilmiyor)
│       ├── tree.glb                # Eski cevre agaci (kullanilmiyor; SideObjects artik Quaternius Trees pack)
│       ├── Kaykit-city/KayKit_City_Builder_Bits_1.0_FREE/Assets/gltf/  # CC0 KayKit
│       │   ├── building_A..H.gltf  # 8 sehir binasi
│       │   ├── watertower.gltf     # Su kulesi
│       │   ├── streetlight, dumpster, firehydrant, bench, trash_A/B, box_A/B, bush.gltf  # City props
│       │   └── (traffic_light, road_*, car_*: dosyada var, kullanilmiyor)
│       ├── Nature-pack/            # CC0 Quaternius Stylized Nature
│       │   ├── Pine_Trees, Birch_Trees, Maple_Trees, Trees, Palm_Trees, Dead_Trees.glb
│       │   └── Bushes, Flower_Bushes, Flowers, Grass, Rocks.glb
│       └── Farm-buildings/         # CC0 Quaternius Farm Buildings
│           ├── Barn, Big_Barn, Small_Barn, Open_Barn.glb
│           ├── Silo, Silo_House, ChickenCoop, Tower_Windmill.glb
│           └── Fence.glb (+ varyant)
├── supabase/
│   ├── functions/
│   │   ├── verify-payment/index.ts # Odeme dogrulama Edge Function (TypeScript/Deno)
│   │   └── use-credit/index.ts     # Kredi dusme Edge Function (Solana adres dogrulama DUZELTILDI)
│   ├── migrations/
│   │   └── 20241216_add_token_fields.sql # (eski BNB/LMX donemi - hala LMX/BNB default, guncellenmesi gerekli)
│   └── rls-security-update.sql
├── supabase-schema.sql             # Veritabani semasi (6 tablo + 1 view)
├── supabase-functions.sql          # Stored procedure'ler (submit_score, triggers, cron)
├── vite.config.js                  # Build yapilandirmasi (code splitting, terser)
├── netlify.toml                    # Deploy yapilandirmasi
├── tailwind.config.js              # Tailwind CSS yapilandirmasi (Inter font)
├── index.html                      # HTML giris (FontAwesome CDN, RainbowKit CSS artigi)
└── .env.example                    # Ortam degiskenleri sablonu
```

---

## Oyun Mimarisi

### Oyun Durumlari (Game States)
```
loading -> launcher -> countdown (5sn) -> playing -> gameover
                                                      |
                                                      v
                                                   launcher
```

| Durum | Aciklama |
|-------|----------|
| `loading` | Ilk yukleme, 3D modeller preload, Lumexia.jpg banner gosterilir |
| `launcher` | Ana menu: mod secimi, kredi satin alma, cuzdan baglama (RealLauncherUI) |
| `countdown` | Geri sayim + shader warmup (modeller gorünmez sahneye render edilir) |
| `playing` | Aktif oyun - frame dongusu, Canvas aktif |
| `gameover` | Carpma/bitis ekrani, skor Supabase'e kaydedilir (3 retry ile) |

### Giris Noktasi Akisi
1. `index.html` → FontAwesome CDN yukler
2. `main.jsx` → SolanaWalletProvider (Phantom, Solflare, Coinbase, Trust) → `<App />`
3. `App.jsx` → ErrorBoundary icinde gameState'e gore render:
   - `loading` → LoadingScreen (progress bar, Lumexia.jpg)
   - `launcher` → RealLauncherUI
   - `countdown/playing` → Game (Canvas + HUD)
   - `gameover` → GameOverUI
4. Viewport meta tag'leri dinamik olarak ayarlanir (zoom engelleme, safe-area-inset)

---

## State Yonetimi (store.js - 797 satir)

### Tum State Degiskenleri
```javascript
gameState: 'loading',     // Oyun durumu
countdown: 3,             // Geri sayim
speed: 0,                 // Mevcut hiz (km/h)
targetSpeed: 60,          // Hedef hiz
currentX: 0,              // Oyuncu X pozisyonu
targetX: 0,               // Hedef X pozisyonu
score: 0,                 // Toplam skor
combo: 1,                 // Near miss combo carpani (max 10)
gameOver: false,           // Oyun bitti mi
enemies: [],               // Dusman arac dizisi
coins: [],                 // Coin dizisi
particles: [],             // Parcacik dizisi
message: "",               // Ekran mesaji
cameraShake: 0,            // Kamera sarsinti
totalDistance: 0,           // Toplam mesafe
nearMissCount: 0,          // Near miss sayisi
startTime: 0,              // Oyun baslangic zamani (Date.now())
currentLevel: 1,           // Mevcut seviye
lastLevelUpDistance: 0,     // Son level-up mesafesi

// Nitro Sistemi
nitro: 100,                // Mevcut nitro (0-100)
maxNitro: 100,             // Maksimum nitro
isNitroActive: false,      // Nitro aktif mi
nitroRegenRate: 5,         // Saniyede nitro yenileme orani

selectedCar: 'default',    // Secili arac
walletAddress: null,        // Bagli cuzdan adresi
credits: 0,                 // Mevcut kredi sayisi

// Oyun Modu
gameMode: 'classic',       // 'classic' | 'doubleOrNothing'
reachedLevel5: false,      // Level 5'e ulasildi mi (D/N icin)

updateCounter: 0,           // Frame sayaci
lastSpawnZ: -400,           // Son spawn Z pozisyonu
countdownTimer: null         // Countdown interval referansi
```

### Tum Action'lar (Fonksiyonlar)

| Action | Aciklama |
|--------|----------|
| `setGameState(state)` | Oyun durumunu degistir |
| `setWalletData(address, credits)` | Cuzdan bilgisini ayarla |
| `setGameMode(mode)` | Oyun modunu ayarla (reachedLevel5 sifirlanir) |
| `updateEnemyPassed(enemyId)` | Dusman gecis bayragi guncelle (near miss icin) |
| `startGame()` | Oyunu baslat: kredi kontrol, countdown baslat, kredi dus, playing state |
| `quitGame()` | Oyundan cik: timer temizle, 'launcher' state'e don |
| `cleanupTimer()` | Countdown timer'i temizle (component unmount icin) |
| `steer(direction)` | Yonlendirme: step=1.25, sinirlar: [-5.0, +5.0] |
| `activateNitro()` | Nitro etkinlestir (nitro > 0 gerekli) |
| `deactivateNitro()` | Nitro devre disi birak |
| `collectCoin(id)` | Coin topla: +100 puan, ses cal, mesaj goster |
| `triggerNearMiss(position)` | Near miss: combo++, +500*combo puan, 5 kivilcim parcacik |
| `addExplosion(x, y, z)` | Patlama efekti: 20 parcacik |
| `updateGame(delta)` | **ANA OYUN DONGUSU** (asagida detayli) |
| `setGameOver()` | Oyun bitis: crash sesi, patlama efekti, kamera sarsinti (3.0) |

### Oyun Dongusu Detayi (updateGame)

Her frame'de cagrilir (RoadEnvironment useFrame icinden):

1. **Delta Clamp**: `Math.min(delta, 0.1)` - 100ms'den buyuk spike'lari engeller
2. **Nitro Sistemi**:
   - Aktifken: saniyede 25 nitro tuketim, hedef hiz 200 km/h
   - Pasifken: saniyede 5 nitro yenileme, hedef hiz 110 km/h
3. **Hiz Hesaplama**: `lerp(speed, targetSpeed, delta * 2)` - yumusak hizlanma
4. **Skor**: `speed * delta * 0.2` (surekli eklenir)
5. **Mesafe**: `speed * delta * 0.1`
6. **Seviye Sistemi**: `floor(distance / 1000) + 1` - her 1000m'de level up
   - Level 5'te Double or Nothing bonusu acilir
7. **Parcacik Guncelleme**: Yercekimi (`-9.8 * delta`), yasam suresi (`life - delta * 3`)
8. **Dusman AI** (asagida detayli)
9. **Coin Spawn**: %9 olasilik/frame, max 15 coin, guvenli alan kontrolu
10. **Dusman Spawn**: Her 30 birim mesafede, en az 1 serit acik birakma garantisi

### Dusman AI (Lane Change Logic)

Dusmanlar bagimsiz AI ile serit degistirir:

```
Serit Degistirme Baslatma:
- Oyuncunun 35m+ arkasindaysa baslayabilir
- Her frame %0.3 olasilikla baslar
- Hedef serit bos olmali (25m tampon)
- Oyuncunun seridini engellemeyecek sekilde (50m mesafe)

Serit Degistirme Sureci:
- Progress: 0 -> 1 (delta * 2 hizinda, ~0.5 saniye)
- Hedef engelliyse ve progress < 0.5 ise: iptal
- Hedef engelliyse ve progress >= 0.5 ise: bekle
- Progress 1'e ulasinca: tamamla, yeni seride gec

NPC Onde Algilama:
- 15m mesafede NPC var mi kontrol
- 8-15m: serit degistirmeye calis
- <8m: %50 yavasla (ownSpeed * 0.5)
```

### Arac Hizlari (Seviye carpanli)
```
Seviye Carpani: 1 + ((level - 1) * 0.1) = her levelde +%10

truck:  40-50 km/h * carpan
sedan:  50-65 km/h * carpan
suv:    50-65 km/h * carpan
sport:  65-75 km/h * carpan
```

### Spawn Algoritmasi (Dusman)
```
1. Her 30 birim mesafede spawn denenecek
2. Mevcut engellenmiş seritler sayilir (35-150m arasinda)
3. Sadece max 1 serit engelliyse spawn izni (2 serit acik kalmali)
4. Oncelik: zaten engelli olan seritlerde spawn (yigilma onleme)
5. Bos alan yoksa veya 2+ serit engelliyse: spawn yok
6. Arac tipi rastgele: truck, sedan, suv, sport
7. Spawn noktasi: z = -400
```

---

## Bilesen Detaylari

### App.jsx Bilesenleri (2464 satir)

| Bilesen | Satir | Aciklama |
|---------|-------|----------|
| `useResponsive()` | 23-75 | Hook: mobil/desktop algilama (touch + ekran boyutu, 100ms debounce) |
| `ErrorBoundary` | 78-131 | React hata siniri, yeniden baslatma butonu |
| `ParticleSystem` | 134-237 | GPU InstancedMesh: 50 kivilcim + 50 patlama parcacigi |
| `Coins` | 239-260 | Coin listesi render (gecersiz coinleri filtreler) |
| `SpinningCoin` | 263-286 | Donen coin: cylinder geometri + coin_logo.png texture |
| `MobileControls` | 293-492 | Dokunmatik kontroller: sol/sag alan + nitro butonu + yon gostergeleri |
| `Speedometer` | 497-529 | SVG benzeri hiz gostergesi (max 200 km/h, renk kodlu) |
| `CarModel` | 548-568 | GLTF/GLB model yukleyici (clone, golge, renk tinting) |
| `TreeModel` | 570-586 | Agac modeli yukleyici |
| `PlayerCar` | 590-775 | Oyuncu araci: hareket, carpisma, near miss, coin toplama, far isiklari |
| `SingleCoin` | 778-816 | Altin coin: MeshPhysicalMaterial, metalik, parlak |
| `Traffic` | 822-906 | Trafik sistemi: dusman render, serit degisimi tilt |
| `Building` | (eski) | 6-tipli prosedürel bina (apartment/villa/modern/shop/townhouse/small) — **dead code, tree-shake'le drop** |
| `AssetModel` | yeni | `useGLTF(path)` + `scene.clone()` — aynı asset'i birden fazla pozisyonda reuse eder |
| `SideObjects` | yeni | Yol kenari asset render — zone bazli (urban/rural/forest), 30 instance/side, 4-6 ardisik aynı zone'da, sonra geçiş. URBAN_BUILDINGS (KayKit 9), RURAL_BUILDINGS (Farm 8), TREE_ASSETS (Quaternius 6), SMALL_NATURE (5), CITY_PROPS (KayKit 9), FARM_PROPS (2). 41 distinct asset preloaded. Per-instance scale jitter 0.85-1.15 + Y rotasyon. |
| `Barrier` | 1214-1240 | Yol bariyeri: 40 direk + uzun ray |
| `StreetLights` | 1243-1353 | Sokak lambalari: 14 adet (7 cift), hareket eden, point light |
| `RoadEnvironment` | 1356-1453 | Yol: GPU instanced serit cizgileri (60), zemin, bariyer, lambalar |
| `CameraShake` | 1456-1503 | Kamera: %70 takip, gameover'da sarsinti |
| `SkyEnvironment` | 1506-1529 | Gokyuzu: 5000 yildiz, ay (10m yaricap), ambient isik |
| `SpeedLines` | 1532-1581 | Hiz cizgileri: 50 cizgi, 160+ km/h'de gorunur |
| `SpeedBlurOverlay` | 1584-1614 | Hiz bulanikligi: CSS gradient, 160-200 km/h araliginda |
| `ShaderWarmup` | 1620-1660 | Shader on-derleme: countdown'da tum modelleri gorünmez render eder |
| `AudioListenerController` | 1663-1671 | Three.js AudioListener kameraya ekler |
| `GameContent` | 1674-1710 | Canvas icerigi: kamera, isiklar, tum 3D bilesenler |
| `Game` | 1713-2169 | Ana oyun bileseni: HUD, Canvas, kontroller, ag izleme |
| `LoadingScreen` | 2173-2357 | Yukleme ekrani: progress bar, banner, model preload |
| `App` | 2360-2464 | Root bilesen: viewport ayari, state yonlendirme |

### Canvas Ayarlari
```javascript
shadows: PCFSoftShadowMap (512x512)
dpr: Platform'a gore:
  - Android: [1, 1]      // Dusuk - performans icin
  - iOS: [1, 1.5]        // Orta
  - Desktop: [1, 1.25-1.5] // Ekran boyutuna gore
gl: {
  antialias: false,           // Performans icin kapatildi
  powerPreference: "high-performance",
  alpha: false,               // Seffaflik yok
  stencil: false,             // Stencil buffer yok
  depth: true,
  logarithmicDepthBuffer: false
}
outputColorSpace: SRGBColorSpace
toneMapping: ACESFilmicToneMapping
toneMappingExposure: 1.0
```

### Kamera Ayarlari
```
Pozisyon: [0, 4, 11] (z=8'den 11'e tasinmis - tam araba gorunumu)
FOV: 50
Takip: targetX * 0.7 (%70 takip faktoru)
Lerp hizi: delta * 3
Sarsinti: gameover'da cameraShake * 0.5 rastgele offset
```

### HUD Elemanlari
| Eleman | Pozisyon | Responsive Olcek |
|--------|----------|-------------------|
| Speedometer | Sol ust | Landscape: 0.28, Mobile: 0.35, Desktop: 1.0 |
| Score | Sag ust | Cyan, skewX(-15deg) |
| Nitro Bar | Ust orta | Fire gradient, fireGlow animasyonu |
| Distance | Sag ust (2. sira) | Cyan border |
| Near Miss | Sag ust (3. sira) | Magenta border |
| Level | Sag ust (4. sira) | Gold border |
| Message | Ekran ortasi (%30) | Gold=level, Cyan=coin, Red=diger |
| Internet | Ust orta | Kirmizi banner (sadece offline) |

### Hiz Efektleri
- **Speed Lines**: 160+ km/h → 50 beyaz cizgi, kameraya dogru hareket
- **Speed Blur Overlay**: 160-200 km/h → radial gradient + ruzgar cizgileri, max %50 opacity

---

## Bilesen Detaylari (Diger Dosyalar)

### GameOverUI.jsx (~420 satir)

**Oyun Sonu Skor Hesaplama:**
```javascript
Classic mod: Math.floor(score)     // Normal skor
D/N mod + Level 5: score * 2       // 2X bonus
D/N mod + Level 5 yok: 0           // Sifir skor
```

**Ozellikler:**
- Skor renk kodlama: Gold (classic), Yesil (D/N basari), Kirmizi (D/N basarisiz)
- Otomatik skor kaydetme: `supabase.rpc('submit_score', { p_wallet, p_score, p_duration, p_distance })`
  - **NOT:** `coins_collected` parametresi gonderilmiyor (scores tablosunda sutun var)
- Retry mekanizmasi: 3 deneme, linear backoff `2000ms * (retryCount + 1)` (2s, 4s, 6s)
- Network kontrolu: `navigator.onLine` ile offline algilama
- Anti-cheat banner: "Fair Play Protected - All scores are verified on-chain"
  - **NOT:** Yaniltici iddia - sunucu tarafli dogrulama yok, skor frontend'ten dogrudan RPC'ye gonderiliyor
- Butonlar: Race Again (kredi varsa), Check Scores (lumexia.net), Main Menu
- Kalan kredi gosterimi

### AdvancedParticles.jsx

**NitroBoostParticles:**
- 50 parcacik havuzu (mount'ta olusturulur)
- Spawn: arabanin arkasinda (position[2] + 2)
- Fizik: yercekimi (y -= 5 * delta), surtuname (velocity *= 0.95)
- Renk: turuncu araliginda (life'a gore)
- Boyut: buyuyen sonra kuculen (life faktorune gore)
- GPU: InstancedMesh, tek draw call, cached dummy Object3D ve Color

### PostProcessing (KALDIRILDI - v5)
Tum post-processing efektleri kaldirildi. Component silindi, `@react-three/postprocessing` dependency'si cikarildi. Yeniden eklenmek istenirse ilgili sahne kodu App.jsx icine baska bir noktada yazilabilir.

### PhysicsWorld.jsx
```javascript
gravity: [0, -9.81, 0]
numSolverIterations: 4
timeStep: "vary"           // Adaptif zaman adimi
colliders: "hull"          // Konveks govde collider
updatePriority: -50        // Dusuk oncelik (render'dan once)
```

---

## Edge Functions (Supabase)

### verify-payment/index.ts

**Islem Akisi:**
1. CORS preflight kontrolu (lumexia.net, game.lumexia.net, localhost:5173)
2. Girdi dogrulama:
   - Solana adresi: base58, 32-44 karakter (DOGRU regex)
   - Transaction signature: base58, 80-90 karakter
   - Paket miktari: sadece 1, 5, 10
3. Tekrar islem kontrolu (transaction_hash unique)
4. Token fiyati alma (backend oncelik sirasi, Sprint 9 sonrası):
   - **DexScreener** (graduated tokenlar, deepest liquidity signal)
   - **Jupiter v2** (`lite-api.jup.ag/price/v2`, `usdPrice`/legacy `price` her ikisini parse eder)
   - **pump.fun frontend-api** (`frontend-api.pump.fun/coins/<mint>`, `usd_market_cap / 1e9`, pre-graduation mintler için)
   - Frontend için 4. tier: **`get-token-price` Edge Function proxy** (mobil carrier DNS bloku ya da sandboxed ortamlar için)
   - `get-token-price` Edge Function ek 4. source olarak **on-chain bonding curve** okuması yapar (Solana RPC `getAccountInfo` + 49-byte Anchor decode, `priceSol = vSol/vTok × 10⁻³`, SOL/USD Jupiter→Coingecko fallback)
   - `PRICE_TOLERANCE = 0.10` (%10 fiyat toleransi - kripto volatilite icin)
   - **NOT:** Frontend `solana.config.js` ise `priceTolerance: 0.05` (%5) kullanir - tolerans frontend/backend arasinda tutarsiz
5. Blockchain dogrulama:
   - Multi-RPC: Helius (ana) + Solana mainnet (yedek)
   - `verifySolanaTransaction` icinde `maxRetries = 5` (her endpoint icin), 1000ms * attempt bekleme
   - Method 1: SPL token transfer instruction parse
   - Method 2: Pre/post token bakiye analizi
6. Transfer dogrulama:
   - Gonderici == kullanici adresi
   - Alici == PAYMENT_RECEIVER
   - Token == PAYMENT_TOKEN_MINT (TOKABU varsayilan, env ile degistirilebilir)
   - Miktar >= minExpectedAmount
7. Veritabani islemleri:
   - Kullanici getir/olustur
   - Transaction kaydi ekle (idempotency icin, `token_symbol: 'COAL'` - eski isim)
   - Kullanici kredisini guncelle
   - Basarisizsa rollback

### use-credit/index.ts

**Adres Dogrulama (DUZELTILDI):**
```typescript
const isValidSolanaAddress = (address: string): boolean => {
  return /^[1-9A-HJ-NP-Za-km-z]{32,44}$/.test(address);
};
```
Onceki Ethereum-format regex'i (`/^0x[a-fA-F0-9]{40}$/`) Solana base58 regex'i ile degistirildi.

**Islem Akisi:**
1. CORS kontrolu
2. Wallet adresi dogrulama (Solana base58)
3. Miktar dogrulama (1-10 arasi tam sayi)
4. Kullanici ara
5. Yeterli kredi kontrolu
6. Kredi dus, oyun sayaci artir, last_played guncelle
7. Sonuc don: remainingCredits, totalGamesPlayed

**Not:** Frontend'in `supabaseClient.js`'deki `useCredit()` fonksiyonu dogrudan DB'ye
yazabilir; RLS gevsek oldugundan Edge Function bypass edilebilir (bkz. Guvenlik Riskleri).

### submit-score/index.ts (Sprint 2.2a — 2026-05-01)

**Trigger:** Frontend HTTP POST (Sprint 2.2b sonrası `GameOverUI.jsx` doğrudan RPC yerine bunu çağırır)

**Akış:**
1. CORS preflight kontrolü
2. Wallet base58 doğrulama (eksikse 400)
3. Rate limit (`check_rate_limit('submit_score', 6/dk)`); aşılmışsa 429
4. Anti-cheat doğrulama (kurallar `submit-score/index.ts` `validate()` fonksiyonunda):
   - `duration >= 10` saniye
   - `distance <= 60 * duration` (200 km/h üst sınır)
   - `coins <= floor(distance / 50)`
   - `score <= distance * 200`
   - `clientStartTime` drift `<= 5sn`
5. Anomali varsa → `suspicious_scores` INSERT → 422 (`reasons` array ile)
6. Geçerse → `submit_score` RPC service role ile → 200

**Yazdığı tablolar:** `suspicious_scores` (anomali) veya `scores` + `daily_leaderboard` (geçerli, RPC trigger ile)

### reconcile-payments/index.ts (Sprint 4.5 — 2026-05-01)

**Amaç:** Self-healing payment reconciliation. `verify-payment` herhangi bir sebeple başarısız olursa kullanıcının TOKABU'su çöpe gitmesin — receiver cüzdanın on-chain TX history'sini periyodik scan eder, orphan transferleri tespit edip otomatik credit ekler.

**Trigger:**
- pg_cron her 15 dakikada bir (Dashboard SQL Editor'dan enable; cron SQL'i PR description'da)
- Manuel admin curl (auth: `Authorization: Bearer ${SUPABASE_SERVICE_ROLE_KEY}`)
- Body: `{ "dryRun": true|false, "source": "cron"|"manual" }`

**Akış:**
1. Auth: `Bearer SERVICE_ROLE_KEY` mismatch → 401
2. Helius RPC: `getSignaturesForAddress(PAYMENT_RECEIVER, limit=100)`
3. `SCAN_WINDOW_DAYS=30` cutoff — daha eski TX'ler skip
4. Her signature için:
   - `transactions.transaction_hash` UNIQUE check → varsa skip (`alreadyCredited`)
   - `unverified_payments.transaction_hash` check → varsa skip
   - `getTransaction` ile full TX → `meta.err` varsa skip
   - `findTokabuTransferToReceiver(tx)` → preTokenBalances/postTokenBalances delta analizi
   - `findSenderForMint(tx)` → bakiye azalan owner veya ilk signer fallback
   - Jupiter/DexScreener'dan TOKABU price (cached for entire scan)
   - `matchPackage(usdValue)` → 1/5/10 USD ± 7% tolerance, eşleşmezse `unverified_payments` insert (`amount_mismatch_$X.XX`)
   - User auto-create eksikse (verify-payment paterni)
   - DRY_RUN ise log + return; aksi halde `transactions` INSERT + `users` UPDATE (UNIQUE constraint idempotency)

**Edge case'ler `unverified_payments` tablosuna yazılır:**
- `no_sender_found` — TX'te sender tespit edilemedi
- `price_unavailable` — Jupiter + DexScreener ikisi de fail
- `amount_mismatch_$X.XX` — TX miktarı 1/5/10 paketlerinden hiçbirine 7% içinde eşleşmiyor

**Tunables (kod sabiti):**
- `SIGNATURE_LIMIT=100` — RPC fetch başına signature sayısı
- `SCAN_WINDOW_DAYS=30` — cutoff
- `PRICE_TOLERANCE=0.07` — verify-payment ile senkron
- `PACKAGE_USD=[1,5,10]` — paket eşleşme set'i

**Yazdığı tablolar:** `transactions` (başarılı reconcile), `users` (credit update veya auto-create), `unverified_payments` (admin review için).

**İdempotency:** `transactions.transaction_hash UNIQUE` constraint sayesinde aynı TX iki kez credit edilmez. Race durumunda ikinci INSERT 23505 döner, kod `alreadyCredited` sayar.

**Auth:** `verify_jwt: true` (default) — frontend Supabase client'ın anon key'i ile çağırır.

### calculate-daily-rewards/index.ts (Sprint 6 PR 6.1 — 48h cycle, 2026-05-01)

**Trigger:** pg_cron job, her gece 00:00 UTC. Cycle-end day değilse self-skip.

**Cycle anchor:** `2026-05-01`. Tüm cycle'lar buradan even-day farkıyla başlar. Anchor + Migration `20260501160000_cycle_48h.sql` içindeki trigger ile birebir aynı.

**Akış:**
1. **Cycle-end check:** `daysSinceAnchor = floor((now - anchor) / 86400000)`. `daysSinceAnchor > 0 && daysSinceAnchor % 2 === 0` ise cycle-end. Değilse 200 + skip mesajı.
2. **Previous cycle window:** `prevCycleStart = cycleStart - 2 gün`. Bütün filtreler bu pencerede.
3. `scores` tablosundan total games (cycle window): `gte(prevCycleStart) lt(cycleStart)`
4. USD havuzu: `totalPoolUSD = totalGames * GAME_TO_USD = totalGames * 1.0`
5. Treasury kesintisi: `netPoolUSD = totalPoolUSD * 0.925`
6. **Leaderboard read with fallback:** Önce `daily_leaderboard` `play_date = prevCycleStartIso` filtre. Boş dönerse (archive cron daha önce sweep ettiyse) `daily_leaderboard_history` aynı filtreyle. Race condition fix.
7. Her oyuncunun cycle window'unda kaç oyun oynadığını al (boost için)
8. Boost: `2+ oyun = +games%` (örn. 5 oyun = 5% boost)
9. Boosted score'a göre yeniden sırala, top 100 al
10. Hisse puanları: 1.=125, 2.=100, 3.=75, 4.=50, 5.=25, 6-50=8, 51-100=4
11. `unitValue = netPoolUSD / totalShares`
12. Her oyuncu: `rewardAmount = sharePoints * unitValue`, `reward_date = prevCycleStartIso`
13. Idempotency: `reward_pool_distribution.delete().eq('reward_date', prevCycleStartIso)` → `insert(rewardRecords)`

**Auth:** `verify_jwt: false` (CI workflow `--no-verify-jwt` flag ile deploy ediliyor) — pg_cron `pg_net.http_post()` ile JWT'siz çağırır.

**Yazdığı tablo:** `reward_pool_distribution` (idempotent — cycle'ın eski kayıtları silinip yeniden yazılır)

---

## Veritabani Semasi ve Fonksiyonlari

### Tablolar

#### users
| Sutun | Tip | Aciklama |
|-------|-----|----------|
| id | UUID (PK) | Otomatik |
| wallet_address | TEXT (UNIQUE) | Solana cuzdan adresi |
| credits | INTEGER | Mevcut kredi (>= 0 CHECK) |
| total_games_played | INTEGER | Toplam oyun sayisi |
| total_spent | DECIMAL(10,2) | Toplam harcama (USD) |
| last_played | TIMESTAMPTZ | Son oyun zamani |
| created_at | TIMESTAMPTZ | Olusturma zamani |
| updated_at | TIMESTAMPTZ | Guncelleme zamani (trigger ile otomatik) |
| selected_team | VARCHAR | Günlük takım seçimi (Sprint 0.5 keşfi — kod tabanında henüz UI yok) |
| team_selection_date | DATE | Takım seçildigi gün |
| best_score | INTEGER | Kişisel en yüksek skor (Sprint 0.5 keşfi) |
| total_games | INTEGER | Toplam oyun (total_games_played ile redundant gibi — Sprint 4'te netleşecek) |

#### transactions
| Sutun | Tip | Aciklama |
|-------|-----|----------|
| id | UUID (PK) | Otomatik |
| user_id | UUID (FK -> users) | Kullanici referansi |
| amount | DECIMAL(10,2) | Odeme miktari (USD) |
| credits_added | INTEGER | Eklenen kredi |
| transaction_hash | TEXT (UNIQUE) | Blockchain tx hash |
| status | TEXT | 'success', 'pending', 'failed' |
| created_at | TIMESTAMPTZ | Islem zamani |

#### scores
| Sutun | Tip | Aciklama |
|-------|-----|----------|
| id | UUID (PK) | Otomatik |
| user_id | UUID (FK -> users) | Kullanici referansi |
| wallet_address | TEXT | Cuzdan adresi (denormalize) |
| score | INTEGER | Oyun skoru (>= 0) |
| distance | INTEGER | Toplam mesafe (>= 0) |
| coins_collected | INTEGER | Toplanan coin sayisi |
| play_duration | INTEGER | Oyun suresi (saniye) |
| game_mode | TEXT | 'normal' (gelecek: 'hard', 'expert') |
| created_at | TIMESTAMPTZ | Kayit zamani |
| team | VARCHAR | Hangi takım için skor (Sprint 0.5 keşfi) |
| duration | INTEGER | Oyun suresi - duplicate of `play_duration` (Sprint 4'te netleşecek) |

#### reward_pool_distribution (Sprint 0.5 keşfi)
Daily reward dağıtım kayıtları. `calculate-daily-rewards` Edge Function tarafından her gece UTC midnight'ta yazılır.

| Sutun | Tip | Aciklama |
|-------|-----|----------|
| id | UUID (PK) | Otomatik |
| wallet_id | TEXT | Oyuncunun cuzdan adresi |
| score | INTEGER | Boosted score (en yüksek günlük skor + günlük oynama bonusu) |
| reward_amount | NUMERIC | USD cinsinden ödül miktarı (Sprint 1.7b sonrası — eski kayıtlar BNB) |
| reward_date | DATE | Ödülün hesaplandığı gün |
| created_at | TIMESTAMPTZ | Kayıt zamanı |

#### rate_limits (Sprint 0.5 keşfi)
Token bucket rate limiting kayıtları. `check_rate_limit()` SECURITY DEFINER fonksiyonu tarafından yönetilir.

| Sutun | Tip | Aciklama |
|-------|-----|----------|
| key | TEXT (PK) | Genelde wallet adresi |
| action | TEXT (PK) | 'use_credit', 'verify_payment' gibi |
| request_count | INTEGER | Pencere içindeki istek sayısı |
| window_start | TIMESTAMPTZ | Pencerenin başlangıcı |

**RLS:** Aktif ama policy yok → service role only. **Açık risk:** anon role tabloyu SELECT'leyebiliyor (bkz. advisor `rls_enabled_no_policy`). Sprint 2'de düzeltilecek.

#### leaderboard_history (kullanılmıyor)
0 satır var. `daily_leaderboard_history` ile karışmasın. Sprint 0.5'te keşfedildi, Sprint 4 dokümantasyon temizliğinde değerlendirilecek.

#### suspicious_scores (Sprint 2.2a — 2026-05-01)
Anti-cheat tarafından reddedilen skor gönderimleri için forensic log. `submit-score` Edge Function tarafından yazılır.

| Sutun | Tip | Aciklama |
|-------|-----|----------|
| id | UUID (PK) | Otomatik |
| wallet_address | TEXT | Cuzdan adresi (anon değil) |
| score | INTEGER | Reddedilen skor değeri |
| distance | INTEGER | Reddedilen mesafe |
| duration | INTEGER | Reddedilen süre (saniye) |
| coins_collected | INTEGER | Reddedilen coin sayısı |
| near_miss_count | INTEGER (nullable) | İstemcinin gönderdiği near miss |
| game_mode | TEXT (nullable) | classic / doubleOrNothing |
| reasons | TEXT[] | Sıralı: 'speed_violation', 'coin_density', 'score_anomaly', 'duration_too_short', 'time_mismatch', 'invalid_score', 'invalid_distance', 'invalid_coins' |
| payload | JSONB | Ham istek body (forensic) |
| created_at | TIMESTAMPTZ | Otomatik |

**RLS:** Aktif, policy YOK → sadece service_role yazabilir/okuyabilir. Dashboard üzerinden admin görüntülenebilir.

#### unverified_payments (Sprint 4.5 — 2026-05-01)
`reconcile-payments` Edge Function'ın auto-credit edemediği TX'ler için admin review log'u. Receiver cüzdana TOKABU gelmiş ama paket eşleşmesi/sender tespit/fiyat sorunu nedeniyle credit verilemediyse buraya yazılır.

| Sutun | Tip | Aciklama |
|-------|-----|----------|
| id | UUID (PK) | Otomatik |
| transaction_hash | TEXT UNIQUE | Solana TX signature (idempotent) |
| sender_wallet | TEXT | Gönderen cüzdan (boş olabilir, `no_sender_found` durumunda) |
| receiver_wallet | TEXT | Alıcı (genelde PAYMENT_RECEIVER) |
| token_mint | TEXT | TOKABU mint |
| token_amount | NUMERIC | Transfer edilen TOKABU miktarı |
| block_time | TIMESTAMPTZ | TX block zamanı |
| reason | TEXT | `unknown_user` / `amount_mismatch_$X.XX` / `price_unavailable` / `no_sender_found` |
| resolved | BOOLEAN | Admin manuel çözdü mü |
| resolved_tx_id | UUID FK→transactions(id) | Çözüm: hangi credit grant TX'iyle kapatıldı |
| notes | TEXT | Admin notu (manuel SQL ile) |
| created_at | TIMESTAMPTZ | Otomatik |

**RLS:** Aktif, policy YOK → service_role only. Admin Dashboard SQL Editor'dan inceler ve manuel `transactions` insert + `users` update yapıp `resolved=TRUE` işaretler.

#### daily_leaderboard
- **Sprint 6 PR 6.1 sonrası:** Tablo ismi "daily" kalsa da semantik 48h cycle. `play_date` artık cycle_start (her 2 günde bir, anchor 2026-05-01).
- Her wallet × her cycle için tek kayit (UNIQUE `wallet_address, play_date`)
- Trigger ile otomatik guncellenir (her score INSERT'te `cycle_start = CURRENT_DATE - ((CURRENT_DATE - DATE '2026-05-01')::int % 2)` üzerine upsert)
- Top 100 disindakiler otomatik silinir (current cycle scope'unda)

#### daily_leaderboard_history
- Bitmiş cycle'ların arsivi
- pg_cron her gece 00:00 UTC'de tetikler ama `archive_daily_leaderboard()` sadece `play_date < current_cycle_start` rows'u taşır → intra-cycle days no-op, cycle-end days bitmiş cycle'ı süpürür

### Stored Procedures

#### submit_score(p_wallet, p_score, p_duration, p_distance)
- Frontend'den `supabase.rpc('submit_score', ...)` ile cagilir
- SECURITY DEFINER: servis rolu ile calisir
- Trigger: `trg_update_daily_leaderboard` otomatik tetiklenir

#### update_daily_leaderboard() [TRIGGER] (Sprint 6 PR 6.1 sonrası)
- scores'a INSERT oldigunda otomatik calisir
- `cycle_start` hesaplar (anchor 2026-05-01 even-day arithmetic), play_date olarak yazar
- Ayni cycle + ayni wallet: en yüksek skoru guncelle (`GREATEST`), `games_played_today += 1` (cycle içi cumulative)
- Yeni cycle: yeni satir ekle
- Top 100 disindakileri sil (sadece current cycle scope'unda)

#### archive_daily_leaderboard() (Sprint 6 PR 6.1 sonrası)
- pg_cron ile her gece 00:00 UTC (03:00 TR) calisir
- Sadece `play_date < current_cycle_start` rows'u (bitmiş cycle) → daily_leaderboard_history kopyalar
- ON CONFLICT (wallet_address, play_date) DO NOTHING (duplicate handling)
- Sonra DELETE FROM daily_leaderboard WHERE play_date < current_cycle_start
- Intra-cycle days: idempotent no-op (`No expired cycles to archive`)
- Cycle-end days (her 2. gün): bitmiş cycle'ı süpürür

### RLS Politikalari (Sprint 2.1 sonrası — 2026-05-01)

**SELECT (anon erişimi):**
- users, transactions, scores, daily_leaderboard, daily_leaderboard_history, reward_pool_distribution → "Allow public read" policy aktif (landing page'in leaderboard ve transactions panel'ı için gereklidir)
- rate_limits, suspicious_scores → policy yok = service-role only

**INSERT/UPDATE/DELETE (anon erişimi):**
- Hiçbir tabloda anon INSERT policy YOK. Tüm INSERT'ler Edge Function'lar üzerinden service role ile yapılır:
  - `users` ve `transactions` → verify-payment Edge Function
  - `scores` → submit-score Edge Function (anti-cheat geçtikten sonra `submit_score` RPC service role)
  - `daily_leaderboard` → `update_daily_leaderboard()` trigger (scores INSERT'ine bağlı)
  - `suspicious_scores` → submit-score Edge Function (anomali log)
  - `reward_pool_distribution` → calculate-daily-rewards Edge Function (pg_cron tetiklemesi)

**SECURITY DEFINER fonksiyonlar:**
- `submit_score`, `check_rate_limit`, `update_daily_leaderboard`, `archive_daily_leaderboard`, `cleanup_rate_limits` → EXECUTE anon ve authenticated için REVOKE edildi (Sprint 2.1)
- Çağrı yolu: Edge Function'lar (service role), trigger'lar (role bypass), pg_cron (postgres role)

**Anti-cheat:** submit-score Edge Function, frontend skor gönderiminin tek meşru yolu. Doğrulama kuralları: `duration ≥ 10s`, `distance ≤ 60 m/s × duration`, `coins ≤ floor(distance/50)`, `score ≤ distance × 200`, `clientStartTime` drift ≤ 5sn.

---

## Ses Sistemi (AudioSystem class)

Web Audio API ile sentezlenmis sesler (dosya yok):

| Ses | Tip | Frekans | Sure | Ek Efekt |
|-----|-----|---------|------|----------|
| Coin toplama | Square wave | B5 (988 Hz) -> E6 (1319 Hz) | 0.35s | Super Mario tarzı 2 tonlu |
| Carpma | Square wave | 100 Hz, exponential azalan | 0.5s | Titresim: [100, 50, 100, 50, 200]ms |
| Near Miss | Sine wave | 800 Hz -> 1200 Hz sweep | 0.2s | Titresim: 50ms |

- Context: `AudioContext` veya `webkitAudioContext`
- Suspended durumdan otomatik resume
- `navigator.vibrate()` ile haptic feedback

---

## Carpisma Sistemi

### Arac Boyutlari (VEHICLE_DIMENSIONS)
```javascript
player: { width: 1.8, length: 5.5 }
sedan:  { width: 3.0, length: 6.75, height: 2.7 }
truck:  { width: 3.1, length: 8.3, height: 4.2 }
sport:  { width: 1.9, length: 4.2, height: 1.9 }
suv:    { width: 2.9, length: 7.6, height: 3.8 }
```

### Carpisma Algilama
```
Carpisma = AABB (Axis-Aligned Bounding Box)
COLLISION_PADDING = 0.2

crashWidthThreshold  = (playerWidth + enemyWidth) / 2 + 0.2
crashDepthThreshold  = (playerLength + enemyLength) / 2 + 0.2

Near Miss:
  nearMissWidthMin = crashWidth + 0.3
  nearMissWidthMax = crashWidth + 1.2
  nearMissDepthThreshold = crashDepth + 0.8
  dz >= 1.0 (minimum derinlik)
```

---

## Performans Optimizasyonlari

### Rendering
1. **GPU Instanced Mesh:** Parcaciklar ve serit cizgileri tek draw call
2. **Shader Warmup:** Countdown sirasinda modeller gorünmez sahneye render edilir
3. **Platform DPR:** Android'de dusuk, iOS'ta orta, Desktop'ta yukse DPR
4. **Canvas Optimizasyonu:** antialias=false, alpha=false, stencil=false
5. **Frustum Culling:** InstancedMesh'lerde kapatildi (surekli gorunur)
6. **Shadow Map:** PCFSoft, 512x512 (dusuk cozunurluk)

### State/Logic
7. **Delta Clamp:** `Math.min(delta, 0.1)` - frame spike koruması
8. **Spatial Partitioning:** Serit bazli dusman gruplama (laneOccupancy) O(1) lookup
9. **Object Pool:** Dusman ve coin objeleri yeniden kullanim (for loop, spread yok)
10. **Single Pass Update:** Coin/dusman guncelleme tek dongu (filter/map zinciri yok)
18. **Module-level laneOccupancy cache (Faz-1):** `_laneOccupancyCache` `updateGame` her frame `{}+3*[]` allocation'ı yerine `length=0` reset. 60 FPS × 4 obje = saniyede 240 GC adayı sıfırlandı.

### React Render
19. **Selector pattern (Faz-1/Faz-2):** `Game()`, `PlayerCar()`, `MobileControls`, `SideObjects`, `StreetLights`, `RoadEnvironment`, `CameraShake`, `SpeedLines`, `SpeedBlurOverlay` — selectorless `useGameStore()` destructure yerine her field için ayrı `useGameStore(s => s.X)`. Component yalnız okuduğu field değişince render olur.
20. **`useGameStore.getState()` in useFrame:** PlayerCar'ın `useFrame` callback'i high-churn alanları (enemies/coins/targetX/gameOver) subscribe etmez, her frame state'ten okur — `enemies/coins` array referans değişimi PlayerCar'ı tetiklemez.
21. **Mutate-in-place playerPos:** `useState(() => [0, 0.1, -2])` + index mutate (`playerPos[0] = ...`). NitroBoostParticles'a aynı array referansı gider, prop reconciliation yok.

### Memory
11. **Shared Materials:** Eski Building materyalleri global havuzda (new yok) — şu an dead code
12. **Cached THREE objeler:** tempMatrix, tempColor, tempScale tekrar kullanilir
13. **Material Dispose:** useEffect cleanup'ta dispose() cagilir
14. **Preload:** 3D modeller `useGLTF.preload()` ile onceden yuklenir; environment asset'lerinin tamamı (41 adet) preload listesinde

### Build
15. **Code Splitting:** 4 vendor chunk (three, solana, supabase, react)
16. **Terser:** console.log + debugger uretimde kaldirilir
17. **Memo:** Tum alt bilesenler `React.memo` ile sarili

---

## Oyun Modlari

### Classic
- Normal skor: mesafe + coinler + near miss
- 1 kredi gerekli
- Skor olduğu gibi kaydedilir

### Double or Nothing
- 2 kredi gerekli
- Level 5'e ulasirsa: skor x2
- Level 5'e ulasamazsa: skor = 0
- Level 5 = 5000m mesafe

---

## Bilinen Hatalar ve Eksiklikler

> Faz 0 kritik bug'lari (use-credit Ethereum regex, quitGame 'menu' state, RainbowKit CSS) **duzeltildi ve merge edildi**.
> Detay icin bkz. `TASK.md`.

### YUKSEK ONCELIK
1. **Test altyapisi yok** - Hicbir test runner veya test dosyasi mevcut degil
2. **RLS politikalari gevsek** - `USING(true)` ile tum tablolar herkese acik
3. **Sunucu tarafli skor dogrulama yok** - Frontend'den hile mumkun, GameOverUI "Fair Play Protected" banner'i yaniltici
4. **TypeScript yok** - Frontend tamami JavaScript, tip guvenligi eksik
5. **App.jsx cok buyuk** - 2464 satir tek dosyada, bolunmesi gerekli

### ORTA ONCELIK
6. **Ses dosyalari yok** - Sadece sentezlenmis sesler (motor sesi/muzik yok)
7. **Hardcoded oyun sabitleri** - Oyun parametreleri (hiz, mesafe, spawn orani) App.jsx/store.js icine gomulu
8. **GameOverUI'da coins_collected gonderilmiyor** (ertelendi - bkz TASK.md)
9. **Tolerans tutarsizligi** - Frontend `solana.config.js` %5, backend `verify-payment` %10 tolerans kullanir
10. **Preload edilen kullanilmayan asset'ler** - `Car1/scene.gltf`, `suv.glb`, `coin.glb` preload edilir ama render'da kullanilmaz (Hata 15 - dokunulmadi)

### DUSUK ONCELIK
11. **Fazla console.log** - Terser uretimde kaldirir ama gelistirmede kirlilik
12. **FontAwesome CDN** - Sadece loading icin, bundle'a alinabilir

### DUZELTILDI (v5 - 2026-04-23)
- ~~Coal/Oiltown tutarsiz isimlendirme~~ → jenerik isimlere rename (getTokenBalance, transferToken, vb.)
- ~~Post-processing bos composer~~ → PostProcessing component tamamen kaldirildi
- ~~PostProcessing olu prop'lar~~ → (component kaldirildi)
- ~~Eski migration LMX/BNB~~ → default temizlendi + yeni migration (20260423_fix_token_symbol_defaults.sql)
- ~~Helius API key commit'li~~ → env var'a tasindi (VITE_HELIUS_API_KEY + Supabase secret HELIUS_API_KEY)

---

## Ortam Degiskenleri

### Frontend (Vite build-time)
```env
VITE_SUPABASE_URL=https://cldjwajhcepyzvmwjcmz.supabase.co
VITE_SUPABASE_ANON_KEY=<supabase-anon-key>
VITE_HELIUS_API_KEY=<public-domain-restricted-key>   # Helius dashboard'dan lumexia.net whitelist zorunlu
VITE_WALLETCONNECT_PROJECT_ID=<optional>
```

### Edge Function Secrets (Supabase Dashboard)
```
SUPABASE_URL=<auto>
SUPABASE_SERVICE_ROLE_KEY=<auto>
HELIUS_API_KEY=<private-key-no-domain-restriction>
PAYMENT_TOKEN_MINT=<token-mint-address>               # current: TOKABU mint
TOKEN_SYMBOL=<token-symbol>                           # current: TOKABU
TOKEN_DECIMALS=<token-decimals>                       # default: 6
PAYMENT_RECEIVER=<receiver-wallet-address>            # default: current receiver
```

Yeni token'a gecerken degistirilecek yer: `src/solana.config.js` -> `TOKEN_CONFIG` (frontend)
ve Supabase Secrets -> `PAYMENT_TOKEN_MINT` / `TOKEN_SYMBOL` (backend).
