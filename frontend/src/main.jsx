import React from 'react'
import {createRoot} from 'react-dom/client'
import './style.css'
import App from './App'

// Apply saved theme before first render to avoid flash
if (localStorage.getItem('artemis-theme') === 'dark') {
  document.documentElement.classList.add('dark');
}

const container = document.getElementById('root')

const root = createRoot(container)

root.render(
    <React.StrictMode>
        <App/>
    </React.StrictMode>
)
