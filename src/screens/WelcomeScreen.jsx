import { useCallback } from 'react';

export default function WelcomeScreen({ onModuleOneFileLoaded, onModuleTwoFileLoaded }) {
  const handleScdbFileChange = useCallback((e) => {
    const file = e.target.files[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (event) => {
      try {
        const data = JSON.parse(event.target.result);
        if (data.type !== 'FeatureCollection' || !Array.isArray(data.features)) {
          alert('Invalid GeoJSON: expected a FeatureCollection with features array.');
          return;
        }
        if (data.features.length === 0) {
          alert('The GeoJSON file contains no features.');
          return;
        }
        onModuleOneFileLoaded(data);
      } catch (err) {
        alert('Failed to parse JSON file: ' + err.message);
      }
    };
    reader.readAsText(file);
  }, [onModuleOneFileLoaded]);

  const handlePolylineFileChange = useCallback((e) => {
    const file = e.target.files[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (event) => {
      try {
        const data = JSON.parse(event.target.result);
        if (!data.country || typeof data.country !== 'string') {
          alert('Invalid sections JSON: missing "country" field.');
          return;
        }
        if (!Array.isArray(data.sections) || data.sections.length === 0) {
          alert('Invalid sections JSON: expected a non-empty "sections" array.');
          return;
        }
        for (let i = 0; i < data.sections.length; i++) {
          const s = data.sections[i];
          if (!s.start?.geometry?.coordinates || !s.end?.geometry?.coordinates) {
            alert(`Invalid section at index ${i}: missing start or end point coordinates.`);
            return;
          }
        }
        onModuleTwoFileLoaded(data);
      } catch (err) {
        alert('Failed to parse JSON file: ' + err.message);
      }
    };
    reader.readAsText(file);
  }, [onModuleTwoFileLoaded]);

  return (
    <div className="screen welcome-screen">
      <h1 style={{ marginBottom: 8, fontSize: 32 }}>Section Control Tool</h1>
      <p style={{ color: '#6b7280', marginBottom: 36, fontSize: 15 }}>
        Choose a module to get started
      </p>
      <div className="welcome-modules">
        <div className="module-card">
          <div className="module-card-icon" style={{ background: '#ecfdf5', color: '#16a34a' }}>1</div>
          <h2>Fix Data from SCDB</h2>
          <p>
            Upload a <strong>GeoJSON file</strong> from the Section Control Database (SCDB) containing
            point features (<code>section_start</code>, <code>section_end</code>, <code>section_mid</code>).
            This module helps you manually pair start points with their corresponding end points and
            mid points on an interactive map, producing a structured sections JSON file.
          </p>
          <div className="file-upload">
            <label htmlFor="scdb-input" className="file-label">
              Select a GeoJSON file (.geojson, .json)
            </label>
            <input
              id="scdb-input"
              type="file"
              accept=".geojson,.json"
              onChange={handleScdbFileChange}
            />
          </div>
        </div>

        <div className="module-card">
          <div className="module-card-icon" style={{ background: '#eff6ff', color: '#2563eb' }}>2</div>
          <h2>Create Section Polylines</h2>
          <p>
            Upload a <strong>sections JSON file</strong> (output from Module 1) for a specific country.
            This module fetches actual driving route geometries from the Mapbox Directions API for each
            section, producing a GeoJSON file with LineString polylines ready for mobile app integration.
            Sections with mid points are automatically split into individual sub-sections.
          </p>
          <div className="file-upload">
            <label htmlFor="polyline-input" className="file-label">
              Select a sections JSON file (.json)
            </label>
            <input
              id="polyline-input"
              type="file"
              accept=".json"
              onChange={handlePolylineFileChange}
            />
          </div>
        </div>
      </div>
    </div>
  );
}
