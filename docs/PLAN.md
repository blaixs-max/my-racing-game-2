# Lumexia Racing Game - Gelistirme Plani

## Mevcut Durum Ozeti

Proje, calisir durumda bir 3D yaris oyunu. Solana blockchain entegrasyonu, kredi sistemi, liderlik tablosu ve temel oyun mekanikleri tamamlanmis durumda. Ancak **3 kritik bug**, test altyapisi eksikligi, guvenlik aciklari ve tip guvenligi sorunlari tespit edildi.

---

## Faz 0: ACIL - Kritik Bug Duzeltmeleri (Oncelik: ACIL)

### 0.1 use-credit Edge Function Bug
- [ ] `isValidEthAddress` Ethereum regex'ini `isValidSolanaAddress` ile degistir
- [ ] Regex: `/^[1-9A-HJ-NP-Za-km-z]{32,44}$/` (base58, 32-44 karakter)
- [ ] Test: gecerli Solana adresleri kabul edilmeli, gecersiz adresler reddedilmeli

### 0.2 quitGame() State Bug
- [ ] `store.js`'te `quitGame()` icindeki `'menu'` state'ini `'launcher'` ile degistir
- [ ] Veya App.jsx'te `'menu'` state icin render ekle

### 0.3 Kullanilmayan Import Temizligi
- [ ] `index.html`'den RainbowKit CSS import'unu kaldir (BNB Chain artigi)

---

## Faz 1: Temel Altyapi Iyilestirmeleri (Oncelik: Yuksek)

### 1.1 Test Altyapisi Kurulumu
- [ ] Vitest kurulumu ve yapilandirmasi
- [ ] Store (game logic) icin birim testleri
- [ ] Carpisma algilama testleri (VEHICLE_DIMENSIONS, COLLISION_PADDING)
- [ ] Skor hesaplama testleri (classic vs D/N)
- [ ] Dusman AI testleri (serit degistirme, spawn algoritmasi)
- [ ] Utility fonksiyonlari (jupiterPrice, solanaWallet) testleri
- [ ] CI/CD pipeline'a test entegrasyonu

### 1.2 Kod Kalitesi
- [ ] ESLint kurallarini genisletme
- [ ] Prettier entegrasyonu
- [ ] Gereksiz console.log'lari temizleme (dev ortaminda birakma)
- [ ] Tutarsiz isimlendirmelerin duzeltilmesi (Coal -> Oiltown)
- [ ] App.jsx bolme (2464 satir -> mantiksal alt dosyalar)

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
- [ ] coins_collected verisini scores tablosuna kaydetme

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

## Teknik Borc

| Alan | Aciklama | Oncelik |
|------|----------|---------|
| **KRITIK BUG** | use-credit Ethereum adresi dogruluyor (Solana degil) | ACIL |
| **KRITIK BUG** | quitGame() 'menu' state -> bos ekran | ACIL |
| Test yok | Hicbir test mevcut degil | Kritik |
| TypeScript yok | Tip guvenligi eksik | Yuksek |
| RLS politikalari | Tum tablolarda USING(true) - herkes her seye erisebilir | Yuksek |
| Sunucu tarafli skor dogrulama yok | Frontend'den hile mumkun | Yuksek |
| App.jsx 2464 satir | Tek dosyada cok fazla bilesen | Yuksek |
| Coal -> Oiltown | getCoalBalance, transferCoalToken gibi fonksiyon isimleri | Orta |
| coins_collected kaydedilmiyor | Scores tablosunda sutun var ama GameOverUI gondermez | Orta |
| Post-processing | Devre disi birakilmis | Dusuk |
| Hardcoded degerler | Oyun sabitleri (hiz, mesafe, spawn oranlari) dosyada gommlu | Orta |
| RainbowKit CSS | index.html'de BNB Chain doneminden kalma kullanilmayan import | Dusuk |
| FontAwesome CDN | Dis bagimllik, bundle'a alinabilir | Dusuk |
