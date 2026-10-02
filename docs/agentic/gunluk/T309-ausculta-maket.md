# T309-ausculta-maket

- Tarih: 2026-10-02 16:03
- Commit: T309: öğrenme ilerleme başlığı .learn-progress işaretini taşır (e2e rota testleri)
- Dal: task/T309-ausculta-maket

---

# T309 özet
- Düzen maketle birebir: ray 264 px, orta en çok 424 px; her sütun kendi içinde kayar, belge 1440x900de kaymaz.
- Görünüm düğmeleri sahne üstünde (4 görünüm hep çizilir, kaydı olmayan kilitli: "Bu örnekte ... kayıt yok"); karma konuda katman düğmesi ve "Figür" rozeti sahnede.
- Sağda koyu oynatıcı: dalga hep dolu (yerleşmeden önce ilk odak önizlenir), ▶ Dinle/❚❚ Durdur (stetoskobu yerleştirir, 5 sn sayacı işler), Bell/Diyafram.
- Renk: maketin camgöbeği packages/tokens/ausculta.css içinde --aus-*; AA için etkin düğmeler --aus-700.
- Kaldırılanlar (makette yok): bölge çipleri, araç çubuğu ses düzeyi, sahne içi sürükleme ipucu. Hız ve döngü yok.
- Kabuk üst bar/alt bilgi yüksekliği CSSde sabit (3.3125rem/2.5625rem, Pulse ile aynı yöntem).
