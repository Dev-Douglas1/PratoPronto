import { StrictMode, useEffect } from 'react'
import { createRoot } from 'react-dom/client'
import { BrowserRouter } from 'react-router-dom'
import App from './App.jsx'
import { CartProvider } from './context/CartContext.jsx'
import { UserProvider } from './context/UserContext.jsx'
import { CompanyProvider } from './context/CompanyContext.jsx'
import AppErrorBoundary from './components/AppErrorBoundary.jsx'
import './index.css'
import './mobile-responsive.css'
import './pwa.js'
import { watchForUpdates } from './pwa.js'

function StartupReady() {
  useEffect(() => { window.dispatchEvent(new Event('pratopronto-ready')) }, [])
  return null
}

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <AppErrorBoundary>
    <BrowserRouter>
      <UserProvider>
        <CompanyProvider>
        <CartProvider>
          <App />
          <StartupReady />
        </CartProvider>
        </CompanyProvider>
      </UserProvider>
    </BrowserRouter>
    </AppErrorBoundary>
  </StrictMode>,
)

if ('serviceWorker' in navigator && import.meta.env.PROD) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/sw.js', { updateViaCache: 'none' }).then(watchForUpdates).catch(() => undefined)
  })
}
