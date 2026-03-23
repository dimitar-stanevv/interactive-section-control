import { useMemo, useState } from 'react';
import { getCountryLabel } from '../utils/countries';
import { hasProgress } from '../utils/storage';

export default function AnalysisScreen({ geojsonData, onCountrySelected, onBack }) {
  const [selectedCountry, setSelectedCountry] = useState('');

  const analysis = useMemo(() => {
    const byCountry = {};
    let nullCountry = 0;
    let nullRoad = 0;

    for (const f of geojsonData.features) {
      const country = f.properties?.country;
      const type = f.properties?.type;

      if (!country) {
        nullCountry++;
        continue;
      }

      if (!byCountry[country]) {
        byCountry[country] = { section_start: 0, section_end: 0, section_mid: 0, total: 0 };
      }
      if (type) byCountry[country][type] = (byCountry[country][type] || 0) + 1;
      byCountry[country].total++;

      if (!f.properties?.osm_road) nullRoad++;
    }

    const countries = Object.entries(byCountry)
      .map(([code, counts]) => ({ code, ...counts }))
      .sort((a, b) => b.total - a.total);

    return { countries, nullCountry, nullRoad, totalFeatures: geojsonData.features.length };
  }, [geojsonData]);

  const handleStart = () => {
    if (!selectedCountry) return;
    const existing = hasProgress(selectedCountry);
    if (existing) {
      const resume = window.confirm(
        `Found saved progress for ${getCountryLabel(selectedCountry)}. Resume where you left off?\n\nClick OK to resume, Cancel to start fresh.`
      );
      if (!resume) {
        localStorage.removeItem('sct-progress-' + selectedCountry);
      }
    }
    onCountrySelected(selectedCountry);
  };

  return (
    <div className="screen analysis-screen">
      <div className="analysis-header">
        <button className="btn btn-secondary" onClick={onBack}>&larr; Back</button>
        <h1>Dataset Analysis</h1>
      </div>
      <p className="total-features">Total features: <strong>{analysis.totalFeatures.toLocaleString()}</strong></p>

      <div className="table-container">
        <table>
          <thead>
            <tr>
              <th>Country</th>
              <th>Start</th>
              <th>End</th>
              <th>Mid</th>
              <th>Total</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {analysis.countries.map((c) => {
              const discrepancy = c.section_start !== c.section_end;
              return (
                <tr key={c.code} className={discrepancy ? 'row-discrepancy' : ''}>
                  <td>{getCountryLabel(c.code)}</td>
                  <td>{c.section_start}</td>
                  <td>{c.section_end}</td>
                  <td>{c.section_mid}</td>
                  <td><strong>{c.total}</strong></td>
                  <td>{discrepancy && <span className="badge-warn">&#9888;</span>}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <div className="analysis-footer">
        <div className="data-warnings">
          {analysis.nullCountry > 0 && (
            <p className="warn">Features without country: <strong>{analysis.nullCountry}</strong></p>
          )}
          {analysis.nullRoad > 0 && (
            <p className="warn">Features without OSM road: <strong>{analysis.nullRoad}</strong></p>
          )}
          {analysis.nullCountry === 0 && analysis.nullRoad === 0 && (
            <p className="ok">All features have country and road data.</p>
          )}
        </div>

        <div className="country-select-row">
          <label htmlFor="country-select">Select country to process:</label>
          <select
            id="country-select"
            value={selectedCountry}
            onChange={(e) => setSelectedCountry(e.target.value)}
          >
            <option value="">-- Choose --</option>
            {analysis.countries.map((c) => (
              <option key={c.code} value={c.code}>
                {getCountryLabel(c.code)} ({c.total} cameras)
              </option>
            ))}
          </select>
          <button className="btn btn-primary" onClick={handleStart} disabled={!selectedCountry}>
            Start Processing
          </button>
        </div>
      </div>
    </div>
  );
}
