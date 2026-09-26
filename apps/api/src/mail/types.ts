/** T170 — tüm `render<Name>` şablon fonksiyonlarının ortak dönüş biçimi. */
export interface MailRenderResult {
  readonly subject: string;
  readonly html: string;
  readonly text: string;
}
