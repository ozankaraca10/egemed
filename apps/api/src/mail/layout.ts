/**
 * T170 — Sistem e-postaları için paylaşılan HTML iskeleti.
 *
 * Tablo tabanlı düzen (600px maks genişlik), tüm CSS inline; `<style>` yalnız
 * karanlık mod ve mobil için medya sorgusu (istemci desteklemezse bozulmadan
 * kalır, çünkü tüm görsel özellikler inline'da zaten mevcuttur).
 */

import { DEFAULT_KVKK_URL, INSTITUTION_ADDRESS, INSTITUTION_LINE, mailColors, mailFontFamily } from "./theme";

/** HTML'e gömülecek kullanıcı verisini kaçışlar (XSS'e karşı — T170 testleri). */
export function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

/** Düz metin sürümünde bağlantıları açık yazmak dışında kaçış gerekmez; satırları birleştirir. */
export function joinTextLines(lines: readonly string[]): string {
  return lines.filter((line) => line.length > 0).join("\n\n");
}

interface MailButton {
  readonly label: string;
  readonly url: string;
}

interface MailLayoutOptions {
  /** Gelen kutusunda görünen önizleme metni; e-posta içinde gizli span'e yazılır. */
  readonly preheader: string;
  /** Marka bandındaki başlık (varsayılan: kurum satırı). */
  readonly bandTitle?: string;
  /** Gövde kartının içeriği (zaten inşa edilmiş, güvenli HTML). */
  readonly bodyHtml: string;
  /** Tek birincil CTA (bulletproof buton: tablo + dolgu, min 44px dokunma hedefi). */
  readonly cta?: MailButton;
  /** Marka bandındaki isteğe bağlı görsel logo; alt metinli, yoksa metin logosu kullanılır. */
  readonly logoUrl?: string | undefined;
  readonly logoAlt?: string | undefined;
  readonly kvkkUrl?: string | undefined;
}

/** Bulletproof CTA butonu: tablo tabanlı, min 44px yükseklik, Outlook uyumlu düz renk. */
function renderButton(button: MailButton): string {
  const href = escapeHtml(button.url);
  const label = escapeHtml(button.label);
  return `
  <table role="presentation" cellpadding="0" cellspacing="0" border="0" align="center" style="margin:0 auto;">
    <tr>
      <td align="center" bgcolor="${mailColors.primary}" style="border-radius:8px;">
        <a href="${href}" target="_blank" rel="noopener"
          style="display:inline-block;min-height:44px;line-height:44px;padding:0 28px;font-family:${mailFontFamily};font-size:16px;font-weight:600;color:${mailColors.onDark};text-decoration:none;border-radius:8px;">
          ${label}
        </a>
      </td>
    </tr>
  </table>`;
}

/** Marka bandı: düz renk zemin (VML fallback yorumu içerir), degrade YOK — istemci uyumu için. */
function renderBrandBand(title: string, logoUrl?: string, logoAlt?: string): string {
  const logo = logoUrl
    ? `<img src="${escapeHtml(logoUrl)}" alt="${escapeHtml(logoAlt ?? "EGEMED")}" height="28" style="display:block;border:0;outline:none;text-decoration:none;" />`
    : `<span style="font-family:${mailFontFamily};font-size:20px;font-weight:700;color:${mailColors.onDark};letter-spacing:0.5px;">EGEMED</span>`;
  return `
  <tr>
    <td bgcolor="${mailColors.brandBg}" style="background-color:${mailColors.brandBg};padding:20px 32px;">
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">
        <tr>
          <td align="left" valign="middle">${logo}</td>
        </tr>
        <tr>
          <td style="padding-top:6px;font-family:${mailFontFamily};font-size:13px;color:#c3ddf8;">
            ${escapeHtml(title)}
          </td>
        </tr>
      </table>
    </td>
  </tr>`;
}

function renderFooter(kvkkUrl: string): string {
  return `
  <tr>
    <td style="padding:24px 32px 32px;font-family:${mailFontFamily};font-size:12px;line-height:18px;color:${mailColors.footerText};text-align:center;">
      ${escapeHtml(INSTITUTION_LINE)}<br />
      ${escapeHtml(INSTITUTION_ADDRESS)}<br />
      Bu e-posta otomatik olarak gönderilmiştir; lütfen yanıtlamayınız.<br />
      <a href="${escapeHtml(kvkkUrl)}" target="_blank" rel="noopener" style="color:${mailColors.footerText};text-decoration:underline;">KVKK Aydınlatma Metni</a>
    </td>
  </tr>`;
}

/** Tüm şablonların paylaştığı tam HTML belge; `lang="tr"`, rol=presentation tablolar. */
export function renderMailLayout(options: MailLayoutOptions): string {
  const bandTitle = options.bandTitle ?? INSTITUTION_LINE;
  const kvkkUrl = options.kvkkUrl ?? DEFAULT_KVKK_URL;
  const ctaHtml = options.cta
    ? `<tr><td style="padding:28px 32px 8px;" align="center">${renderButton(options.cta)}</td></tr>`
    : "";

  return `<!DOCTYPE html>
<html lang="tr" xmlns="http://www.w3.org/1999/xhtml">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<meta http-equiv="X-UA-Compatible" content="IE=edge" />
<title>${escapeHtml(bandTitle)}</title>
<style>
  @media (max-width: 620px) {
    .eg-container { width: 100% !important; }
    .eg-body-pad { padding-left: 16px !important; padding-right: 16px !important; }
  }
  @media (prefers-color-scheme: dark) {
    .eg-page { background-color: #0b1220 !important; }
    .eg-card { background-color: #101a2e !important; }
    .eg-text { color: #e6edf7 !important; }
    .eg-muted { color: #9db3d6 !important; }
  }
</style>
</head>
<body class="eg-page" style="margin:0;padding:0;background-color:${mailColors.pageBg};">
  <span style="display:none;visibility:hidden;opacity:0;color:transparent;height:0;width:0;overflow:hidden;mso-hide:all;">
    ${escapeHtml(options.preheader)}
  </span>
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background-color:${mailColors.pageBg};">
    <tr>
      <td align="center" style="padding:32px 16px;">
        <table role="presentation" class="eg-container" width="600" cellpadding="0" cellspacing="0" border="0" style="width:600px;max-width:600px;background-color:${mailColors.card};border:1px solid ${mailColors.border};border-radius:14px;overflow:hidden;">
          ${renderBrandBand(bandTitle, options.logoUrl, options.logoAlt)}
          <tr>
            <td class="eg-card eg-body-pad" style="padding:32px 32px 8px;font-family:${mailFontFamily};font-size:15px;line-height:23px;color:${mailColors.text};">
              ${options.bodyHtml}
            </td>
          </tr>
          ${ctaHtml}
          <tr><td style="padding:24px 32px 0;"><hr style="border:none;border-top:1px solid ${mailColors.border};margin:0;" /></td></tr>
          ${renderFooter(kvkkUrl)}
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;
}
