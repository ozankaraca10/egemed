# T307-ausculta-learn

- Tarih: 2026-10-02 09:43
- Commit: T307: Ausculta öğrenme modu yeniden tasarımı — sentetik + gerçek hasta örnekleri, lateral görünüm, 60 sn dinleme kapısı, tüp 2×, dalga paneli
- Dal: task/T307-ausculta-learn

---

# T307 özet

## Yapılan
- Öğrenme: konu başına örnek 1 çok noktalı sentetik (HLS kütüphanesi ya da yeni 4 konuda bölgesel model),
  örnek 2–4 envanterden gerçek hasta (bulgunun duyulduğu nokta sayısı çoktan aza). Seviyesiz kaynaklarda
  kısa not. Gerçek kadın hastada kadın figürü. Lateral görünüm (manken renderı), anterior/posterior adları.
- Karma konularda kalp/akciğer katman düğmesi. Yalnız "Acil" rozeti (AF, AV blok, stridor).
- 60 sn dinleme kapısı: yalnız ses çalarken ve stetoskop konunun noktasındayken sayılır (tıklama sayılmaz);
  depo `ausculta.learn.seconds` ({konu: sn}).
- Tüp uzunluğu 2× (ikili aramayla sarkma), sürüklenebilir stetoskop korunur. Grid 22/47/31.
- Dalga paneli (zarf + kaynak işaretleri), DOI bağlantılı kaynaklar.
- Kullanılmaz kalan `planLibraryViews` ve learning-samples hattı kaldırıldı.

## Testler (TEST-POLİTİKASI 4 soru)
- steth-tube "~2× uzunluk": tüp uzunluğu davranışı; FACTOR geri 1'e inerse kırılır (doğrulandı); önceki testler
  uzunluğu ölçmüyordu; üretim açıklığı gerekmedi.
- learn-sets: örnek sırası (sentetik önce, gerçekler azalan) ve her noktanın gerçek noktaya + klibe bağlanması;
  üretici bozulursa kırılır; başka test yoktu; açıklık yok (modül zaten dışa açık).
- learn-lock: 60 sn eşiği ve tıklamanın sayılmaması; eski "≥1 dinleme" testlerinin yerine.
- e2e ausculta-learn-layout ölçütü: sabit 1200 px yerine içerik altı boş alan ≤64 px (T206 amacı korunur).

## Notlar / açık
- Öğrenme klipleri (~180, ~11 MB) git dışı `packages/sim-ausculta/public/assets/audio/runtime/learn/`
  (ana ağaçta). Üretim dağıtımına da kopyalanmalı; üretici: `egemed-tools/ausculta-learn/build_learn.py`.
- Hız (0,5/1/2×) uygulamada yok (WebAudio perde sorunu).
- Toolbar kilit gerekçesi "Bu vakada …" öğrenmede de aynı metni kullanır.
- Sonra: soru aşamasında gövde simülatörü yok, yalnız dalga + ek bilgi (memory klinik-vinyet-plani).
