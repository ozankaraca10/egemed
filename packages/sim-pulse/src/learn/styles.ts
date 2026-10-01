/** T298 — öğrenme çalışma alanı stili (Pulse gölge kökü; `pl-` önekli). */
export const PULSE_LEARN_CSS = `
#simView.pl-active > .rhythm-tabs,
#simView.pl-active > #workspace,
#simView.pl-active > .transport,
#simView.pl-active > #guidedCoach { display: none !important; }
#simView.pl-active { grid-template-rows: minmax(0, 1fr); }
/* Masaüstünde öğrenme alanı kabuk başlığı ile alt bilgi arasına tam oturur
   (mod seçimiyle aynı pay); sayfa kaymaz, sütunlar kendi içinde kayar. */
@media (min-width: 1101px) {
  :host(.pulse-unified) .app:has(#simView.pl-active:not([hidden])) { height: calc(var(--pulse-vh, 100dvh) - 2.5625rem); min-height: 0; }
  .app:has(#simView.pl-active:not([hidden])) main { min-height: 0; overflow: hidden; }
}
.pl {
  --pl-navy: #0a2a5e; --pl-ink: #0f1f38; --pl-ink-2: #33475f; --pl-ink-3: #4a5d75;
  --pl-line: #dbe4ef; --pl-surface: #f4f7fc; --pl-card: #fff;
  --pl-red: #c81e36; --pl-red-ink: #a3142a; --pl-red-soft: #fde8eb;
  --pl-gold: #f5a524; --pl-gold-soft: #fff3d6; --pl-green: #15803d;
  --pl-blue: #1557b8; --pl-blue-soft: #eef5ff; --pl-paper: #fffaf8;
  --pl-mono: "JetBrains Mono", ui-monospace, Menlo, monospace;
  display: grid; grid-template-columns: 236px minmax(280px, 320px) minmax(0, 1fr); width: 100%; min-width: 0; height: 100%; min-height: 0; grid-template-rows: minmax(0, 1fr);
  border: 1px solid var(--pl-line); border-radius: 16px; overflow: hidden;
  background: var(--pl-surface); color: var(--pl-ink); font-size: 14px; line-height: 1.5; text-align: left;
}
.pl *, .pl *::before, .pl *::after { box-sizing: border-box; }
.pl [hidden] { display: none !important; }
.pl button { font: inherit; }
.pl button:focus-visible, .pl .pl-cal:focus-visible { outline: 3px solid var(--pl-blue); outline-offset: 2px; }
/* Masaüstü: çerçeve görünür alana oturur, her sütun kendi içinde kayar. */
.pl-rail, .pl-left, .pl-right { min-height: 0; overflow-y: auto; overscroll-behavior: contain; scrollbar-width: thin; }
.pl-rail { display: block; width: auto; min-width: 0; max-width: 100%; background: var(--pl-card); border-right: 1px solid var(--pl-line); padding: 14px 10px; }
.pl-rail h2 { margin: 4px 8px 10px; font-size: 12px; letter-spacing: .12em; text-transform: uppercase; color: var(--pl-ink-3); }
.pl-grp { margin: 12px 8px 4px; font-size: 11px; font-weight: 800; letter-spacing: .08em; color: var(--pl-ink-3); text-transform: uppercase; }
.pl-pt { display: flex; align-items: center; gap: 8px; width: 100%; min-height: 44px; padding: 6px 10px; border: 0; background: none; border-radius: 10px; font-size: 13px; color: var(--pl-ink-2); text-align: left; cursor: pointer; }
.pl-pt:hover { background: var(--pl-surface); }
.pl-pt[aria-current="true"] { background: var(--pl-red-soft); color: var(--pl-red-ink); font-weight: 700; }
.pl-pt[disabled] { opacity: .5; cursor: default; }
.pl-pt .pl-tag { margin-left: auto; font-size: 9.5px; font-weight: 900; letter-spacing: .08em; padding: 2px 6px; border-radius: 4px; background: var(--pl-red-ink); color: #fff; }
.pl-pt .pl-tag.pl-extra { background: var(--pl-blue-soft); color: var(--pl-blue); }
.pl-ck { width: 16px; height: 16px; border-radius: 50%; border: 1.5px solid #c3cfdd; flex: none; display: grid; place-items: center; font-size: 10px; color: #fff; }
.pl-ck.pl-done { background: var(--pl-green); border-color: var(--pl-green); }
.pl-left { padding: 16px; display: grid; grid-auto-rows: max-content; gap: 14px; align-content: start; border-right: 1px solid var(--pl-line); background: linear-gradient(180deg, #fff, var(--pl-surface)); }
.pl-title { display: grid; gap: 4px; }
.pl-eb { font-size: 11px; font-weight: 800; letter-spacing: .12em; text-transform: uppercase; color: var(--pl-red-ink); }
.pl-title h2 { margin: 0; font-size: 22px; letter-spacing: -.02em; color: var(--pl-navy); line-height: 1.15; }
.pl-urg { width: fit-content; font-size: 11.5px; font-weight: 800; color: #fff; background: var(--pl-red-ink); padding: 3px 9px; border-radius: 6px; }
.pl-study { display: grid; gap: 4px; font-size: 11.5px; color: var(--pl-ink-3); }
.pl-study i { display: block; height: 5px; border-radius: 99px; background: var(--pl-line); overflow: hidden; }
.pl-study i b { display: block; height: 100%; background: var(--pl-green); transition: width .3s; }
.pl-heart { position: relative; border-radius: 16px; background: radial-gradient(80% 80% at 50% 40%, #1a2b52, #071433); aspect-ratio: 1 / 1; display: grid; place-items: center; overflow: hidden; }
.pl-heart-svg { width: 92%; height: auto; }
.pl-hlabel { position: absolute; left: 12px; right: 12px; bottom: 10px; font: 700 11px var(--pl-mono); color: #b9c8e4; letter-spacing: .04em; }
.pl-bpm { position: absolute; right: 12px; top: 10px; font: 700 26px var(--pl-mono); color: #fff; }
.pl-bpm small { font-size: 11px; color: #b9c8e4; margin-left: 4px; }
.pl-lbl { font-size: 11px; font-weight: 700; letter-spacing: .06em; text-transform: uppercase; color: var(--pl-ink-3); }
.pl-recs { display: flex; gap: 6px; flex-wrap: wrap; margin-top: 6px; }
.pl-rec { flex: 1; min-width: 84px; min-height: 44px; border-radius: 10px; border: 1.5px solid var(--pl-line); background: #fff; font: 600 12px var(--pl-mono); color: var(--pl-ink-2); cursor: pointer; }
.pl-rec[aria-pressed="true"] { border-color: var(--pl-red); color: var(--pl-red-ink); background: var(--pl-red-soft); }
.pl-meas { display: grid; grid-template-columns: repeat(3, 1fr); gap: 6px; }
.pl-m { background: #fff; border: 1px solid var(--pl-line); border-radius: 10px; padding: 8px; text-align: center; }
.pl-m b { display: block; font: 700 16px var(--pl-mono); color: var(--pl-navy); }
.pl-m span { font-size: 11px; color: var(--pl-ink-3); }
.pl-src { margin: 0; font-size: 11px; color: var(--pl-ink-3); }
.pl-right { position: relative; padding: 12px 14px; display: grid; grid-auto-rows: max-content; gap: 10px; align-content: start; min-width: 0; }
.pl-tools { display: flex; flex-wrap: wrap; gap: 8px; align-items: center; }
.pl-tb { display: inline-flex; align-items: center; gap: 6px; min-height: 44px; padding: 0 12px; border-radius: 10px; border: 1.5px solid var(--pl-line); background: #fff; font-size: 13px; font-weight: 600; color: var(--pl-ink-2); cursor: pointer; }
.pl-tb[aria-pressed="true"] { background: var(--pl-navy); border-color: var(--pl-navy); color: #fff; }
.pl-tb.pl-play { background: var(--pl-red); border-color: var(--pl-red); color: #fff; font-weight: 800; }
.pl-seg { display: inline-flex; border: 1.5px solid var(--pl-line); border-radius: 10px; overflow: hidden; background: #fff; }
.pl-seg button { border: 0; background: none; font: 600 12px var(--pl-mono); padding: 0 10px; min-height: 44px; min-width: 44px; color: var(--pl-ink-3); cursor: pointer; }
.pl-seg button[aria-pressed="true"] { background: var(--pl-blue-soft); color: var(--pl-blue); }
.pl-paper { position: relative; border-radius: 10px; overflow: hidden; background: var(--pl-paper); box-shadow: inset 0 0 0 1px #f0c9cf; min-height: 120px; }
.pl-paper canvas { display: block; width: 100%; }
.pl-orig { display: block; width: 100%; height: auto; }
.pl-orig-note { margin: 0; font-size: 12px; color: var(--pl-ink-3); }
.pl button[disabled] { opacity: .5; cursor: not-allowed; }
.pl-msg { position: absolute; inset: 0; display: grid; place-items: center; gap: 8px; align-content: center; color: var(--pl-ink-2); font-weight: 600; }
.pl-cal { position: absolute; top: 0; cursor: grab; touch-action: none; }
.pl-cal i { position: absolute; top: 0; bottom: 0; width: 2px; background: var(--pl-blue); }
.pl-cal i.pl-a { left: 0; } .pl-cal i.pl-b { right: 0; }
.pl-cal .pl-bridge { position: absolute; left: 0; right: 0; top: 14px; height: 2px; background: var(--pl-blue); }
.pl-cal .pl-read { position: absolute; left: 50%; top: -1px; transform: translateX(-50%); font: 700 11px var(--pl-mono); color: #fff; background: var(--pl-blue); padding: 2px 7px; border-radius: 6px; white-space: nowrap; }
.pl-calrow { display: flex; gap: 6px; align-items: center; flex-wrap: wrap; font-size: 12px; color: var(--pl-ink-3); }
.pl-calrow .pl-tb { padding: 0 10px; }
.pl-about { display: grid; gap: 10px; border-top: 1px solid var(--pl-line); padding-top: 12px; }
.pl-about-head { display: flex; flex-wrap: wrap; align-items: baseline; gap: 4px 10px; }
.pl-about-head h3 { margin: 0; font-size: 17px; color: var(--pl-navy); }
.pl-about-head .pl-lbl { margin-left: auto; }
.pl-alert { background: var(--pl-red-soft); color: var(--pl-red-ink); border-radius: 10px; padding: 10px 12px; font-size: 13px; font-weight: 600; }
.pl-grid { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 10px; }
.pl-card { background: #fff; border: 1px solid var(--pl-line); border-radius: 12px; padding: 12px; display: grid; gap: 8px; align-content: start; }
.pl-crit { background: var(--pl-gold-soft); border-left: 3px solid var(--pl-gold); padding: 10px 12px; border-radius: 0 8px 8px 0; font-size: 13px; }
.pl-refs { margin: 0; font-size: 12px; color: var(--pl-ink-3); display: flex; flex-wrap: wrap; align-items: center; column-gap: 8px; }
.pl-refs a, .pl-src a { display: inline-flex; align-items: center; min-height: 44px; }
.pl a { color: var(--pl-blue); text-decoration: underline; text-underline-offset: 2px; }
.pl a:focus-visible { outline: 3px solid var(--pl-blue); outline-offset: 2px; border-radius: 2px; }
.pl-look { margin: 0; padding-left: 18px; color: var(--pl-ink-2); font-size: 13px; display: grid; gap: 4px; }
.pl-mech { margin: 0; font-size: 13px; color: var(--pl-ink-2); }
@media (max-width: 1100px) {
  /* Dar ekran: tek sütun, kaynağın main öğesiyle doğal akışta kayar. */
  #simView.pl-active { height: auto; grid-template-rows: auto; }
  .pl { grid-template-columns: minmax(0, 1fr); grid-template-rows: none; height: auto; }
  .pl-left, .pl-right { overflow: visible; }
  .pl-rail { display: block; overflow-x: auto; overflow-y: hidden; padding: 10px; border-right: 0; border-bottom: 1px solid var(--pl-line); }
  .pl-rail h2, .pl-grp { display: none; }
  .pl-rail [data-pl="list"] { display: flex; gap: 6px; width: max-content; }
  .pl-pt { flex: none; width: auto; white-space: nowrap; }
  .pl-left { border-right: 0; }
  .pl-heart { max-width: 340px; justify-self: center; width: 100%; }
}
@media (max-width: 900px) { .pl-grid { grid-template-columns: 1fr; } }
@media (prefers-reduced-motion: reduce) { .pl-study i b { transition: none; } }
`;
