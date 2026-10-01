# T299-pulse-learn-fit

- Tarih: 2026-10-01 17:13
- Commit: T299: Pulse öğrenme alanı ekrana sığar (sütun içi kaydırma) ve Orijinal Görüntü (ham kayıt) düğmesi
- Dal: task/T299-pulse-learn-fit

---

# T299 — Pulse öğrenme alanı ekrana sığma + Orijinal Görüntü (Opus 5.5)

## Sorun (kullanıcı, 1 Eki 2026)
Tam ekran değilken "Bu patern hakkında" ve sol sütunun altı görünmüyor; tam ekranda kopmalar var.
Ölçüm (1440×800): kaynak `simView` 747 px'e sabit, öğrenme alanı içeriği 807 px → kesiliyor, kaydırılacak alan yok. Kabuk alt bilgisi (41 px) yüzünden sayfa kayıyor, alan başlığın altına giriyordu. Ayrıca sağ sütunda kâğıt sıkışıyor, ResizeObserver döngü uyarısı vardı.

## Çözüm
- Masaüstü (≥1101 px): `.app` yüksekliği mod seçimiyle aynı payla (`--pulse-vh − 2.5625rem`) sabit; çerçeve görünür alana oturur, üç sütun kendi içinde kayar (`overscroll-behavior: contain`). Sayfa kayması 0, alt bilgi görünür.
- Sütun satırları `max-content` (kâğıt sıkışmaz). Dar ekranda tek sütun, doğal akış.
- ResizeObserver yalnız genişlik değişince bir sonraki karede çizer.
- **Orijinal Görüntü** düğmesi (kaliperin sağında): hastanın ham 500 Hz kaydı, filtre/örnekleme yok, standart 25 mm/s · 10 mm/mV çıktı (`public/assets/ecg-orig/<id>.png`, 60 dosya, 4,2 MB, istenince yüklenir; üretim: `egemed-tools/pulse-ecg/export_originals.py`). Bu modda oynat/durdur, hız, kazanç, kaliper kapalı; kalp diyastolde durur ("Orijinal görüntü · animasyon kapalı"); kayıt/patern değişince görüntü de değişir; inceleme süresi sayılmaya devam eder.
- Not: etkileşimli kâğıt da sentetik değildir — aynı hastanın sinyali, yalnız 250 Hz'e örneklenmiş.

## Testler
- e2e: sığma (1440×760: sayfa kaymaz, alt bilgi görünür, sol/sağ sütun sonu görünür) ve Orijinal Görüntü modu (kontroller kapalı, kalp durur, kayıtla görüntü değişir, geri dönüş).
- birim: her kaydın orijinal PNG'si pakette.
- Yerel: pulse-runtime + pulse-a11y + uat-journeys 80 geçti, 4 bilinçli atlandı.
