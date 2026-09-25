import type { ReactNode } from "react";

export function GamiDemoBanner({ icon }: { icon: ReactNode }) {
  return (
    <div className="eg-gami-demo" role="note">
      {icon} Demo verisi — gösterilen kişiler, puanlar ve sıralamalar örnektir; gerçek öğrenci verisi değildir.
    </div>
  );
}
