import type { JSX } from "react";
import { Card } from "@egemed/ui";
import { t } from "@egemed/ui/i18n";
import { prefetchSimModule } from "./sims/loaders";

/** Simülatör kimlikleri; sıra AGENTS.md'deki Pulse → Ausculta → Opaca sırasıdır. */
export const SIM_IDS = ["pulse", "ausculta", "opaca"] as const;
export type SimId = (typeof SIM_IDS)[number];

/**
 * Yatay sim logoları. `width`/`height` gerçek piksel oranıyla verilir; kart
 * görseli sabit yüksekliğe `object-fit: contain` ile oturur, CLS oluşmaz.
 */
export const SIM_LOGOS: Record<SimId, { src: string; width: number; height: number }> = {
  ausculta: { height: 169, src: "/brand/sims/ausculta-horizontal.png", width: 640 },
  opaca: { height: 300, src: "/brand/sims/opaca-horizontal.png", width: 849 },
  pulse: { height: 266, src: "/brand/sims/pulse-horizontal.png", width: 800 },
};

/**
 * Giriş ekranı sol paneli için beyaz sim ikonları. Üç kaynak da beyaz-saydam
 * PNG'dir (Pulse marka kitindeki `09_..._symbol-white.png`); CSS filtresi
 * gerekmez. `width`/`height` doğal piksel oranıdır.
 */
export const SIM_ICONS: Record<SimId, { src: string; width: number; height: number }> = {
  ausculta: { height: 128, src: "/brand/sims/ausculta-icon-white.png", width: 118 },
  opaca: { height: 256, src: "/brand/sims/opaca-icon-white.png", width: 256 },
  pulse: { height: 1024, src: "/brand/sims/pulse-icon-white.png", width: 1024 },
};

/** Kart başlığı düzeyleri; `Card` ile aynı eşleme (2 → h2, 3 → h3). */
const headingTags = { 2: "h2", 3: "h3" } as const;

export interface SimCardProps {
  readonly id: SimId;
  /** Simülatörler sayfasında logo ve kart bir kademe büyür. */
  readonly size?: "default" | "large";
  /** Başlık düzeyi; ana sayfada bölüm altında 3, simülatörler sayfasında 2. */
  readonly headingLevel?: 2 | 3;
  /**
   * "Simülatörü aç" bağlantısı; her iki sayfada da sim rotasına
   * (`simHref`) gider, verilmezse bağlantı çizilmez.
   */
  readonly href?: `#${string}`;
  /** API oturumunda sim listede yoksa kart işaretlenir; bağlantı açık kalır. */
  readonly denied?: boolean;
}

/**
 * Simülatör kartı: ad (görsel gizli erişilebilir başlık), logo, tagline,
 * tanıtım ve isteğe bağlı bağlantı. Üç sim de gerçek modüllere bağlandığı
 * için "Platforma taşınıyor" rozeti kalkmıştır (T14e); logo adı zaten
 * taşıdığı için `alt=""` kalır ve erişilebilir ad tek kaynaktan (başlık)
 * gelir. Kart kabuğu `@egemed/ui` Card; gölge/radius aile token'larından
 * gelir.
 */
export function SimCard({
  id,
  size = "default",
  headingLevel = 3,
  href,
  denied = false,
}: SimCardProps): JSX.Element {
  const logo = SIM_LOGOS[id];
  const Heading = headingTags[headingLevel];
  return (
    <Card>
      <div className={`eg-shell-sim eg-shell-sim--${size}`}>
        <div className="eg-shell-sim__head">
          <Heading className="eg-visually-hidden">{t(`sims.${id}.name`)}</Heading>
        </div>
        <img
          alt=""
          className="eg-shell-sim__logo"
          height={logo.height}
          src={logo.src}
          width={logo.width}
        />
        <p className="eg-shell-sim__tagline">{t(`sims.${id}.tagline`)}</p>
        <p className="eg-shell-sim__body">{t(`sims.${id}.body`)}</p>
        {denied ? <p className="eg-shell-sim__noaccess">{t("sims.access.none")}</p> : null}
        {href === undefined ? null : (
          <a
            className="eg-shell-sim__link"
            href={href}
            onFocus={() => prefetchSimModule(id)}
            onMouseEnter={() => prefetchSimModule(id)}
            onTouchStart={() => prefetchSimModule(id)}
          >
            {t("sims.open")}
          </a>
        )}
      </div>
    </Card>
  );
}
