import { useEffect, useState } from 'react';
import { Layout } from './components/Layout';
import { PwaInstallBanner } from './components/PwaInstallBanner';
import { SenseiApp } from './sensei/SenseiApp';
import { getUiMode, setUiMode, subscribeUiMode, type UiMode } from './sensei/uiMode';
import './sensei/sensei.css';

function App() {
  const [mode, setMode] = useState<UiMode>(() => getUiMode());
  useEffect(() => subscribeUiMode(setMode), []);

  if (mode === 'simple') return <SenseiApp />;
  return (
    <>
      <Layout />
      <PwaInstallBanner />
      <button type="button" className="sensei-back-to-simple" onClick={() => setUiMode('simple')}>
        かんたんモード
      </button>
    </>
  );
}

export default App;
