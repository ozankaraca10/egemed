import { assertHttpsIri } from "./iri";
import type { OpaqueActorId } from "./profile";

/** Opak kimlik biçimi: 8–128 karakter; `@` ve boşluk yok (ADR-005). */
const OPAQUE_ID = /^[A-Za-z0-9._:-]{8,128}$/;

/** Ham metni doğrulayıp markalı opak kimliğe çevirir; aksi RangeError. */
export function parseOpaqueActorId(raw: string): OpaqueActorId {
  if (!OPAQUE_ID.test(raw)) {
    throw new RangeError(`Geçersiz opak kimlik: ${JSON.stringify(raw)}`);
  }
  return raw as OpaqueActorId;
}

/**
 * xAPI aktörü; yalnız `account{homePage,name}` taşır (ADR-005).
 * mbox, mbox_sha1sum, openid ve ad alanları kasten yoktur.
 */
export interface XapiActor {
  readonly objectType: "Agent";
  readonly account: { readonly homePage: string; readonly name: OpaqueActorId };
}

/** Doğrulanmış aktör üretir; `homePage` https değilse RangeError. */
export function opaqueActor(homePage: string, id: OpaqueActorId): XapiActor {
  assertHttpsIri(homePage, "homePage https olmalı", "Geçersiz homePage");
  return { objectType: "Agent", account: { homePage, name: id } };
}
