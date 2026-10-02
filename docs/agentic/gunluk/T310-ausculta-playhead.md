# T310-ausculta-playhead

- Tarih: 2026-10-02 16:47
- Commit: T310: Ausculta öğrenme — dalga konum çubuğu, küçük stetoskop, ortalanmış görünümler, sağ sütun sadeleşti
- Dal: task/T310-ausculta-playhead

---

# T310 özet
- Dalga panelinde çalarken konum çubuğu (CSS animasyonu, kaydın gerçek süresi; HLS 15 sn kayıtta 8 sn pencereden sonra gizlenir; döngüde başa döner; azaltılmış harekette de çalışır).
- Sahne: stetoskop (kulaklık, göğüs parçası, tüp) %25 küçük, boşta y=0,88; görünüm düğmeleri görselin üstünde ortada; karma katman düğmesi sağ üstte.
- Sağ sütundan kaldırıldı: vaka kapsamı, Pediatrik referans, "Bu sesle uygulama yap", kilit notu (depo sahibi). Konu odaklı uygulama öğrenmeden başlatılamaz; e2e Ausculta uygulamayı mod kartından (10 vaka) başlatır.
- PatientStage: isteğe bağlı stethScale ve restPosition (vaka ekranları değişmez).
