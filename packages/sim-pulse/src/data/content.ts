import type { Mode } from "../engine/shapes";

export interface PulseModeContent {
  readonly title: string;
  readonly label: string;
  readonly lead: string;
  readonly summary: string;
  readonly clues: readonly [string, string, string];
  /** Authored source includes limited inline emphasis markup; render as text or sanitize at the host boundary. */
  readonly note: string;
  readonly cards: readonly [readonly [string, string], readonly [string, string], readonly [string, string]];
}

export const PULSE_MODE_CONTENT = {
    "normal": {
      "title": "Normal sinüs ritmi",
      "label": "NORMAL SİNÜS RİTMİ",
      "lead": "II",
      "summary": "Sinüs düğümünden başlayan düzenli uyarı önce atriyumlara, ardından ventriküllere yayılır. Elektriksel etkinliği, kasılma ve kanın pompalanması izler.",
      "clues": [
        "Her QRS öncesinde P",
        "Düzenli R–R aralıkları",
        "Dar QRS"
      ],
      "note": "<b>İzleme ipucu:</b> P dalgasını atriyal kasılma, QRS kompleksini kısa bir gecikmeyle ventriküler kasılma izler.",
      "cards": [
        [
          "EKG özellikleri",
          "75/dk düzenli ritim. Her QRS öncesinde P dalgası ve sabit PR aralığı."
        ],
        [
          "Dolaşıma etkisi",
          "Atriyal kasılma doluşa katkı sağlar. Ventriküller düzenli aralıklarla kan pompalar."
        ],
        [
          "Öğrenme odağı",
          "EKG elektriksel etkinliği gösterir; kasılma ve kan akışı bu uyarıyı izler."
        ]
      ]
    },
    "af": {
      "title": "Atriyal fibrilasyon (AF)",
      "label": "ATRİYAL FİBRİLASYON",
      "lead": "II",
      "summary": "Atriyumlardaki düzensiz elektriksel etkinlik organize kasılmayı ortadan kaldırır. AV düğümden ventriküllere düzensiz aralıklarla uyarı iletilir.",
      "clues": [
        "Belirgin P dalgası yok",
        "R–R aralıkları düzensiz",
        "İnce f dalgaları"
      ],
      "note": "<b>Ayırt edici bulgu:</b> P dalgalarının yokluğu ile düzensiz R–R aralıklarını birlikte değerlendir. Bu örnekte QRS dardır.",
      "cards": [
        [
          "EKG özellikleri",
          "P dalgaları seçilemez. R–R aralıkları belirgin biçimde düzensizdir."
        ],
        [
          "Dolaşıma etkisi",
          "Atriyal kasılmanın doluşa katkısı kaybolur. Değişken doluş süreleri, atımların gücünü etkileyebilir."
        ],
        [
          "Klinik önemi",
          "Atriyal kan stazı ve tromboemboli riski artabilir. Klinik değerlendirme gerekir."
        ]
      ]
    },
    "stemi": {
      "title": "ST elevasyonlu MI örneği",
      "label": "ST ELEVASYONLU MI • ÖRNEK",
      "lead": "V3",
      "summary": "Bu senaryoda ön duvar iskemisi, ST segmentinde yükselme ve sol ventrikülün etkilenen bölgesinde azalmış kasılma ile gösterilir. Ritim düzenli kalabilir.",
      "clues": [
        "J+20 ms’de +0,32 mV",
        "Yükselmiş ST segmenti",
        "Ritim düzenli kalabilir"
      ],
      "note": "<b>Klinik ipucu:</b> ST yükselmesi tek başına MI tanısı koydurmaz. Komşu derivasyonlar, belirtiler ve klinik değerlendirme birlikte ele alınır.",
      "cards": [
        [
          "EKG özellikleri",
          "V3 benzeri örnek izde ST segmenti yükselmiştir. P dalgaları ve düzenli ritim korunur."
        ],
        [
          "Dolaşıma etkisi",
          "Örnekte bir koroner dalın akışı kesilir. İskemik bölge daha az kasılır; kalbin pompalaması sürer."
        ],
        [
          "Klinik önemi",
          "İskemik belirtilerle birlikte ST yükselmesi acil değerlendirme gerektirir. Tek şerit tanı için yeterli değildir."
        ]
      ]
    },
    "pvc": {
      "title": "Ventriküler erken atım (PVC)",
      "label": "VENTRİKÜLER ERKEN ATIM • PVC",
      "lead": "II",
      "summary": "Sinüs ritmi sırasında ventrikülden erken başlayan bir uyarı, geniş QRS kompleksi ve ardından kompansatuvar duraklama oluşturur. Erken atımın doluş süresi ve mekanik etkinliği azalabilir.",
      "clues": [
        "Beklenenden erken kompleks",
        "Geniş QRS · yaklaşık 140 ms",
        "Ardından kompansatuvar duraklama"
      ],
      "note": "<b>Ayırt edici bulgu:</b> Erken ve geniş QRS öncesinde ilişkili P dalgası görülmez; sonraki sinüs atımına kadar daha uzun bir R–R aralığı oluşur.",
      "cards": [
        [
          "EKG özellikleri",
          "Aralıklı erken, geniş ve farklı morfolojili QRS kompleksleri; diskordan ST–T değişikliği."
        ],
        [
          "Dolaşıma etkisi",
          "Erken atımda ventrikül doluşu daha kısa olduğundan mekanik atım daha zayıf olabilir."
        ],
        [
          "Klinik önemi",
          "PVC tek başına etiyoloji veya risk düzeyi belirlemez; sıklık, belirtiler ve yapısal kalp hastalığıyla birlikte değerlendirilir."
        ]
      ]
    },
    "svt": {
      "title": "Düzenli dar kompleks SVT",
      "label": "SUPRAVENTRİKÜLER TAŞİKARDİ • SVT",
      "lead": "II",
      "summary": "Ventriküllerin üzerinde başlayan hızlı ve düzenli ritim, AV düğüm–His-Purkinje sistemi üzerinden iletilerek dar QRS kompleksleri oluşturur. Bu örnekte hız yaklaşık 167/dk’dır.",
      "clues": [
        "Düzenli hızlı ritim",
        "Dar QRS · 80 ms",
        "P dalgaları seçilemeyebilir"
      ],
      "note": "<b>Ayırt edici bulgu:</b> Düzenli, hızlı ve dar QRS’li ritmi tanı; P dalgalarının görünümü SVT mekanizmasına göre değişebilir.",
      "cards": [
        [
          "EKG özellikleri",
          "Yaklaşık 167/dk düzenli dar kompleks taşikardi. P dalgaları bu sentetik şeritte seçilemez."
        ],
        [
          "Dolaşıma etkisi",
          "Diyastol ve ventrikül doluş süresi kısalır; ejeksiyon döngüleri daha sık gerçekleşir."
        ],
        [
          "Klinik önemi",
          "SVT bir üst başlıktır; kesin mekanizma ve tedavi kararı 12 derivasyonlu EKG ile klinik değerlendirme gerektirir."
        ]
      ]
    },
    "inferior": {
      "title": "İnferior ST elevasyonlu MI",
      "label": "İNFERİOR STEMI • ÖRNEK",
      "lead": "aVF",
      "summary": "İnferior duvar örneğinde ST yükselmesi II, III ve aVF derivasyonlarında; karşılıklı ST çökmesi ise I ve aVL’de belirginleşir. Ritim düzenli kalabilir.",
      "clues": [
        "II–III–aVF’de ST ↑",
        "I–aVL’de karşılıklı ST ↓",
        "Bölgesel kasılma azalması"
      ],
      "note": "<b>Derivasyon ipucu:</b> Ekstremite ve artırılmış gruplarda II ile aVF’yi seç; inferior komşu derivasyonlardaki eş yönlü değişimi birlikte değerlendir.",
      "cards": [
        [
          "EKG özellikleri",
          "II, III ve aVF’de sentetik ST yükselmesi; I ve aVL’de karşılıklı ST çökmesi."
        ],
        [
          "Dolaşıma etkisi",
          "Koroner akım engeli ve bölgesel duvar hareketinde azalma şematik olarak gösterilir."
        ],
        [
          "Klinik önemi",
          "Akut koroner oklüzyon kuşkusunda semptomlar, seri 12 derivasyonlu EKG ve acil klinik değerlendirme gerekir."
        ]
      ]
    },
    "vt": {
      "title": "Monomorfik ventriküler taşikardi",
      "label": "VENTRİKÜLER TAŞİKARDİ • VT",
      "lead": "V1",
      "summary": "Ventrikülden başlayan hızlı ritim, düzenli ve geniş QRS kompleksleri oluşturur. Kısa doluş süresi ile ventriküler eşzamanlılık kaybı mekanik etkinliği azaltır.",
      "clues": [
        "Düzenli geniş kompleks",
        "Yaklaşık 158/dk",
        "QRS yaklaşık 180 ms"
      ],
      "note": "<b>Güvenlik notu:</b> Geniş kompleks taşikardi klinikte aksi kanıtlanana kadar VT kabul edilerek acil değerlendirilir.",
      "cards": [
        [
          "EKG özellikleri",
          "Hızlı, düzenli, geniş ve tek biçimli komplekslerden oluşan sentetik monomorfik VT."
        ],
        [
          "Dolaşıma etkisi",
          "Doluş süresi ve her atımın etkinliği azalır; dolaşım kararlılığı klinik duruma göre değişebilir."
        ],
        [
          "Klinik önemi",
          "Nabız ve hemodinamik durum acil yaklaşımı belirler; bu simülasyon tedavi kararı vermez."
        ]
      ]
    },
    "vf": {
      "title": "Ventriküler fibrilasyon",
      "label": "VENTRİKÜLER FİBRİLASYON • VF",
      "lead": "II",
      "summary": "Kaotik ventriküler elektriksel etkinlikte organize QRS, etkili ventriküler kasılma ve dolaşım yoktur.",
      "clues": [
        "Organize QRS yok",
        "Kaotik düzensiz dalgalar",
        "Etkili ejeksiyon yok"
      ],
      "note": "<b>Acil ritim:</b> VF kardiyak arrest ritmidir; gerçek yaşamda hemen resüsitasyon ve defibrilasyon algoritması gerekir.",
      "cards": [
        [
          "EKG özellikleri",
          "Değişken genlikli, kaotik etkinlik; düzenli R–R veya seçilebilir QRS bulunmaz."
        ],
        [
          "Dolaşıma etkisi",
          "Etkili ventriküler kasılma ve ileri kan akımı oluşmaz."
        ],
        [
          "Klinik önemi",
          "Bu görünüm eğitim amaçlıdır; gerçek VF acil müdahale gerektirir."
        ]
      ]
    },
    "pat": {
      "title": "Paroksismal atriyal taşikardi (PAT)",
      "label": "PAROKSİSMAL ATRİYAL TAŞİKARDİ • PAT",
      "lead": "II",
      "summary": "Sinüs düğümü dışındaki atriyal bir odaktan başlayan düzenli taşikardide P dalgasının ekseni ve biçimi değişir; QRS genellikle dardır.",
      "clues": [
        "Düzenli atriyal taşikardi",
        "Farklı morfolojili P",
        "Dar QRS · 150/dk"
      ],
      "note": "<b>Ayırt edici bulgu:</b> Her QRS öncesindeki sinüs P’sinden farklı P dalgasını, düzenli hız ve dar QRS ile birlikte değerlendir.",
      "cards": [
        [
          "EKG özellikleri",
          "Yaklaşık 150/dk; inferior derivasyonlarda ters gösterilen ektopik P dalgası ve dar QRS."
        ],
        [
          "Dolaşıma etkisi",
          "Atriyal kasılma sürer; yüksek hız nedeniyle ventrikül doluş süresi kısalır."
        ],
        [
          "Klinik önemi",
          "“PAT” burada fokal atriyal taşikardiyi öğretmek için kullanılır; başlangıç ve bitiş şeritte gösterilmez."
        ]
      ]
    },
    "flutter": {
      "title": "Atriyal flutter",
      "label": "ATRİYAL FLUTTER • 2:1 İLETİM",
      "lead": "II",
      "summary": "Düzenli makro-reentran atriyal etkinlik yaklaşık 300/dk hızda F dalgaları oluşturur. Bu örnekte 2:1 AV iletimle ventrikül hızı 150/dk’dır.",
      "clues": [
        "Testere dişi F dalgaları",
        "II–III–aVF’de belirgin",
        "2:1 iletim · 150/dk"
      ],
      "note": "<b>Derivasyon ipucu:</b> Tipik flutter dalgaları inferior derivasyonlarda daha belirgindir; artırılmış grupta aVF’yi seç.",
      "cards": [
        [
          "EKG özellikleri",
          "İzoelektrik hat olmadan süren F dalgaları ve her iki atriyal dalgadan birinin ventriküle iletildiği örnek."
        ],
        [
          "Dolaşıma etkisi",
          "Koordineli atriyal kasılma azalır; hızlı ventrikül yanıtı doluş süresini kısaltır."
        ],
        [
          "Klinik önemi",
          "İletim oranı değişebilir; bu şerit yalnızca sabit 2:1 örneğini gösterir."
        ]
      ]
    },
    "sintach": {
      "title": "Sinüs taşikardisi",
      "label": "SİNÜS TAŞİKARDİSİ",
      "lead": "II",
      "summary": "Uyarı sinüs düğümünden çıkar; hız artmış olsa da her QRS öncesinde uygun P dalgası ve düzenli dar kompleksler korunur.",
      "clues": [
        "Yaklaşık 120/dk",
        "Her QRS öncesinde P",
        "Düzenli dar QRS"
      ],
      "note": "<b>Ayırt edici bulgu:</b> Hızlı ritimde sinüs P morfolojisinin ve P–QRS ilişkisinin korunması sinüs taşikardisini destekler.",
      "cards": [
        [
          "EKG özellikleri",
          "Yaklaşık 120/dk düzenli ritim; her dar QRS öncesinde sinüs P dalgası."
        ],
        [
          "Dolaşıma etkisi",
          "Döngüler sıklaşır ve diyastolik doluş süresi kısalır; etkin ejeksiyon sürer."
        ],
        [
          "Klinik önemi",
          "Sinüs taşikardisi çoğunlukla fizyolojik veya ikincil bir yanıttır; neden klinik bağlamla araştırılır."
        ]
      ]
    },
    "lbbb": {
      "title": "Sol dal bloğu (LBBB)",
      "label": "SOL DAL BLOĞU • LBBB",
      "lead": "V6",
      "summary": "Sol dal iletiminin gecikmesi QRS’yi genişletir. V1’de derin negatif kompleks; I, aVL, V5–V6’da geniş ve çentikli R morfolojisi belirginleşir.",
      "clues": [
        "QRS yaklaşık 160 ms",
        "V1’de QS/rS",
        "I–aVL–V5–V6’da geniş R"
      ],
      "note": "<b>Karşılaştırma:</b> Prekordiyal grupta V1 ve V6 arasında geçiş yap; terminal QRS yönü ve sekonder ST–T diskordansını karşılaştır.",
      "cards": [
        [
          "EKG özellikleri",
          "Geniş QRS; sağ prekordiyallerde derin S, lateral derivasyonlarda geniş/çentikli R."
        ],
        [
          "Dolaşıma etkisi",
          "Sol ventrikül aktivasyonu gecikir; kasılma eşzamanlılığı azaltılmış olarak gösterilir."
        ],
        [
          "Klinik önemi",
          "Dal bloğu etiyoloji veya akut iskemi tanısını tek başına belirlemez; eski EKG ve klinik bağlam gerekir."
        ]
      ]
    },
    "rbbb": {
      "title": "Sağ dal bloğu (RBBB)",
      "label": "SAĞ DAL BLOĞU • RBBB",
      "lead": "V1",
      "summary": "Sağ dal iletiminin gecikmesi QRS’yi genişletir. V1–V2’de terminal R′; I ve V6’da geniş terminal S dalgası belirginleşir.",
      "clues": [
        "QRS yaklaşık 140 ms",
        "V1–V2’de rSR′",
        "I–V6’da geniş terminal S"
      ],
      "note": "<b>Karşılaştırma:</b> Prekordiyal grupta V1 ve V6 arasında geçiş yaparak rSR′ ile geniş terminal S morfolojilerini karşılaştır.",
      "cards": [
        [
          "EKG özellikleri",
          "V1–V2’de rsR′/rSR′, lateral derivasyonlarda geniş terminal S ve sekonder ST–T değişikliği."
        ],
        [
          "Dolaşıma etkisi",
          "Sağ ventrikül aktivasyonu gecikir; model hafif eşzamanlılık kaybı gösterir."
        ],
        [
          "Klinik önemi",
          "Tam RBBB için erişkinde QRS genişliği ve morfoloji birlikte değerlendirilir."
        ]
      ]
    }
  } as const satisfies Readonly<Record<Mode, PulseModeContent>>;
