# Lumexia Racing Game - Gelistirme Plani

## Mevcut Durum Ozeti

Proje, calisir durumda bir 3D yaris oyunu. Solana blockchain entegrasyonu, kredi sistemi, liderlik tablosu ve temel oyun mekanikleri tamamlanmis durumda. Ancak test altyapisi, tip guvenligi ve bazi performans iyilestirmeleri eksik.

---

## Faz 1: Temel Altyapi Iyilestirmeleri (Oncelik: Yuksek)

### 1.1 Test Altyapisi Kurulumu
- [ ] Vitest kurulumu ve yapilandirmasi
- [ ] Store (game logic) icin birim testleri
- [ ] Carpisma algilama testleri
- [ ] Skor hesaplama testleri
- [ ] Utility fonksiyonlari (jupiterPrice, solanaWallet) testleri
- [ ] CI/CD pipeline'a test entegrasyonu

### 1.2 Kod Kalitesi
- [ ] ESLint kurallarini genisletme
- [ ] Prettier entegrasyonu
- [ ] Gereksiz console.log'lari temizleme (dev ortaminda birakma)
- [ ] Tutarsiz isimlendirmelerin duzeltilmesi (Coal -> Oiltown)

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
- [ ] RLS politikalarinin sikistirilmasi (USING(true) -> spesifik kurallar)
- [ ] Skor dogrulama (sunucu tarafli anti-cheat)
- [ ] Rate limiting eklenmesi
- [ ] Edge Function'larda girdi dogrulama guclendirme

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
| Test yok | Hicbir test mevcut degil | Kritik |
| TypeScript yok | Tip guvenligi eksik | Yuksek |
| Coal -> Oiltown | Fonksiyon isimleri eski token ismini kullaniyor | Orta |
| RLS politikalari | Cok acik kurallar | Yuksek |
| Post-processing | Devre disi birakilmis | Dusuk |
| Hardcoded degerler | Oyun sabitleri dosyada gommlu | Orta |
| Console.log'lar | Uretimde Terser kaldiriyor ama gelistirmede cok fazla | Dusuk |
