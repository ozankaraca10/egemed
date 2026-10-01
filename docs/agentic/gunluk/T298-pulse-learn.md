# T298-pulse-learn

- Tarih: 2026-10-01 16:32
- Commit: T298: Pulse öğrenme modu gerçek 12 derivasyon EKG, dört boşluklu kalp ve EKG altında patern bilgisi
- Dal: task/T298-pulse-learn

---

# T298 — Pulse öğrenme modu: gerçek 12 derivasyon EKG çalışma alanı (Opus 5.5)

Maket: https://claude.ai/artifact/J4FHJmQuMCVCEbnaNRpEWz (1 Eki 2026 onay; "Öğretim Üyesinin Seçtiği Kayıtlar" başlığı kullanıcı isteği).

## Yapılan
- `packages/sim-pulse/src/learn/`:
  - `content.ts`: 29 patern için öğrenci metni (rehber ölçütü / bu kayıtta bakın / kalpte ne oluyor; AHA/ACCF/HRS, 4. UDMI, ESC 2023), kalp fizyoloji profili, 23 kaynak moduna eşleme (mi_anterior→stemi, mi_inferior→inferior). Seçim sürecinin notları (pats.json "aday", "Claude kontrolü") öğrenciye gösterilmez.
  - `ecg.ts`: int16le µV lead-major çözme; çok derivasyonlu eğim enerjisiyle R tepesi saptama (kenar 100 ms geçişleri atılır); RR istatistiği. 60 kaydın tümünde Python referansıyla ≤60 ms uyumlu.
  - `heart.ts`: dört boşluklu kesit; R'ye kilitli sistol/diyastol, duvar kalınlaşması, kapaklar, SA→AV→His→dallar kıvılcımları. Profiller: AF titreşim, flutter 0,2 s, kavşak/SVT retrograd, tam blok bağımsız atriyum, Mobitz'te uzun RR'de iletilmeyen P, dal blokunda geciken taraf, WPW aksesuar yol, VT apeks odağı, VF düzensiz, MI'da zayıf LV.
  - `workspace.ts` + `styles.ts`: patern rayı, kalp, kayıt seçimi, ölçümler, 4×3 + DII ritim şeridi kâğıt (25/50 mm/s, 5/10/20 mm/mV), kilitli kaliper (sürükle, ok tuşları, ±20 ms, RR'ye eşitle), EKG altında sabit "Bu patern hakkında".
- İlerleme kaynağın `state.viewed[mod]` (≥16 s, `persist()`) sayacına yazılır → vaka/sınav kilidi, `pulse:learn-complete`, oyunlaştırma değişmeden çalışır. Kaynak modu olmayan 6 MI alt paterni "EK" etiketli, yerel (`pulse.learn.extra`) işaretlenir, kilidi etkilemez.
- Vendor öğrenme alanı (ritim sekmeleri, workspace, transport, koç) CSS ile gizlendi; kaynak kodu silinmedi.
- Vendor dar ekran kuralı `nav{width:100%;justify-content:center}` rayı bozuyordu; `.pl-rail` kendi genişliğini ezer.

## Testler (yazım kapısı)
- `tests/sim-pulse/learn-ecg.test.ts` (3): (1) ikili biçim çözme — endian/düzen hatası kırar; (2) seçilen kayıtlarda saptanan hızın rehber ölçütüne uyması (tıbbi veri doğrulama) — eşik/saptama gerilemesi kırar; (3) 29 paternin metni ve 23 kilit modunun eksiksiz eşlenmesi — kilidin açılamaması kırar. Mevcut testler yeni modülü kapsamıyordu; üretime test açıklığı eklenmedi.
- e2e `pulse-runtime.spec.ts`: eski öğrenme testleri (#playBtn, #heartSvg, ritim sekmeleri) yeni alana uyarlandı; yeni: inceleme süresi sayacı. `pulse-a11y`: öğrenme ekranı yeni oynat düğmesi; izin listesi 'sim' küçük hedefleri 5→0 (vendor katman menüsü gizli, tüm hedefler ≥44 px).
- Yerel: pulse-runtime + pulse-a11y 46/46 (360/768/1440).

## Notlar / karar bekleyenler
- Kilit 23 modla sınırlı; 6 MI alt paterni zorunlu yapılmak istenirse vendor durum sürümü (v6) değişmeli.
- `mi_posterior` kayıt bekliyor (devre dışı).
