// EGEMED Pulse runtime — platform kaynağı (ADR-011). Doğrudan düzenlenir; kaynak depo artık yetkili değil.
// Köken: EGEMED_PULSE/cardai/scorm.js (2026-09-27 anlık görüntüsü).
// T278 (ADR-006): SCORM/LMS iletişimi (API arama, LMS* çağrıları, cmi.* alanları)
// kaldırıldı; `CardAIScorm` adı ve yerel (localStorage) kalıcılık davranışı korunur.
/* eslint-disable */
export default function run(env) {
const { window, document, localStorage, setTimeout, clearTimeout, setInterval, clearInterval, requestAnimationFrame, cancelAnimationFrame, ResizeObserver, CardAIModel, CardAIScorm, PulseCurriculum, PulseState } = env;
/* Yerel kalıcılık: 4096 bayt sınırı, bozuk kayıt koruması ve sürüm denetimi ağsız sürer. */
(function(){'use strict';
const KEY='egemed-pulse-6.0',LEGACY_KEYS=['egemed-pulse-5.0','egemed-cardai-4.0','egemed-cardai-3.0','egemed-cardai-2.0','egemed-cardai-1.0'];
let finished=false,resumeReadOK=true,activeMs=0,lastActive=performance.now(),activity=false;
let lastResult={ok:false,core:'not-saved',interactions:'none',errors:[]};
function blockResume(reason){resumeReadOK=false;lastResult={ok:false,core:'resume-read-failed',interactions:'none',errors:[reason]};return null;}
function load(){let raw='';try{raw=localStorage.getItem(KEY)||LEGACY_KEYS.map(k=>localStorage.getItem(k)).find(Boolean)||'';}catch{return blockResume('Devam kaydı okunamadı; önceki veri korundu');}
if(!raw){resumeReadOK=true;return null;}if(new TextEncoder().encode(raw).length>4096)return blockResume('Devam kaydı 4096 bayt sınırından büyük; önceki veri korundu');let obj;try{obj=JSON.parse(raw);}catch{return blockResume('Devam kaydı bozuk JSON; önceki veri korundu');}if(!obj||typeof obj!=='object'||Array.isArray(obj)||!Number.isInteger(obj.version)||obj.version<1||obj.version>6)return blockResume('Desteklenmeyen devam kaydı sürümü/biçimi; önceki veri korundu');resumeReadOK=true;return obj;}
function acknowledgeReset(){resumeReadOK=true;lastResult={ok:false,core:'reset-pending',interactions:'none',errors:[]};}
function addTime(){const now=performance.now();if(activity&&!document.hidden&&!finished)activeMs+=Math.max(0,now-lastActive);lastActive=now;}
function setActivity(on){addTime();activity=!!on;}
function sessionTime(){addTime();const cs=Math.floor(activeMs/10),h=Math.min(9999,Math.floor(cs/360000)),m=Math.floor(cs/6000)%60,s=Math.floor(cs/100)%60;return String(h).padStart(4,'0')+':'+String(m).padStart(2,'0')+':'+String(s).padStart(2,'0')+'.'+String(cs%100).padStart(2,'0');}
function save(state){if(finished){lastResult={ok:false,core:'ended',interactions:'none',errors:['Kayıt oturumu sonlandırıldı']};return false;}
if(!resumeReadOK){lastResult={ok:false,core:'resume-read-failed',interactions:'none',errors:['Devam kaydı okunamadı; önce yeniden okuma gerekir']};return false;}
let serial;try{serial=JSON.stringify(window.PulseState?window.PulseState.encode(state):state);}catch{lastResult={ok:false,core:'serialization-failed',interactions:'none',errors:['Durum kodlanamadı']};return false;}
if(new TextEncoder().encode(serial).length>4096){lastResult={ok:false,core:'oversize',interactions:'none',errors:['Kayıt 4096 bayt sınırını aşıyor']};return false;}
try{localStorage.setItem(KEY,serial);lastResult={ok:true,core:'local',interactions:'local-only',errors:[]};return true;}catch{lastResult={ok:false,core:'local-failed',interactions:'local-only',errors:['Tarayıcı kaydı reddetti']};return false;}}
function finish(state){if(finished)return false;if(!save(state))return false;return true;}
function clearLocal(){try{localStorage.removeItem(KEY);LEGACY_KEYS.forEach(k=>localStorage.removeItem(k));return true;}catch{return false;}}
document.addEventListener('visibilitychange',addTime);
window.addEventListener('pagehide',()=>{try{if(!finished)finish(window.CardAIController?.state);}catch{}});
window.CardAIScorm={load,save,finish,clearLocal,acknowledgeReset,setActivity,sessionTime,get ended(){return finished;},get resumeBlocked(){return !resumeReadOK;},get lastResult(){return {...lastResult,errors:[...lastResult.errors]};},get activeMilliseconds(){addTime();return activeMs;},key:KEY};
})();

}
