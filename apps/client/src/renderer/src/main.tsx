import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'

import { App } from './App.js'
import { connectStore } from './store.js'
import './styles.css'
import './board.css'

const root = document.getElementById('root')
if (!root) throw new Error('missing #root')

connectStore()

createRoot(root).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
