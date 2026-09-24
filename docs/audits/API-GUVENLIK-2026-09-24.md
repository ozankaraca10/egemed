# API güvenlik denetimi — 2026-09-24

Kapsam: `apps/api` (OWASP ASVS L2 bakışı). Yeni bağımlılık yok. Saat `now` enjekte edilir.

## Bulgular

### 1. Giriş hız sınırı yoktu

- Bulgu: `POST /auth/dev/login` ve `GET /auth/sso/callback` deneme sayısını sınırlamıyordu (E3 §a kural 5).
- Düzeltme: Bellek içi sınır, `apps/api/src/auth/rate-limit.ts`. Anahtar SHA-256; ham kullanıcı adı tutulmaz. Varsayılan eşik (açık karar §i.7): 15 dakikada 8 deneme. Aşım `429 rate_limited`; ayrıntı ve kullanıcı adı yazılmaz.
- Test: `tests/api/session.test.ts` — eşik, pencere sonrası yeniden deneme, audit’te kullanıcı adı yok.

### 2. Denetim özetinde kişisel veri

- Bulgu: Kullanıcı güncellemesi özeti `displayName`, `username`, `email` yazıyordu. `bootstrap.admin` özeti kullanıcı adı yazıyordu.
- Düzeltme: Özet yalnız `status`, `authMethod`, `roles`, `unitId` (güncelleme) veya kodlu tohum alanları. Ad, kullanıcı adı ve e-posta yok.
- Test: `tests/api/admin-users.test.ts`, `tests/api/seed.test.ts`.

### 3. CSV hata raporu hücre değerini taşıyordu

- Bulgu: `invalid_value` açıklaması ham hücreyi ekliyordu (`Geçersiz değer: …`). Formül metni ve kişisel veri dışa aktarılıyordu.
- Düzeltme: Açıklama yalnız kodlu metin. Dışa aktarımda `=`, `+`, `-`, `@` ve öndeki boşluk/sekme tek tırnakla kaçırılır. `Content-Length` 2 MB üstündeyse gövde okunmaz; satır sınırı 5.000.
- Test: `tests/api/imports.test.ts`.

## Doğrulanan ve değiştirilmeyen kontroller

| Kontrol | Durum | Test |
|---|---|---|
| Oturum çerezi `HttpOnly`, `SameSite=Lax`, `Path=/`, Domain yok; `Secure` yalnız üretim | Yerinde | `tests/api/session.test.ts` |
| CSRF çerezi double-submit için `HttpOnly` değil; mutasyonlarda `X-CSRF-Token` + Origin | Yerinde | `tests/api/session.test.ts` |
| `/admin/*` rol kontrolü; `/me/*` kimliği yalnız oturumdan | Yerinde | `tests/api/admin-users.test.ts`, `tests/api/me-gamification.test.ts` |
| `AUTH_DEV_ENABLED` üretimde açılışı durdurur; uç 404 | Yerinde | `tests/api/app.test.ts`, `tests/api/session.test.ts` |
| Beklenmeyen hata `internal_error`, gövde ayrıntısız | Yerinde | `tests/api/app.test.ts` |
| Girdi zod; doğrulama ayrıntısı değer taşımaz | SSO sorgu/returnTo üst sınırı eklendi | `tests/api/sso.test.ts` |
