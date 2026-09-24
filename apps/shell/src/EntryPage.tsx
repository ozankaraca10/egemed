/// <reference types="vite/client" />
import { useState, type FormEvent, type JSX } from "react";
import { t } from "@egemed/ui/i18n";
import { checkDevCredentials, createSessionStore, type DevSession, type DevSessionStorage } from "./devAuth";
import { focusMain } from "./ShellLayout";
import { ShellFooter } from "./ShellFooter";
import { entryHref, entryRedirectHref, type EntryRole } from "./routes";
import { SIM_ICONS, SIM_IDS } from "./SimCard";

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

/** Giriş ekranı: dev kapalıyken yalnız önizleme, açıkken sahte kimlik doğrulama. */
export function EntryPage({ role, devEnabled = false }: EntryPageProps): JSX.Element {
  const [submitted, setSubmitted] = useState(false);
  const [invalid, setInvalid] = useState(false);
  const isAdmin = role === "admin";
  const title = t(isAdmin ? "entry.admin.title" : "entry.student.title");

  function onSubmit(event: FormEvent<HTMLFormElement>): void {
    // Dev dalı doğrudan `import.meta.env.DEV` ile korunur: üretim build'inde
    // tümüyle elenir ve `devAuth` pakete girmez; önizleme yolu birebir kalır.
    if (import.meta.env.DEV && devEnabled) {
      const form = event.currentTarget as unknown as FormLike;
      submitDevEntry(
        event,
        {
          password: form.elements.namedItem("password")?.value ?? "",
          username: form.elements.namedItem("username")?.value ?? "",
        },
        role,
        {
          onInvalid: () => {
            setSubmitted(false);
            setInvalid(true);
          },
          onSignedIn: (session) => {
            // DOM'suz ortamda (SSR/test) oturum yazımı ve yönlendirme sessizce atlanır.
            const win = (globalThis as { window?: DevWindow }).window;
            if (win === undefined) return;
            createSessionStore(win.sessionStorage).write(session);
            win.location.hash = entryRedirectHref(session.role);
          },
        },
      );
      return;
    }
    submitEntryPreview(event, () => setSubmitted(true));
  }

  return (
    <div className="eg-shell-entry">
      <a className="eg-shell-skip" href="#icerik" onClick={focusMain}>{t("shell.skip")}</a>
      <section aria-label={t("entry.brand")} className="eg-shell-entry__brand">
        <img alt="" className="eg-shell-entry__logo" src="/brand/ege-tip-logo.png" />
        <p className="eg-shell-entry__name">{t("entry.brand")}</p>
        <p className="eg-shell-entry__tagline">{t("entry.tagline")}</p>
        <div className="eg-shell-entry__sims">
          <div className="eg-shell-entry__simrow">
            {SIM_IDS.map((id) => (
              <img
                alt=""
                className="eg-shell-entry__simicon"
                height={SIM_ICONS[id].height}
                key={id}
                src={SIM_ICONS[id].src}
                width={SIM_ICONS[id].width}
              />
            ))}
          </div>
          <p className="eg-shell-entry__sims-label">
            {SIM_IDS.map((id) => t(`sims.${id}.name`)).join(" · ")}
          </p>
        </div>
      </section>
      <main className="eg-shell-entry__main" id="icerik" tabIndex={-1}>
        <div className="eg-shell-entry__panel">
          <nav aria-label={t("entry.brand")} className="eg-shell-entry__roles">
            <a aria-current={isAdmin ? "page" : undefined} href={entryHref("admin")}>
              {t("entry.role.admin")}
            </a>
            <a aria-current={!isAdmin ? "page" : undefined} href={entryHref("student")}>
              {t("entry.role.student")}
            </a>
          </nav>
          <h1 className="eg-shell-entry__title">{title}</h1>
          <p className="eg-shell-entry__help">{t("entry.help")}</p>
          {!isAdmin && <p className="eg-shell-entry__notice">{t("entry.session.synthetic")}</p>}
          {devEnabled ? (
            <div className="eg-shell-entry__dev">
              <p className="eg-shell-entry__dev-title">{t("entry.dev.title")}</p>
              <p className="eg-shell-entry__dev-account">
                {t(isAdmin ? "entry.dev.admin" : "entry.dev.student")}
              </p>
              <p className="eg-shell-entry__dev-note">{t("entry.dev.note")}</p>
            </div>
          ) : (
            <p className="eg-shell-entry__status">{t("entry.auth.pending")}</p>
          )}
          <form autoComplete="off" className="eg-shell-entry__form" onSubmit={onSubmit}>
            <label className="eg-shell-entry__label" htmlFor="entry-username">{t("entry.field.username")}</label>
            <input
              autoComplete="off"
              className="eg-shell-entry__input"
              id="entry-username"
              name="username"
              required
              type="text"
            />
            <label className="eg-shell-entry__label" htmlFor="entry-password">{t("entry.field.password")}</label>
            <input
              autoComplete="off"
              className="eg-shell-entry__input"
              id="entry-password"
              name="password"
              required
              type="password"
            />
            <button className="eg-shell-entry__submit" type="submit">{t("entry.action.login")}</button>
          </form>
          {!devEnabled && submitted && (
            <p className="eg-shell-entry__status" role="alert">{t("entry.auth.pending")}</p>
          )}
          {devEnabled && invalid && (
            <p className="eg-shell-entry__status" role="alert">{t("entry.error.invalid")}</p>
          )}
          <a className="eg-shell-entry__back" href="#/">{t("entry.back")}</a>
        </div>
        <ShellFooter small />
      </main>
    </div>
  );
}
