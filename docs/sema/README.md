# Platform şemaları

Bu klasör EGEMED platformunun veritabanı, ürün ve mimari şemalarını Mermaid
diyagramlarıyla belgeler (T286). Tüm içerik koddan türetilmiştir; tahmin
edilen ilişki yazılmamıştır. **Şemalar kod değişince güncellenmelidir** — bu
dosyalar git dışı üretilmiş bir rapor değil, depoya işlenmiş ve elle bakımı
gereken belgelerdir.

| Dosya | İçerik | Türetildiği kaynak |
|---|---|---|
| [`veritabani.md`](./veritabani.md) | ER şeması: 18 tablo + 1 görünüm, 6 alan grubu, KVKK notları | `apps/api/migrations/001…014*.sql` |
| [`urun.md`](./urun.md) | Ürün şeması: rol → yüzey erişimi, mod kilitleri | `packages/contracts/src/ids.ts`, `packages/sim-host`, `apps/shell/src/routes.ts`, `apps/shell/src/session.ts` |
| [`mimari.md`](./mimari.md) | Paket bağımlılık grafiği, sim-host sözleşmesi, üretim dağıtımı | `*/package.json`, `packages/sim-host/src/SimHost.ts`, `infra/prod/*`, `docs/adr/*` |
| [`akislar.md`](./akislar.md) | 5 sıra diyagramı: değerlendirme, düello, aylık ödül, öğrenme/XP, giriş | `apps/api/src/me/*.ts`, `apps/api/src/auth/**`, `apps/shell/src/reportLearn.ts` |

## Doğruluk ve kapsam notu

- Kod DEĞİŞMEDİ; bu görev yalnız belge üretti.
- Gerçek veri veya sır içeren dosyalar (`packages/sim-*/src/data/*.json`,
  `packages/assessment-bank/data/**`) AGENTS.md okuma sınırı gereği toplu
  okunmadı; bu dosyalardaki iş verisi (vaka bankası içeriği vb.) şemalara
  yansımaz.
- Her dosyanın sonunda "Açık sorular" başlığı altında koddan emin
  olunamayan ya da ADR ile kod arasında sapma görülen noktalar ayrıca
  listelenmiştir (tahmin diyagrama yazılmadı).

## Güncel tutma kuralı
Şemayı etkileyen her değişiklik aynı görevde buraya işlenir (bkz. `AGENTS.md` → Şemalar). `tests/config/schema-docs.test.ts`, migration tabloları/sütunları ile ER şemasını ve sim-host sözleşme alanları/ekran anahtarları ile mimari şemasını karşılaştırır; kopukluk merge kapısında kırmızı verir.
