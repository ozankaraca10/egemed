---
name: EGEMED Klinik Öğrenme Deneyimi Platformu
description: Ege Üniversitesi Tıp Fakültesi — sakin, güvenilir, premium klinik simülasyon kabuğu ve aile sim UI
colors:
  navy-900: "#0a2a5e"
  navy-800: "#0d346f"
  navy-700: "#10457e"
  blue-700: "#0f62d8"
  blue-600: "#1673e6"
  blue-50: "#eff6ff"
  ink-900: "#0b2559"
  ink-600: "#46618c"
  green-600: "#16a34a"
  purple-600: "#7c3aed"
  card: "#ffffff"
  border: "#d9e5f4"
  bg-grad-b: "#f6faff"
  red-600: "#b91c1c"
typography:
  body:
    fontFamily: "'Segoe UI','SF Pro Text',-apple-system,BlinkMacSystemFont,Roboto,'Helvetica Neue',Arial,sans-serif"
    fontSize: "var(--fs-md)"
    fontWeight: 400
    lineHeight: 1.5
  page-title:
    fontFamily: "{typography.body.fontFamily}"
    fontSize: "var(--fs-2xl)"
    fontWeight: 800
    lineHeight: 1.15
  section-title:
    fontFamily: "{typography.body.fontFamily}"
    fontSize: "var(--fs-xl)"
    fontWeight: 700
    lineHeight: 1.2
rounded:
  sm: "6px"
  md: "10px"
  lg: "14px"
  xl: "22px"
  pill: "999px"
spacing:
  touch-min: "44px"
  sp-2: "8px"
  sp-3: "12px"
  sp-4: "16px"
  sp-5: "24px"
  sp-6: "32px"
components:
  button-primary:
    backgroundColor: "{colors.blue-700}"
    textColor: "{colors.card}"
    rounded: "{rounded.md}"
    padding: "0 24px"
    height: "{spacing.touch-min}"
  button-secondary:
    backgroundColor: "{colors.blue-50}"
    textColor: "{colors.navy-900}"
    rounded: "{rounded.md}"
    padding: "0 16px"
    height: "{spacing.touch-min}"
  card-surface:
    backgroundColor: "{colors.card}"
    textColor: "{colors.ink-900}"
    rounded: "{rounded.lg}"
    padding: "16px"
---

## Overview

EGEMED görsel dünyası **Operate** modunda çalışır: öğrenci ve yönetici görevi tamamlar; marka ifadesi lacivert üst bar, klinik güven tonu ve mod renkleriyle gelir. Kabuk (`apps/shell`) ve `@egemed/ui` aile token'larını (`packages/tokens/family-tokens.css`) doğrudan kullanır; sim paketleri aynı paleti köprü değişkenleriyle paylaşır.

**Mod kimliği (normatif):**

| Mod | Renk | Token |
|-----|------|-------|
| İnceleme | Yeşil | `--green-600`, `--green-50` |
| Uygulama | Mavi | `--blue-600`, `--blue-50` |
| Değerlendirme | Mor | `--purple-600`, `--purple-50` |

## Colors

- **Kroma:** Lacivert degrade üst bar (`--navy-900` → `--navy-700`), gövde `--bg-grad-b`, kart `--card`, metin `--text` / `--muted`.
- **Durum:** Başarı yeşil, uyarı turuncu/amber, hata kırmızı (`--red-600`, `--red-100`).
- **Yasak:** CSS'te ham hex renk literali (kabuk ve `packages/ui`); sim tıbbi görselleştirme SVG/canvas istisnası.
- **Alan rengi:** Pulse EKG sahnesi `--cyan` yalnız monitör içinde; UI kromunda kullanılmaz.

## Typography

- Gövde **14px sabit** — yalnız `var(--fs-xs)` … `var(--fs-3xl)`; px `font-size` yasak (kabuk/ui).
- Sayfa başlığı `--fs-2xl`, bölüm `--fs-xl`, hero `clamp(--fs-2xl, 5vw, 2.5rem)`.
- Ağırlık: marka adı 800, CTA 700, gövde 400–600.

## Layout

- **Mobil öncelik:** `<768px` alt sekme çubuğu (ikon + etiket); `≥768px` üst bar gezinme; `≥1440px` admin filtre ızgarası genişler.
- **İçerik genişliği:** `main` max-width 72rem, ortalanmış.
- **Dokunma:** `--eg-shell-touch-min: 44px` (kabuk); tüm birincil etkileşimler bu eşiği karşılamalı.
- **Safe area:** Alt nav ve giriş paneli `env(safe-area-inset-bottom)` kullanır.

## Elevation & Depth

- Kart: `--shadow-card` (hafif, lacivert tonlu gölge).
- Popover/modal/bulk bar: `--shadow-pop`.
- Üst bar: degrade + `border-bottom: 1px solid var(--navy-700)`; alt sekme `border-top: 1px solid var(--border)`.

## Shapes

- Kart köşesi `--r-lg` (14px); hero `--r-xl`; rozet/pill `--r-pill`.
- Mod adım kartları üst şerit (4px) + `--radius` — renk yalnızca ipucu; numara + başlık birincil ayırt edici.

## Components

| Bileşen | Kaynak | Not |
|---------|--------|-----|
| `Card`, `Badge`, `Tabs`, `Modal`, `Table`, `ModeCard` | `@egemed/ui` | Kabuk ve admin tüketir |
| Topbar / footer / mode-card | `apps/shell/src/shell.css` | Framework topbar/footer desenleri |
| Sim kartı | `SimCard.tsx` + `eg-shell-sim__*` | Logo, rozet, CTA |
| Giriş paneli | `EntryPage.tsx` | İki sütun; mobil tek sütun |
| Sim host | `SimRoute.tsx` | Üst bar + host alanı |

## Do's and Don'ts

**Do**

- Renk, tipografi ve boşluğu `family-tokens.css` üzerinden kullan.
- Metinleri `t()` ile `tr.ts`'den al (kabuk/admin).
- `aria-current="page"`, skip link, `:focus-visible` halkası ve tek `h1` kuralına uy.
- Mod renklerini yeşil/mavi/mor üçlüsüyle tutarlı uygula.

**Don't**

- Yeni marka rengi icat etme; mevcut token dışına çıkma.
- Öğrenciye `internal_error` veya ham API kodu gösterme.
- "Yakında" rozeti olan sim için aktif "Simülatörü aç" CTA sunma.
- Sim paketlerinde kabuktan farklı mod adı (ör. "Öğrenme Modu" vs "İnceleme") kullanma — platform terimleri hizalanmalı.
