/**
 * T170 — `pnpm --filter @egemed/api mail:preview`
 *
 * Tüm e-posta şablonlarını deterministik örnek veriyle üretip
 * `e2e-artifacts/mail-preview/<ad>.html` ve bir `index.html` bağlantı
 * sayfası olarak yazar. Gönderim yoktur, ağ çağrısı yoktur; yalnız
 * dosya sistemine yazar. Gerçek kişi adı/e-posta kullanılmaz.
 */

import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import process from "node:process";
import { renderAccountCreated } from "./templates/account-created.ts";
import { renderPasswordReset } from "./templates/password-reset.ts";
import { renderChallengeInvite } from "./templates/challenge-invite.ts";
import { renderChallengeResult } from "./templates/challenge-result.ts";
import { renderMonthlyRewardWinner } from "./templates/monthly-reward-winner.ts";
import { renderMonthlySummary } from "./templates/monthly-summary.ts";
import type { MailRenderResult } from "./types.ts";

const OUTPUT_DIR = path.resolve(process.cwd(), "../../e2e-artifacts/mail-preview");

interface PreviewEntry {
  readonly slug: string;
  readonly title: string;
  readonly result: MailRenderResult;
}

function buildEntries(): PreviewEntry[] {
  return [
    {
      slug: "account-created",
      title: "Hesap oluşturuldu",
      result: renderAccountCreated({
        recipientName: "Öğrenci A",
        username: "ogrenci.a",
        setupUrl: "https://egemed.ege.edu.tr/hesap/sifre-belirle?token=ornek-token",
        expiresInLabel: "48 saat",
      }),
    },
    {
      slug: "password-reset",
      title: "Şifre sıfırlama",
      result: renderPasswordReset({
        recipientName: "Öğrenci A",
        resetUrl: "https://egemed.ege.edu.tr/hesap/sifre-sifirla?token=ornek-token",
        expiresInLabel: "60 dakika",
      }),
    },
    {
      slug: "challenge-invite",
      title: "Meydan Okuma daveti",
      result: renderChallengeInvite({
        recipientName: "Öğrenci A",
        inviterDisplayName: "Öğrenci B",
        simName: "EGEMED Ausculta",
        code: "482913",
        joinUrl: "https://egemed.ege.edu.tr/meydan-okuma/katil?kod=482913",
        expiresInLabel: "24 saat",
      }),
    },
    {
      slug: "challenge-result",
      title: "Karşılaşma sonucu",
      result: renderChallengeResult({
        recipientName: "Öğrenci A",
        simName: "EGEMED Ausculta",
        recipientScoreLabel: "87 puan",
        recipientDurationLabel: "4 dk 12 sn",
        opponentDisplayName: "Öğrenci B",
        opponentScoreLabel: "81 puan",
        opponentDurationLabel: "4 dk 40 sn",
        winnerDisplayName: "Öğrenci A",
        recipientIsWinner: true,
        rematchUrl: "https://egemed.ege.edu.tr/meydan-okuma/rovans?id=ornek",
      }),
    },
    {
      slug: "monthly-reward-winner",
      title: "Ayın ödülünü kazandınız",
      result: renderMonthlyRewardWinner({
        recipientName: "Öğrenci A",
        simName: "EGEMED Opaca",
        rank: 1,
        rewardTitle: "Ayın Şampiyonu Rozeti",
        sponsorName: "Ege Üniversitesi Tıp Fakültesi",
        monthLabel: "Eylül 2026",
        nextStepsText: "Ödülünüzü teslim almak için fakülte öğrenci işleri ile iletişime geçebilirsiniz.",
        detailsUrl: "https://egemed.ege.edu.tr/odul/ornek",
      }),
    },
    {
      slug: "monthly-summary",
      title: "Aylık özet",
      result: renderMonthlySummary({
        recipientName: "Öğrenci A",
        monthLabel: "Eylül 2026",
        sims: [
          {
            simName: "EGEMED Pulse",
            sessionCount: 12,
            bestScoreLabel: "94 puan",
            badges: ["EKG Uzmanı", "Hızlı Tanı"],
          },
          {
            simName: "EGEMED Ausculta",
            sessionCount: 5,
            bestScoreLabel: "78 puan",
            badges: [],
          },
          {
            simName: "EGEMED Opaca",
            sessionCount: 8,
            bestScoreLabel: "89 puan",
            badges: ["Görüntü Okuma"],
          },
        ],
        dashboardUrl: "https://egemed.ege.edu.tr/panel",
      }),
    },
  ];
}

function buildIndexHtml(entries: readonly PreviewEntry[]): string {
  const rows = entries
    .map(
      (entry) =>
        `<li><a href="./${entry.slug}.html">${entry.title}</a> — <code>${entry.result.subject}</code></li>`,
    )
    .join("\n");
  return `<!DOCTYPE html>
<html lang="tr">
<head><meta charset="utf-8" /><title>EGEMED e-posta önizlemeleri</title></head>
<body style="font-family:sans-serif;max-width:640px;margin:40px auto;">
<h1>EGEMED sistem e-postaları — önizleme (T170)</h1>
<ul>
${rows}
</ul>
</body>
</html>`;
}

async function main(): Promise<void> {
  const entries = buildEntries();
  await mkdir(OUTPUT_DIR, { recursive: true });
  await Promise.all(
    entries.map((entry) => writeFile(path.join(OUTPUT_DIR, `${entry.slug}.html`), entry.result.html, "utf8")),
  );
  await writeFile(path.join(OUTPUT_DIR, "index.html"), buildIndexHtml(entries), "utf8");
  process.stdout.write(`EGEMED e-posta önizlemeleri yazıldı: ${OUTPUT_DIR}\n`);
}

await main();
