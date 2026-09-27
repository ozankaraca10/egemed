# A1 — Sunucu oturumu ile vaka çalışması (ADR-009 uygulaması)

- Dayanak: ADR-009 (Kabul, 27 Eyl 2026).
- Kapsam kararı (depo sahibi, 27 Eyl 2026): "Uygulamayı da sunucudan ver". Uygulama ve değerlendirme vakaları yalnız sunucuda durur; tüm havuz korunur. Öğrenme modu (etiketli kütüphane) istemcide kalır.
- Aşama sırası: Ausculta (A1) → Opaca (A2) → Pulse (A3) → eski istemci yolunun kapatılması (A4).

## 1. Neden (bulgular, 27 Eyl 2026)

Ausculta'daki 84 değerlendirme vakasının tamamı uygulama havuzunda da var. Uygulama tarayıcıda çalıştığı için şu alanlar tarayıcı paketine giriyor:
- `questions[].correct` (doğru seçenekler),
- `primaryAcousticFinding`, `clinicalDiagnosis`,
- `soundAssignments[].acousticFinding` (örn. `"normal"`),
- `title` (örn. "Normal Kardiyak Oskültasyon"),
- `objectives` (örn. "Normal S1–S2 ritmini tanımak"),
- `feedback`, `hint`.

Bu alanların herhangi biri, sayfa kaynağını okuyan bir kişiye ya da yapay zekâ aracına cevabı verir.

## 2. İstemciye giden anahtarsız vaka (`PublicCase`, Ausculta)

| Alan | Durum | Not |
|---|---|---|
| `index` (1..N), `label` ("Vaka 3") | var | Gerçek vaka kimliği ve başlığı gitmez. |
| `patient`, `chiefComplaint`, `history`, `vitalSigns` | var | Klinik öykü, soru bağlamıdır. |
| `tasks` | var | Genel yönergelerdir. |
| `views`, `allowedHeads` | var | |
| `points[]` | var | `{ pointId, audio: { bell?: token, diaphragm?: token } }`. Ses dosyası adı yerine oturuma bağlı opak jeton gider. |
| `questions[]` | var | `{ id, type, domain, prompt, help?, options[] }`. Seçenek kimlikleri oturuma özel karıştırılır. `correct`, `feedback*` ve `hint` alanları yoktur. |
| `technique` | kısmi | Yalnız `minPointsVisited` gider. `requiredPoints` gitmez, lokalizasyonu ele verir. |
| `title`, `objectives`, `primaryAcousticFinding`, `clinicalDiagnosis`, `soundAssignments`, `feedback`, `references`, `libraryKey`, `mappingNote`, `scoringWeights` | yok | |

## 3. Uçlar (`/me/*`, çerez + CSRF; yalnız öğrenci kitlesi, T171)

| Yöntem ve yol | Gövde | Yanıt |
|---|---|---|
| `POST /me/sims/:simId/sessions` | `{ mode: "practice" \| "assessment" }` | `{ sessionId, mode, caseCount, perCaseLimitMs, totalLimitMs, startedAt }`. Sunucu 10 vaka seçer; sıra ve seçenek karışımı oturum tohumuna bağlıdır. |
| `GET …/sessions/:id/cases/:index` | — | `PublicCase`. Vaka süresi ilk okumada başlar. Vakalar sırayla açılır; ileri atlama 409 döner. |
| `POST …/sessions/:id/cases/:index/hint` | `{ questionId }` | Yalnız uygulamada `{ hint }` döner, değerlendirmede 403. İpucu sayısı sunucuda tutulur. |
| `POST …/sessions/:id/cases/:index/answer` | `{ answers: { [qid]: optionId[] }, telemetry }` | Uygulamada anında geri bildirim: soru başına doğru/yanlış, doğru seçenekler, açıklama ve vaka puanı. Değerlendirmede yalnız `{ accepted: true }`. Süre aşımı 422 `case_time_exceeded` döner. Tekrar gönderim 409 döner. |
| `POST …/sessions/:id/finish` | — | Puan ve deneme kaydı sunucuda yazılır (XP, rozet, liderlik; ADR-008 yolu). Değerlendirmede tüm geri bildirim burada açılır. Yanıt: `{ total, max, passed, cases[], attempt }`. |
| `GET …/sessions/:id/audio/:token` | — | Ses baytları, `Cache-Control: private, no-store`. Jeton oturuma ve kullanıcıya bağlıdır. |

