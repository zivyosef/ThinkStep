import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import path from 'path'
import { existsSync, statSync, readFileSync } from 'fs'

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.css':  'text/css; charset=utf-8',
  '.js':   'text/javascript; charset=utf-8',
  '.svg':  'image/svg+xml',
  '.png':  'image/png',
  '.jpg':  'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.ico':  'image/x-icon',
}

function serveLegacy() {
  const legacyDir = path.resolve(__dirname, '../legacy')
  return {
    name: 'serve-legacy',
    configureServer(server) {
      server.middlewares.use((req, res, next) => {
        const url = req.url.split('?')[0]
        const filePath = path.join(legacyDir, url)
        const ext = path.extname(filePath)
        if (existsSync(filePath) && statSync(filePath).isFile()) {
          res.setHeader('Content-Type', MIME[ext] || 'application/octet-stream')
          res.end(readFileSync(filePath))
        } else {
          next()
        }
      })
    },
  }
}

export default defineConfig({
  plugins: [react(), tailwindcss(), serveLegacy()],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
  server: {
    proxy: {
      '/api': 'http://localhost:3001',
    },
  },
})
