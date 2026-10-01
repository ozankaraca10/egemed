/**
 * T170 — "Meydan Okuma daveti" e-postası: davet eden takma adı, sim adı,
 * 6 haneli kod + bağlantı, 24 saat geçerlilik.
 */

import { escapeHtml, joinTextLines, renderMailLayout } from "../layout";
import { INSTITUTION_LINE, mailColors, mailFontFamily } from "../theme";
import type { MailRenderResult } from "../types";

export interface ChallengeInviteData {
  readonly recipientName: string;
  readonly inviterDisplayName: string;
  readonly simName: string;
  /** 6 haneli davet kodu, örn. "482913". */
  readonly code: string;
  readonly joinUrl: string;
  /** Örn. "24 saat" — davetin geçerlilik süresi. */
  readonly expiresInLabel: string;
  readonly logoUrl?: string;
}

export function renderChallengeInvite(data: ChallengeInviteData): MailRenderResult {
  const name = escapeHtml(data.recipientName);
  const inviter = escapeHtml(data.inviterDisplayName);
  const simName = escapeHtml(data.simName);
  const code = escapeHtml(data.code);
  const joinUrl = escapeHtml(data.joinUrl);
  const expiresIn = escapeHtml(data.expiresInLabel);

  const bodyHtml = `
    <p style="margin:0 0 16px;">Merhaba ${name},</p>
    <p style="margin:0 0 16px;"><strong>${inviter}</strong> sizi <strong>${simName}</strong> simülasyonunda bir Meydan Okuma karşılaşmasına davet etti.</p>
    <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="background-color:${mailColors.pageBg};border-radius:8px;margin:0 0 16px;">
      <tr>
        <td align="center" style="padding:18px;font-family:${mailFontFamily};">
          <div style="font-size:12px;color:${mailColors.footerText};margin-bottom:6px;">Davet kodu</div>
          <div style="font-size:28px;font-weight:700;letter-spacing:6px;color:${mailColors.text};">${code}</div>
        </td>
      </tr>
    </table>
    <p style="margin:0 0 16px;">Bu davet <strong>${expiresIn}</strong> içinde geçerliliğini kaybeder. Katılmak için aşağıdaki butonu kullanın veya kodu uygulamada girin.</p>
    <p style="margin:0;color:${mailColors.footerText};font-size:13px;">Bağlantı çalışmazsa: <a href="${joinUrl}" target="_blank" rel="noopener" style="color:${mailColors.primary};">${joinUrl}</a></p>
  `;

  const html = renderMailLayout({
    preheader: `${data.inviterDisplayName} sizi bir Meydan Okuma karşılaşmasına davet etti.`,
    bandTitle: INSTITUTION_LINE,
    bodyHtml,
    cta: { label: "Karşılaşmaya katıl", url: data.joinUrl },
    logoUrl: data.logoUrl,
  });

  const text = joinTextLines([
    `Merhaba ${data.recipientName},`,
    `${data.inviterDisplayName} sizi ${data.simName} simülasyonunda bir Meydan Okuma karşılaşmasına davet etti.`,
    `Davet kodu: ${data.code}`,
    `Bu davet ${data.expiresInLabel} içinde geçerliliğini kaybeder. Katılmak için: ${data.joinUrl}`,
    INSTITUTION_LINE,
  ]);

  return { subject: `${data.inviterDisplayName} sizi Meydan Okuma'ya davet etti`, html, text };
}
