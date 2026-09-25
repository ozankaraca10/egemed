import type { GamiAvatarModel } from "./types";

export function GamiAvatar({ model, size = "md" }: { model: GamiAvatarModel; size?: "md" | "lg" }) {
  return (
    <span className={`eg-gami-avatar ${model.tone}${size === "lg" ? " lg" : ""}`} aria-hidden="true">
      {model.text}
    </span>
  );
}
