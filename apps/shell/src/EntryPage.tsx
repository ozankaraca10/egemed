/// <reference types="vite/client" />
import { useState, type FormEvent, type JSX } from "react";
import { Button, Field, IconButton, TextInput, icons } from "@egemed/ui";
import { t } from "@egemed/ui/i18n";
import { checkDevCredentials, createSessionStore, type DevSession, type DevSessionStorage } from "./devAuth";
import { focusMain } from "./ShellLayout";
import { ShellFooter } from "./ShellFooter";
import { entryHref, entryRedirectHref, type EntryRole } from "./routes";
import type { ShellSession } from "./session";
import { SIM_ICONS, SIM_IDS } from "./SimCard";
import { EgemedLogo } from "./brand/EgemedLogo";
import { DEV_ENTRY_STRINGS } from "./devStrings";

/** Kök tsconfig DOM lib'i taşımadığı için form alanı erişimi en dar arayüzle yapılır. */
interface FieldLike { value: string }
interface FormLike { elements: { namedItem(name: string): FieldLike | null } }

/** Oturum yazımı ve hash yönlendirmesi için gereken en dar pencere arayüzü. */
interface DevWindow {
  location: { hash: string };
  sessionStorage: DevSessionStorage;
}

export interface EntryPageProps {
  role: EntryRole;
  /** Geliştirmeye özel sahte kimlik doğrulama; `App` bunu `import.meta.env.DEV` ile besler. */
  devEnabled?: boolean;
  /** T57 — API taban adresi; doluysa giriş `/auth/dev/login` ile API oturumu açar. */
  apiBaseUrl?: string | null;
  /** T57 — API oturumu kurulduğunda kabuk durumunu günceller (`App` geçirir). */
  onApiSignedIn?: (session: ShellSession) => void;
  /** 26 Eyl 2026 — "Ziyaretçi olarak göz at" (yalnız öğrenci girişinde; sınırlı öğrenme modu). */
  onBrowseAsVisitor?: () => void;
}

export interface EntryFormValues {
  username: string;
  password: string;
}

export interface DevSubmitHandlers {
  /** Dev açıkken hatalı kimlik. */
  onInvalid(): void;
  /** Dev açıkken doğrulanmış oturum; kayıt ve yönlendirme çağıranın işidir. */
  onSignedIn(session: DevSession): void;
}

/** Önizleme formunun gönderimini iptal eder; kimlik doğrulama çağrısı yapmaz. */
export function submitEntryPreview(event: { preventDefault(): void }, notify: () => void): void {
  event.preventDefault();
  notify();
}

/**
 * Dev açıkken form gönderimini saf olarak işler: `checkDevCredentials` ile
 * doğrular. Oturum yazımı ve yönlendirme DOM'a bağlı olduğu için çağırana
 * bırakılır; böylece DOM'suz test edilir. Dev kapalıyken `submitEntryPreview`
 * kullanılır ve bu fonksiyon çağrılmaz.
 */
export function submitDevEntry(
  event: { preventDefault(): void },
  values: EntryFormValues,
  role: EntryRole,
  handlers: DevSubmitHandlers,
): DevSession | null {
  event.preventDefault();
  const session = checkDevCredentials(role, values.username, values.password);
  if (session === null) {
    handlers.onInvalid();
    return null;
  }
  handlers.onSignedIn(session);
  return session;
}

