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

## 29 Eylül 2026

6. **Lateral grafiler.** "Lateral" etiketli 7 görüntünün yalnız 3'ünün gerçek göğüs lateral grafisi olduğu görüldü; biri aslında frontal (PA) göğüs grafisiydi (yeniden sınıflandırıldı), ikisi boyun grafisiydi (göğüs okuma bölgeleri uygulanmaz), biri çok panelli dergi figürüydü (tek film değil; hekime sorulacak). Üç gerçek lateral grafiye lateral grafiye özgü 10 okuma bölgesi (trakea, retrosternal ve retrokardiyak boşluk, kalp, hilus, diyafram kubbeleri, arka kostofrenik sinüs, omurga, sternum, diyafram altı) filmin yönüne göre (ön yüz solda/sağda) tek tek yerleştirildi.
7. **Toplu hesap.** 580 frontal filmin 518'i tüm anatomik tutarlılık denetimlerinden geçti. Denetime takılanların çoğu yanlış alarmdı: derin kostofrenik açılı uzun akciğerlerde diyafram kutusunun yüksek olması doğaldı; üstten kırpılmış 16 filmde trakea görüntüde yoktu (o filmde trakea bölgesi gösterilmiyor). Akciğeri bulunamayan 11 görüntünün çoğu standart göğüs grafisi değildi (klavikula yakın çekimi, kontrastlı çalışma, skolyoz filmi, boyun grafileri, çok panelli figürler); bunlara göğüs okuma bölgesi uygulanmadı. Gerçek göğüs grafisi olup modelin başaramadığı iki film — biri sağ hemitoraksta tam opasiteli, klinik açıdan çok öğretici bir örnek — elle işaretlendi.
8. **Sonuç veri seti.** 597 görüntünün 575'i görüntüye özgü okuma bölgeleriyle (571 segmentasyon, 2 elle frontal, 3 elle lateral), 22'si gerekçesiyle bölgesiz (BT kesitleri, boyun grafileri, çok panelli figürler, odaklı yakın çekimler). Sabit şablon koordinatı artık hiçbir görüntüde kullanılmıyor. Uygulama ve değerlendirme vakaları aynı görüntüyü kullandığından bölgeleri doğrudan öğrenme modundakiyle aynıdır.
9. **Uygulamaya geçiş.** Görüntüye özgü bölgeler öğrenme, uygulama ve değerlendirme ekranlarına ve sunucu puanlamasına bağlandı; bölgesi olmayan görüntüde bölge katmanı yerine "Bu görüntü için okuma bölgesi tanımlı değil." notu çıkıyor, sistematik okuma puanlanmıyor ve ağırlığı diğer alanlara dağıtılıyor. Ardından ABCDE okumayı öğreten "Temel okuma" kategorisinden bölgesiz görüntüler çıkarıldı (sistematik okuma ve projeksiyon konularında 6'şar görüntü); bu konularda artık her örnekte okuma bölgeleri izlenebiliyor.
