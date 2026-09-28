# Opaca — görüntüye özgü lokalizasyon: geliştirme notları

Bu dosya, Opaca'nın bölge işaretlemelerinin yeniden yapılandırılma sürecini adım adım kaydeder; Hakkında sayfasındaki geliştirme hikayesinin kaynağıdır. Her adım olduğu gün eklenir.

## 28 Eylül 2026

1. **Uzman geri bildirimi.** Uzman hekimler Opaca'daki bölge işaretlemelerinin önemli bir kısmının uygunsuz olduğunu bildirdi; örnek olarak diyafram işaretlemeleri ve lateral grafiler öne çıktı.
2. **Sorunun analizi.** 596 görüntü incelendi (163 PA, 176 AP, 7 lateral, 9 BT kesiti, 1 boyun AP, 241 projeksiyonu kayıtsız; kaynaklar NIH ChestX-ray14, NLM TB, Kermany pediatrik, Europe PMC, Wikimedia Commons, TCIA LIDC-IDRI).
   - ABCDE sistematik okuma bölgeleri (trakea, 6 akciğer zonu, kalp, mediasten, sağ/sol diyafram, diyafram altı, kemikler — 14 bölge) **tek bir şematik PA şablonundan, sabit oranlarla tüm filmlere** uygulanıyordu.
   - Görüntü üzerine çizimle doğrulandı: lateral filmde PA zonları anatomik karşılıksız; pediatrik filmde zonlar ve diyafram kutuları karaciğere/karına kayıyor; yetişkin PA'da diyafram kutuları kubbelere oturmuyor, sol diyafram mide gazına taşıyor, kalp sol sınırı ve kostofrenik açılar dışarıda kalıyor.
   - 411 görüntüde bulguya özgü uzman kutusu yok; 187 görüntüde uzman kutusu (expert bbox) var.
3. **Karar (depo sahibi).** Sabit koordinat kullanılmayacak; her görüntünün bölgeleri kendi anatomisine göre belirlenecek. Önce ekip optimize edecek, ardından hekim onayına sunulacak.
4. **Yöntem.**
   - Frontal (PA/AP, pediatrik dahil) filmler: açık kaynak göğüs grafisi segmentasyon modeli (TorchXRayVision PSPNet, Apache 2.0) ile her filmde akciğerler, kalp, mediasten, trakea, diyafram yüzeyleri, klavikula, skapula ve omurga bulunur; ABCDE bölgeleri bu yapılardan görüntü başına hesaplanır (akciğerler kendi yüksekliklerine göre üst/orta/alt, diyafram kutusu kubbe ve kostofrenik açıyı içerir, kalp gerçek sınırından).
   - Lateral filmler: lateral grafiye özgü okuma bölgeleri (retrosternal ve retrokardiyak alan, omurga, arka kostofrenik sinüsler, diyafram kubbeleri) görüntü başına elle yerleştirilir.
   - BT kesitleri: ABCDE bölgeleri gösterilmez.
   - Bölgesi hesaplanamayan görüntü şablona düşmez; işaretlenir.
   - Kalite kontrol: otomatik anatomik tutarlılık denetimi + görsel inceleme, ardından hekim onay sayfası.