/** Giriş ekranı: dev kapalıyken yalnız önizleme, açıkken sahte ya da API oturumu. */
export function EntryPage({ role, devEnabled = false, apiBaseUrl = null, onApiSignedIn, onBrowseAsVisitor }: EntryPageProps): JSX.Element {
  const [submitted, setSubmitted] = useState(false);
  const [invalid, setInvalid] = useState(false);
  const [loading, setLoading] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const isAdmin = role === "admin";
  const title = t(isAdmin ? "entry.admin.title" : "entry.student.title");

  function onSubmit(event: FormEvent<HTMLFormElement>): void {
    setLoading(true);
    // Dev dalı doğrudan `import.meta.env.DEV` ile korunur: üretim build'inde
    // tümüyle elenir; `devAuth` ve `apiAuth` pakete girmez, önizleme yolu birebir kalır.
    if (import.meta.env.DEV && devEnabled) {
      const form = event.currentTarget as unknown as FormLike;
      const values: EntryFormValues = {
        password: form.elements.namedItem("password")?.value ?? "",
        username: form.elements.namedItem("username")?.value ?? "",
      };
      if (apiBaseUrl !== null) {
        // API oturumu uçtan uca çerezle kurulur (T57); yönlendirme `/auth/me`
        // rolüne göre yapılır, formdaki role göre değil.
        event.preventDefault();
        void import("./apiAuth")
          .then((module) =>
            module.submitApiEntry(values, role, apiBaseUrl, {
              onInvalid: () => {
                setSubmitted(false);
                setInvalid(true);
                setLoading(false);
              },
              onSignedIn: (session) => {
                onApiSignedIn?.(session);
                // DOM'suz ortamda (SSR/test) yönlendirme sessizce atlanır.
                const win = (globalThis as { window?: DevWindow }).window;
                if (win === undefined) return;
                win.location.hash = entryRedirectHref(session.role);
              },
            }),
          )
          .catch(() => {
            setInvalid(true);
            setLoading(false);
          });
        return;
      }
      submitDevEntry(event, values, role, {
        onInvalid: () => {
          setSubmitted(false);
          setInvalid(true);
          setLoading(false);
        },
        onSignedIn: (session) => {
          // DOM'suz ortamda (SSR/test) oturum yazımı ve yönlendirme sessizce atlanır.
          const win = (globalThis as { window?: DevWindow }).window;
          if (win === undefined) return;
          createSessionStore(win.sessionStorage).write(session);
          win.location.hash = entryRedirectHref(session.role);
        },
      });
      return;
    }
    submitEntryPreview(event, () => {
      setSubmitted(true);
      setLoading(false);
    });
  }

  return (
    <div className="eg-shell-entry">
      <a className="eg-shell-skip" href="#icerik" onClick={focusMain}>{t("shell.skip")}</a>
      {/* T296 (depo sahibi onayı 1 Eki 2026): fotoğrafsız lacivert sahne, gerçek EGEMED ve sim logo setleri. */}
      <section aria-label={t("entry.brand")} className="eg-shell-entry__brand">
        <div className="eg-shell-entry__brandTop">
          <img alt="" className="eg-shell-entry__logo" height={128} src="/brand/ege-tip-logo.png" width={128} />
          <EgemedLogo variant="on-dark" />
        </div>
        <div className="eg-shell-entry__pitch">
          <p className="eg-shell-entry__eyebrow">
            <span className="eg-shell-entry__claim">{t("entry.claim")}</span>
            {t("shell.brand.tagline")}
          </p>
          <p className="eg-shell-entry__headline">{t("entry.headline")}</p>
          <p className="eg-shell-entry__lead">{t("entry.lead")}</p>
          <ul aria-label={t("entry.sims")} className="eg-shell-entry__sims">
            {SIM_IDS.map((id) => (
              <li className={`eg-shell-entry__sim eg-shell-entry__sim--${id}`} key={id}>
                <img
                  alt=""
                  className="eg-shell-entry__simicon"
                  height={SIM_ICONS[id].height}
                  src={SIM_ICONS[id].src}
                  width={SIM_ICONS[id].width}
                />
                <span className="eg-shell-entry__simname">{t(`sims.${id}.name`)}</span>
              </li>
            ))}
          </ul>
        </div>
        <p className="eg-shell-entry__quote">{t("entry.quote")}</p>
      </section>
      <main className="eg-shell-entry__main" id="icerik" tabIndex={-1}>
        <div className="eg-shell-entry__panel">
          <nav aria-label={t("entry.brand")} className="eg-shell-entry__roles">
            <a aria-current={!isAdmin ? "page" : undefined} href={entryHref("student")}>
              {t("entry.role.student")}
            </a>
            <a aria-current={isAdmin ? "page" : undefined} href={entryHref("admin")}>
              {t("entry.role.admin")}
            </a>
          </nav>
          <h1 className="eg-shell-entry__title">{title}</h1>
          <p className="eg-shell-entry__help">{t("entry.help")}</p>
          {!isAdmin && <p className="eg-shell-entry__notice">{t("entry.session.synthetic")}</p>}
          {import.meta.env.DEV && devEnabled ? (
            <div className="eg-shell-entry__dev">
              <p className="eg-shell-entry__dev-title">{DEV_ENTRY_STRINGS.title}</p>
              <p className="eg-shell-entry__dev-account">
                {isAdmin ? DEV_ENTRY_STRINGS.admin : DEV_ENTRY_STRINGS.student}
              </p>
              <p className="eg-shell-entry__dev-note">{DEV_ENTRY_STRINGS.note}</p>
            </div>
          ) : (
            <p className="eg-shell-entry__status">{t("entry.auth.pending")}</p>
          )}
          <form autoComplete="off" className="eg-shell-entry__form" onSubmit={onSubmit}>
            <Field id="entry-username" label={t("entry.field.username")} required>
              {(control) => (
                <TextInput {...control} autoComplete="username" name="username" type="text" />
              )}
            </Field>
            <Field
              error={invalid ? <span role="alert">{t("entry.error.invalid")}</span> : undefined}
              id="entry-password"
              label={t("entry.field.password")}
              required
            >
              {(control) => (
                <div className="eg-shell-entry__password">
                  <TextInput
                    {...control}
                    autoComplete="current-password"
                    className="eg-shell-entry__password-input"
                    name="password"
                    type={showPassword ? "text" : "password"}
                  />
                  <IconButton
                    aria-pressed={showPassword}
                    className="eg-shell-entry__password-toggle"
                    icon={showPassword ? <icons.EyeOff /> : <icons.Eye />}
                    label={t(showPassword ? "entry.field.password.hide" : "entry.field.password.show")}
                    onClick={() => setShowPassword((prev) => !prev)}
                    variant="ghost"
                  />
                </div>
              )}
            </Field>
            <Button fullWidth loading={loading} type="submit">{t("entry.action.login")}</Button>
          </form>
          {!devEnabled && submitted && (
            <p className="eg-shell-entry__status" role="alert">{t("entry.auth.pending")}</p>
          )}
          {!isAdmin && onBrowseAsVisitor !== undefined && (
            <div className="eg-shell-entry__visitor">
              <span aria-hidden="true" className="eg-shell-entry__or">{t("entry.visitor.or")}</span>
              <Button fullWidth onClick={onBrowseAsVisitor} variant="secondary">{t("entry.visitor.action")}</Button>
              <p className="eg-shell-entry__visitorNote">{t("entry.visitor.note")}</p>
            </div>
          )}
          <ul aria-label={t("entry.trust")} className="eg-shell-entry__trust">
            <li>{t("entry.trust.privacy")}</li>
            <li>{t("entry.trust.data")}</li>
            <li>{t("entry.trust.edu")}</li>
          </ul>
          <a className="eg-shell-entry__back" href="#/">{t("entry.back")}</a>
        </div>
        <ShellFooter small />
      </main>
    </div>
  );
}
