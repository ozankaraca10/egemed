/** Bu dilimin kullandığı dekoratif ikonlar. Tam ikon seti S12a'dadır.
 *  Anlam metin ve `aria-pressed` / `aria-checked` ile taşınır. */
import type { SVGProps } from "react";

type IconProps = SVGProps<SVGSVGElement>;

function base(props: IconProps): IconProps {
  return {
    xmlns: "http://www.w3.org/2000/svg",
    width: 18,
    height: 18,
    viewBox: "0 0 24 24",
    fill: "none",
    stroke: "currentColor",
    strokeWidth: 2,
    strokeLinecap: "round",
    strokeLinejoin: "round",
    "aria-hidden": true,
    focusable: false,
    ...props,
  };
}

export function IconBell(props: IconProps) {
  return (
    <svg {...base(props)}>
      <path d="M12 3a6 6 0 0 0-6 6v4l-2 4h16l-2-4V9a6 6 0 0 0-6-6z" />
      <path d="M10 20a2 2 0 0 0 4 0" />
    </svg>
  );
}

export function IconDiaphragm(props: IconProps) {
  return (
    <svg {...base(props)}>
      <circle cx="12" cy="9" r="5" />
      <circle cx="12" cy="9" r="2" />
      <path d="M12 14v3" />
      <path d="M8 20h8" />
      <path d="M12 17a3 3 0 0 0-3 3" />
    </svg>
  );
}

export function IconVolume(props: IconProps) {
  return (
    <svg {...base(props)}>
      <path d="M11 5 6 9H3v6h3l5 4z" />
      <path d="M15.5 8.5a5 5 0 0 1 0 7" />
      <path d="M18.5 5.5a9 9 0 0 1 0 13" />
    </svg>
  );
}

export function IconVolumeX(props: IconProps) {
  return (
    <svg {...base(props)}>
      <path d="M11 5 6 9H3v6h3l5 4z" />
      <path d="M22 9l-6 6" />
      <path d="M16 9l6 6" />
    </svg>
  );
}

export function IconLightbulb(props: IconProps) {
  return (
    <svg {...base(props)}>
      <path d="M9 18h6M10 21h4" />
      <path d="M12 3a6 6 0 0 1 3.7 10.7c-.7.6-1 1.4-1 2.3h-4c0-.9-.3-1.7-1-2.3A6 6 0 0 1 12 3z" />
    </svg>
  );
}

export function IconBodyFront(props: IconProps) {
  return (
    <svg {...base(props)}>
      <circle cx="12" cy="4.5" r="2" />
      <path d="M8 8h8v6l-1.5 9h-2l-.5-7-.5 7h-2L8 14z" />
      <path d="M8 8l-2.5 2M16 8l2.5 2" />
    </svg>
  );
}

export function IconBodyBack(props: IconProps) {
  return (
    <svg {...base(props)}>
      <circle cx="12" cy="4.5" r="2" />
      <path d="M8 8h8v6l-1.5 9h-2L12 16l-.5 7h-2L8 14z" />
      <path d="M9 9.5h6M9.5 12h5" />
    </svg>
  );
}

export function IconCheck(props: IconProps) {
  return (
    <svg {...base(props)}>
      <path d="m5 12 5 5 9-10" />
    </svg>
  );
}

export function IconCheckCircle(props: IconProps) {
  return (
    <svg {...base(props)}>
      <circle cx="12" cy="12" r="9" />
      <path d="m8.5 12.5 2.5 2.5 5-6" />
    </svg>
  );
}

export function IconXCircle(props: IconProps) {
  return (
    <svg {...base(props)}>
      <circle cx="12" cy="12" r="9" />
      <path d="M9 9l6 6M15 9l-6 6" />
    </svg>
  );
}
