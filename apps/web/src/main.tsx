import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
import { ToastProvider } from './components/toast/ToastProvider';
import './styles.css';
import { installMonitoring } from './monitoring';
import { ErrorBoundary } from './components/ErrorBoundary';

installMonitoring();

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <ErrorBoundary><ToastProvider>
      <App />
    </ToastProvider></ErrorBoundary>
  </React.StrictMode>
);
