# T293-cleanup

- Tarih: 2026-10-01 08:02
- Commit: T293: Opaca Podyum rozeti ölü kodu (Claude)
- Dal: task/T293-cleanup

---

# T293 — Temizlik

Yazan: Claude.
- Opaca: T277 ile kaldırılan Podyum rozetine ait `lockedNote` ölü kodu silindi (AchievementsScreen, opacaGami).
- Denetim bulgusu "kabukta kullanılmayan assessment-bank bağımlılığı" YANLIŞ: `apps/shell/src/sims/devLocalSessions.ts` kullanıyor; dokunulmadı.
- Kapı 17/17, 1937 test.
