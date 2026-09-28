# Ausculta — geliştirme notları

Bu dosya, Ausculta'nın geliştirme sürecini adım adım kaydeder; Hakkında sayfasındaki geliştirme hikayesinin kaynağıdır. Her adım olduğu gün eklenir.

## 28 Eylül 2026

1. **Ses ve etkileşim düzeltmeleri.** Ses aç/kapat düğmesi kaldırıldı (dinleme simülatöründe ses her zaman açık). Ardından ortaya çıkan ses sorununun kök nedeni bulundu: hasta sahnesi tarayıcı zamanlayıcısına bağlı değildi ve ses motoru dosya isteğinde tarayıcının kabul etmediği bir iptal sinyali kullanıyordu; ikisi düzeltildi.
2. **Posterior akciğer seslerinde gerçek hasta kayıtları.** Önceden tüm akciğer kayıtları mankenden ve ön yüzdendi; 6 posterior noktada ön yüz kaydı çalınıyordu. Açık erişimli, bölge etiketli KAUH veri kümesinden (Ürdün Üniversitesi Hastanesi, 112 hasta, 3M Littmann 3200, CC BY 4.0) 86 gerçek hasta posterior kaydı eklendi: normal solunum 29, wheezing 33, ince raller 18, kaba raller 6. Bulgu eşlemesi hastalık bağlamına göre yapıldı (kalp yetmezliği ve fibrozis → ince ral; bronşit ve pnömoni → kaba ral) ve öğretim üyesi onayına işaretlendi.
3. **Pediatrik posterior kayıtlar.** Açık erişimli SPRSound veri kümesinden (Şanghay Çocuk Tıp Merkezi, CC BY 4.0) 1,4–11,7 yaş çocuklardan saf ronküs ve wheezing kayıtları, olay kapsamı en yüksek olanlar seçilerek eklendi; pediatrik wheezing vakası artık yetişkin değil çocuk kayıtlarını çalıyor, yeni bir pediatrik ronküs vakası yazıldı. Çocuk kayıtlarının yetişkin vakalara karışmaması testle güvence altına alındı.
4. **Karma vakalarda posterior akciğer bileşeni.** Sırtta kalp sesi zayıf duyulduğundan, kalp+akciğer karma vakalarda posterior noktada o noktanın gerçek akciğer kaydı çalınmaya başlandı; kaydı tam olan vaka oranı %57'den %79'a (114 → 158/199) çıktı. Posterior ronküs ve plevral sürtünme için açık veri kümelerinde bölge etiketli kayıt bulunamadı (HF_Lung, ICBHI, SPRSound incelendi).
5. **Vaka türüne göre görünüm.** Yalnız akciğer bulgusu olan vakalar arka, yalnız kalp bulgusu olanlar ön görünümle açılıyor; karma vakalarda ikisi de açık, dinlenecek noktası olmayan görünüm kapalı. Kural öğrenme, uygulama, değerlendirme ve düelloda aynı.
6. **Gerçekçi stetoskop.** Dinleme başlığına ses iletim tüpü eklendi: tüp sol üstteki kulaklıktan sarkarak başlığa sol alt 45°'den bağlanıyor ve başlığı takip ediyor; kulaklık bölümü gerçek oranında (göğüs parçasının ~3,2 katı).
