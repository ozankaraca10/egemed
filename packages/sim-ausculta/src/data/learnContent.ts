import type { LibItem } from "./library";

/** T307 — öğrenme modu "Bu ses hakkında" içeriği ve kılavuz kaynakları. DOI'ler
 *  Crossref'te doğrulandı (1–2 Eki 2026). Yeni konular için metin elle yazıldı;
 *  diğerleri kütüphane kaydından türetilir. */

interface LearnRef {
  readonly label: string;
  readonly title: string;
  readonly doi: string;
}

export const LEARN_REFS: Readonly<Record<string, LearnRef>> = {
  accVhd: { label: "ACC/AHA 2020 Kapak", title: "Otto CM, et al. 2020 ACC/AHA Guideline for the Management of Patients With Valvular Heart Disease. Circulation 2021", doi: "10.1161/CIR.0000000000000923" },
  escVhd: { label: "ESC/EACTS 2021 Kapak", title: "Vahanian A, et al. 2021 ESC/EACTS Guidelines for the management of valvular heart disease. Eur Heart J 2022", doi: "10.1093/eurheartj/ehab395" },
  ers: { label: "ERS 2016 Akciğer sesi terminolojisi", title: "Pasterkamp H, et al. Towards the standardisation of lung sound nomenclature. Eur Respir J 2016", doi: "10.1183/13993003.01132-2015" },
  bohadana: { label: "Bohadana 2014 (NEJM)", title: "Bohadana A, et al. Fundamentals of Lung Auscultation. N Engl J Med 2014", doi: "10.1056/NEJMra1302901" },
};

/** Konu yanında yalnız "Acil" etiketi gösterilir (depo sahibi kararı). */
export const URGENT_KEYS: ReadonlySet<string> = new Set(["heart.atrial_fibrillation", "heart.av_block", "lung.stridor"]);

interface LearnAbout {
  readonly crit: string;
  readonly look: readonly string[];
  readonly mech: string;
  readonly urgent?: string;
  readonly refs?: readonly string[];
}

const NEW_TOPICS: Readonly<Record<string, LearnAbout>> = {
  "heart.murmur.holosystolic": {
    crit: "S1 ile başlayıp S2'ye kadar süren, şiddeti sistol boyunca sabit (plato) sistolik üfürüm. Şiddet Levine 1–6 ölçeğiyle derecelendirilir; mitral/triküspit yetersizliği ya da VSD düşündürür.",
    look: ["Üfürüm S1 ile aynı anda başlıyor (arada sessizlik yok)", "S2'ye kadar aynı şiddette (dalga formunda düz bant)", "En iyi duyulduğu odak: mitral ya da triküspit"],
    mech: "Sistol boyunca yüksek basınçlı ventrikülden düşük basınçlı odacığa sürekli geri akım olur. Basınç farkı sistol boyunca sürdüğü için ses de sabit şiddette kalır.",
    refs: ["accVhd", "escVhd"],
  },
  "heart.murmur.early_diastolic": {
    crit: "S2'den hemen sonra başlayan, giderek azalan (dekreşendo), yüksek perdeli, üfleyici diyastolik üfürüm; aort (ya da pulmoner) yetersizliği düşündürür.",
    look: ["S2'nin hemen arkasından başlayan üfleyici ses", "Diyastol boyunca azalan şiddet", "Sol sternal kenarda, hasta öne eğikken daha iyi duyulur"],
    mech: "Diyastolde aortadan sol ventriküle (ya da pulmoner arterden sağ ventriküle) geri akım olur. Basınç farkı diyastolün başında en yüksektir ve giderek azalır.",
    refs: ["accVhd", "escVhd"],
  },
  "lung.stridor": {
    crit: "Üst hava yolu daralmasında oluşan, çoğunlukla inspiratuvar, yüksek perdeli, sürekli müzikal ses; boyunda göğüsten daha yüksek duyulur.",
    look: ["İnspiryumda başlayan sürekli yüksek ton", "Göğüs duvarında yayılarak duyulması", "Bebekte eşlik eden çekilmeler (klinik bağlam)"],
    mech: "Larenks ya da trakea daralmasında (krup, larengomalazi, yabancı cisim) hava akımı hızlanır, daralan duvar titreşir; daralma ekstratorasik olduğunda inspiryumda belirginleşir.",
    urgent: "Acil: stridor üst hava yolu tıkanıklığının işaretidir; solunum sıkıntısıyla birlikteyse acil değerlendirme gerekir.",
    refs: ["ers", "bohadana"],
  },
  "lung.wheeze_crackle": {
    crit: "Aynı kayıtta hem sürekli müzikal (wheeze) hem süreksiz patlayıcı (ral) ek sesler.",
    look: ["Müzikal tonla birlikte kısa patlamalar", "Hangisinin inspiryumda, hangisinin ekspiryumda olduğu", "Bölgesel mi, yaygın mı?"],
    mech: "Hava yolu daralması (wheeze) ile küçük hava yolu/alveol tutulumu (ral) birlikte bulunur; çocuklarda bronşiolit ve pnömonide sık görülür.",
    refs: ["ers", "bohadana"],
  },
};

/** Konunun "Bu ses hakkında" içeriği: yeni konularda elle yazılmış metin, diğerlerinde
 *  kütüphane kaydı (tanım + benzetme, S1/S2/faz ipuçları, klinik). */
export function learnAbout(item: LibItem): LearnAbout {
  const own = NEW_TOPICS[item.key];
  if (own) return own;
  const crit = [item.description, item.metaphor ? `Benzetme: ${item.metaphor}` : ""].filter(Boolean).join(" ");
  const look = [item.s1 ? `S1: ${item.s1}` : null, item.s2 ? `S2: ${item.s2}` : null, item.phase ?? null].filter(
    (line): line is string => line !== null,
  );
  return { crit, look: look.length > 0 ? look : [item.clinical], mech: item.clinical };
}
