import { SenseiApp } from './sensei/SenseiApp';
import { installErrorLogging } from './sensei/log';
import { removeLocalStorage } from './utils/storage';
import './sensei/sensei.css';

installErrorLogging();
// The detail mode (web-katrain's own screen) is gone; forget a stored choice of it.
removeLocalStorage('web-katrain:sensei-ui-mode:v1');

function App() {
  return <SenseiApp />;
}

export default App;
