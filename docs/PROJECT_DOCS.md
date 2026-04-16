# Lumexia Racing Game - Proje Dokumantasyonu (v3 - Kod ile hizalandi)

## Genel Bakis

Lumexia Racing Game, Solana blockchain uzerinde OILTOWN token ile calisan, 3D tarayici tabanli bir araba yarisi oyunudur. Oyuncular kripto cuzdan baglayarak kredi satin alir, trafik arasinda slalom yaparak puan toplar ve liderlik tablosunda yarisirler.

**Canli URL:** Netlify uzerinden deploy ediliyor (lumexia.net)
**Veritabani:** Supabase (PostgreSQL)
**Blockchain:** Solana Mainnet-Beta
**Token Mint:** `AakmsJ4vebK1Uk3eWPRPx89WzEDq2knvN2sgGcXEpump` (OILTOWN, pump.fun - Token-2022 otomatik algilama)
**Odeme Alicisi:** `T6EkvAVdHPRr6Ngub1vk7VTzqtgw2KoGJwA8RCJmmGg`

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
| @react-three/postprocessing | 3.0.4 | Post-processing efektler (su an devre disi) |
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
│   │   ├── PhysicsWorld.jsx        # Rapier3D fizik wrapper
│   │   └── PostProcessing.jsx      # Post-processing (bos EffectComposer - tum efektler devre disi)
│   └── utils/
│       ├── supabaseClient.js       # Veritabani islemleri (getOrCreateUser, getUserCredits, useCredit)
│       ├── solanaWallet.js         # Token transfer & bakiye kontrol (getCoalBalance, transferCoalToken - COAL eski BNB donemi isimleri, OILTOWN icin kullaniliyor)
│       └── jupiterPrice.js         # Token fiyat API (frontend: DexScreener -> Jupiter fallback)
├── public/
│   ├── Lumexia.jpg                 # Loading screen banner
│   ├── Lumexia.png                 # Branding asset
│   └── models/
│       ├── sport_car.glb           # Oyuncu araci (F1, scale: 0.16)
│       ├── ferrari.glb             # Dusman: sport araba (scale: 1.21)
│       ├── truck.glb               # Dusman: kamyon (scale: 1.678)
│       ├── suv.glb                 # (preload edilmis ama kullanilmiyor - suv tipi Car 2 kullaniyor)
│       ├── Car1/scene.gltf         # (preload edilmis ama kullanilmiyor - sedan Car 3 kullaniyor)
│       ├── Car 2/scene.gltf        # Dusman: SUV (scale: 1.53)
│       ├── Car 3/scene.gltf        # Dusman: sedan (scale: 1.35)
│       ├── coin.glb                # (kullanilmiyor - SpinningCoin procedurel cylinder + coin_logo.png)
│       └── tree.glb                # Cevre agaci (scale: 2.5)
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
| `Building` | 930-1074 | Bina bileseni: 6 tip (apartment, villa, modern, shop, townhouse, small) |
| `SideObjects` | 1078-1211 | Yol kenari objeler: binalar + agaclar (30 adet, sonsuz dongu) |
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

