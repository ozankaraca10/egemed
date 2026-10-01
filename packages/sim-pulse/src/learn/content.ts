/**
 * T298 — Pulse öğrenme modu içeriği (gerçek 12 derivasyon EKG).
 *
 * Patern listesi ve kayıtlar `data/realEcg.json`dan (Doç. Dr. Evrim Şimşek
 * seçimi) gelir; bu dosya yalnız öğrenciye gösterilen metni ve kalp
 * animasyonunun fizyoloji profilini taşır. Ölçütler: AHA/ACCF/HRS EKG
 * standartları, 4. Evrensel MI Tanımı, ESC 2023 AKS kılavuzu.
 */

export interface PulseLearnText {
  /** Rehber ölçütü (tek paragraf). */
  readonly crit: string;
  /** "Bu kayıtta bakın" maddeleri. */
  readonly look: readonly string[];
  /** "Kalpte ne oluyor?" — elektriksel/mekanik açıklama. */
  readonly mech: string;
}

/** Kalp animasyonunun fizyoloji profili. */
export interface PulseHeartProfile {
  /** Atriyal etkinlik: sinüs (P→QRS), fibrilasyon, flutter, bağımsız (AV dissosiyasyon), retrograd (QRS ile eş zamanlı), yok. */
  readonly atrial: "sinus" | "fib" | "flutter" | "independent" | "retro" | "none";
  /** P başlangıcından QRS başlangıcına süre (s). */
  readonly pr: number;
  /** Ventrikül aktivasyonu: His–Purkinje, ventrikül odağı (apeks), organize olmayan. */
  readonly vent: "his" | "focus" | "chaos";
  /** Dal bloğu: geciken dal. */
  readonly bundle?: "R" | "L";
  /** Aksesuar yol (WPW): ventrikül erken uyarılır. */
  readonly accessory?: boolean;
  /** Uzun RR'de iletilmeyen P göster (2. derece AV blok). */
  readonly dropped?: boolean;
  /** Sol ventrikül kasılma katsayısı (iskemi/infarktüste <1). */
  readonly lv?: number;
}

const SINUS: PulseHeartProfile = { atrial: "sinus", pr: 0.16, vent: "his" };

export const PULSE_HEART_PROFILES: Readonly<Record<string, PulseHeartProfile>> = {
  normal: SINUS,
  sintach: { ...SINUS, pr: 0.14 },
  sinbrady: { ...SINUS, pr: 0.18 },
  pac: SINUS,
  pvc: SINUS,
  junctional: { atrial: "retro", pr: 0, vent: "his" },
  af: { atrial: "fib", pr: 0, vent: "his" },
  flutter: { atrial: "flutter", pr: 0, vent: "his" },
  pat: { ...SINUS, pr: 0.14 },
  svt: { atrial: "retro", pr: 0, vent: "his" },
  avb1: { ...SINUS, pr: 0.3 },
  mobitz1: { ...SINUS, pr: 0.24, dropped: true },
  mobitz2: { ...SINUS, pr: 0.18, dropped: true },
  chb: { atrial: "independent", pr: 0, vent: "his" },
  rbbb: { ...SINUS, bundle: "R" },
  lbbb: { ...SINUS, bundle: "L" },
  wpw: { ...SINUS, pr: 0.1, accessory: true },
  vt: { atrial: "none", pr: 0, vent: "focus" },
  vf: { atrial: "none", pr: 0, vent: "chaos" },
  mi_anterior: { ...SINUS, lv: 0.65 },
  mi_lateral: { ...SINUS, lv: 0.72 },
  mi_inferior: { ...SINUS, lv: 0.75 },
  mi_posterior: { ...SINUS, lv: 0.75 },
  mi_nstemi: { ...SINUS, lv: 0.85 },
  mi_avr: { ...SINUS, lv: 0.7 },
  mi_wellens: { ...SINUS, lv: 0.9 },
  mi_old: { ...SINUS, lv: 0.7 },
  pericarditis: SINUS,
  hyperk: SINUS,
};

export function heartProfileFor(key: string): PulseHeartProfile {
  return PULSE_HEART_PROFILES[key] ?? SINUS;
}

/**
 * Öğrenme kilidini taşıyan kaynak modları (`state.viewed`, ≥60 s). Gerçek EKG
 * paterni bu modlardan birine eşlenir; eşlenmeyen MI alt paternleri yalnız
 * yerel olarak işaretlenir (kilit sayısı değişmez).
 */
