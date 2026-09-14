import React from 'react';
import { createRoot } from 'react-dom/client';
import App from './App.jsx';
import { applyTheme, getStoredTheme } from './theme.js';
import 'leaflet/dist/leaflet.css';
import './styles.css';

applyTheme(getStoredTheme());

createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);
