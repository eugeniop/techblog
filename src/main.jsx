import { Buffer } from 'buffer'
if (!window.Buffer) window.Buffer = Buffer

import React from 'react'
import ReactDOM from 'react-dom/client'
import { BrowserRouter } from 'react-router-dom' // ← add this
import App from './App.jsx'
import './index.css'
import 'highlight.js/styles/atom-one-dark.css'

const basename =
  import.meta.env.MODE === 'production' ? '/techblog' : '/'

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <BrowserRouter basename={basename}>
      <App />
    </BrowserRouter>
  </React.StrictMode>
)
