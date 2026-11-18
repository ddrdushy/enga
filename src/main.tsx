import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.tsx'
import { UpdateBanner } from './screens/UpdateBanner.tsx'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
    <UpdateBanner />
  </StrictMode>,
)

if ('serviceWorker' in navigator && import.meta.env.PROD) {
  window.addEventListener('load', () => { void navigator.serviceWorker.register('/sw.js') })
}
