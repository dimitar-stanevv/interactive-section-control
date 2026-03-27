import { useState, useCallback } from 'react';
import WelcomeScreen from './screens/WelcomeScreen';
import AnalysisScreen from './screens/AnalysisScreen';
import FixScdbDataMapScreen from './screens/FixScdbDataMapScreen';
import ExportScreen from './screens/ExportScreen';
import PolylineAnalysisScreen from './screens/PolylineAnalysisScreen';
import PolylineFullAnalysisScreen from './screens/PolylineFullAnalysisScreen';
import PolylineMapScreen from './screens/PolylineMapScreen';
import PolylineExportScreen from './screens/PolylineExportScreen';

export default function App() {
  const [screen, setScreen] = useState('welcome');

  // Module 1 state
  const [geojsonData, setGeojsonData] = useState(null);
  const [selectedCountry, setSelectedCountry] = useState(null);
  const [exportData, setExportData] = useState(null);

  // Module 2 state
  const [sectionsData, setSectionsData] = useState(null);
  const [prefetchedResults, setPrefetchedResults] = useState(null);
  const [polylineExportData, setPolylineExportData] = useState(null);

  const handleModuleOneFileLoaded = useCallback((data) => {
    setGeojsonData(data);
    setScreen('analysis');
  }, []);

  const handleModuleTwoFileLoaded = useCallback((data) => {
    setSectionsData(data);
    setScreen('polyline-analysis');
  }, []);

  const handleCountrySelected = useCallback((country) => {
    setSelectedCountry(country);
    setScreen('map');
  }, []);

  const handleProcessingComplete = useCallback((result) => {
    setExportData(result);
    setScreen('export');
  }, []);

  const handlePolylineFetchGeometry = useCallback(() => {
    setScreen('polyline-full-analysis');
  }, []);

  const handleResultsFetched = useCallback((results) => {
    setPrefetchedResults(results);
  }, []);

  const handlePolylineStart = useCallback(() => {
    setScreen('polyline-map');
  }, []);

  const handlePolylineComplete = useCallback((result) => {
    setPolylineExportData(result);
    setScreen('polyline-export');
  }, []);

  const handleStartOver = useCallback(() => {
    setGeojsonData(null);
    setSelectedCountry(null);
    setExportData(null);
    setSectionsData(null);
    setPrefetchedResults(null);
    setPolylineExportData(null);
    setScreen('welcome');
  }, []);

  switch (screen) {
    case 'welcome':
      return (
        <WelcomeScreen
          onModuleOneFileLoaded={handleModuleOneFileLoaded}
          onModuleTwoFileLoaded={handleModuleTwoFileLoaded}
        />
      );
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
        <FixScdbDataMapScreen
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
    case 'polyline-analysis':
      return (
        <PolylineAnalysisScreen
          sectionsData={sectionsData}
          onFetchGeometry={handlePolylineFetchGeometry}
          onStartDirect={handlePolylineStart}
          onBack={() => setScreen('welcome')}
        />
      );
    case 'polyline-full-analysis':
      return (
        <PolylineFullAnalysisScreen
          sectionsData={sectionsData}
          onResultsFetched={handleResultsFetched}
          onStart={handlePolylineStart}
          onBack={() => { setPrefetchedResults(null); setScreen('polyline-analysis'); }}
        />
      );
    case 'polyline-map':
      return (
        <PolylineMapScreen
          sectionsData={sectionsData}
          prefetchedResults={prefetchedResults}
          onComplete={handlePolylineComplete}
        />
      );
    case 'polyline-export':
      return (
        <PolylineExportScreen
          data={polylineExportData}
          country={sectionsData?.country}
          onStartOver={handleStartOver}
        />
      );
    default:
      return null;
  }
}
