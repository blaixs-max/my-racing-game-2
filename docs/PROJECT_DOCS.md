# Lumexia Racing Game - Proje Dokumantasyonu

## Genel Bakis

Lumexia Racing Game, Solana blockchain uzerinde OILTOWN token ile calisan, 3D tarayici tabanli bir araba yarisi oyunudur. Oyuncular kripto cuzdan baglayarak kredi satin alir, trafik arasinda slalom yaparak puan toplar ve liderlik tablosunda yarisbilirler.

**Canli URL:** Netlify uzerinden deploy ediliyor
**Veritabani:** Supabase (PostgreSQL)
**Blockchain:** Solana Mainnet-Beta

---

## Teknoloji Yigini

### Frontend
| Teknoloji | Versiyon | Amac |
|-----------|----------|------|
| React | 19.2.0 | UI framework |
| Vite | 7.2.4 | Build araci (ESM, HMR) |
| Three.js | 0.181.2 | 3D rendering |
| @react-three/fiber | 9.4.0 | React Three.js renderer |
| @react-three/drei | 10.7.7 | 3D yardimci bilesenler |
| @react-three/rapier | 2.2.0 | Fizik motoru wrapper |
| Rapier3D | 0.19.3 | WebAssembly fizik motoru |
| Zustand | 5.0.8 | State management |
| Tailwind CSS | 3.4.0 | CSS framework |
| React Query | 5.90.11 | Sunucu state yonetimi |

### Blockchain (Solana)
| Teknoloji | Amac |
|-----------|------|
| @solana/web3.js 1.98.4 | Solana blockchain etklesimi |
| @solana/wallet-adapter-react | Cuzdan baglanti saglayicisi |
| @solana/spl-token | SPL token transferleri |
| Desteklenen Cuzdanlar | Phantom, Solflare, Coinbase, Trust |

### Backend
| Teknoloji | Amac |
|-----------|------|
| Supabase | PostgreSQL veritabani + Edge Functions |
| Netlify | Hosting ve CI/CD |

---

## Dizin Yapisi

