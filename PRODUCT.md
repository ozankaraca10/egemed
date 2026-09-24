# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

## Users

**Primary:** Tıp fakültesi öğrencileri — klinik becerileri (EKG, oskültasyon, radyolojik görüntüleme) sistematik inceleme, uygulama ve değerlendirme modlarında pekiştirmek için platformu kullanır.

**Secondary:** Kurum yöneticileri — kullanıcıları, simülatör erişimini, rolleri ve denetim kayıtlarını yönetir.

**Operating context:** Ege Üniversitesi Tıp Fakültesi; ders, ödev ve not defteri Moodle'da kalır; öğrenci verisi kurum altyapısında tutulur.

## Product Purpose

EGEMED, Pulse, Ausculta ve Opaca simülatörlerini tek React platformu içinde ayrı modüller olarak sunan mobil uyumlu klinik öğrenme deneyimi platformudur. Öğrenciler gerçek klinik veri setleriyle bireysel pratik yapar; yöneticiler erişim ve denetimi merkezi kabuktan yönetir.

**Success:** Öğrenci bir simülatörde inceleme → uygulama → değerlendirme döngüsünü tamamlar; ilerleme sim bazında görünür; sim verileri birbirine karışmaz.

## Positioning

Üç klinik simülatör tek kabukta, ortak aile tasarım dili ve mod kimliği (İnceleme yeşil / Uygulama mavi / Değerlendirme mor) ile sunulur; SCORM/iframe yerine yerel React gömme (ADR-006). Simülatör verileri hiçbir yüzeyde birleştirilmez.

## Operating Context

- Geliştirme girişi: `#/giris/admin` (admin/egemed), `#/giris/test-ogrenci` (ogrenci/egemed) — yalnız `import.meta.env.DEV`.
- Ana rotalar: ana sayfa, simülatörler, görevler, not defteri; admin: panel, kullanıcılar, içe aktarma, roller, denetim.
- Sim rotaları: `#/sims/pulse`, `#/sims/opaca`, `#/sims/ausculta` (ausculta henüz yer tutucu).
- Saat: `Europe/Istanbul`; `now` bağımlılık olarak enjekte edilir.

## Capabilities and Constraints

- **Dil:** Arayüz metinleri Türkçe; tek kaynak `packages/ui/i18n/tr.ts` (sim paketlerinde geçiş süreci devam ediyor).
- **Tasarım:** Renkler `packages/tokens/family-tokens.css`; yeni renk eklenmez. Görsel dil referansı: egemed-sim-ui-ux-framework (bileşenler, docs/01–04).
- **Erişilebilirlik:** WCAG 2.2 AA; dokunma hedefleri ≥44 px; doğrulama genişlikleri 360 / 768 / 1440 px; yatay kaydırma yok.
- **Veri:** Mock veri deterministik tohumlu; gerçek öğrenci verisi repoya girmez.
- **Açık karar:** Ausculta modülü S18a'ya dek kabukta "Yakında" rozetiyle yer tutucuya bağlı.

## Brand Commitments

- **Ton:** Premium tıp eğitimi — sakin, güvenilir, kurumsal; panik veya oyunlaştırma abartısından kaçınma.
- **Kurum:** Ege Üniversitesi Tıp Fakültesi kimliği giriş ekranı, footer ve güven kanıtlarında görünür.
- **Terminoloji (hedef):** Pedagojik üçlü **İnceleme / Uygulama / Değerlendirme**; mod renkleri yeşil / mavi / mor.

## Evidence on Hand

- Tasarım token'ları: `packages/tokens/family-tokens.css`
- UI bileşen kütüphanesi: `packages/ui`
- Kabuk: `apps/shell`
- Sim paketleri: `packages/sim-pulse`, `packages/sim-opaca`, `packages/sim-ausculta`
- ADR/spec: `docs/adr`, `docs/specs`
- Canlı önizleme: `cd apps/shell && npx vite --port 5177`

## Product Principles

1. **Sim verisi ayrı kalır** — öğrenci ilerlemesi sim bazında; platform genelinde birleştirilmiş skor yok.
2. **Kurumsal güven** — fakülte denetimi, veri gizliliği ve açık atıf ana sayfada görünür.
3. **Tek dil, tek token kaynağı** — Türkçe copy ve aile renkleri merkezi; sapma geçici teknik borç olarak işlenir.
4. **Mobil önce klinik pratik** — öğrenci telefon/tablet'te kesintisiz mod geçişi yapabilmeli.
5. **Erişilebilirlik şart** — klavye, odak, kontrast ve renk-dışı durum işaretleri üretim öncesi kapıdır.

## Accessibility & Inclusion

WCAG 2.2 AA zorunlu. Tam klavye gezinmesi, görünür `:focus-visible` halkaları, anlamlı başlık hiyerarşisi, `aria-current` ile gezinme durumu, form etiketleri ve `role="alert"` hata kutuları. `prefers-reduced-motion` tüm yüzeylerde tutarlı olmalıdır.
