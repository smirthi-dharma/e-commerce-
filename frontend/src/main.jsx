import React from 'react'
import { createRoot } from 'react-dom/client'
import { BrowserRouter } from 'react-router-dom'
import App from './App'
import { AuthProvider } from './context/AuthContext'
import { CartProvider } from './context/CartContext'
import './styles.css'

if (import.meta.env.PROD && 'serviceWorker' in navigator) {
  window.addEventListener('load', () => { navigator.serviceWorker.register('/sw.js').catch(() => {}) })
}

createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    {import.meta.env.DEV && import.meta.env.VITE_QA_MODE === 'true' && <aside role="status" style={{ padding: '10px 16px', background: '#fff3cd', color: '#503b00', textAlign: 'center', font: '600 14px/1.5 system-ui' }}>
      TEST COPY · Original product catalogue · No real payments or deliveries.{' '}
      <a href="https://pandiyan-stores.vercel.app/products" style={{ color: 'inherit', textDecoration: 'underline' }}>Open the live store</a>
    </aside>}
    <BrowserRouter>
      <AuthProvider>
        <CartProvider><App /></CartProvider>
      </AuthProvider>
    </BrowserRouter>
  </React.StrictMode>,
)