```
my-racing-game-2/
├── src/
│   ├── App.jsx              # Ana oyun bileseni (~2464 satir)
│   ├── App.css              # Oyun stilleri
│   ├── main.jsx             # Giris noktasi (Solana wallet provider)
│   ├── index.css            # Global stiller
│   ├── store.js             # Zustand state yonetimi (~796 satir)
│   ├── solana.config.js     # Solana yapilandirmasi
│   ├── assets/
│   │   ├── coin_logo.png    # HUD coin ikonu
│   │   └── react.svg
│   ├── components/
│   │   ├── RealLauncherUI.jsx      # Oyun baslangic ekrani & cuzdan arayuzu
│   │   ├── GameOverUI.jsx          # Oyun bitis ekrani
│   │   ├── AdvancedParticles.jsx   # Parcacik efekt sistemi
│   │   ├── PhysicsWorld.jsx        # Rapier3D fizik wrapper
│   │   └── PostProcessing.jsx      # Post-processing (su an devre disi)
│   └── utils/
│       ├── supabaseClient.js       # Veritabani islemleri
│       ├── solanaWallet.js         # Token transfer & bakiye kontrol
│       └── jupiterPrice.js         # Token fiyat API entegrasyonu
├── public/
│   └── models/
│       ├── sport_car.glb           # Oyuncu araci (F1)
│       ├── ferrari.glb             # Dusman: sport araba
│       ├── truck.glb               # Dusman: kamyon
│       ├── suv.glb                 # Dusman: SUV
│       ├── Car1/scene.gltf         # Dusman: sedan
│       ├── Car 2/scene.gltf        # Dusman: SUV (GLTF)
│       ├── Car 3/scene.gltf        # Dusman: pikap/taksi
│       ├── coin.glb                # Toplanabilir altin
│       └── tree.glb                # Cevre agaci
├── supabase/
│   ├── functions/
│   │   ├── verify-payment/index.ts # Odeme dogrulama Edge Function
│   │   └── use-credit/index.ts     # Kredi dusme Edge Function
│   └── migrations/
├── supabase-schema.sql             # Veritabani semasi
├── supabase-functions.sql          # Stored procedure'ler
├── vite.config.js                  # Build yapilandirmasi
├── netlify.toml                    # Deploy yapilandirmasi
├── tailwind.config.js              # Tailwind CSS yapilandirmasi
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
| `loading` | Ilk yukleme, 3D modeller preload ediliyor |
| `launcher` | Ana menu: mod secimi, kredi satin alma, cuzdan baglama |
| `countdown` | 5 saniye geri sayim |
| `playing` | Aktif oyun - 60fps frame dongusu |
| `gameover` | Carpma/bitis ekrani, skor kaydi |

### Ana Bilesenler

#### 1. State Management (`store.js`)
- **Zustand** ile merkezi state yonetimi
- Oyun durumu, skor, dusmanlar, coinler
- Web Audio API ile ses sentezi (crash, coin, near-miss)
- Kredi dusme sistemi
- Iki oyun modu: `classic` ve `doubleOrNothing`

#### 2. Oyuncu Arabasi (PlayerCar)
- 3D Model: `sport_car.glb` (F1 araci, scale: 0.16)
- Kontroller: Klavye (A/D) veya dokunmatik ekran
- Nitro boost sistemi (SPACE veya buton)
- Hareket: Position-based, lerp ile yumusak gecis
- Carpisma algilama: AABB kutu carpisma

#### 3. Trafik Sistemi (Traffic)
- 5 arac tipi: truck, suv, sedan, sport, muscle
- 3 seritli yol: sol (-4.5), orta (0), sag (+4.5)
- Serit degistirme davranisi
- Seviye bazli zorluk: her 1000 birim mesafede seviye artar
- Her seviyede %10 hiz artisi

#### 4. Coin Sistemi
- Rastgele spawn, seritlerde dagitim
- Toplama: +100 puan
- Carpisma algilama: dx < 2.0, dz < 2.5

#### 5. Parcacik Sistemi (GPU Instanced)
- Kivilcim parcaciklari (sari) - max 50
- Patlama parcaciklari (turuncu) - max 50
- Nitro boost efekti
- InstancedMesh ile GPU optimizasyonu

### Skor Sistemi
- **Mesafe puani:** `speed * delta * 0.2` (surekli)
- **Coin toplama:** +100 puan
- **Near Miss:** +500 * combo carpani
- **Combo:** Art arda near miss ile artar (max 10x)
- **Seviye:** Her 1000 birim mesafede +1

### Fizik Ayarlari
- Gravity: [0, -9.81, 0]
- 4 solver iterasyonu
- Surekli carpisma algilama (CCD)

---

## Blockchain Entegrasyonu

### Token Bilgileri
- **Token:** OILTOWN
- **Mint Adresi:** `AakmsJ4vebK1Uk3eWPRPx89WzEDq2knvN2sgGcXEpump`
- **Decimal:** 6
- **Ag:** Solana Mainnet-Beta

### Odeme Akisi
1. Kullanici cuzdanini baglar
2. Kredi paketi secer ($1, $5, $10)
3. Token fiyati DexScreener/Jupiter'den cekilir
4. OILTOWN token transferi yapilir
5. `verify-payment` Edge Function ile dogrulanir
6. Kredi kullanici hesabina eklenir

### Alici Cuzdan
`T6EkvAVdHPRr6Ngub1vk7VTzqtgw2KoGJwA8RCJmmGg`

### RPC Endpoints (Fallback sirasi)
1. Helius RPC (ana)
2. Solana Mainnet-Beta (yedek)

---

## Veritabani Semasi (Supabase/PostgreSQL)

### Tablolar
| Tablo | Amac |
|-------|------|
| `users` | Kullanici bilgileri, krediler, toplam oyun sayisi |
| `transactions` | Odeme islemi kayitlari |
| `scores` | Tum oyun skorlari |
| `daily_leaderboard` | Gunluk en iyi skorlar (Top 100) |
| `daily_leaderboard_history` | Gecmis gunlerin arsivi |

### Gorunumler (Views)
| View | Amac |
|------|------|
| `alltime_leaderboard` | Tum zamanlarin en iyi 100 skoru |

### Guvenlik
- Row Level Security (RLS) tum tablolarda aktif
- Kredi ekleme sadece Edge Function uzerinden
- Frontend'den dogrudan kredi ekleme yok

---

## Build ve Deploy

### Komutlar
```bash
npm run dev      # Gelistirme sunucusu (HMR)
npm run build    # Uretim build'i (/dist)
npm run preview  # Uretim onizleme
npm run lint     # ESLint kontrolu
```

### Vite Build Optimizasyonlari
- **Code Splitting:** 4 ayri chunk
  - `three-vendor`: Three.js + React Three Fiber
  - `solana-vendor`: Solana cuzdan kutuphaneleri
  - `supabase-vendor`: Supabase istemcisi
  - `react-vendor`: React cekirdek
- **Minification:** Terser (console.log temizleme dahil)
- **Chunk uyari limiti:** 500KB

### Netlify Yapilandirmasi
- Build komutu: `npm run build`
- Cikti dizini: `dist`
- Node versiyonu: 20
- SPA yonlendirme: `/*` -> `/index.html`

---

## Ses Sistemi

Tum sesler Web Audio API ile sentezlenir (dosya yok):

| Ses | Tip | Frekans |
|-----|-----|---------|
| Coin toplama | Square wave | B5 (988 Hz) -> E6 (1319 Hz) |
| Carpma | Square wave | 100 Hz, azalan |
| Near Miss | Sine wave | 800 Hz -> 1200 Hz sweep |

---

## Performans Optimizasyonlari

1. **GPU Instanced Mesh:** Parcaciklar icin tek draw call
2. **Delta Clamp:** `Math.min(delta, 0.1)` ile spike koruması
3. **Object Pool:** Dusman ve coin objeleri yeniden kullanim
4. **Shared Materials:** Bina materyalleri global havuzda paylasilir
5. **Preload:** 3D modeller onceden yuklenir
6. **Spatial Partitioning:** Serit bazli dusman gruplama
7. **Memo:** Tum alt bilesenler `React.memo` ile sarili
8. **Code Splitting:** Vendor kutuphaneleri ayri chunk'larda

---

## Bilinen Eksiklikler

1. **Test yok:** Hicbir test runner veya test dosyasi mevcut degil
2. **TypeScript yok:** Tum kod JavaScript, tip guvenligi yok
3. **Post-processing devre disi:** `PostProcessing.jsx` yorum satirinda
4. **Ses dosyasi yok:** Sadece sentezlenmis sesler
5. **Fonksiyon isimleri tutarsiz:** `getCoalBalance` ama token OILTOWN
6. **Hardcoded degerler:** Bazi oyun ayarlari dosyada sabit
7. **RLS politikalari cok acik:** `USING (true)` ile herkes okuyabilir

---

## Ortam Degiskenleri

```env
VITE_SUPABASE_URL=https://cldjwajhcepyzvmwjcmz.supabase.co
VITE_SUPABASE_ANON_KEY=<supabase-anon-key>
VITE_WALLETCONNECT_PROJECT_ID=<optional>
```
