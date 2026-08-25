import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import Popup from './Popup.js';
import type { WaterApi } from '../preload/index.js';
import './popup.css';

declare global {
  interface Window {
    water: WaterApi;
  }
}

const container = document.getElementById('root');
if (container === null) throw new Error('popup root element missing');

createRoot(container).render(
  <StrictMode>
    <Popup />
  </StrictMode>,
);
