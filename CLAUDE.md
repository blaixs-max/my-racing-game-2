# Claude Code - Proje Kurallari

## Commit ve Merge Bildirimi

**KURAL: Her commit sonrasi kullaniciya ACIKCA merge zamani bildirilmelidir.**

Commit yapildiktan sonra asagidaki formatta bildirim ver:

```
MERGE BILDIRIMI:
- Branch: <branch-adi>
- Commit: <commit-mesaji-ozeti>
- Durum: Push yapildi, MERGE ICIN HAZIR
- Risk seviyesi: [DUSUK/ORTA/YUKSEK]
- Test durumu: [Test edildi / Test edilmedi - RISK]
- Onerilen aksiyon: [Hemen merge et / Test sonrasi merge et / Inceleme sonrasi merge et]
```

### Risk Seviyeleri:
- **DUSUK**: Sadece dokumantasyon, yorum, stil degisiklikleri → "Hemen merge edilebilir"
- **ORTA**: Kucuk kod degisiklikleri, bug fix'ler (test ile) → "Test basariliysa merge edilebilir"
- **YUKSEK**: Buyuk refactor, test olmadan bug fix, guvenlik degisiklikleri → "Inceleme ve test sonrasi merge edilmeli"

### Merge Oncesi Kontrol Listesi:
1. Build basarili mi? (`npm run build`)
2. Lint hatalari var mi? (`npm run lint`)
3. Testler gecti mi? (varsa)
4. Degisiklikler dokumante edildi mi? (TASK.md, PLAN.md)

## Genel Kurallar

- Her degisiklik oncesi ilgili dosyalari oku
- Degisiklik sonrasi build test et
- TASK.md ve PLAN.md her zaman guncel tut
- Kritik degisikliklerde (guvenlik, odeme, skor) mutlaka test yaz
- Console.log eklemekten kacin (uretimde Terser kaldirir ama gelistirmede kirlilik yaratir)