export const PULSE_VENDOR_MODE: Readonly<Record<string, string>> = {
  normal: "normal", sintach: "sintach", sinbrady: "sinbrady", pac: "pac", pvc: "pvc",
  junctional: "junctional", af: "af", flutter: "flutter", pat: "pat", svt: "svt",
  avb1: "avb1", mobitz1: "mobitz1", mobitz2: "mobitz2", chb: "chb", rbbb: "rbbb",
  lbbb: "lbbb", wpw: "wpw", vt: "vt", vf: "vf", mi_anterior: "stemi",
  mi_inferior: "inferior", pericarditis: "pericarditis", hyperk: "hyperk",
};

export const PULSE_LEARN_TEXT: Readonly<Record<string, PulseLearnText>> = {
  normal: {
    crit: "Sinüs ritmi: her QRS'ten önce DII'de pozitif P, hız 60–100/dk, PR 120–200 ms, QRS <120 ms, RR düzenli.",
    look: ["Her QRS'ten önce P var mı; DII'de pozitif mi?", "PR aralığını kaliperle ölçün (120–200 ms).", "RR düzenli mi, hız 60–100/dk arasında mı?"],
    mech: "Uyarı SA düğümünden çıkar, atriyumları kasar (P), AV düğümde kısa süre bekler (PR), His–Purkinje ağıyla iki ventrikülü aynı anda uyarır (dar QRS). Her P'yi bir QRS ve ventrikül sistolü izler.",
  },
  sintach: {
    crit: "Sinüs ritmi kurallarına uyan, hızı >100/dk olan ritim; P morfolojisi normal, QRS dar, RR düzenli.",
    look: ["Hızı ölçün: RR <600 ms (>100/dk).", "P'ler DII'de pozitif ve her QRS'ten önce mi?", "Hızla birlikte P, önceki T'ye yaklaşır; P'yi T'den ayırın."],
    mech: "SA düğümü sempatik uyarı, ateş, ağrı, hipovolemi ya da anemi gibi nedenlerle daha sık uyarı üretir. İleti yolu normaldir; diyastol kısalır, ventrikül dolumu azalır.",
  },
  sinbrady: {
    crit: "Sinüs ritmi kurallarına uyan, hızı <60/dk olan ritim; P–QRS ilişkisi 1:1, QRS dar.",
    look: ["Hızı ölçün: RR >1000 ms (<60/dk).", "Her QRS'ten önce aynı biçimli P var mı?", "PR normal aralıkta mı (AV blokla karışmasın)?"],
    mech: "SA düğümü yavaş uyarı üretir (vagal tonus, sporcu kalbi, ilaçlar, hipotiroidi, sinüs düğümü hastalığı). İleti normaldir; diyastol uzar.",
  },
  pac: {
    crit: "Beklenenden erken gelen, sinüs P'sinden farklı biçimli P ve onu izleyen genellikle dar QRS; ardından çoğunlukla tam olmayan kompansatuvar duraklama.",
    look: ["RR'si kısalan erken atımı bulun (kaliperi kaydırın).", "Erken atımdan önceki P'nin biçimini sinüs P'siyle karşılaştırın.", "Erken atımın QRS'i diğerleriyle aynı mı (dar)?"],
    mech: "Atriyumdaki ektopik bir odak SA düğümünden önce ateşler. Uyarı normal AV düğüm ve His–Purkinje yolunu kullandığı için QRS dar kalır; SA düğümü sıfırlanır.",
  },
  pvc: {
    crit: "Erken gelen, öncesinde P olmayan, geniş (≥120 ms) ve farklı biçimli QRS; T dalgası QRS'in ters yönünde; çoğunlukla tam kompansatuvar duraklama.",
    look: ["Geniş ve biçimi farklı erken QRS'i bulun.", "Erken atımdan önce P yok; T ters yönde.", "Erken atımı çevreleyen iki RR'nin toplamı iki normal RR'ye eşit mi?"],
    mech: "Ventrikül kasındaki bir odak erken ateşler. Uyarı His–Purkinje ağını kullanmadan kastan kasa yavaş yayılır; QRS genişler ve repolarizasyon da bozulur.",
  },
  junctional: {
    crit: "AV kavşak kaynaklı kaçış ritmi: dar QRS, hız 40–60/dk; P yok, QRS içinde gizli ya da DII, DIII, aVF'de negatif (retrograd).",
    look: ["QRS'ten önce P var mı? Yoksa QRS'in hemen arkasına bakın.", "Hızı ölçün (40–60/dk).", "QRS dar mı?"],
    mech: "Üst merkez (SA düğümü) yavaşlayınca AV kavşak kendi hızında uyarı üretir. Ventriküller normal yoldan uyarılır; atriyumlar ters yönde ve QRS ile neredeyse aynı anda kasılır.",
  },
  af: {
    crit: "Belirgin P dalgası yok, taban çizgisinde düzensiz fibrilasyon (f) dalgaları, RR tamamen düzensiz; QRS genellikle dar.",
    look: ["Belirgin P yok; V1 ve DII'de f dalgalarına bakın.", "Kaliperi kaydırın: ardışık RR'ler birbirine eşit değil.", "Ventrikül hızını ölçün (kontrollü mü, hızlı mı?)."],
    mech: "Atriyumlarda yüzlerce düzensiz uyarı dolaşır; atriyum organize kasılmaz, titrer. AV düğüm bu uyarıların bir kısmını rastgele geçirir: RR aralıkları tamamen düzensizdir. Atriyal katkı kaybolur, pıhtı riski artar.",
  },
  flutter: {
    crit: "Atriyal hız 240–340/dk; DII, DIII, aVF'de testere dişi flutter dalgaları, V1'de belirgin; QRS dar, iletim çoğunlukla 2:1 ya da 4:1.",
    look: ["DII ve aVF'de testere dişi tabanı arayın.", "V1'de iki QRS arasındaki flutter dalgalarını sayın (2:1, 4:1).", "Ventrikül hızı yaklaşık 150/dk ise 2:1 flutter düşünün."],
    mech: "Sağ atriyumda (çoğunlukla triküspit halkası çevresinde) tek bir büyük dolaşım devresi döner. AV düğüm her uyarıyı geçiremez; sabit oranda (2:1, 4:1) iletir.",
  },
  pat: {
    crit: "Atriyal taşikardi: hız >100/dk, düzenli, dar QRS; her QRS'ten önce sinüs P'sinden farklı biçimli P.",
    look: ["Hızı ölçün ve düzenini kontrol edin.", "P'nin biçimini sinüs ritmiyle karşılaştırın (DII, V1).", "P–P aralıkları arasında izoelektrik çizgi var mı (flutter'dan ayırın)?"],
    mech: "SA düğümü dışındaki bir atriyal odak hızlı ve düzenli ateşler. Atriyumlar bu odaktan uyarılır; uyarı normal AV yolundan ventriküllere geçer.",
  },
  svt: {
    crit: "Dar QRS'li (<120 ms), düzenli taşikardi, hız çoğunlukla 150–250/dk; P görünmez ya da QRS'in hemen arkasında (retrograd).",
    look: ["QRS dar mı, RR tamamen düzenli mi?", "QRS'ten önce P arayın; yoksa ST segmentindeki çentiğe bakın.", "Hızı ölçün."],
    mech: "Çoğunlukla AV düğüm içinde (AVNRT) ya da aksesuar yolu kullanan (AVRT) bir yeniden giriş devresi döner. Atriyum ve ventrikül aynı anda uyarılır; P, QRS'in içinde kaybolur.",
  },
  avb1: {
    crit: "PR aralığı >200 ms ve sabit; her P'yi bir QRS izler.",
    look: ["PR'yi kaliperle ölçün (>200 ms).", "PR her atımda aynı mı?", "İletilmeyen P var mı (yoksa 1. derece)?"],
    mech: "Uyarı AV düğümde normalden uzun bekler ama her seferinde ventriküllere geçer. Atriyal ve ventriküler sistol arasındaki süre uzar.",
  },
  mobitz1: {
    crit: "2. derece AV blok Mobitz I (Wenckebach): PR giderek uzar, ardından bir P iletilmez; duraklamadan sonra PR yeniden kısalır.",
    look: ["Ardışık PR aralıklarını karşılaştırın.", "QRS'siz kalan P'yi bulun (uzun RR'nin içinde).", "Duraklamadan sonraki ilk PR daha kısa mı?"],
    mech: "AV düğüm her uyarıdan sonra biraz daha yorulur; ileti süresi uzar ve sonunda bir uyarı geçmez. Kısa dinlenmeden sonra döngü yeniden başlar. Blok çoğunlukla AV düğüm düzeyindedir.",
  },
  mobitz2: {
    crit: "2. derece AV blok Mobitz II: PR sabit, P'ler düzenli; bir P aniden iletilmez. QRS çoğunlukla geniştir.",
    look: ["İletilen atımlarda PR'nin sabit olduğunu doğrulayın.", "QRS'siz P'yi bulun.", "QRS genişliğini ölçün (His altı hastalık)."],
    mech: "Blok His demeti ya da dallar düzeyindedir: uyarılar önceden uyarı vermeden ya geçer ya geçmez. Tam bloğa ilerleyebildiği için kalıcı pil gerektirebilir.",
  },
  chb: {
    crit: "3. derece (tam) AV blok: P'ler kendi düzenli hızında, QRS'ler kendi yavaş hızında; P ile QRS arasında ilişki yok (AV dissosiyasyon).",
    look: ["P–P ve R–R aralıklarını ayrı ayrı ölçün; ikisi de düzenli.", "PR her atımda farklı.", "Kaçış ritminin QRS genişliği: dar (kavşak) mı, geniş (ventrikül) mü?"],
    mech: "AV düğüm hiçbir uyarıyı geçirmez. Atriyumlar SA hızında kasılır, ventriküller kendi kaçış odağıyla yavaş atar; P ve QRS birbirinden bağımsızdır.",
  },
  rbbb: {
    crit: "Sağ dal bloğu: QRS ≥120 ms, V1–V2'de rsR' (M biçimi), DI ve V6'da geniş, çentikli S.",
    look: ["QRS süresini ölçün (≥120 ms).", "V1'de rsR' biçimini arayın.", "DI ve V6'da geniş S'ye bakın."],
    mech: "Sağ dal iletmez. Sol ventrikül normal uyarılır, sağ ventrikül ise uyarıyı geç ve kastan kasa alır; QRS'in son kısmı sağa ve öne yönelir.",
  },
  lbbb: {
    crit: "Sol dal bloğu: QRS ≥120 ms, DI, aVL, V5–V6'da geniş çentikli R ve q yok; V1'de derin QS ya da rS; ST–T QRS'in ters yönünde.",
    look: ["QRS süresini ölçün (≥120 ms).", "V5–V6'da geniş çentikli R, V1'de derin S.", "ST–T'nin QRS'e ters (uyumsuz) olduğunu görün."],
    mech: "Sol dal iletmez. Septum sağdan sola uyarılır, sol ventrikül geç ve kastan kasa uyarılır; iki ventrikül eşzamansız kasılır.",
  },
  wpw: {
    crit: "Preeksitasyon (WPW paterni): PR <120 ms, QRS başında delta dalgası, QRS >110 ms; ikincil ST–T değişiklikleri.",
    look: ["PR'yi ölçün (<120 ms).", "QRS'in yavaş yükselen başlangıcını (delta) arayın.", "Delta'nın yönü aksesuar yolun yerini gösterir."],
    mech: "Atriyumla ventrikül arasında AV düğümü atlayan bir aksesuar yol (Kent demeti) vardır. Ventrikülün bir kısmı erken uyarılır (delta), kalanı normal yoldan; QRS iki uyarının birleşimidir.",
  },
  vt: {
    crit: "Ventriküler taşikardi: ≥3 ardışık ventrikül kaynaklı atım, hız >100/dk, QRS ≥120 ms; AV dissosiyasyon, füzyon ya da yakalama atımları tanıyı destekler.",
    look: ["QRS geniş ve hız >100/dk mı?", "Tabanda QRS'ten bağımsız P'ler arayın (AV dissosiyasyon).", "Prekordiyal derivasyonlarda QRS'lerin hepsi aynı yönde mi (uyum)?"],
    mech: "Uyarı ventrikül kasındaki bir odaktan çıkar, His–Purkinje ağını kullanmadan kastan kasa yavaş yayılır: geniş QRS. Atriyum ventrikülden bağımsızdır; dolum süresi kısalır, debi düşer.",
  },
  vf: {
    crit: "Ventrikül fibrilasyonu: tanınabilir P, QRS ya da T yok; düzensiz biçim ve genlikte dalgalanma.",
    look: ["Tanınabilir QRS var mı?", "Dalgaların genliği iri mi, ince mi?", "Artefaktı dışlamak için tüm derivasyonlara bakın."],
    mech: "Ventriküllerde birçok küçük dolaşım devresi düzensiz döner; kas organize kasılamaz ve titrer. Kalp debisi sıfırdır: nabızsız arrest, hemen defibrilasyon gerekir.",
  },
  mi_anterior: {
    crit: "4. Evrensel MI Tanımı / ESC 2023: J noktasında ≥2 ardışık derivasyonda yeni ST yükselmesi. V2–V3'te ≥40 yaş erkekte ≥2 mm, <40 yaş erkekte ≥2,5 mm, kadında ≥1,5 mm; diğer derivasyonlarda ≥1 mm. Anterior: V1–V4.",
    look: ["V1–V4'te J noktasındaki ST yükselmesini ölçün.", "Ardışık derivasyonlarda devam ediyor mu?", "Inferior derivasyonlarda karşılık gelen çökme var mı?"],
    mech: "LAD tıkanıklığı ön duvar ve septumda transmural iskemi yapar. Hasarlı hücreler arasındaki akım ST'yi yükseltir. Etkilenen duvar sistolde daha az kasılır (animasyonda LV zayıf).",
  },
  mi_lateral: {
    crit: "Aynı ST yükselmesi ölçütü; DI, aVL ve/veya V5–V6'da ≥1 mm ST yükselmesi.",
    look: ["DI, aVL, V5–V6'da ST yükselmesi arayın.", "DIII ve aVF'de karşılık gelen çökmeye bakın.", "V1–V4 ve inferior derivasyonlar normal mi?"],
    mech: "Sirkumfleks ya da diagonal dal tıkanıklığı sol ventrikülün yan duvarında iskemi yapar. Yan duvar sistolde zayıf kasılır.",
  },
  mi_inferior: {
    crit: "Aynı ST yükselmesi ölçütü; DII, DIII, aVF'den ≥2'sinde ≥1 mm ST yükselmesi. DI ve aVL'de karşılık gelen çökme tanıyı destekler.",
    look: ["DII, DIII, aVF'de ST yükselmesi.", "DI ve aVL'de karşılık gelen çökme.", "Bradikardi ve AV blok açısından ritme bakın; sağ ventrikül tutulumunu düşünün."],
    mech: "Çoğunlukla sağ koroner arter (bazen sirkumfleks) tıkanıklığı alt duvarı etkiler. RCA AV düğümü de beslediği için bradikardi ve AV blok eşlik edebilir.",
  },
  mi_posterior: {
    crit: "ESC 2023: V1–V3'te ≥0,5 mm yatay ya da aşağı eğimli ST çökmesi, V2'de R/S >1; V7–V9'da ST yükselmesi (≥0,5 mm) tanıyı doğrular.",
    look: ["V1–V3'te ST çökmesi ve uzun R.", "Arka derivasyonlar (V7–V9) çekilmeli.", "Eşlik eden inferior ya da lateral yükselme var mı?"],
    mech: "Sirkumfleks ya da RCA tıkanıklığı arka duvarı etkiler. Öndeki derivasyonlar arka duvarı ayna görüntüsü olarak görür: yükselme çökme, Q dalgası uzun R olarak yansır.",
  },
  mi_nstemi: {
    crit: "NSTE-AKS EKG paterni: ≥2 ardışık derivasyonda ≥0,5–1 mm yatay ya da aşağı eğimli ST çökmesi ve/veya T negatifliği; ST yükselmesi yok. Tanı troponinle konur.",
    look: ["Yatay ya da aşağı eğimli ST çökmesini arayın.", "Hangi derivasyonlarda (yaygın mı, bölgesel mi)?", "ST yükselmesi olmadığını doğrulayın."],
    mech: "Koroner akım tamamen kesilmemiştir; iskemi kalp kasının iç tabakasıyla (subendokard) sınırlıdır. Akım yönü değiştiği için ST çöker.",
  },
  mi_avr: {
    crit: "ESC 2023: ≥8 derivasyonda ≥1 mm ST çökmesi ile aVR'de (ve/veya V1'de) ST yükselmesi; sol ana koroner ya da çok damar iskemisini düşündürür.",
    look: ["aVR'de ST yükselmesi.", "Kaç derivasyonda ST çökmesi var (≥8)?", "Taşikardi tek başına benzer görüntü yapabilir; hızı ölçün."],
    mech: "Yaygın subendokardiyal iskemi tüm sol ventrikülü etkiler; aVR bu yaygın çökmeyi ayna görüntüsü olarak yükselme şeklinde görür. Hemodinamik bozulma riski yüksektir.",
  },
  mi_wellens: {
    crit: "Wellens paterni: V2–V3'te derin simetrik ya da bifazik T negatifliği; ST yükselmesi <1 mm, patolojik Q yok, prekordiyal R korunmuş; ağrısız dönemde görülür.",
    look: ["V2–V3'te derin simetrik ya da bifazik T.", "ST yükselmesi olmadığını, R'lerin korunduğunu görün.", "Q dalgası yok."],
    mech: "LAD'nin proksimalinde kritik darlık vardır; damar geçici olarak tıkanıp açılmıştır. Ağrı geçtikten sonra repolarizasyon değişir; yakın dönemde büyük anterior MI riski yüksektir.",
  },
  mi_old: {
    crit: "4. Evrensel MI Tanımı: ≥2 ardışık derivasyonda ≥30 ms ve ≥1 mm derinlikte Q (V2–V3'te ≥20 ms ya da QS); güncel ST yükselmesi yok.",
    look: ["Patolojik Q dalgalarını bulun ve süresini ölçün.", "Hangi bölgede (anterior, inferior, lateral)?", "ST yükselmesi yok mu (eski MI)?"],
    mech: "İnfarkt alanı nedbeye dönüşmüştür ve elektriksel olarak sessizdir. O bölgeye bakan derivasyon karşı duvarın uzaklaşan akımını görür: Q dalgası. Nedbeli duvar kasılmaz.",
  },
  pericarditis: {
    crit: "Akut perikardit: birden çok koroner alana yayılan, yukarı içbükey ST yükselmesi; PR çökmesi (aVR'de PR yükselmesi); karşılık gelen ST çökmesi yok (aVR ve V1 hariç).",
    look: ["ST yükselmesi tek bir damar alanıyla sınırlı mı, yaygın mı?", "DII'de PR çökmesi, aVR'de PR yükselmesi.", "Karşılık gelen çökme ve Q yok."],
    mech: "Perikardın iltihabı altındaki epikardiyal kası yaygın olarak etkiler. Akım tek bir bölgeye değil tüm yüzeye yayıldığı için ST yaygın yükselir; atriyal yüzey etkilenince PR çöker.",
  },
  hyperk: {
    crit: "Hiperkalemi: dar tabanlı, sivri, simetrik T dalgaları (erken); ilerledikçe PR uzar, P yassılaşır, QRS genişler, sinüzoidal dalga oluşur. Tanı serum potasyumuyla doğrulanır.",
    look: ["Prekordiyal derivasyonlarda sivri, dar tabanlı T.", "P genliği ve PR süresi.", "QRS genişlemesi (ileri evre)."],
    mech: "Hücre dışı potasyum artınca dinlenim potansiyeli yükselir; repolarizasyon hızlanır (sivri T), ilerledikçe hücreler yavaş uyarılır (geniş QRS). Ölümcül aritmi riski vardır.",
  },
};

