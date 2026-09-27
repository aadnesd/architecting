import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import App from './App';
import './styles.css';
import { useStore } from './store/store';
import { registry } from './three/registry';

// Handle for debugging and automated visual tests.
(window as unknown as { __homeDesigner: unknown }).__homeDesigner = { store: useStore, registry };

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
