/**
 * T170 — "Hesabınız oluşturuldu" e-postası: ilk giriş / şifre belirleme bağlantısı.
 */

import { escapeHtml, joinTextLines, renderMailLayout } from "../layout";
import { INSTITUTION_LINE, mailColors, mailFontFamily } from "../theme";
import type { MailRenderResult } from "../types";

export interface AccountCreatedData {
  readonly recipientName: string;
  readonly username: string;
  readonly setupUrl: string;
  /** Örn. "48 saat" — bağlantının geçerlilik süresi. */
  readonly expiresInLabel: string;
  readonly logoUrl?: string;
}

export function renderAccountCreated(data: AccountCreatedData): MailRenderResult {
  const name = escapeHtml(data.recipientName);
  const username = escapeHtml(data.username);
  const setupUrl = escapeHtml(data.setupUrl);
  const expiresIn = escapeHtml(data.expiresInLabel);

  const bodyHtml = `
    <p style="margin:0 0 16px;">Merhaba ${name},</p>
    <p style="margin:0 0 16px;">EGEMED Klinik Öğrenme Platformu'nda sizin için bir hesap oluşturuldu. Aşağıdaki kullanıcı adıyla giriş yapabilir, ilk girişte şifrenizi belirleyebilirsiniz.</p>
    <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="background-color:${mailColors.pageBg};border-radius:8px;margin:0 0 16px;">
      <tr>
        <td style="padding:14px 18px;font-family:${mailFontFamily};font-size:14px;color:${mailColors.textMuted};">
          Kullanıcı adı: <strong style="color:${mailColors.text};">${username}</strong>
        </td>
      </tr>
    </table>
    <p style="margin:0 0 16px;">Şifrenizi belirlemek için aşağıdaki butonu kullanın. Bu bağlantı <strong>${expiresIn}</strong> içinde geçerliliğini kaybeder.</p>
    <p style="margin:0;color:${mailColors.footerText};font-size:13px;">Bağlantı çalışmazsa: <a href="${setupUrl}" target="_blank" rel="noopener" style="color:${mailColors.primary};">${setupUrl}</a></p>
  `;

  const html = renderMailLayout({
    preheader: "EGEMED hesabınız hazır — ilk girişte şifrenizi belirleyin.",
    bandTitle: INSTITUTION_LINE,
    bodyHtml,
    cta: { label: "Şifremi belirle", url: data.setupUrl },
    logoUrl: data.logoUrl,
  });

  const text = joinTextLines([
    `Merhaba ${data.recipientName},`,
    "EGEMED Klinik Öğrenme Platformu'nda sizin için bir hesap oluşturuldu.",
    `Kullanıcı adı: ${data.username}`,
    `Şifrenizi belirlemek için bu bağlantıyı kullanın (${data.expiresInLabel} içinde geçerliliğini kaybeder): ${data.setupUrl}`,
    INSTITUTION_LINE,
  ]);

  return { subject: "EGEMED hesabınız oluşturuldu — şifrenizi belirleyin", html, text };
}
