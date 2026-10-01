# T290-server-learn-lock

- Tarih: 2026-10-01 07:38
- Commit: T290: sunucu öğrenme kilidi — uygulama/değerlendirme oturumu learn_required (Sonnet; doğrulama: Claude)
- Dal: task/T290-server-learn-lock

---

# T290 — Sunucuda öğrenme kilidi (uygulama/değerlendirme oturumu)

Yazan: Sonnet (egemed-sonnet-z3), oturum sınırında yarıda kaldı; özet ve doğrulama Claude.

## Ne değişti
- `apps/api/src/me/learn.ts`: ortak `hasCompletedLearn` + `learnRequiredError` (403 `forbidden`, `issues: [{code: "learn_required"}]`).
- `apps/api/src/me/simSessions.ts`: `POST /me/sims/:simId/sessions` — `actor.gamified` öğrenci, admin değilse ve simin tamamlama kaydı yoksa `learn_required`. Admin, öğretim üyesi ve uzmanlık öğrencisi muaf.
- `apps/api/src/me/challenges.ts`: aynı yardımcıyı kullanır (davranış değişmedi).
- Testler: `tests/api/learn.test.ts` kilit + muafiyet; oturum testleri harness'te tamamlama kaydıyla uyarlandı.
- Şemalar: `docs/sema/urun.md` (Önemli bulgu → kapatıldı, kilit diyagramı), `docs/sema/akislar.md` Bölüm 1 notu.

## Doğrulama
`pnpm turbo lint typecheck test` 17/17, 1933 test yeşil.

## Risk / not
- API e2e (`pnpm e2e:api`) bu oturumda koşulmadı; API e2e akışlarında oturum açmadan önce öğrenme tamamlanmıyorsa artık 403 alır.
- İstemci tarafında `learn_required` için özel ileti yok; normalde istemci kilidi bu durumu zaten engelliyor (kapı savunma derinliği).