### PostProcessing.jsx (22 satir)
- `enabled=false` ise `null` dondurur; aksi halde bos `<EffectComposer multisampling={0}>` dondurur (hicbir efekt icermez)
- App.jsx her zaman `enabled={true}` ile render eder, yani efektsiz composer sahneye eklenir
- App.jsx'te `speed` ve `isNitroActive` prop'lari gecer ama component kullanmaz (olu prop'lar)
- Yorum: "ALL POST-PROCESSING DISABLED - Clean gameplay visuals"

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
4. Token fiyati alma (backend oncelik sirasi):
   - Jupiter Price API (ana)
   - DexScreener (yedek)
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
   - Token == PAYMENT_TOKEN_MINT (OILTOWN)
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

#### daily_leaderboard
- Her wallet + her gun icin tek kayit (UNIQUE constraint)
- Trigger ile otomatik guncellenir
- Top 100 disindakiler otomatik silinir

#### daily_leaderboard_history
- Gecmis gunlerin arsivi
- Gece 00:00 UTC'de pg_cron ile kopyalanir

### Stored Procedures

#### submit_score(p_wallet, p_score, p_duration, p_distance)
- Frontend'den `supabase.rpc('submit_score', ...)` ile cagilir
- SECURITY DEFINER: servis rolu ile calisir
- Trigger: `trg_update_daily_leaderboard` otomatik tetiklenir

#### update_daily_leaderboard() [TRIGGER]
- scores'a INSERT oldigunda otomatik calisir
- Ayni gun + ayni wallet: en yüksek skoru guncelle
- Yeni kayit: yeni satir ekle
- Top 100 disindakileri sil

#### archive_daily_leaderboard()
- pg_cron ile her gece 00:00 UTC (03:00 TR) calisir
- daily_leaderboard -> daily_leaderboard_history kopyalar
- ON CONFLICT DO NOTHING (duplicate handling)
- daily_leaderboard tablosunu temizler

### RLS Politikalari
**TUMU COK ACIK** - `USING(true)`:
- users: SELECT, INSERT, UPDATE herkese acik
- transactions: SELECT, INSERT herkese acik
- scores: SELECT, INSERT herkese acik
- daily_leaderboard: SELECT, INSERT, UPDATE, DELETE herkese acik
- daily_leaderboard_history: SELECT, INSERT herkese acik

**RISK:** Herhangi bir kullanici diger kullanicilarin verilerini okuyabilir,
kendi skorlarini ekleyebilir, ve potansiyel olarak baskalarinin verilerini degistirebilir.

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

### Memory
11. **Shared Materials:** Bina materyalleri global havuzda (new yok)
12. **Cached THREE objeler:** tempMatrix, tempColor, tempScale tekrar kullanilir
13. **Material Dispose:** useEffect cleanup'ta dispose() cagilir
14. **Preload:** 3D modeller `useGLTF.preload()` ile onceden yuklenir

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
5. **Tutarsiz isimlendirme** - `getCoalBalance`, `calculateCoalAmount`, `transferCoalToken` - COAL eski BNB donemi isimleri, token OILTOWN
6. **App.jsx cok buyuk** - 2464 satir tek dosyada, bolunmesi gerekli

### ORTA ONCELIK
7. **Post-processing bos composer** - `PostProcessing.jsx` efektsiz `EffectComposer` render eder (null yerine). Gereksiz Canvas agaci dugumu.
8. **PostProcessing olu prop'lar** - App.jsx `speed`, `isNitroActive` prop'lari gonderir ama component kullanmaz
9. **Ses dosyalari yok** - Sadece sentezlenmis sesler (motor sesi/muzik yok)
10. **Hardcoded oyun sabitleri** - Oyun parametreleri (hiz, mesafe, spawn orani) App.jsx/store.js icine gomulu
11. **GameOverUI'da coins_collected gonderilmiyor** - scores tablosunda sutun var ama RPC cagrisina eklenmiyor
12. **Tolerans tutarsizligi** - Frontend `solana.config.js` %5, backend `verify-payment` %10 tolerans kullanir
13. **Preload edilen kullanilmayan asset'ler** - `Car1/scene.gltf`, `suv.glb`, `coin.glb` preload edilir ama Traffic render'inda kullanilmaz
14. **Eski migration** - `20241216_add_token_fields.sql` LMX/BNB default'lari iceriyor (artik OILTOWN)

### DUSUK ONCELIK
15. **Fazla console.log** - Terser uretimde kaldirir ama gelistirmede kirlilik
16. **FontAwesome CDN** - Sadece loading icin, bundle'a alinabilir

---

## Ortam Degiskenleri

```env
VITE_SUPABASE_URL=https://cldjwajhcepyzvmwjcmz.supabase.co
VITE_SUPABASE_ANON_KEY=<supabase-anon-key>
VITE_WALLETCONNECT_PROJECT_ID=<optional>
```

### Edge Function Env (Supabase tarafinda)
```
SUPABASE_URL=<supabase-url>
SUPABASE_SERVICE_ROLE_KEY=<service-role-key>
```
