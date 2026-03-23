import { useState, useCallback } from 'react';
import WelcomeScreen from './screens/WelcomeScreen';
import AnalysisScreen from './screens/AnalysisScreen';
import MapScreen from './screens/MapScreen';
import ExportScreen from './screens/ExportScreen';

export default function App() {
  const [screen, setScreen] = useState('welcome');
  const [geojsonData, setGeojsonData] = useState(null);
  const [selectedCountry, setSelectedCountry] = useState(null);
  const [exportData, setExportData] = useState(null);

  const handleFileLoaded = useCallback((data) => {
    setGeojsonData(data);
    setScreen('analysis');
  }, []);

  const handleCountrySelected = useCallback((country) => {
    setSelectedCountry(country);
    setScreen('map');
  }, []);

  const handleProcessingComplete = useCallback((result) => {
    setExportData(result);
    setScreen('export');
  }, []);

  const handleStartOver = useCallback(() => {
    setGeojsonData(null);
    setSelectedCountry(null);
    setExportData(null);
    setScreen('welcome');
  }, []);

  switch (screen) {
    case 'welcome':
      return <WelcomeScreen onFileLoaded={handleFileLoaded} />;
    case 'analysis':
      return (
        <AnalysisScreen
          geojsonData={geojsonData}
          onCountrySelected={handleCountrySelected}
          onBack={() => setScreen('welcome')}
        />
      );
    case 'map':
      return (
        <MapScreen
          geojsonData={geojsonData}
          country={selectedCountry}
          onComplete={handleProcessingComplete}
        />
      );
    case 'export':
      return (
        <ExportScreen
          data={exportData}
          country={selectedCountry}
          onStartOver={handleStartOver}
        />
      );
    default:
      return null;
  }
}
