import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import App from './App'
import { UpdateBanner } from './components/UpdateBanner'
import './styles.css'
import { fitToScreen } from './lib/standalone'

fitToScreen()

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
    <UpdateBanner />
  </StrictMode>,
)