/** Ölçütlerin dayandığı kılavuz ve standartlar (DOI'ler Crossref'te doğrulandı, 1 Eki 2026). */
export interface PulseGuideline {
  readonly label: string;
  readonly title: string;
  readonly doi: string;
}

export const PULSE_GUIDELINES: Readonly<Record<string, PulseGuideline>> = {
  aha1: { label: "AHA/ACCF/HRS 2007 · I", title: "Kligfield P, et al. Recommendations for the Standardization and Interpretation of the Electrocardiogram, Part I. Circulation 2007", doi: "10.1161/CIRCULATIONAHA.106.180200" },
  aha3: { label: "AHA/ACCF/HRS 2009 · III", title: "Surawicz B, et al. AHA/ACCF/HRS Recommendations for the ECG, Part III: Intraventricular Conduction Disturbances. Circulation 2009", doi: "10.1161/CIRCULATIONAHA.108.191095" },
  aha4: { label: "AHA/ACCF/HRS 2009 · IV", title: "Rautaharju PM, et al. AHA/ACCF/HRS Recommendations for the ECG, Part IV: The ST Segment, T and U Waves, and the QT Interval. Circulation 2009", doi: "10.1161/CIRCULATIONAHA.108.191096" },
  aha6: { label: "AHA/ACCF/HRS 2009 · VI", title: "Wagner GS, et al. AHA/ACCF/HRS Recommendations for the ECG, Part VI: Acute Ischemia/Infarction. Circulation 2009", doi: "10.1161/CIRCULATIONAHA.108.191098" },
  udmi4: { label: "4. Evrensel MI Tanımı 2018", title: "Thygesen K, et al. Fourth Universal Definition of Myocardial Infarction (2018). Eur Heart J 2019", doi: "10.1093/eurheartj/ehy462" },
  escAcs: { label: "ESC 2023 AKS", title: "Byrne RA, et al. 2023 ESC Guidelines for the management of acute coronary syndromes. Eur Heart J 2023", doi: "10.1093/eurheartj/ehad191" },
  escSvt: { label: "ESC 2019 SVT", title: "Brugada J, et al. 2019 ESC Guidelines for the management of patients with supraventricular tachycardia. Eur Heart J 2020", doi: "10.1093/eurheartj/ehz467" },
  escAf: { label: "ESC 2024 AF", title: "Van Gelder IC, et al. 2024 ESC Guidelines for the management of atrial fibrillation. Eur Heart J 2024", doi: "10.1093/eurheartj/ehae176" },
  accBrady: { label: "ACC/AHA/HRS 2018 Bradikardi", title: "Kusumoto FM, et al. 2018 ACC/AHA/HRS Guideline on the Evaluation and Management of Patients With Bradycardia and Cardiac Conduction Delay. Circulation 2019", doi: "10.1161/CIR.0000000000000628" },
  escVa: { label: "ESC 2022 Ventriküler aritmi", title: "Zeppenfeld K, et al. 2022 ESC Guidelines for the management of patients with ventricular arrhythmias and the prevention of sudden cardiac death. Eur Heart J 2022", doi: "10.1093/eurheartj/ehac262" },
  escPeri: { label: "ESC 2025 Miyokardit/Perikardit", title: "Schulz-Menger J, et al. 2025 ESC Guidelines for the management of myocarditis and pericarditis. Eur Heart J 2025", doi: "10.1093/eurheartj/ehaf192" },
  levis: { label: "Levis 2013 Hiperkalemi", title: "Levis JT. ECG Diagnosis: Hyperkalemia. Perm J 2013", doi: "10.7812/TPP/12-088" },
};

