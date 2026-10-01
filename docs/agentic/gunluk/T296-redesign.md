# T296-redesign

- Tarih: 2026-10-01 15:10
- Commit: T296: Ana Sayfa, Simülatörler ve Giriş premium yeniden tasarımı; Discerna/Praxis geliştirme aşamasında (Claude)
- Dal: task/T296-redesign

---

# T296 — Ana Sayfa, Simülatörler ve Giriş premium yeniden tasarımı

Yazan: Claude (Opus 5.5). Onay: maket https://claude.ai/artifact/M7mf1yrNuDrCCkTm5obr8h ("ekranlar süper"); ek kararlar: girişte gerçek EGEMED logo seti, simlerde gerçek logo setleri, girişte arka plan fotoğrafı yok; Simülatörler'e "Geliştirme Aşamasında" Discerna ve Praxis.

## Ne değişti
- Menü: "Ana" → "Ana Sayfa".
- Ana Sayfa: koyu karşılama (oturumda "Hoş geldiniz, <ad>", "Kaldığın yerden devam et"; oturumsuz "Öğrenci girişi") + "Bugün" kartı (son etkinlik simi, günlük seri, haftalık XP, seviye) / ziyaretçide dört mod; "Simülatörlerin" kartları (renkli sim ikonu, öğrenme durumu, mod çipleri, en iyi puan/sıralama); liderlik vitrini ve İlerlemem korunur; "Nasıl çalışır" 4 adım (Meydan Okuma eklendi); "Neden güvenilir" sayılarla.
- Simülatörler: sim başına vitrin kartı (sim renginde sahne + gerçek beyaz ikon, gerçek içerik sayıları, dört mod çipi, öğrenme durumu, tek eylem) + "Geliştirme aşamasında": Discerna (Klinik Akıl Yürütme ve Ayırıcı Tanı), Praxis (Girişimsel Temel Hekimlik Uygulamaları) — logo seti gelene dek geçici simge.
- Giriş: fotoğrafsız lacivert sahne, gerçek Ege Tıp + EGEMED beyaz logo, güçlü başlık, beyaz sim ikonlu çipler; sağ panel sade (Öğrenci önce), güvence satırı.
- Ortak `home/simProgress.ts` (gamification + learn kaynakları), `sims/SimulatorsPage.tsx`, sim kimlik token'ları (`--sim-*`).
- Kaldırılan: yetim `SimCard` bileşeni/`SIM_LOGOS`/`.eg-shell-sim*` CSS, giriş özellik kutusu CSS'i.
- Testler: home, entry CSS, sim-routes, optout güncellendi; yeni `sim-facts.test.ts` (kart sayıları ↔ sim envanterleri).

## Doğrulama
Kapı 17/17; e2e (a11y, layout, uat, sims, auth-dev, visitor, dashboard) 150/150; 1440/360 ekran görüntüleri.

## Notlar
- Kurum SSO'su kodda yok; maketteki "Ege Üniversitesi hesabıyla giriş" düğmesi eklenmedi (işlevsiz olurdu).
- `public/brand/entry-bg*.jpg` artık kullanılmıyor (silinmedi).
- Çevrimdışı UAT testi, önbellekte olmayan görsel yükleme hatasını uygulama hatası saymaz.