Diğer kurallar:
- Oturum 2 saat sonra geçersiz olur.
- Kullanıcı başına aynı anda en fazla 1 açık değerlendirme oturumu olabilir; saatlik oturum açma hız sınırı vardır.
- Telemetri (dinlenen noktalar, süreler) istemci beyanıdır. Teknik puanı bu beyana dayanır; belgelenmiş kalan risktir. Buna karşılık dinleme süresi, ses jetonu isteklerinin sunucu kayıtlarıyla çapraz doğrulanır: hiç istenmemiş bir ses "dinlendi" sayılmaz.

## 4. Sim sözleşmesi (`@egemed/sim-host`)

`SimMountContext.sessions?: SimSessionSource` kanalı eklenir:
- İçeriği: `start`, `getCase`, `hint`, `answer`, `finish` ve `audioUrl(token)`.
- Kabuk, API oturumunda bu kanalı API istemcisiyle kurar.
- Geliştirmede (DEV) API yoksa kabuk, bankayı tarayıcıda çalıştıran bir **yerel** kaynağı dinamik içe aktarmayla bağlar. Bu yol `import.meta.env.DEV` kapısının arkasındadır ve üretim paketine girmez. Bunu bir prod-bundle testi doğrular: üretim paketinde `correct` alanı ya da `acousticFinding` değeri geçmez.
- Üretimde kanal yoksa (oturumsuz ziyaretçi) uygulama ve değerlendirme zaten kilitlidir.

## 5. Paketler

- **`packages/assessment-bank`** (yeni, DOM yok):
  - Sim başına anahtarlı vakalar, saf puanlama (`scoreCase` buraya taşınır), `toPublicCase(case, seed)` projeksiyonu, deterministik karıştırma ve ses jetonu eşlemesi.
  - Ausculta'nın `cases*.json` dosyaları sim paketinden buraya taşınır. Sim paketi yalnız öğrenme kütüphanesini tutar.
- **`apps/api`:**
  - `sim_sessions` tablosu: kimlik, kullanıcı, sim, mod, tohum, vaka kimlikleri, cevaplar (jsonb, kodlu), ipuçları, zaman damgaları, durum.
  - `sim_session_audio` erişim günlüğü (isteğe bağlı, sayaç olarak).
  - Uçlar ve ses vekili (`AUSCULTA_AUDIO_DIR` ortam değişkeni; yoksa geliştirme varsayılanı).

## 6. Görevler

| Görev | İş | Zorluk | Sahip |
|---|---|---|---|
| A1.1 | Bu spesifikasyon, sözleşme şemaları, sim-host `SimSessionSource` | Z5 | Claude |
| A1.2 | `assessment-bank`: Ausculta vakaları, puanlama, projeksiyon, karıştırma, prod-bundle koruma testi | Z4 | Claude |
| A1.3 | API: migration, oturum uçları, ses vekili, hız sınırı, testler, canlı PG denemesi | Z4 | Claude |
| A1.4 | Ausculta istemcisi: uygulama ve değerlendirme akışı `sessions` kanalına geçer, yerel geliştirme kaynağı | Z4 | Claude/Sonnet |
| A1.5 | Kabuk bağlantısı ve e2e (uygulama anında geri bildirim, değerlendirme sonda açılır, ağ trafiğinde `correct` yok) | Z3 | Sonnet |
