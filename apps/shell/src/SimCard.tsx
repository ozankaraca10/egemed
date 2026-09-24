import type { JSX } from "react";
import { Badge, Card } from "@egemed/ui";
import { t } from "@egemed/ui/i18n";

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

export interface SimCardProps {
  readonly id: SimId;
  /** Simülatörler sayfasında logo ve kart bir kademe büyür. */
  readonly size?: "default" | "large";
  /** Başlık düzeyi; ana sayfada bölüm altında 3, simülatörler sayfasında 2. */
  readonly headingLevel?: 2 | 3;
  /**
   * Henüz sim rotası yokken gösterilen bağlantı; simülatörler sayfasında
   * kartın kendine bağlanmaması için verilmez.
   */
  readonly href?: `#${string}`;
}

/**
 * Simülatör kartı: logo (dekoratif, ad başlıkta), ad, tagline, tanıtım,
 * "Platforma taşınıyor" rozeti ve isteğe bağlı bağlantı. Kart kabuğu
 * `@egemed/ui` Card; gölge/radius aile token'larından gelir.
 */
export function SimCard({
  id,
  size = "default",
  headingLevel = 3,
  href,
}: SimCardProps): JSX.Element {
  const logo = SIM_LOGOS[id];
  return (
    <Card
      footer={<Badge tone="info">{t("sims.soon")}</Badge>}
      headingLevel={headingLevel}
      title={t(`sims.${id}.name`)}
    >
      <div className={`eg-shell-sim eg-shell-sim--${size}`}>
        <img
          alt=""
          className="eg-shell-sim__logo"
          height={logo.height}
          src={logo.src}
          width={logo.width}
        />
        <p className="eg-shell-sim__tagline">{t(`sims.${id}.tagline`)}</p>
        <p className="eg-shell-sim__body">{t(`sims.${id}.body`)}</p>
        {href === undefined ? null : (
          <a className="eg-shell-sim__link" href={href}>
            {t("sims.open")}
          </a>
        )}
      </div>
    </Card>
  );
}
