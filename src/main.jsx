import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.jsx'
import BackgroundAudio from './components/BackgroundAudio.jsx'

const isBackgroundPage = new URLSearchParams(window.location.search).get('background') === '1'

createRoot(document.getElementById('root')).render(
  <StrictMode>
    {isBackgroundPage ? <BackgroundAudio /> : <App />}
  </StrictMode>,
)
