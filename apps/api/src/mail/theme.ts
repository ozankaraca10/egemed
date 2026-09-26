/**
 * T170 — E-posta şablonları için sabit renk/tipografi paleti.
 *
 * E-posta istemcilerinin çoğu CSS değişkenlerini desteklemez, bu yüzden
 * `packages/tokens/family-tokens.css`'teki EGEMED aile token'larının HEX
 * karşılıkları burada sabit olarak kopyalanır. Her satırda kaynak token adı
 * yorum olarak belirtilir; aile paleti değişirse bu dosya elle güncellenir.
 */

export const mailColors = {
  /** --navy-900 — marka bandı zemini */
  brandBg: "#0a2a5e",
  /** --navy-800 — marka bandı yedek/gradyan koyu ucu (VML degrade) */
  brandBgDark: "#0d346f",
  /** --blue-600 — birincil CTA buton zemini */
  primary: "#1673e6",
  /** --blue-700 — birincil CTA buton hover/koyu yedeği (bazı istemciler :hover uygulamaz, statik bırakılır) */
  primaryDark: "#0f62d8",
  /** --ink-900 — gövde ana metin */
  text: "#0b2559",
  /** --ink-700 — gövde ikincil metin */
  textMuted: "#1e3a6e",
  /** --ink-600 — dipnot/altbilgi metni */
  footerText: "#46618c",
  /** --card — kart zemini */
  card: "#ffffff",
  /** --card-soft — sayfa zemini (kartın dışı) */
  pageBg: "#f4f8fe",
  /** --border — kart kenarlığı */
  border: "#d9e5f4",
  /** --green-600 — başarı/kazanan vurgusu */
  success: "#16a34a",
  /** --green-50 — başarı rozeti zemini */
  successBg: "#ecfaf1",
  /** --amber-700 — dikkat/uyarı metni (şifre sıfırlama vb.) */
  warning: "#92400e",
  /** --orange-100 — dikkat rozeti zemini */
  warningBg: "#fdeecd",
  /** --purple-600 — ikincil vurgu (rövanş/etkileşim butonları) */
  accent: "#7c3aed",
  /** beyaz metin (marka bandı ve CTA üzeri) */
  onDark: "#ffffff",
} as const;

/** --font — e-posta güvenli yazı tipi yığını (sistem fontlarına düşer) */
export const mailFontFamily =
  "'Segoe UI','SF Pro Text',-apple-system,BlinkMacSystemFont,Roboto,'Helvetica Neue',Arial,sans-serif";

export const INSTITUTION_LINE =
  "Ege Üniversitesi Tıp Fakültesi · EGEMED Klinik Öğrenme Platformu";

export const INSTITUTION_ADDRESS = "Ege Üniversitesi Tıp Fakültesi, 35100 Bornova, İzmir";

export const DEFAULT_KVKK_URL = "https://egemed.ege.edu.tr/kvkk";
