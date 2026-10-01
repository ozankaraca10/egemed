import { describe, expect, it } from "vitest";
import {
  renderAccountCreated,
  renderChallengeInvite,
  renderChallengeResult,
  renderMonthlyRewardWinner,
  renderMonthlySummary,
  renderPasswordReset,
} from "../../apps/api/src/mail";

// T170 — sistem e-postası şablonları. Bağımlılıksız saf fonksiyonlar; DB/ağ
// gerekmez. Her şablon `lang="tr"`, bulletproof CTA, gizli preheader ve
// HTML-escape edilmiş kullanıcı verisi içermeli (XSS'e karşı).

const XSS_NAME = '<img src=x onerror="alert(1)">"Öğrenci" & <b>A</b>';

describe("mail şablonları — genel yapı", () => {
  const cases: Array<{ name: string; result: { subject: string; html: string; text: string } }> = [
    {
      name: "accountCreated",
      result: renderAccountCreated({
        recipientName: "Öğrenci A",
        username: "ogrenci.a",
        setupUrl: "https://egemed.ege.edu.tr/hesap/sifre-belirle?token=t",
        expiresInLabel: "48 saat",
      }),
    },
    {
      name: "passwordReset",
      result: renderPasswordReset({
        recipientName: "Öğrenci A",
        resetUrl: "https://egemed.ege.edu.tr/hesap/sifre-sifirla?token=t",
        expiresInLabel: "60 dakika",
      }),
    },
    {
      name: "challengeInvite",
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
      name: "challengeResult",
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
        rematchUrl: "https://egemed.ege.edu.tr/meydan-okuma/rovans?id=x",
      }),
    },
    {
      name: "monthlyRewardWinner",
      result: renderMonthlyRewardWinner({
        recipientName: "Öğrenci A",
        simName: "EGEMED Opaca",
        rank: 1,
        rewardTitle: "Ayın Şampiyonu Rozeti",
        sponsorName: "Ege Üniversitesi Tıp Fakültesi",
        monthLabel: "Eylül 2026",
        nextStepsText: "Fakülte öğrenci işleri ile iletişime geçin.",
        detailsUrl: "https://egemed.ege.edu.tr/odul/x",
      }),
    },
    {
      name: "monthlySummary",
      result: renderMonthlySummary({
        recipientName: "Öğrenci A",
        monthLabel: "Eylül 2026",
        sims: [
          { simName: "EGEMED Pulse", sessionCount: 12, bestScoreLabel: "94 puan", badges: ["EKG Uzmanı"] },
          { simName: "EGEMED Ausculta", sessionCount: 5, bestScoreLabel: "78 puan", badges: [] },
        ],
        dashboardUrl: "https://egemed.ege.edu.tr/panel",
      }),
    },
  ];

  for (const { name, result } of cases) {
    it(`${name}: lang=tr, preheader, bulletproof CTA ve altbilgi içerir`, () => {
      expect(result.html).toContain('lang="tr"');
      expect(result.html).toMatch(/mso-hide:all/);
      expect(result.html).toContain('role="presentation"');
      expect(result.html).toContain("KVKK Aydınlatma Metni");
      expect(result.html).toContain("Bu e-posta otomatik olarak gönderilmiştir");
      expect(result.subject.length).toBeGreaterThan(0);
      expect(result.text.length).toBeGreaterThan(0);
      // Metin sürümü HTML etiketi içermemeli.
      expect(result.text).not.toMatch(/<[a-z]/i);
    });
  }
});

describe("mail şablonları — XSS/HTML-escape", () => {
  it("accountCreated: kullanıcı adı ve alıcı adı HTML-escape edilir", () => {
    const result = renderAccountCreated({
      recipientName: XSS_NAME,
      username: XSS_NAME,
      setupUrl: "https://egemed.ege.edu.tr/hesap/sifre-belirle?token=t",
      expiresInLabel: "48 saat",
    });
    expect(result.html).not.toContain("<img src=x onerror=");
    expect(result.html).not.toContain("<b>A</b>");
    expect(result.html).toContain("&lt;img");
    expect(result.html).toContain("&amp;");
  });

  it("challengeInvite: davet eden adı ve sim adı HTML-escape edilir", () => {
    const result = renderChallengeInvite({
      recipientName: "Öğrenci A",
      inviterDisplayName: XSS_NAME,
      simName: XSS_NAME,
      code: "482913",
      joinUrl: "https://egemed.ege.edu.tr/meydan-okuma/katil?kod=482913",
      expiresInLabel: "24 saat",
    });
    // Not: `subject` düz metin bir e-posta başlığıdır (HTML olarak işlenmez),
    // bu yüzden yalnız HTML gövdesinin kaçışlandığı doğrulanır.
    expect(result.html).not.toContain("<img src=x onerror=");
  });

  it("monthlySummary: sim adı ve rozet adları HTML-escape edilir", () => {
    const result = renderMonthlySummary({
      recipientName: "Öğrenci A",
      monthLabel: "Eylül 2026",
      sims: [{ simName: XSS_NAME, sessionCount: 3, bestScoreLabel: XSS_NAME, badges: [XSS_NAME] }],
      dashboardUrl: "https://egemed.ege.edu.tr/panel",
    });
    expect(result.html).not.toContain("<img src=x onerror=");
    expect(result.html).not.toContain("<b>A</b>");
  });

  it("passwordReset: bağlantı URL'si href içinde escape edilir (tırnak kaçışı)", () => {
    const maliciousUrl = 'https://egemed.ege.edu.tr/x?"><script>alert(1)</script>';
    const result = renderPasswordReset({
      recipientName: "Öğrenci A",
      resetUrl: maliciousUrl,
      expiresInLabel: "60 dakika",
    });
    expect(result.html).not.toContain("<script>alert(1)</script>");
  });
});

describe("mail şablonları — ADR-006 (sim verileri birleştirilmez)", () => {
  it("monthlySummary: simler arası toplam puan hesaplanmaz, her sim ayrı blokta", () => {
    const result = renderMonthlySummary({
      recipientName: "Öğrenci A",
      monthLabel: "Eylül 2026",
      sims: [
        { simName: "EGEMED Pulse", sessionCount: 12, bestScoreLabel: "94 puan", badges: [] },
        { simName: "EGEMED Ausculta", sessionCount: 5, bestScoreLabel: "78 puan", badges: [] },
      ],
      dashboardUrl: "https://egemed.ege.edu.tr/panel",
    });
    expect(result.html).toContain("EGEMED Pulse");
    expect(result.html).toContain("EGEMED Ausculta");
    expect(result.html).not.toMatch(/toplam puan/i);
    expect(result.text).not.toMatch(/toplam puan/i);
  });
});

describe("mail şablonları — karşılaşma sonucu kazanan rozeti", () => {
  it("recipientIsWinner=true iken 'KAZANAN' rozeti alıcı satırında görünür", () => {
    const result = renderChallengeResult({
      recipientName: "Öğrenci A",
      simName: "EGEMED Ausculta",
      recipientScoreLabel: "87 puan",
      recipientDurationLabel: "4 dk 12 sn",
      opponentDisplayName: "Öğrenci B",
      opponentScoreLabel: "81 puan",
      opponentDurationLabel: "4 dk 40 sn",
      winnerDisplayName: "Öğrenci A",
      recipientIsWinner: true,
      rematchUrl: "https://egemed.ege.edu.tr/meydan-okuma/rovans?id=x",
    });
    expect(result.subject).toContain("Kazandınız");
    expect(result.html).toContain("KAZANAN");
  });
});
