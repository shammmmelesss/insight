import React from 'react'
import ReactDOM from 'react-dom/client'
import './api/client' // 全局 axios 拦截器，必须最先导入
import App from './App.tsx'
import './index.css'

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
)