# T300-pulse-rate

- Tarih: 2026-10-01 20:06
- Commit: T300: Pulse öğrenme oynatma hızı 0,5×/1×/2×; EKG kâğıdı 25 mm/s · 10 mm/mV sabit
- Dal: task/T300-pulse-rate

---

# T300 — Pulse öğrenme: oynatma hızı 0,5×/1×/2×; kâğıt ölçeği sabit (Opus 5.5)

Kullanıcı (1 Eki 2026): "hız ve kazançla değişen görüntü yaklaşımını kaldıracağız, hız için 0,5x 1x 2x; sadece EKG görüntüsü değişmesin".

- 25/50 mm/s ve 5/10/20 mm/mV seçimleri kaldırıldı; kâğıt sabit 25 mm/s · 10 mm/mV (standart 12 derivasyon).
- "Oynatma hızı" 0,5× / 1× / 2×: yalnız zamanın akışı (imleç + kalp animasyonu) değişir; kare süresi 100 ms ile sınırlı.
- Orijinal Görüntü modunda oynatma hızı düğmeleri de kapalı; not metni güncellendi.
- e2e: hız değişince canvas görüntüsü birebir aynı; araç çubuğunda mm/s, mm/mV yok; orijinal modda hız kapalı.
