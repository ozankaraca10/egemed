// EGEMED Pulse runtime — platform kaynağı (ADR-011). Doğrudan düzenlenir; kaynak depo artık yetkili değil.
// Köken: EGEMED_PULSE/cardai/curriculum.js (2026-09-27 anlık görüntüsü).
// T220 (A3.4, ADR-009): Madde içeriği (vaka kökü, soru, seçenekler, doğru, gerekçeler,
// geri bildirim, vitals, EKG) istemciden kaldırıldı; tek doğruluk kaynağı sunucu bankası
// `packages/assessment-bank/data/pulse/items.json`. İstemcide yalnız etiketler, kaynaklar,
// derivasyonlar, sınırlılık metni ve bankayla birebir eşit sayılar kalır.
/* eslint-disable */
export default function run(env) {
const { window, document, localStorage, setTimeout, clearTimeout, setInterval, clearInterval, requestAnimationFrame, cancelAnimationFrame, ResizeObserver, CardAIModel, CardAIScorm, PulseCurriculum, PulseState } = env;
(function(root){'use strict';
const version=8,sessionSize=10,caseCount=300,quizCount=300;
const labels={normal:'Normal sinüs ritmi',af:'Atriyal fibrilasyon',stemi:'Anterior ST yükselmesi örneği',pvc:'Ventriküler erken atım',svt:'Düzenli dar kompleks taşikardi',inferior:'İnferior ST yükselmesi örneği',vt:'Monomorfik VT örneği',vf:'VF elektriksel örneği',pat:'Fokal atriyal taşikardi',flutter:'2:1 flutter örneği',sintach:'Sinüs taşikardisi',lbbb:'LBBB örneği',rbbb:'RBBB örneği',sinbrady:'Sinüs bradikardisi',avb1:'1. derece AV blok',mobitz1:'2. derece AV blok – Mobitz Tip I',mobitz2:'2. derece AV blok – Mobitz Tip II',chb:'3. derece AV blok – Tam AV blok',pac:'Atriyal erken atım (PAC)',junctional:'AV kavşak kaçış ritmi',wpw:'Ventriküler preeksitasyon (WPW paterni)',pericarditis:'Akut perikardit EKG paterni',hyperk:'Hiperkalemiye bağlı EKG paterni'};
const modeSources={normal:['ECG','CYCLE'],af:['AF2024'],stemi:['ACS2023'],pvc:['VA2022'],svt:['SVT2019'],inferior:['ACS2023'],vt:['VA2022','ALS2025'],vf:['VA2022','ALS2025'],pat:['SVT2019'],flutter:['SVT2019'],sintach:['SVT2019','ECG'],lbbb:['BBB2009'],rbbb:['BBB2009'],sinbrady:['BRADY2018'],avb1:['BRADY2018'],mobitz1:['BRADY2018'],mobitz2:['BRADY2018'],chb:['BRADY2018'],pac:['ECG2007','PAC2019'],junctional:['BRADY2018','ECG2007'],wpw:['ECG2007','SVT2019'],pericarditis:['PERI2025'],hyperk:['MON2017']};
const leads={normal:['II','aVF','V3'],af:['II','aVF','V1'],stemi:['V2','V3','V4'],pvc:['II','aVR','V1'],svt:['II','aVF','V1'],inferior:['II','III','aVF'],vt:['II','aVR','V1'],vf:['II','aVF','V1'],pat:['II','aVF','V1'],flutter:['II','aVF','V1'],sintach:['II','aVF','V3'],lbbb:['I','V1','V6'],rbbb:['I','aVR','V1'],sinbrady:['II','aVF','V1'],avb1:['II','aVF','V1'],mobitz1:['II','aVF','V1'],mobitz2:['II','aVF','V1'],chb:['II','aVF','V1'],pac:['II','aVF','V1'],junctional:['II','aVR','V1'],wpw:['II','aVF','V4'],pericarditis:['II','aVR','V5'],hyperk:['II','aVF','V3']};
/* T220 sayıları: sunucu bankası envanteriyle birebir (tests/sim-pulse + tests/assessment-bank). */
const patterns={af:{case:15,quiz:16},avb1:{case:10,quiz:10},chb:{case:10,quiz:10},flutter:{case:16,quiz:15},hyperk:{case:10,quiz:10},inferior:{case:15,quiz:16},junctional:{case:10,quiz:10},lbbb:{case:15,quiz:16},mobitz1:{case:10,quiz:10},mobitz2:{case:10,quiz:10},normal:{case:16,quiz:15},pac:{case:10,quiz:10},pat:{case:15,quiz:15},pericarditis:{case:10,quiz:10},pvc:{case:16,quiz:15},rbbb:{case:16,quiz:15},sinbrady:{case:10,quiz:10},sintach:{case:15,quiz:15},stemi:{case:16,quiz:15},svt:{case:15,quiz:15},vf:{case:15,quiz:16},vt:{case:15,quiz:16},wpw:{case:10,quiz:10}};
function freeze(value){if(value&&typeof value==='object'){Object.values(value).forEach(freeze);Object.freeze(value);}return value;}
root.PulseCurriculum=freeze({version,sessionSize,caseCount,quizCount,patterns,labels,modeSources,leads,limitations:(caseCount+quizCount)+' sentetik madde ve '+root.CardAIModel.ALL_MODES.length+' EKG sonucu: Simülatörün ilk 13 EKG sonucunun tüm tıbbi içerik ve sinyal validasyonları Ege Üniversitesi Tıp Fakültesi Kardiyoloji Anabilim Dalı öğretim üyelerince yapılmıştır. Patern 14–23 (T204) sinyal ve içerikleri Kardiyoloji ABD onayı bekliyor. Olgu vinyetleri ve vitaller sentetik öğretim örnekleridir. 16 s gözlem yalnız akış kuralıdır.'});
})(window);

}
