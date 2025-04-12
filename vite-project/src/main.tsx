import React, { StrictMode } from 'react'; // Import React and StrictMode
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.tsx'
import './i18n'; // Import the i18n configuration

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    {/* Wrap App with Suspense for i18n loading */}
    <React.Suspense fallback="Loading...">
      <App />
    </React.Suspense>
  </StrictMode>,
)
