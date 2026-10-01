# T287-arena

- Tarih: 2026-10-01 07:30
- Commit: T287: Meydan Okuma premium 1v1 ekranları — meydan, bekleme odası, maç, sonuç; rakibin son 5 sonucu; karşılaşma ifadeleri (Claude)
- Dal: task/T287-arena

---

# T287 — Meydan Okuma premium 1v1 ekranları

Yazan: Claude (Opus 5.5). Onay: Karşılaşma maketi v3 (artifact Gv96Jsk1yoWvKHzs1WfnmH), "ekranlar harika bunları 3 sim içinde uygula"; ifade kararları: "meydan", "karşılaşma", madalya simgesi.

## Ne değişti
- `apps/shell/src/challenges/arena/ArenaParts.tsx`: sahne, VS kompozisyonu, kural hapları, kod karoları, adil oyun notu, karşılaşma satırı (rakibin son 5 sonucu adın sağında), kariyer paneli.
- `ChallengesPage` → meydan: davet et / kodla katıl, aktif ve son karşılaşmalar, kariyer (G/B/M, son 5, sıradaki rozet, farklı rakipler; "puan aylık sıralamaya girmez").
- `ChallengeDetailPage` → bekleme odası (kod karoları), maç (skor gizli durumları), sonuç (bant, taç, puan/süre çubukları, rövanş), süresi dolmuş.
- API/sözleşme: `challengeParticipantSchema.recentForm` (son 5 sonuç; ad/puan taşımaz), `recentDuelForm` (`apps/api/src/me/challenges.ts`).
- Metin: `challenges.*` içindeki "düello" ifadeleri "karşılaşma" oldu; `icons.Medal`.
- Eski `.eg-shell-duel__*` sayfa CSS'i kaldırıldı (geri bağlantı, rozet, başlık satırı kaldı).
- `e2e/auth-api.spec.ts` karşılaşma akışı yeni seçicilere taşındı (API gerektirir, `pnpm e2e:api`; bu oturumda koşulmadı).

## Doğrulama
- `tests/shell` 280 yeşil.
- Geçici Vite harness'iyle (silindi) 1280/390 ekran görüntüleri: meydan, bekleme odası, maç, kazanma/kaybetme.
