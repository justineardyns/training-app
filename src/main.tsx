import { render } from 'preact';
import { App } from './ui/App.tsx';
import './styles.css';

render(<App />, document.getElementById('app')!);

if ('serviceWorker' in navigator && import.meta.env.PROD) {
  navigator.serviceWorker.register(`${import.meta.env.BASE_URL}sw.js`).catch((err) => {
    console.warn('Service worker niet geregistreerd', err);
  });
  // Tik op een melding terwijl de app al open is → naar de juiste pagina.
  navigator.serviceWorker.addEventListener('message', (e) => {
    if (e.data?.type === 'navigate' && typeof e.data.url === 'string') {
      const hash = new URL(e.data.url).hash;
      if (hash) location.hash = hash;
    }
  });
}
