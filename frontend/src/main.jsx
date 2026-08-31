import React from 'react';
import { createRoot } from 'react-dom/client';
import App from './App';
import './styles/login.css';
import './styles/registration.css';
import './styles/header-logo-overrides.css';
import './styles/zone-dropdown.css';
import './styles/signup.css';
import './styles/layout.css';

createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);
