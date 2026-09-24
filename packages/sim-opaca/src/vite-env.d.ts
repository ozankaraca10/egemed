/** Vite derleme sabitleri — `import.meta.env.DEV` (DevPanel kapısı, üretim rotasına girmez). */
interface ImportMetaEnv {
  readonly DEV: boolean;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
