/**
 * T170 — "Düello sonucu" e-postası: iki taraf skoru/süresi, kazanan, rövanş CTA'sı.
 */

import { escapeHtml, joinTextLines, renderMailLayout } from "../layout";
import { INSTITUTION_LINE, mailColors, mailFontFamily } from "../theme";
import type { MailRenderResult } from "../types";

export interface ChallengeResultData {
  readonly recipientName: string;
  readonly simName: string;
  readonly recipientScoreLabel: string;
  readonly recipientDurationLabel: string;
  readonly opponentDisplayName: string;
  readonly opponentScoreLabel: string;
  readonly opponentDurationLabel: string;
  readonly winnerDisplayName: string;
  readonly recipientIsWinner: boolean;
  readonly rematchUrl: string;
  readonly logoUrl?: string;
}

function scoreRow(label: string, scoreLabel: string, durationLabel: string, isWinner: boolean): string {
  const badge = isWinner
    ? `<span style="display:inline-block;margin-left:8px;font-size:11px;font-weight:700;color:${mailColors.success};background-color:${mailColors.successBg};border-radius:999px;padding:2px 10px;">KAZANAN</span>`
    : "";
  return `
    <tr>
      <td style="padding:10px 14px;font-family:${mailFontFamily};font-size:14px;color:${mailColors.text};border-bottom:1px solid ${mailColors.border};">
        ${label}${badge}
      </td>
      <td align="right" style="padding:10px 14px;font-family:${mailFontFamily};font-size:14px;color:${mailColors.text};border-bottom:1px solid ${mailColors.border};white-space:nowrap;">
        ${scoreLabel} · ${durationLabel}
      </td>
    </tr>`;
}

export function renderChallengeResult(data: ChallengeResultData): MailRenderResult {
  const name = escapeHtml(data.recipientName);
  const simName = escapeHtml(data.simName);
  const opponent = escapeHtml(data.opponentDisplayName);
  const winner = escapeHtml(data.winnerDisplayName);
  const outcomeText = data.recipientIsWinner ? "Bu karşılaşmayı kazandınız." : `Bu karşılaşmayı ${winner} kazandı.`;

  const bodyHtml = `
    <p style="margin:0 0 16px;">Merhaba ${name},</p>
    <p style="margin:0 0 8px;"><strong>${simName}</strong> simülasyonundaki karşılaşmanız sona erdi.</p>
    <p style="margin:0 0 16px;font-weight:600;color:${data.recipientIsWinner ? mailColors.success : mailColors.text};">${outcomeText}</p>
    <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="margin:0 0 20px;">
      ${scoreRow("Siz", escapeHtml(data.recipientScoreLabel), escapeHtml(data.recipientDurationLabel), data.recipientIsWinner)}
      ${scoreRow(opponent, escapeHtml(data.opponentScoreLabel), escapeHtml(data.opponentDurationLabel), !data.recipientIsWinner)}
    </table>
    <p style="margin:0;">Rövanş ister misiniz?</p>
  `;

  const html = renderMailLayout({
    preheader: `${data.simName} karşılaşmanızın sonucu hazır — ${outcomeText}`,
    bandTitle: INSTITUTION_LINE,
    bodyHtml,
    cta: { label: "Rövanş isteği gönder", url: data.rematchUrl },
    logoUrl: data.logoUrl,
  });

  const text = joinTextLines([
    `Merhaba ${data.recipientName},`,
    `${data.simName} simülasyonundaki karşılaşmanız sona erdi.`,
    outcomeText,
    `Siz: ${data.recipientScoreLabel} · ${data.recipientDurationLabel}`,
    `${data.opponentDisplayName}: ${data.opponentScoreLabel} · ${data.opponentDurationLabel}`,
    `Rövanş için: ${data.rematchUrl}`,
    INSTITUTION_LINE,
  ]);

  return {
    subject: `${data.simName} karşılaşma sonucu: ${data.recipientIsWinner ? "Kazandınız!" : `${data.winnerDisplayName} kazandı`}`,
    html,
    text,
  };
}
