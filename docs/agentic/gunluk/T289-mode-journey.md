# T289-mode-journey

- Tarih: 2026-10-01 02:12
- Commit: T289: üç simde ortak premium mod seçimi — dört modlu yolculuk (Öğrenme→Uygulama→Değerlendirme→Meydan Okuma), aylık ödül şeridi, adil oyun kuralı (Claude)
- Dal: task/T289-mode-journey

---

# T289 — Ortak premium mod seçimi (dört modlu yolculuk)

Yazan: Claude (Opus 5.5). Depo sahibi onayı: mod seçimi maketi v2 (artifact PTc4ZcLeZJfMo6XpjZ71SN), "ekranlar harika bunları 3 sim içinde uygula".

## Ne değişti
- `@egemed/gami-ui` `GamiModeJourney` + `GamiFairPlay` + `GAMI_FAIR_PLAY_TEXT`: Öğrenme (yeşil) → Uygulama (mavi) → Değerlendirme (mor) → Meydan Okuma (koyu lacivert/altın) yolculuğu; öğrenme halkası, kilit mührü, aylık ödül şeridi ("ilk N kişiye · X gün"), adil oyun kuralı.
- Opaca ve Ausculta `ModeSelectScreen` bileşeni kullanır; `openChallenges` SimModule → App → bağlam kancası (`useOpenChallenges`) ile 4. karta bağlandı. Eski `ModeCard` ve ölü `.mode-card*` CSS kaldırıldı.
- Pulse: kaynak `renderModes` aynı işaretlemeyi üretir (sınıf/`data-view` kancaları korunarak kitle, sunucu ve ödül ekleri çalışmaya devam eder); `challengeCard.ts` 4. kartı kabuğa bağlar, öğretim üyesinde pasif, öğrenciye adil oyun notu ekler. gami-ui stilleri gölge köke `host.ts`'ten her kitlede eklenir; kaynak mod kartı CSS'i silindi.
- Ziyaretçi: Meydan Okuma kartı da kilitli (üç simde), kilit metni mühürde tek neden olarak görünür.
- Token: `--navy-950`, `--gold-glow` vb. (T287 ile aynı fark).

## Doğrulama
- `tests/sim-opaca`, `tests/gami-ui`, `tests/sim-ausculta` (339), `tests/sim-pulse` (134) yeşil.
- Ekran görüntüleri 1440/768/360 (üç sim): kartlar hizalı, alt bilgi görünür; 768'de 2×2, 360'ta tek sütun.
- e2e seçicileri `.mode-card.<tür> button.eg-gami-mode-cta` ve `.eg-gami-mode-status` olarak güncellendi.

## Şema
- `docs/sema/urun.md` 4. mod kartı → `openChallenges` zaten T281a/T286 ile işlenmişti; ek şema değişikliği yok (yalnız görünüm).
