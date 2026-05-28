import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import './index.css';
import App from './App.jsx';
import ReloadPrompt from './components/shared/ReloadPrompt.jsx';

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <App />
    <ReloadPrompt />
  </StrictMode>
);
