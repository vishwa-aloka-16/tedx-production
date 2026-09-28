import jkitLogo from "../assets/JKIT-logo.png";
import tedxLogo from "../assets/tedx.png";

export default function BrandLogos({ compact = false }) {
  return (
    <div className={`brand-logos${compact ? " brand-logos--compact" : ""}`}>
      <div className="brand-partner brand-partner--primary">
        <span className="brand-caption">Powered by</span>
        <div className="brand-logo brand-logo--jkit">
          <img src={jkitLogo} alt="John Keells IT — disruptive minds" />
        </div>
      </div>
      <div className="brand-partner brand-partner--event">
        <span className="brand-caption">At</span>
        <div className="brand-logo brand-logo--tedx">
          <img src={tedxLogo} alt="TEDx" />
        </div>
      </div>
    </div>
  );
}
