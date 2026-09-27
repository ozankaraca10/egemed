# Mimari karar kayıtları (ADR)

Bu dizin EGEMED mimari kararlarının taslaklarını barındırır. Taslaklar
insan onayına sunulur; öneri metni karar değildir.

| ADR | Konu | Durum |
|---|---|---|
| [ADR-001](001-monorepo.md) | Monorepo | Kabul |
| [ADR-002](002-yigin.md) | Yığın (kabuk ve API) | Kabul |
| [ADR-003](003-gomme.md) | Simülatör gömme modeli | Kabul |
| [ADR-004](004-lrs.md) | LRS ve xAPI ifade iletimi | Kabul |
| [ADR-005](005-kimlik.md) | Kimlik ve öğrenci tanımlayıcısı | Kabul |
| [ADR-006](006-tek-platform.md) | Tek platform — simülatörler iç modül (hibrit) | Kabul |
| [ADR-007](007-kimlik-ve-kullanici-verisi.md) | Kimlik, kullanıcı kaydı ve oyunlaştırma verisi | Kabul |
| [ADR-008](008-rozetler-sunucuda.md) | Rozetler sunucuda değerlendirilir (sime özgü saf katalog paketi) | Kabul |
| [ADR-009](009-sunucuda-puanlama.md) | Değerlendirme sunucuda puanlanır; cevap anahtarı istemciye gitmez | Kabul |
| [ADR-010](010-meydan-okuma.md) | Meydan Okuma: eşzamansız, süreli düello | Kabul |

`Durum: Kabul` satırını yalnız insan yazar. ADR-006 (23 Eylül 2026) ADR-003'ün gömme modelini iç modülle değiştirdi; veri izolasyonu kuralı geçerli. Astra ikinci görüşü her ADR'de
`Bekleniyor.` olarak durur; bulgular gelene kadar karar kaydı tamamlanmış
sayılmaz.
