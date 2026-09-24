/// <reference lib="dom" />

/**
 * Kaynak Pulse betiklerine (`vendor/*.js`) verilen gölge ortam. Adlar
 * `tools/sync-runtime.mjs` içindeki ENV_NAMES ile birebir aynıdır; betikler bu
 * adları global yerine `env`den okur.
 */
export interface PulseScriptEnv {
  readonly window: Window;
  readonly document: Document;
  readonly localStorage: Storage;
  readonly setTimeout: typeof setTimeout;
  readonly clearTimeout: typeof clearTimeout;
  readonly setInterval: typeof setInterval;
  readonly clearInterval: typeof clearInterval;
  readonly requestAnimationFrame: typeof requestAnimationFrame;
  readonly cancelAnimationFrame: typeof cancelAnimationFrame;
  readonly ResizeObserver: typeof ResizeObserver;
  readonly CardAIModel: unknown;
  readonly CardAIScorm: unknown;
  readonly PulseCurriculum: unknown;
  readonly PulseState: unknown;
}
