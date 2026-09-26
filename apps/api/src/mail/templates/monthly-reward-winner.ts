/**
 * T170 — "Ayın ödülünü kazandınız" e-postası.
 */

import { escapeHtml, joinTextLines, renderMailLayout } from "../layout";
import { INSTITUTION_LINE, mailColors, mailFontFamily } from "../theme";
import type { MailRenderResult } from "../types";

export interface MonthlyRewardWinnerData {
  readonly recipientName: string;
  readonly simName: string;
  /** 1, 2 veya 3 — ay içi sıralama. */
  readonly rank: 1 | 2 | 3;
  readonly rewardTitle: string;
  readonly sponsorName: string;
  readonly monthLabel: string;
  readonly nextStepsText: string;
  readonly detailsUrl: string;
  readonly logoUrl?: string;
}

const RANK_LABEL: Record<1 | 2 | 3, string> = {
  1: "1. sıra",
  2: "2. sıra",
  3: "3. sıra",
};

export function renderMonthlyRewardWinner(data: MonthlyRewardWinnerData): MailRenderResult {
  const name = escapeHtml(data.recipientName);
  const simName = escapeHtml(data.simName);
  const rewardTitle = escapeHtml(data.rewardTitle);
  const sponsor = escapeHtml(data.sponsorName);
  const monthLabel = escapeHtml(data.monthLabel);
  const nextSteps = escapeHtml(data.nextStepsText);
  const rankLabel = RANK_LABEL[data.rank];

  const bodyHtml = `
    <p style="margin:0 0 16px;">Merhaba ${name},</p>
    <p style="margin:0 0 16px;">Tebrikler! <strong>${monthLabel}</strong> döneminde <strong>${simName}</strong> simülasyonunda <strong>${escapeHtml(rankLabel)}</strong> oldunuz ve bir ödül kazandınız.</p>
    <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="background-color:${mailColors.successBg};border-radius:8px;margin:0 0 16px;">
      <tr>
        <td style="padding:16px 18px;font-family:${mailFontFamily};">
          <div style="font-size:12px;color:${mailColors.success};margin-bottom:4px;">Kazanılan ödül</div>
          <div style="font-size:18px;font-weight:700;color:${mailColors.text};">${rewardTitle}</div>
          <div style="font-size:13px;color:${mailColors.footerText};margin-top:4px;">Sponsor: ${sponsor}</div>
        </td>
      </tr>
    </table>
    <p style="margin:0 0 16px;">${nextSteps}</p>
  `;

  const html = renderMailLayout({
    preheader: `${data.monthLabel} ayının ödülünü kazandınız: ${data.rewardTitle}`,
    bandTitle: INSTITUTION_LINE,
    bodyHtml,
    cta: { label: "Ödül detaylarını gör", url: data.detailsUrl },
    logoUrl: data.logoUrl,
  });

  const text = joinTextLines([
    `Merhaba ${data.recipientName},`,
    `Tebrikler! ${data.monthLabel} döneminde ${data.simName} simülasyonunda ${rankLabel} oldunuz ve bir ödül kazandınız.`,
    `Kazanılan ödül: ${data.rewardTitle} (Sponsor: ${data.sponsorName})`,
    data.nextStepsText,
    `Detaylar: ${data.detailsUrl}`,
    INSTITUTION_LINE,
  ]);

  return { subject: `${data.monthLabel} ayının ödülünü kazandınız!`, html, text };
}
