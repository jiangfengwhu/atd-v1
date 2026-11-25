import * as React from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './App';
import { ErrorBoundary } from '@/components/ErrorBoundary';
import { installGlobalErrorReporter } from '@/lib/errorReporter';
import './index.css';

installGlobalErrorReporter();

createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <ErrorBoundary>
      <App />
    </ErrorBoundary>
  </React.StrictMode>
);
