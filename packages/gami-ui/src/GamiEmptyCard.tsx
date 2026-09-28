import type { GamiIcons } from "./types";

export function GamiEmptyCard({ onAssessment, icons, badgeCount = 28 }: { onAssessment: () => void; icons: Pick<GamiIcons, "arrowRight" | "award" | "chart" | "star" | "target">; badgeCount?: number }) {
  return (
    <div className="card eg-gami-empty">
      <h2>Başarılarım burada birikecek</h2>
      <p>Değerlendirme ve uygulama oturumların XP ve rozet olarak burada toplanır. İlk değerlendirmeni tamamladığında sıralamaya da girebilirsin.</p>
      <div className="eg-gami-empty-steps">
        <div><span className="ic eg-gami-tone-blue">{icons.star({ width: 24, height: 24 })}</span><b>XP kazan</b><span>Her oturum ve doğru yanıt XP getirir.</span></div>
        <div><span className="ic eg-gami-tone-amber">{icons.award({ width: 24, height: 24 })}</span><b>Rozet topla</b><span>{badgeCount} rozet: konu, beceri, seri, öğrenme ve Meydan Okuma.</span></div>
        <div><span className="ic eg-gami-tone-purple">{icons.chart({})}</span><b>Sıralamada yüksel</b><span>En iyi 3 değerlendirmenin ortalaması sayılır.</span></div>
        <div><span className="ic eg-gami-tone-green">{icons.target({ width: 24, height: 24 })}</span><b>İlerlemeni izle</b><span>Alan bazlı güçlü ve zayıf yönlerin.</span></div>
      </div>
      <button className="btn purple" type="button" onClick={onAssessment}>Değerlendirmeye gir {icons.arrowRight({ width: 16, height: 16 })}</button>
    </div>
  );
}
