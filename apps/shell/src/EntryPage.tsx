import { useState, type FormEvent, type JSX } from "react";
import { t } from "@egemed/ui/i18n";
import { focusMain } from "./ShellLayout";
import { entryHref, type EntryRole } from "./routes";

interface EntryPageProps {
  role: EntryRole;
}

/** Önizleme formunun gönderimini iptal eder; kimlik doğrulama çağrısı yapmaz. */
export function submitEntryPreview(event: { preventDefault(): void }, notify: () => void): void {
  event.preventDefault();
  notify();
}

/** Yalnız görsel giriş önizlemesi; form gönderimi ağ veya oturum başlatmaz. */
export function EntryPage({ role }: EntryPageProps): JSX.Element {
  const [submitted, setSubmitted] = useState(false);
  const isAdmin = role === "admin";
  const title = t(isAdmin ? "entry.admin.title" : "entry.student.title");

  function onSubmit(event: FormEvent<HTMLFormElement>): void {
    submitEntryPreview(event, () => setSubmitted(true));
  }

  return (
    <div className="eg-shell-entry">
      <a className="eg-shell-skip" href="#icerik" onClick={focusMain}>{t("shell.skip")}</a>
      <section aria-label={t("entry.brand")} className="eg-shell-entry__brand">
        <img alt="" className="eg-shell-entry__logo" src="/brand/ege-tip-logo.png" />
        <p className="eg-shell-entry__name">{t("entry.brand")}</p>
        <p className="eg-shell-entry__tagline">{t("entry.tagline")}</p>
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
          <p className="eg-shell-entry__status">{t("entry.auth.pending")}</p>
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
          {submitted && <p className="eg-shell-entry__status" role="alert">{t("entry.auth.pending")}</p>}
          <a className="eg-shell-entry__back" href="#/">{t("entry.back")}</a>
        </div>
      </main>
    </div>
  );
}
