import fs from 'node:fs'
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// Geolocation only works in a secure context, so phones on the LAN need HTTPS.
// Generate the cert with mkcert into .cert/; without it, Vite
// falls back to plain HTTP.
const certDir = new URL('./.cert/', import.meta.url)
const https = fs.existsSync(new URL('cert.pem', certDir))
  ? {
      cert: fs.readFileSync(new URL('cert.pem', certDir)),
      key: fs.readFileSync(new URL('key.pem', certDir)),
    }
  : undefined

export default defineConfig({
  plugins: [react()],
  server: {
    host: '0.0.0.0',
    https,
    // Same-origin API calls: the browser only talks to Vite over HTTPS, and
    // Vite forwards to the backend over plain HTTP.
    proxy: {
      '/api': {
        target: 'http://localhost:3000',
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/api/, ''),
      },
    },
  },
})
