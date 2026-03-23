import { useCallback } from 'react';

export default function WelcomeScreen({ onFileLoaded }) {
  const handleFileChange = useCallback((e) => {
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
        onFileLoaded(data);
      } catch (err) {
        alert('Failed to parse JSON file: ' + err.message);
      }
    };
    reader.readAsText(file);
  }, [onFileLoaded]);

  return (
    <div className="screen welcome-screen">
      <div className="welcome-card">
        <h1>Section Control Tool</h1>
        <p>
          This tool helps you transform a messy section control dataset into
          structured sections. You will manually pair start points with their
          corresponding end points (and optionally mid points) on an interactive map.
        </p>
        <div className="file-upload">
          <label htmlFor="geojson-input" className="file-label">
            Select a GeoJSON file to begin
          </label>
          <input
            id="geojson-input"
            type="file"
            accept=".geojson,.json"
            onChange={handleFileChange}
          />
        </div>
      </div>
    </div>
  );
}
