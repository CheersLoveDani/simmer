import '@fontsource-variable/figtree';
import '@fontsource-variable/fraunces/full.css';
import './styles/tokens.css';
import './styles/base.css';
import './styles/app.css';

import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './App';
import { installInsets } from './platform/insets';

installInsets();

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
