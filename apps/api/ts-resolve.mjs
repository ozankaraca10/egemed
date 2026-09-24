/**
 * Node'un yerleşik TypeScript desteği göreli içe aktarmalarda açık uzantı
 * ister; `packages/contracts` kaynakları uzantısız yazıldığı için (ör.
 * `./ids`) düz Node çözümlemesi ERR_MODULE_NOT_FOUND verir. `dev` ve `start`
 * bu kancayla uzantısız göreli importları `.ts`e tamamlar.
 * packages/contracts açık uzantıya geçince veya derlenmiş çıktı yayınlayınca
 * bu dosya, `ts-register.mjs` ve `--import` bayrağı kaldırılabilir.
 */
export function resolve(specifier, context, nextResolve) {
  if (specifier.startsWith("./") || specifier.startsWith("../")) {
    return nextResolve(specifier, context).catch(() => nextResolve(`${specifier}.ts`, context));
  }
  return nextResolve(specifier, context);
}
