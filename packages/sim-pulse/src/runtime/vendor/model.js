// EGEMED Pulse runtime — platform kaynağı (ADR-011). Doğrudan düzenlenir; kaynak depo artık yetkili değil.
// Köken: EGEMED_PULSE/cardai/model.js (2026-09-27 anlık görüntüsü).
/* eslint-disable */
export default function run(env) {
const { window, document, localStorage, setTimeout, clearTimeout, setInterval, clearInterval, requestAnimationFrame, cancelAnimationFrame, ResizeObserver, CardAIModel, CardAIScorm, PulseCurriculum, PulseState } = env;
/* EGEMED PULSE: bounded, deterministic educational signal. Seconds / mV.
   Shared fiducials describe the drawn support, not patient measurements. */
(function(root){
'use strict';
const MODES=['normal','af','stemi','pvc','svt','inferior','vt','vf','pat','flutter','sintach','lbbb','rbbb'];
const LEADS=['I','II','III','aVR','aVL','aVF','V1','V2','V3','V4','V5','V6'];
const NO_P=['af','svt','vt','vf','flutter'];
const clamp=(v,a,b)=>Math.max(a,Math.min(b,v));
const bell=(t,c,w,a)=>Math.abs(t-c)>w?0:a*(1+Math.cos(Math.PI*(t-c)/w))/2;
function interpolate(t,pts){for(let i=1;i<pts.length;i++){const a=pts[i-1],b=pts[i];if(t>=a[0]&&t<=b[0])return a[1]+(b[1]-a[1])*(t-a[0])/(b[0]-a[0]);}return 0;}
function limb(i,ii){return {I:i,II:ii,III:ii-i,aVR:-(i+ii)/2,aVL:i-ii/2,aVF:ii-i/2};}
const leadShape={...limb(.72,1),V1:-.62,V2:-.28,V3:.34,V4:.92,V5:1.06,V6:.82};
const pShape={...limb(.8,1),V1:.55,V2:.75,V3:.78,V4:.7,V5:.62,V6:.55};
const tShape={...limb(.72,1),V1:-.28,V2:.15,V3:.55,V4:1,V5:1.05,V6:.86};
const anteriorST={...limb(.04,-.04),V1:.12,V2:.24,V3:.32,V4:.24,V5:.08,V6:.03};
const inferiorST={...limb(-.08,.20),V1:-.04,V2:-.03,V3:0,V4:.02,V5:.04,V6:.04};
const SHAPES={normal:[[0,0],[.2,-.13],[.5,1],[.7,-.25],[1,0]],pvc:[[0,0],[.12,-.18],[.27,.25],[.45,1.08],[.67,-.58],[.86,-.12],[1,0]],vt:[[0,0],[.13,-.22],[.30,.35],[.46,1.08],[.65,.65],[.83,-.42],[1,0]],lRight:[[0,0],[.15,.10],[.40,-.88],[.65,-1.12],[.90,-.25],[1,0]],lLeft:[[0,0],[.20,0],[.40,.72],[.56,.48],[.73,1.02],[.92,.22],[1,0]],lOther:[[0,0],[.20,-.12],[.44,.72],[.67,.48],[.92,-.18],[1,0]],rRight:[[0,0],[.14,.28],[.33,-.34],[.58,.92],[.83,.42],[1,0]],rLeft:[[0,0],[.20,-.08],[.36,.90],[.55,.18],[.83,-.48],[1,0]],rOther:[[0,0],[.18,-.10],[.35,.82],[.56,.14],[.85,-.34],[1,0]],
// WPW: QRS'in ilk ~%36'sı yavaş, eğimli yükselir (delta = QRS başlangıcının slurred kısmı, ayrı dalga değil), ardından hızlı His–Purkinje bileşeni.
wpw:[[0,0],[.06,.05],[.36,.34],[.5714,1],[.74,-.16],[.88,-.05],[1,0]]};
function hash(n){let x=(n+173812)>>>0;x=Math.imul(x^(x>>>16),0x45d9f3b);x=Math.imul(x^(x>>>16),0x45d9f3b);return ((x^(x>>>16))>>>0)/4294967296;}
function fiducials(mode,isPVC=false){const kind=isPVC?'pvc':mode==='pvc'?'normal':mode,qrs=kind==='pvc'?.14:kind==='vt'?.18:kind==='lbbb'?.16:kind==='rbbb'?.14:.08,qrsStart=['pvc','rbbb'].includes(kind)?-.06:['vt','lbbb'].includes(kind)?-.07:-.04,qrsEnd=qrsStart+qrs,hasP=!NO_P.includes(mode)&&!isPVC,pr=mode==='pat'?.14:.175,pStart=hasP?qrsStart-pr:null,pEnd=hasP?pStart+.09:null;
const fast=['svt','pat','flutter','sintach','vt'].includes(mode),tStart=qrsEnd+(fast?.025:.07),tEnd=tStart+(fast?.14:.20);
return {qrsStart,qrsEnd,pStart,pEnd,pCenter:hasP?(pStart+pEnd)/2:null,pr:hasP?pr:null,qrs,qt:tEnd-qrsStart,tStart,tEnd,tCenter:(tStart+tEnd)/2,j:qrsEnd,stMeasure:qrsEnd+.02};}

/* ---------------------------------------------------------------------------
   Patterns 14–23 (T204, ADR-011): tek küresel zaman çizelgesi üzerinde atriyal ve
   ventriküler olaylar. Her derivasyon aynı olaylardan türetilir; derivasyon yalnız
   polarite/amplitüd/morfolojiyi değiştirir. Aşağıdaki sayılar PEDAGOJİK SİMÜLASYON
   parametreleridir, tanı eşiği değildir (bkz. docs/specs/pulse-patern-14-23-tibbi-validasyon.md).
   ------------------------------------------------------------------------- */
const PATTERN_MODES=['sinbrady','avb1','mobitz1','mobitz2','chb','pac','junctional','wpw','pericarditis','hyperk'];
const EXT=new Set(PATTERN_MODES);
const ALL_MODES=[...MODES,...PATTERN_MODES];
// Mobitz I: 4:3 Wenckebach — PR 160→220→260 ms, 4. P iletilmez; atriyal döngü 750 ms (80/dk).
const M1_PP=.75,M1_PR=[.16,.22,.26];
// Mobitz II: 4:3 — iletilen atımlarda PR 180 ms sabit, 4. P ani iletilmez; atriyal döngü 800 ms (75/dk).
const M2_PP=.80,M2_PR=.18;
// Tam AV blok: iki bağımsız saat — atriyum 720 ms (≈83/dk), ventriküler kaçış 1600 ms (≈38/dk).
const CHB_PP=.72,CHB_RR=1.6,CHB_A0=-8.37;
// PAC: temel sinüs 72/dk; ardışık PAC arası sinüs atımı sayısı döngüsü (tasarım parametresi, tanı kriteri değil).
const PAC_RR=.833,PAC_COUPLING=.56,PAC_CYCLE=[6,5,7,6,8,5],PAC_PERIOD=PAC_CYCLE.reduce((a,b)=>a+b+1,0);
function pacKind(n){let m=((n%PAC_PERIOD)+PAC_PERIOD)%PAC_PERIOD;for(const L of PAC_CYCLE){if(m<L)return m===0?'post':'sinus';if(m===L)return 'pac';m-=L+1;}return 'sinus';}
// Ektopik (düşük-orta atriyal odak) P: sinüs P'sinden farklı eksen — II'de basık, V1'de negatif.
const ectopicPShape={...limb(.85,.30),V1:-.55,V2:-.15,V3:.35,V4:.46,V5:.44,V6:.40};
// Retrograd P (kavşak kaynaklı): atriyum aşağıdan yukarı aktive olur — II/III/aVF negatif, aVR pozitif.
const retroPShape={...limb(.25,-.85),V1:.22,V2:-.08,V3:-.22,V4:-.28,V5:-.30,V6:-.28};
// Akut perikardit: yaygın (koroner bölgeyle sınırlı olmayan) konkav ST yükselmesi; aVR'de ST çökmesi; PR segment çökmesi (aVR'de yükselme).
const pericST={...limb(.16,.20),V1:-.02,V2:.14,V3:.20,V4:.22,V5:.20,V6:.16};
const pericPR={...limb(-.05,-.08),V1:.01,V2:-.04,V3:-.06,V4:-.06,V5:-.06,V6:-.05};
// Hiperkalemi: sivri T en belirgin sağ-orta prekordiyal derivasyonlarda; ekstremite derivasyonlarında eksene göre.
const hyperT={...limb(.62,.85),V1:.35,V2:1.25,V3:1.35,V4:1.2,V5:.95,V6:.75};
const PATTERN_SPEC={
  sinbrady:{qrs:.08,qs:-.04,pr:.16},
  avb1:{qrs:.08,qs:-.04,pr:.26},
  mobitz1:{qrs:.08,qs:-.04,pr:null},
  mobitz2:{qrs:.12,qs:-.05,pr:M2_PR},
  chb:{qrs:.14,qs:-.07,pr:null},
  pac:{qrs:.08,qs:-.04,pr:.16},
  junctional:{qrs:.08,qs:-.04,pr:null},
  wpw:{qrs:.14,qs:-.08,pr:.10},
  pericarditis:{qrs:.08,qs:-.04,pr:.16},
  hyperk:{qrs:.12,qs:-.05,pr:.24}};
function mod(n,k){return ((n%k)+k)%k;}
/** Yeni paternlerde atım n'in fiducial noktaları (R tepesine göre saniye). */
function patternFiducials(mode,n){
  const spec=PATTERN_SPEC[mode];let pr=spec.pr,pKind=pr===null?null:'sinus';
  if(mode==='mobitz1'){pr=M1_PR[mod(n,3)];pKind='sinus';}
  if(mode==='pac'&&pacKind(n)==='pac'){pr=.15;pKind='ectopic';}
  const qrsStart=spec.qs,qrsEnd=qrsStart+spec.qrs,hasP=pr!==null,pWidth=mode==='hyperk'?.11:pKind==='ectopic'?.08:.09;
  const pStart=hasP?qrsStart-pr:null,pEnd=hasP?pStart+pWidth:null;
  const tStart=qrsEnd+(mode==='hyperk'?.05:.07),tEnd=tStart+(mode==='hyperk'?.16:.20);
  // İletilmeyen P (Mobitz I/II): döngünün son iletilen atımından bir atriyal döngü sonra.
  let blockedP=null;
  if(mode==='mobitz1'&&mod(n,3)===2)blockedP=pStart+M1_PP+pWidth/2;
  if(mode==='mobitz2'&&mod(n,3)===2)blockedP=pStart+M2_PP+pWidth/2;
  return {qrsStart,qrsEnd,pStart,pEnd,pCenter:hasP?(pStart+pEnd)/2:null,pr:hasP?pr:null,qrs:spec.qrs,qt:tEnd-qrsStart,tStart,tEnd,tCenter:(tStart+tEnd)/2,j:qrsEnd,stMeasure:qrsEnd+.02,pKind,pWidth,blockedP};
}
function patternRR(mode,n){
  switch(mode){
    case 'sinbrady':return 1.25+(hash(n*3+1)-.5)*.04;
    case 'avb1':return .95+(hash(n*3+1)-.5)*.03;
    case 'mobitz1':{const i=mod(n,3);return i===1?M1_PP+M1_PR[1]-M1_PR[0]:i===2?M1_PP+M1_PR[2]-M1_PR[1]:4*M1_PP-(2*M1_PP+M1_PR[2]-M1_PR[0]);} // döngü toplamı = 4 atriyal döngü
    case 'mobitz2':return mod(n,3)===0?2*M2_PP:M2_PP;
    case 'chb':return CHB_RR;
    case 'pac':{const k=pacKind(n);return k==='pac'?PAC_COUPLING+(hash(n*5+2)-.5)*.04:k==='post'?.90+hash(n*5+3)*.07:PAC_RR+(hash(n*3+1)-.5)*.03;}
    case 'junctional':return 1.28;
    case 'wpw':return .83+(hash(n*3+1)-.5)*.03;
    case 'pericarditis':return .68+(hash(n*3+1)-.5)*.02;
    case 'hyperk':return .95+(hash(n*3+1)-.5)*.02;
  }
  return .8;
}
/** Sivri, dar tabanlı T (hiperkalemi öğretici fenotipi). */
function tent(t,c,w,a){const x=Math.abs(t-c)/w;return x>=1?0:a*Math.pow(1-x,1.35);}
class CardiacModel {
constructor(mode,options={}){this.mode=ALL_MODES.includes(mode)?mode:'normal';this.ext=EXT.has(this.mode);this.afProfile=options.afProfile==='rapid'?'rapid':'controlled';this.options={afProfile:this.afProfile};if(Number.isFinite(options.rate)&&options.rate>=50&&options.rate<=220&& !['af','pvc','flutter','vf'].includes(this.mode))this.options.rate=options.rate;this.checkpoints=[{n:0,r:-8.8,prefix:0}];this.beats=[];this.cacheFrom=Infinity;this.cacheTo=-Infinity;this.ensure(2);}
rrAt(n){if(this.ext)return patternRR(this.mode,n);if(this.mode==='af')return this.afProfile==='rapid'?.34+Math.pow(hash(n),1.18)*.22:.60+Math.pow(hash(n),1.22)*.40;if(this.mode==='pvc')return [.8,.8,.48,1.12,.8][n%5];if(this.options.rate)return 60/this.options.rate;return {svt:.36,vt:.38,vf:.28,pat:.40,flutter:.40,sintach:.50}[this.mode]||.8;}
strengthAt(n,rr){if(this.mode==='vf')return 0;if(this.ext)return this.mode==='chb'?.9:this.mode==='junctional'?.93:1;if(this.mode==='af')return clamp(.68+(rr-(this.afProfile==='rapid'?.34:.60))*.55,.68,1.02);if(this.mode==='pvc')return n%5===2?.68:n%5===3?1.06:1;return {svt:.76,vt:.48,pat:.74,flutter:.70,sintach:.84,lbbb:.90,rbbb:.90}[this.mode]||1;}
// Sparse checkpoints (one per128 beats) keep a ten-hour seek below ~1,100 records.
ensureCheckpoints(time){let c=this.checkpoints[this.checkpoints.length-1];while(c.r<time+8){let r=c.r,prefix=c.prefix;for(let j=c.n;j<c.n+128;j++){const rr=this.rrAt(j);r+=rr;prefix+=this.strengthAt(j,rr);}c={n:c.n+128,r,prefix};this.checkpoints.push(c);}}
ensure(time){time=clamp(Number(time)||0,-8,36002);if(time>=this.cacheFrom&&time<=this.cacheTo)return;this.ensureCheckpoints(time);const from=Math.max(-8.7,time-6),to=time+6;let lo=0,hi=this.checkpoints.length-1;while(lo<hi){const mid=Math.ceil((lo+hi)/2);if(this.checkpoints[mid].r<=from)lo=mid;else hi=mid-1;}const c=this.checkpoints[lo];let r=c.r,prefix=c.prefix;const beats=[];for(let n=c.n;r<=to;n++){const rr=this.rrAt(n),strength=this.strengthAt(n,rr);r+=rr;prefix+=strength;const isPVC=this.mode==='pvc'&&n%5===2;if(r>=from-1.2)beats.push({n,r,rr,strength,isPVC,prefix,...(this.ext?patternFiducials(this.mode,n):fiducials(this.mode,isPVC))});}this.beats=beats;this.cacheFrom=from+1.2;this.cacheTo=to-1.2;}
lowerBound(time){let lo=0,hi=this.beats.length;while(lo<hi){const mid=(lo+hi)>>>1;if(this.beats[mid].r<time)lo=mid+1;else hi=mid;}return lo;}
between(a,b){if(!Number.isFinite(a)||!Number.isFinite(b)||b<a)return [];a=clamp(a,-8,36002);b=clamp(b,-8,36002);if(b<a)return [];if(b-a>20){let result=[];for(let t=a;t<=b;t+=8)result.push(...this.between(t,Math.min(b,t+8)));return [...new Map(result.map(x=>[x.n,x])).values()];}this.ensure((a+b)/2);if(a<this.cacheFrom-1.2||b>this.cacheTo+1.2){if(b-a<=6){this.ensure(b>this.cacheTo+1.2?b:a);return this.beats.slice(this.lowerBound(a),this.lowerBound(b+1e-10));}const result=[];for(let t=a;t<b;t+=6)result.push(...this.between(t,Math.min(b,t+6)));return [...new Map(result.map(x=>[x.n,x])).values()];}return this.beats.slice(this.lowerBound(a),this.lowerBound(b+1e-10));}
indexAt(time){this.ensure(time);return Math.max(0,this.lowerBound(time+1e-10)-1);}
qrsSignal(d,lead,b){const u=(d-b.qrsStart)/b.qrs;if(u<0||u>1)return 0;if(this.ext){const shape=this.mode==='wpw'?SHAPES.wpw:this.mode==='chb'?SHAPES.pvc:SHAPES.normal;return interpolate(u,shape)*leadShape[lead]*(1+(hash(b.n*7+3)-.5)*.06);}if(b.isPVC||this.mode==='vt')return interpolate(u,SHAPES[b.isPVC?'pvc':'vt'])*leadShape[lead];if(this.mode==='lbbb'){if(['V1','V2','V3'].includes(lead))return interpolate(u,SHAPES.lRight);if(['V5','V6','I'].includes(lead))return interpolate(u,SHAPES.lLeft);return interpolate(u,SHAPES.lOther)*leadShape[lead];}if(this.mode==='rbbb'){if(['V1','V2'].includes(lead))return interpolate(u,SHAPES.rRight);if(['V5','V6','I'].includes(lead))return interpolate(u,SHAPES.rLeft);return interpolate(u,SHAPES.rOther)*leadShape[lead];}return interpolate(u,SHAPES.normal)*leadShape[lead];}
independentSignal(time,lead){if(this.mode==='vf'){const k=lead==='I'?1:lead==='II'?2:LEADS.indexOf(lead)+1;return .22*Math.sin(2*Math.PI*(3.2+.07*k)*time)+.14*Math.sin(2*Math.PI*(5.7+.03*k)*time+1.1)+.10*Math.sin(2*Math.PI*8.9*time+.37*k)+.07*Math.sin(2*Math.PI*1.7*time*time+.1*k);}
if(this.ext)return this.patternSignal(time,lead);
this.ensure(time);const i=this.indexAt(time);let value=0;
if(this.mode==='af')value=(lead==='I'?.8:lead==='II'?1:pShape[lead])*(.020*Math.sin(2*Math.PI*6.3*time+.7*Math.sin(2.1*time))+.013*Math.sin(2*Math.PI*8.7*time)+.009*Math.sin(2*Math.PI*4.9*time+.2));
if(this.mode==='flutter'){const phase=((time*5)%1+1)%1,scale=lead==='I'?-.025:lead==='II'?-.085:lead==='V1'?.07:.035;value+=(2*phase-1)*scale;}
for(let j=Math.max(0,i-1);j<=Math.min(this.beats.length-1,i+2);j++){const b=this.beats[j],d=time-b.r;if(b.pStart!==null)value+=bell(d,b.pCenter,.045,(this.mode==='pat'?-.13:.14)*pShape[lead]);value+=this.qrsSignal(d,lead,b);
const ls=leadShape[lead],secondary=b.isPVC||this.mode==='vt'||this.mode==='lbbb'||this.mode==='rbbb';let ta=.28*tShape[lead];if(secondary){const side=this.mode==='rbbb'?Math.sign(this.qrsSignal(b.qrsStart+b.qrs*.85,lead,b)):this.mode==='lbbb'&&['V1','V2','V3'].includes(lead)?-1:Math.sign(ls);ta=-.24*side;}value+=bell(d,b.tCenter,(b.tEnd-b.tStart)/2,ta);
if(['stemi','inferior'].includes(this.mode)){const st=(this.mode==='stemi'?anteriorST:inferiorST)[lead];value+=interpolate(d,[[b.qrsEnd-.016,0],[b.qrsEnd,st],[b.tStart,st],[b.tCenter,st*.95],[b.tEnd,0]]);}}
return value;}
/** Yeni paternler: atriyal olaylar (P merkezleri). Tam AV blokta bağımsız atriyal saatten; diğerlerinde atım zaman çizelgesinden. */
atrialEvents(from,to){const out=[];
  if(this.mode==='chb'){const k0=Math.ceil((from-.1-CHB_A0)/CHB_PP),k1=Math.floor((to+.1-CHB_A0)/CHB_PP);for(let k=k0;k<=k1;k++)out.push({t:CHB_A0+k*CHB_PP+.045,kind:'sinus',conducted:false,width:.09,index:k});return out.filter(e=>e.t>=from&&e.t<=to);}
  for(const b of this.between(from-1.7,to+1.7)){
    if(b.pCenter!==null)out.push({t:b.r+b.pCenter,kind:b.pKind,conducted:true,beat:b.n,width:b.pWidth,pr:b.pr});
    if(b.blockedP!==null&&b.blockedP!==undefined)out.push({t:b.r+b.blockedP,kind:'sinus',conducted:false,beat:b.n,width:b.pWidth});
    if(this.mode==='junctional')out.push({t:b.r+b.qrsEnd+.075,kind:'retro',conducted:false,beat:b.n,width:.08});
  }
  return out.filter(e=>e.t>=from&&e.t<=to).sort((a,b)=>a.t-b.t);}
pWave(time,lead,ev){
  if(ev.kind==='retro')return bell(time,ev.t,.04,.10*retroPShape[lead]);
  if(ev.kind==='ectopic')return bell(time,ev.t,.036,.12*ectopicPShape[lead]);
  if(this.mode==='hyperk')return bell(time,ev.t,.055,.07*pShape[lead]);
  return bell(time,ev.t,.045,.14*pShape[lead]);}
patternSignal(time,lead){const events=this.atrialEvents(time-.35,time+.35);this.ensure(time);const i=this.indexAt(time);let value=0;
  for(const ev of events)value+=this.pWave(time,lead,ev);
  for(let j=Math.max(0,i-1);j<=Math.min(this.beats.length-1,i+2);j++){const b=this.beats[j],d=time-b.r,ls=leadShape[lead],tw=(b.tEnd-b.tStart)/2;
    value+=this.qrsSignal(d,lead,b);
    if(this.mode==='chb')value+=bell(d,b.tCenter,tw,-.26*Math.sign(ls));           // kaçış QRS'ine sekonder, uyumsuz T
    else if(this.mode==='wpw')value+=bell(d,b.tCenter,tw,-.10*Math.sign(ls)+.06*tShape[lead]); // preeksitasyona sekonder ST-T
    else if(this.mode==='hyperk')value+=tent(d,b.tCenter,tw,.55*hyperT[lead]);     // sivri, dar tabanlı T
    else value+=bell(d,b.tCenter,tw,.28*tShape[lead]);
    if(this.mode==='pericarditis'){const st=pericST[lead];value+=interpolate(d,[[b.qrsEnd-.012,0],[b.qrsEnd,st*.7],[b.qrsEnd+.05,st*.84],[b.tStart+.05,st],[b.tCenter+.02,st*.9],[b.tEnd+.05,0]]);
      if(b.pEnd!==null){const pr=pericPR[lead];value+=interpolate(d,[[b.pEnd-.025,0],[b.pEnd+.005,pr],[b.qrsStart-.006,pr],[b.qrsStart+.004,0]]);}}
  }
  return value;}
atrialActivity(time){let a=0;for(const e of this.atrialEvents(time-.3,time+.2))a=Math.max(a,bell(time,e.t+.035,.045,1));return a;}
/** Yeni paternlerde iletim sisteminin anlık durumu (kalp/iletim animasyonu ve olay metni). */
patternState(time,beat,next,d){
  const evs=this.atrialEvents(time-.4,time+.4),inP=evs.find(e=>Math.abs(time-e.t)<=e.width/2),dN=time-next.r;
  const inQRS=d>=beat.qrsStart&&d<=beat.qrsEnd?beat:dN>=next.qrsStart&&dN<=next.qrsEnd?next:null;
  let avDelay=0;for(const b of [beat,next]){if(b.pEnd===null)continue;const a=b.r+b.pEnd,z=b.r+b.qrsStart;if(time>=a&&time<=z)avDelay=Math.max(.01,clamp((time-a)/Math.max(.01,z-a),0,1));}
  const blocked=this.mode!=='chb'&&evs.some(e=>!e.conducted&&e.kind==='sinus'&&time>=e.t-e.width/2&&time<=e.t+.55);
  const ectopic=evs.some(e=>e.kind==='ectopic'&&time>=e.t-e.width/2-.02&&time<=e.t+.25);
  const retro=this.mode==='junctional'&&evs.some(e=>e.kind==='retro'&&Math.abs(time-e.t)<=.06);
  const junctionFocus=this.mode==='junctional'&&[beat,next].some(b=>time>=b.r+b.qrsStart-.035&&time<=b.r+b.qrsEnd);
  const escape=this.mode==='chb'&&[beat,next].some(b=>time>=b.r+b.qrsStart-.02&&time<=b.r+b.qrsEnd);
  const accessory=this.mode==='wpw'&&[beat,next].some(b=>b.pEnd!==null&&time>=b.r+b.pEnd-.02&&time<=b.r+b.qrsStart+.05);
  const delta=this.mode==='wpw'&&inQRS!==null&&time-inQRS.r<=inQRS.qrsStart+.045;
  let electrical,text=null;
  if(inP)electrical=inP.kind==='retro'?'Retrograd P · Kavşaktan geriye atriyal aktivasyon':inP.kind==='ectopic'?'Erken ektopik P · Atriyal erken uyarı':this.mode==='chb'?'P · Atriyal depolarizasyon (QRS’ten bağımsız)':!inP.conducted?'P · İletilmeyen atriyal uyarı':this.mode==='hyperk'?'Basık P · Atriyal depolarizasyon':'P · Atriyal depolarizasyon';
  else if(inQRS)electrical=delta?'Delta · Aksesuar yolla erken ventriküler aktivasyon':this.mode==='wpw'?'QRS · Preeksitasyon ve normal iletimin füzyonu':this.mode==='chb'?'QRS · Ventriküler kaçış odağı':this.mode==='junctional'?'QRS · Kavşak kaynaklı dar kompleks':'QRS · Ventriküler depolarizasyon';
  else if(avDelay>0)electrical=['avb1','mobitz1'].includes(this.mode)?'PR · AV düğümde gecikme':this.mode==='wpw'?'Kısa PR · Aksesuar yol AV düğümü atlar':this.mode==='pericarditis'?'PR segmenti çökük':'PR · AV iletimi';
  else if(d>=beat.tStart&&d<=beat.tEnd)electrical=this.mode==='hyperk'?'Sivri T · Ventriküler repolarizasyon':'T · Ventriküler repolarizasyon';
  else if(d>beat.qrsEnd&&d<beat.tStart)electrical=this.mode==='pericarditis'?'ST · Yaygın konkav yükselme':'ST segmenti';
  else electrical=this.mode==='chb'?'İzoelektrik · Atriyum ve ventrikül bağımsız':'İzoelektrik aralık';
  if(blocked)text='Atriyal uyarı AV iletim sisteminde durdu; bu P dalgasını QRS izlemiyor.';
  else if(escape)text='Ventriküller kendi kaçış odağıyla uyarılır; atriyal ve ventriküler kasılmalar arasında sabit ilişki yoktur.';
  else if(retro||junctionFocus)text='Uyarı AV kavşaktan çıkar: ventriküllere normal yoldan, atriyumlara geriye doğru yayılır.';
  else if(ectopic)text='Uyarı sinüs düğümü dışındaki bir atriyal odaktan beklenenden erken çıkar ve AV düğümden iletilir.';
  else if(accessory||delta)text='Uyarı aksesuar yoldan ventriküle erken ulaşır; ardından AV düğümden gelen uyarıyla birleşir.';
  else if(avDelay>0&&['avb1','mobitz1'].includes(this.mode))text='Uyarı AV düğümde normalden uzun bekler, sonra ventriküllere geçer.';
  const atrialRate=this.mode==='chb'?Math.round(60/CHB_PP):this.mode==='mobitz1'?Math.round(60/M1_PP):this.mode==='mobitz2'?Math.round(60/M2_PP):null;
  return {electrical,text,atrialRate,conduction:{avDelay,blocked,ectopic,retro,junctionFocus,escape,accessory,delta,dissociation:this.mode==='chb'}};}
signal(time,lead='II'){lead=LEADS.includes(lead)?lead:'II';if(['I','II','V1','V2','V3','V4','V5','V6'].includes(lead))return this.independentSignal(time,lead);const i=this.independentSignal(time,'I'),ii=this.independentSignal(time,'II');return limb(i,ii)[lead];}
mechanicalTimeline(beat,next){const cycle=next.r-beat.r,fast=['svt','pat','flutter','sintach'].includes(this.mode)||this.mode==='af'&&cycle<.60,vt=this.mode==='vt',relaxEnd=vt?.32:fast?.27:.43,scale=Math.min(1,Math.max(.25,(cycle-.04)/relaxEnd));return {start:(vt?.04:fast?.025:.035)*scale,ejectStart:(vt?.10:fast?.06:.09)*scale,ejectEnd:(vt?.25:fast?.18:.30)*scale,relaxEnd:relaxEnd*scale,contractEnd:(vt?.30:fast?.25:.38)*scale,cycle};}
metrics(time,lead='II'){const s=this.snapshot(time),b=s.beat;if(this.mode==='vf')return {pr:null,qrs:null,qt:null,rr:null,j:null,st:null};return {pr:b.pr===null?null:Math.round(b.pr*1000),qrs:Math.round(b.qrs*1000),qt:Math.round(b.qt*1000),rr:Math.round(b.rr*1000),j:b.r+b.j,st:this.signal(b.r+b.stMeasure,lead),fiducials:{...b}};}
snapshot(time){this.ensure(time);const i=this.indexAt(time),beat=this.beats[i],next=this.beats[i+1]||{...beat,r:beat.r+beat.rr},d=time-beat.r;if(this.mode==='vf')return {time,beat,next,d,phase:'chaotic',electrical:'Kaotik ventriküler elektriksel etkinlik',mechanical:'Etkili kasılma ve mekanik nabız yok',text:'VF örneğinde organize QRS, ejeksiyon ve ileri akım yoktur. Elektriksel hız ölçülemez. Arrest bağlamında acil resüsitasyon değerlendirmesi gerekir.',atrial:0,contract:0,cavity:0,eject:false,avOpen:false,rate:null,electricalRate:null,mechanicalPulse:null,pulseText:'VF: etkili mekanik nabız yok',rr:0,qrs:0,flow:0,ischaemia:false};
const tl=this.mechanicalTimeline(beat,next),systolic=d>=tl.start&&d<tl.contractEnd,eject=d>=tl.ejectStart&&d<tl.ejectEnd,avOpen=d>=tl.relaxEnd||d<tl.start,contract=systolic?Math.sin(Math.PI*(d-tl.start)/(tl.contractEnd-tl.start)):0,cavity=d<tl.ejectStart?0:d<tl.ejectEnd?(d-tl.ejectStart)/(tl.ejectEnd-tl.ejectStart):d<tl.relaxEnd?1:1-clamp((d-tl.relaxEnd)/Math.max(.01,tl.cycle-tl.relaxEnd),0,1);
const until=next.r-time,atrial=this.ext?this.atrialActivity(time):next.pStart!==null?bell(until,-next.pCenter-.035,.045,1):0;let phase='fill',mechanical='Ventriküler doluş',text='AV kapaklar açık; şematik ventrikül hacmi doluş boyunca geri kazanılır.';if(d>=tl.start&&d<tl.ejectStart){phase='qrs';mechanical='İzovolümetrik kasılma';text='Kasılma başlar; tüm kapaklar kapalıdır. Henüz ileri ejeksiyon yoktur.';}else if(eject){phase=d>=beat.tStart?'t':'eject';mechanical='Ventriküler ejeksiyon';text='Çıkış kapakları açık; şematik ileri akım sürer.';}else if(d>=tl.ejectEnd&&d<tl.relaxEnd){phase='t';mechanical='İzovolümetrik gevşeme';text='Ejeksiyon sona erdi; tüm kapaklar kısa süre kapalıdır.';}else if(atrial>0){phase='atrial';mechanical='Doluş ve atriyal kasılma';text='Ayrık P etkinliğini şematik atriyal kasılma izler; AV kapaklar açıktır.';}
let electrical='İzoelektrik aralık';const nextD=time-next.r;if(next.pStart!==null&&nextD>=next.pStart&&nextD<=next.pEnd)electrical=this.mode==='pat'?'Ektopik P · Atriyal depolarizasyon':'P · Atriyal depolarizasyon';else if(d>=beat.qrsStart&&d<=beat.qrsEnd||nextD>=next.qrsStart&&nextD<=next.qrsEnd)electrical='QRS · Ventriküler depolarizasyon';else if(d>=beat.tStart&&d<=beat.tEnd)electrical='T · Ventriküler repolarizasyon';else if(d>beat.qrsEnd&&d<beat.tStart)electrical='ST segmenti';if(this.mode==='af')electrical+=' · sürekli f etkinliği';if(this.mode==='flutter')electrical+=' · sürekli F etkinliği';const rate=Math.round(60/beat.rr);const pat=this.ext?this.patternState(time,beat,next,d):null;if(pat){electrical=pat.electrical;if(pat.text)text=pat.text;}return {time,beat,next,d,phase,electrical,mechanical,text,...(pat?{conduction:pat.conduction,atrialRate:pat.atrialRate}:{}),atrial,contract:Math.max(0,contract),cavity:clamp(cavity,0,1),eject,avOpen,rate,electricalRate:rate,mechanicalPulse:null,pulseText:'Mekanik nabız EKG’den belirlenemez',rr:Math.round(beat.rr*1000),qrs:Math.round(beat.qrs*1000),flow:beat.strength,ischaemia:['stemi','inferior'].includes(this.mode),timeline:tl};}
eventTimes(from,to){if(this.mode==='vf')return [from+.1].filter(t=>t<=to);if(this.ext){const base=this.between(from-.6,to+.6).flatMap(b=>{const tl=this.mechanicalTimeline(b,{r:b.r+b.rr});return [b.qrsStart,tl.ejectStart+.01,b.tCenter,tl.relaxEnd+.02].map(o=>b.r+o);});return [...base,...this.atrialEvents(from,to+.6).map(e=>e.t)].filter(t=>t>from+.001&&t<=to).sort((a,b)=>a-b);}return this.between(from-.6,to+.6).flatMap(b=>{const tl=this.mechanicalTimeline(b,{r:b.r+b.rr});return [b.pCenter,b.qrsStart,tl.ejectStart+.01,b.tCenter,tl.relaxEnd+.02].filter(v=>v!==null).map(o=>b.r+o);}).filter(t=>t>from+.001&&t<=to).sort((a,b)=>a-b);}
nextEvent(time){return this.eventTimes(time,time+2)[0]||time+.1;}
phaseTime(time,phase){if(this.mode==='vf')return time+.1;if(this.ext&&phase==='atrial'){const e=this.atrialEvents(time+.015,time+3)[0];return e?e.t:time+.1;}const beats=this.between(time-.5,time+2);for(const b of beats){const tl=this.mechanicalTimeline(b,{r:b.r+b.rr}),offset={atrial:b.pCenter,qrs:b.qrsStart+.01,eject:tl.ejectStart+.02,t:b.tCenter,fill:tl.relaxEnd+.02}[phase];if(offset!==null&&Number.isFinite(offset)&&b.r+offset>time+.015)return b.r+offset;}return time+.1;}
}
const api={CardiacModel,MODES,PATTERN_MODES,ALL_MODES,LEADS,NO_P,anteriorST,inferiorST,pericST,pericPR,clamp,fiducials,patternFiducials,limb};if(typeof module!=='undefined'&&module.exports)module.exports=api;root.CardAIModel=api;
})(typeof window!=='undefined'?window:globalThis);

}
