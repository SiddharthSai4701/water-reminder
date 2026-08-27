// The React root for the settings window. Named `settings-entry` rather than
// `settings.tsx` because the component beside it is `Settings.tsx`, and both
// Windows NTFS and macOS APFS are case-insensitive by default — the two names
// are the same file on every machine this app is developed on. Renaming this
// back would silently clobber the component.
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import Settings from './Settings.js';
import type { SettingsApi } from '../preload/settings.js';
import './settings.css';

declare global {
  interface Window {
    waterSettings: SettingsApi;
  }
}

const container = document.getElementById('root');
if (container === null) throw new Error('settings root element missing');

createRoot(container).render(
  <StrictMode>
    <Settings />
  </StrictMode>,
);
