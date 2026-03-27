import { getCountryLabel } from '../utils/countries';
import { clearPolylineProgress } from '../utils/storage';

function downloadJson(data, filename) {
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

export default function PolylineExportScreen({ data, country, onStartOver }) {
  const { features, warningCount, totalSections, totalPolylines } = data;

  const geojson = {
    type: 'FeatureCollection',
    features,
  };

  const handleDownload = () => {
    downloadJson(geojson, `polylines_${country}.geojson`);
  };

  const handleStartOver = () => {
    if (window.confirm(`Clear saved polyline progress for ${getCountryLabel(country)}?`)) {
      clearPolylineProgress(country);
    }
    onStartOver();
  };

  return (
    <div className="screen export-screen">
      <div className="export-card">
        <h1>Export Polylines</h1>
        <p className="country-label">{getCountryLabel(country)}</p>

        <div className="export-stats">
          <div className="stat">
            <span className="stat-number">{totalSections}</span>
            <span className="stat-label">Original sections</span>
          </div>
          <div className="stat">
            <span className="stat-number">{totalPolylines}</span>
            <span className="stat-label">Polylines created</span>
          </div>
          {warningCount > 0 && (
            <div className="stat">
              <span className="stat-number" style={{ color: '#f59e0b' }}>{warningCount}</span>
              <span className="stat-label">Sections with warnings</span>
            </div>
          )}
        </div>

        <div className="export-buttons">
          <button className="btn btn-primary btn-large" onClick={handleDownload}>
            Download Polylines GeoJSON
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