/** Patern başına ölçütün kaynakları (sıra: en doğrudan kaynak önce). */
export const PULSE_LEARN_REFS: Readonly<Record<string, readonly string[]>> = {
  normal: ["aha1"], sintach: ["aha1"], sinbrady: ["aha1", "accBrady"],
  pac: ["aha1", "escSvt"], pvc: ["aha1", "escVa"], junctional: ["accBrady", "aha1"],
  af: ["escAf"], flutter: ["escSvt", "escAf"], pat: ["escSvt"], svt: ["escSvt"],
  avb1: ["accBrady"], mobitz1: ["accBrady"], mobitz2: ["accBrady"], chb: ["accBrady"],
  rbbb: ["aha3"], lbbb: ["aha3"], wpw: ["aha3", "escSvt"],
  vt: ["escVa"], vf: ["escVa"],
  mi_anterior: ["udmi4", "escAcs", "aha6"], mi_lateral: ["udmi4", "escAcs", "aha6"], mi_inferior: ["udmi4", "escAcs", "aha6"],
  mi_posterior: ["escAcs", "udmi4"], mi_nstemi: ["escAcs", "udmi4"], mi_avr: ["escAcs"], mi_wellens: ["escAcs", "aha6"], mi_old: ["udmi4"],
  pericarditis: ["escPeri"], hyperk: ["levis", "aha4"],
};

export function learnRefsFor(key: string): readonly PulseGuideline[] {
  return (PULSE_LEARN_REFS[key] ?? []).map((id) => PULSE_GUIDELINES[id]).filter((g): g is PulseGuideline => g !== undefined);
}

export function learnTextFor(key: string): PulseLearnText | undefined {
  return PULSE_LEARN_TEXT[key];
}
