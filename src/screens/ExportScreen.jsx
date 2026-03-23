import { getCountryLabel } from '../utils/countries';
import { clearProgress } from '../utils/storage';

function downloadJson(data, filename) {
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

export default function ExportScreen({ data, country, onStartOver }) {
  const { sections, danglingStartPoints, danglingEndPoints } = data;
  const totalDangling = danglingStartPoints.length + danglingEndPoints.length;

  const sectionsJson = {
    country,
    generated_at: new Date().toISOString(),
    total_sections: sections.length,
    sections: sections.map((s) => ({
      start: s.start,
      end: s.end,
      mid_points: s.midPoints,
    })),
  };

  const danglingGeoJson = {
    type: 'FeatureCollection',
    features: [...danglingStartPoints, ...danglingEndPoints],
  };

  const handleDownloadSections = () => {
    downloadJson(sectionsJson, `sections_${country}.json`);
  };

  const handleDownloadDangling = () => {
    downloadJson(danglingGeoJson, `dangling_${country}.geojson`);
  };

  const handleStartOver = () => {
    if (window.confirm(`Clear saved progress for ${getCountryLabel(country)}?`)) {
      clearProgress(country);
    }
    onStartOver();
  };

  return (
    <div className="screen export-screen">
      <div className="export-card">
        <h1>Export Results</h1>
        <p className="country-label">{getCountryLabel(country)}</p>

        <div className="export-stats">
          <div className="stat">
            <span className="stat-number">{sections.length}</span>
            <span className="stat-label">Sections created</span>
          </div>
          <div className="stat">
            <span className="stat-number">{danglingStartPoints.length}</span>
            <span className="stat-label">Dangling start points</span>
          </div>
          <div className="stat">
            <span className="stat-number">{danglingEndPoints.length}</span>
            <span className="stat-label">Dangling end points</span>
          </div>
        </div>

        <div className="export-buttons">
          <button className="btn btn-primary btn-large" onClick={handleDownloadSections}>
            Download Sections JSON
          </button>
          <button className="btn btn-secondary btn-large" onClick={handleDownloadDangling}>
            Download Dangling Points GeoJSON ({totalDangling} points)
          </button>
        </div>

        <hr />
        <button className="btn btn-secondary" onClick={handleStartOver}>
          Start Over
        </button>
      </div>
    </div>
  );
}
