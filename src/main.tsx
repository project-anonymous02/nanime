import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { HashRouter } from 'react-router-dom';
import { App } from './App';
import '@fontsource-variable/inter';
import './styles/app.css';

const host = document.getElementById('root');
if (host) {
  createRoot(host).render(
    <StrictMode>
      <HashRouter>
        <App />
      </HashRouter>
    </StrictMode>
  );
}
const boot = document.getElementById('boot');
if (boot) {
  boot.classList.add('done');
  window.setTimeout(() => boot.remove(), 320);
}
