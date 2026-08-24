import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { fileURLToPath, URL } from 'node:url'
import { compression } from 'vite-plugin-compression2'

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [
    react(),
    // 构建时预压缩，Go 直接发送 .gz/.br，运行时零 CPU 开销
    compression({ algorithms: ['gzip', 'brotliCompress'], threshold: 1024 }),
  ],
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
      '@shared': fileURLToPath(new URL('../shared', import.meta.url)),
    },
  },
  build: {
    rollupOptions: {
      output: {
        // 仅拆分首屏必加载的全局库以利长期缓存；antv/monaco 等只被懒加载页面使用，
        // 交由 Vite 按动态导入边界自动拆成 async chunk，避免被首屏 modulepreload 拉取
        manualChunks: {
          react: ['react', 'react-dom', 'react-router-dom'],
          antd: ['antd'],
        },
      },
    },
  },
  server: {
    port: 3000,
    strictPort: true,
    host: '0.0.0.0',
    proxy: {
      '/api': {
        target: 'http://localhost:8080',
        changeOrigin: true,
      },
    },
  },
})
