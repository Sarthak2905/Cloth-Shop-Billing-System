import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { BrowserRouter } from 'react-router-dom'
import './index.css'
import App from './App.jsx'
import DatabaseGate from './components/DatabaseGate.jsx'

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <DatabaseGate>
      <BrowserRouter>
        <App />
      </BrowserRouter>
    </DatabaseGate>
  </StrictMode>,
)