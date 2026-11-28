import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import '@fontsource/barlow/400.css';
import '@fontsource/barlow/600.css';
import '@fontsource/barlow-condensed/600.css';
import '@fontsource/barlow-condensed/700.css';
import './styles.css';
import { useRoute } from './lib';
import { GamesHome, Home, NewArmy, ImportScreen } from './ui/Home';
import { ArmyScreen, AddUnits, UnitScreen, Settings, ExportScreen, BrowseDatasheet } from './ui/Army';
import { ToastHost } from './ui/common';
import { useEffect } from 'react';

function App() {
  const [a, b, c, d, e] = useRoute();
  useEffect(() => {
    window.scrollTo(0, 0);
  }, [a, b, c, d, e]);
  let screen: JSX.Element;
  if (a === 'new') screen = <NewArmy />;
  else if (a === 'import') screen = <ImportScreen code={b} />;
  else if (a === 'army' && b) {
    if (c === 'add') screen = <AddUnits id={b} />;
    else if (c === 'unit' && d) screen = <UnitScreen key={d} id={b} unitUid={d} tab={e === 'sheet' ? 'sheet' : 'config'} />;
    else if (c === 'ds' && d) screen = <BrowseDatasheet id={b} defId={d} />;
    else if (c === 'settings') screen = <Settings id={b} isNew={d === 'new'} />;
    else if (c === 'export') screen = <ExportScreen id={b} />;
    else screen = <ArmyScreen id={b} tab={c === 'rules' ? 'rules' : 'roster'} />;
  } else if (a === 'wh40k') screen = <Home />;
  else screen = <GamesHome />;
  return (
    <>
      {screen}
      <ToastHost />
    </>
  );
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
