// Bu dosya yalnızca typecheck koruması içindir; test koşucusu çalıştırmaz
// (vitest include deseni `*.test.ts`). Her `@ts-expect-error` gerçek bir tip
// hatasını hedefler; hata kaybolursa satır kullanılmaz hale gelir ve
// typecheck kırılır.
import {
  activityIri,
  opaqueActor,
  parseOpaqueActorId,
  type ActivityIri,
  type OpaqueActorId,
  type SimulatorId,
  type VerbKey,
  type XapiActor,
} from "../../packages/xapi-profile/src/index";

export const validActivityIri: ActivityIri = activityIri(
  "https://xapi.egemed.example/clix/",
  { simulator: "pulse" },
);

export const validOpaqueId: OpaqueActorId = parseOpaqueActorId("kurum-ogrenci-0001");

export const validActor: XapiActor = opaqueActor(
  "https://moodle.egemed.example",
  validOpaqueId,
);

// @ts-expect-error ham string ActivityIri yerine geçmez (marka zorunlu).
export const rawActivityIri: ActivityIri = "https://xapi.egemed.example/clix/pulse";

// @ts-expect-error ham string OpaqueActorId yerine geçmez (marka zorunlu).
export const rawOpaqueId: OpaqueActorId = "kurum-ogrenci-0001";

export const actorWithMbox: XapiActor = {
  objectType: "Agent",
  account: { homePage: "https://moodle.egemed.example", name: validOpaqueId },
  // @ts-expect-error XapiActor'a mbox eklenemez (ADR-005).
  mbox: "mailto:ogrenci@ornek.example",
};

export const actorWithName: XapiActor = {
  objectType: "Agent",
  // @ts-expect-error XapiActor'da üst düzey name alanı yoktur (ADR-005).
  name: "Ali Veli",
  account: { homePage: "https://moodle.egemed.example", name: validOpaqueId },
};

// @ts-expect-error bilinmeyen fiil anahtarı reddedilir.
export const unknownVerb: VerbKey = "started";

// @ts-expect-error bilinmeyen simülatör reddedilir.
export const unknownSimulator: SimulatorId = "pulse2";
