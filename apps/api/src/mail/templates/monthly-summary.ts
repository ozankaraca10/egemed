/**
 * T170 — "Aylık özet" e-postası: sim başına oturum sayısı, en iyi puan, rozetler.
 *
 * ADR-006 — simülatör verileri hiçbir yüzeyde birleştirilmez: her sim kendi
 * bloğunda ayrı gösterilir, simler arası toplam puan HESAPLANMAZ.
 */

import { escapeHtml, joinTextLines, renderMailLayout } from "../layout";
import { INSTITUTION_LINE, mailColors, mailFontFamily } from "../theme";
import type { MailRenderResult } from "../types";

interface MonthlySummarySimBlock {
  readonly simName: string;
  readonly sessionCount: number;
  readonly bestScoreLabel: string;
  readonly badges: readonly string[];
}

interface MonthlySummaryData {
  readonly recipientName: string;
  readonly monthLabel: string;
  readonly sims: readonly MonthlySummarySimBlock[];
  readonly dashboardUrl: string;
  readonly logoUrl?: string;
}

function renderBadge(label: string): string {
  return `<span style="display:inline-block;margin:0 6px 6px 0;font-size:12px;font-weight:600;color:${mailColors.accent};background-color:#f5f0fd;border-radius:999px;padding:3px 10px;">${escapeHtml(label)}</span>`;
}

function renderSimBlock(sim: MonthlySummarySimBlock): string {
  const badges = sim.badges.length > 0
    ? `<div style="margin-top:8px;">${sim.badges.map(renderBadge).join("")}</div>`
    : `<div style="margin-top:8px;font-size:12px;color:${mailColors.footerText};">Bu ay rozet kazanılmadı.</div>`;

  return `
    <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="background-color:${mailColors.pageBg};border-radius:8px;margin:0 0 14px;">
      <tr>
        <td style="padding:16px 18px;font-family:${mailFontFamily};">
          <div style="font-size:15px;font-weight:700;color:${mailColors.text};margin-bottom:8px;">${escapeHtml(sim.simName)}</div>
          <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%">
            <tr>
              <td style="font-size:13px;color:${mailColors.footerText};padding:2px 0;">Oturum sayısı</td>
              <td align="right" style="font-size:13px;color:${mailColors.text};font-weight:600;padding:2px 0;">${sim.sessionCount}</td>
            </tr>
            <tr>
              <td style="font-size:13px;color:${mailColors.footerText};padding:2px 0;">En iyi puan</td>
              <td align="right" style="font-size:13px;color:${mailColors.text};font-weight:600;padding:2px 0;">${escapeHtml(sim.bestScoreLabel)}</td>
            </tr>
          </table>
          ${badges}
        </td>
      </tr>
    </table>`;
}

export function renderMonthlySummary(data: MonthlySummaryData): MailRenderResult {
  const name = escapeHtml(data.recipientName);
  const monthLabel = escapeHtml(data.monthLabel);
  const simBlocksHtml = data.sims.map(renderSimBlock).join("");

  const bodyHtml = `
    <p style="margin:0 0 16px;">Merhaba ${name},</p>
    <p style="margin:0 0 16px;"><strong>${monthLabel}</strong> ayında EGEMED üzerindeki etkinliğinizin özeti aşağıdadır. Her simülatör verisi kendi bloğunda ayrı gösterilir.</p>
    ${simBlocksHtml}
  `;

  const html = renderMailLayout({
    preheader: `${data.monthLabel} ayı EGEMED özetiniz hazır.`,
    bandTitle: INSTITUTION_LINE,
    bodyHtml,
    cta: { label: "Panele git", url: data.dashboardUrl },
    logoUrl: data.logoUrl,
  });

  const simLines = data.sims.flatMap((sim) => [
    `${sim.simName}: ${sim.sessionCount} oturum, en iyi puan ${sim.bestScoreLabel}, rozetler: ${sim.badges.length > 0 ? sim.badges.join(", ") : "yok"}`,
  ]);

  const text = joinTextLines([
    `Merhaba ${data.recipientName},`,
    `${data.monthLabel} ayında EGEMED üzerindeki etkinliğinizin özeti:`,
    ...simLines,
    `Panel: ${data.dashboardUrl}`,
    INSTITUTION_LINE,
  ]);

  return { subject: `${data.monthLabel} ayı EGEMED özetiniz`, html, text };
}
