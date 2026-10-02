# T316-opaca-yerel-yol

- Tarih: 2026-10-02 18:28
- Commit: T316: Opaca — ADR-009 sonrası yerel puanlama yolu söküldü; puanlama testleri bankaya taşındı
- Dal: task/T316-opaca-yerel-yol

---

# T316 özet (şekil değişikliği)
Önce: Opaca istemcisinde sunucu oturumunun yanında yerel puanlama yolu — reducer `finishCase` (computeCaseResult:
scoreCase + practiceAdjusted, `case_completed` yayımı), `startSession`, `setResults`; birincil eylem planı sahte
`finishCase` üretip ekran süzüyordu; plan istemcide `isAnswerCorrect` ile doğruluk hesaplayıp sunucuyla eziyordu.
Sonra: Ausculta (T313) ile aynı tek akış — plan { submitQid, advance, finish }; doğruluk ve sonuç sunucudan.
Telemetri: yerel dal hiç tetiklenmiyordu, sunucu dalı bilerek `case_completed` yaymıyor → kayıp yok.
Silinen: scoreCase, practiceAdjusted, HINT_PENALTY_PRACTICE, computeCaseResult (istemci), 3 reducer eylemi,
plan.saveInteractions (hiçbir ekran okumuyordu).
Testler: istemci puanlama testleri (9) bankaya taşındı (tests/assessment-bank/opaca-scoring.test.ts); iki "diferansiyel"
test silinmedi, gradeCase ↔ anahtarlı scoreCase jeton çözümü testine yeniden hedeflendi; en iyi puan / sonuç ekranı /
askıya alma testleri sonuç verisini tests/sim-opaca/score-fixture.ts (banka puanlaması, tek yerde tip dönüşümü) ile kurar
ve oturumu `serverFinished` ile bitirir.
Kapsam dışı (sonraki aday): SCORM yanıt kayıt kanalı — `runtime.saveInteractions` / `recordInteraction` iki simde de
yalnız testlerden çağrılıyor; `isAnswerCorrect` ve `markToScorm` bu kanalın son kullanıcıları. Ausculta'da plan.saveInteractions
ve plan.latency alanları da okunmuyor (T315 sim-ausculta'da çalışırken dokunulmadı).
