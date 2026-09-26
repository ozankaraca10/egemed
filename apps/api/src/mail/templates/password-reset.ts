/**
 * T170 — "Şifre sıfırlama" e-postası.
 */

import { escapeHtml, joinTextLines, renderMailLayout } from "../layout";
import { INSTITUTION_LINE, mailColors, mailFontFamily } from "../theme";
import type { MailRenderResult } from "../types";

export interface PasswordResetData {
  readonly recipientName: string;
  readonly resetUrl: string;
  /** Örn. "60 dakika" — bağlantının geçerlilik süresi. */
  readonly expiresInLabel: string;
  readonly logoUrl?: string;
}

export function renderPasswordReset(data: PasswordResetData): MailRenderResult {
  const name = escapeHtml(data.recipientName);
  const resetUrl = escapeHtml(data.resetUrl);
  const expiresIn = escapeHtml(data.expiresInLabel);

  const bodyHtml = `
    <p style="margin:0 0 16px;">Merhaba ${name},</p>
    <p style="margin:0 0 16px;">EGEMED hesabınız için bir şifre sıfırlama isteği aldık. Yeni şifrenizi belirlemek için aşağıdaki butonu kullanabilirsiniz.</p>
    <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="background-color:${mailColors.warningBg};border-radius:8px;margin:0 0 16px;">
      <tr>
        <td style="padding:14px 18px;font-family:${mailFontFamily};font-size:14px;color:${mailColors.warning};">
          Bu bağlantı <strong>${expiresIn}</strong> içinde geçerliliğini kaybeder.
        </td>
      </tr>
    </table>
    <p style="margin:0 0 16px;">Bu isteği siz yapmadıysanız bu e-postayı yok sayabilirsiniz; şifreniz değişmeyecektir.</p>
    <p style="margin:0;color:${mailColors.footerText};font-size:13px;">Bağlantı çalışmazsa: <a href="${resetUrl}" target="_blank" rel="noopener" style="color:${mailColors.primary};">${resetUrl}</a></p>
  `;

  const html = renderMailLayout({
    preheader: "EGEMED şifre sıfırlama bağlantınız hazır.",
    bandTitle: INSTITUTION_LINE,
    bodyHtml,
    cta: { label: "Şifremi sıfırla", url: data.resetUrl },
    logoUrl: data.logoUrl,
  });

  const text = joinTextLines([
    `Merhaba ${data.recipientName},`,
    "EGEMED hesabınız için bir şifre sıfırlama isteği aldık.",
    `Bu bağlantı ${data.expiresInLabel} içinde geçerliliğini kaybeder: ${data.resetUrl}`,
    "Bu isteği siz yapmadıysanız bu e-postayı yok sayabilirsiniz; şifreniz değişmeyecektir.",
    INSTITUTION_LINE,
  ]);

  return { subject: "EGEMED şifre sıfırlama isteği", html, text };
}
