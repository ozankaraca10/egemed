// EGEMED Pulse runtime — platform kaynağı (ADR-011). Doğrudan düzenlenir; kaynak depo artık yetkili değil.
import type { PulseScriptEnv } from "../env";
declare function run(env: PulseScriptEnv): void;
export default run;
