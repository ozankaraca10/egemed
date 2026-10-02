# T311-ausculta-waves

- Tarih: 2026-10-02 17:29
- Commit: T311: Ausculta — eksik 22 kaydın dalga zarfı (KAUH posterior, S4); kapsama testi
- Dal: task/T311-ausculta-waves

---

# T311 özet
- 22 kütüphane kaydının (21 KAUH posterior, sounds-external.json; 1 HLS S4 konumsuz) dalga zarfı yoktu → çalarken panel boş.
- Üretici (egemed-tools/ausculta-learn/build_learn.py) artık tüm doğrulanmış kayıtları + KAUH kayıtlarını kapsıyor; WAV okuma bozuk başlığa dayanıklı. Yalnız learn-waves.json değişti.
- Test: çözücünün çaldığı her kaydın zarfı var (eski veriyle kırılır, doğrulandı).
