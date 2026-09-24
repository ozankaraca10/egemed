import type { JSX } from "react";
import { IconInfo } from "../icons";
import { useGamiContext } from "../../gamification/GamiContext";

/** API senkronizasyon hatası — oturum verisi kaybolmadığı vurgulanır (T79a, ADR-004). */
export function GamiSyncErrorBanner(): JSX.Element | null {
  const { syncError, clearSyncError } = useGamiContext();
  if (!syncError) return null;
  return (
    <div className="gami-sync-error" role="alert">
      <IconInfo width={16} height={16} />
      <span>{syncError.message}</span>
      <button type="button" className="btn outline small" onClick={clearSyncError}>
        Kapat
      </button>
    </div>
  );
}
