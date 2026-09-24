import { register } from "node:module";

// `dev`/`start` bu dosyayı `--import` ile yükler; kanca gerekçesi için
// `ts-resolve.mjs` başlığına bakın.
register("./ts-resolve.mjs", import.meta.url);
