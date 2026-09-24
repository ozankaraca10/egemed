import type { GamiStorage } from "../gamification/repo";
import type { StoragePort } from "./reducer";

/** Kayıt ad alanı: kullanıcı×sim (PULSE-08 deseni). Anonim oturumun kaydı
 *  hesaba taşınmaz; eski öneksiz kayıtlar hiçbir hesaba aktarılmaz.
 *  Anahtara kullanıcı adı/e-posta değil, yalnız oturumun takma kimliği girer. */
export function auscultaStorageNamespace(actorId: string | undefined): string {
  return actorId === undefined || actorId.length === 0
    ? "egemed:anon:ausculta:"
    : `egemed:u:${encodeURIComponent(actorId)}:ausculta:`;
}

/** `StoragePort`u ad alanına sarar: tüm okuma/yazmalar önekli olur; öneksiz
 *  anahtarlar ne okunur ne yazılır (aynı tarayıcıdaki hesaplar karışmaz). */
export function namespacedStoragePort(storage: StoragePort, namespace: string): StoragePort {
  return {
    get: (key) => storage.get(namespace + key),
    set: (key, value) => storage.set(namespace + key, value),
  };
}

/** Oyunlaştırma deposunu aynı ad alanlı `StoragePort`a bağlar; ayrı anahtar yolu yoktur. */
export function gamiStoragePort(storage: StoragePort): GamiStorage {
  return {
    getItem: (key) => storage.get(key),
    setItem: (key, value) => storage.set(key, value),
  };
}
