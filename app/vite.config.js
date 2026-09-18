import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))

function getCertFiles() {
  const dir = __dirname;
  if (fs.existsSync(path.resolve(dir, 'cert.pem')) && fs.existsSync(path.resolve(dir, 'key.pem'))) {
    return {
      key: fs.readFileSync(path.resolve(dir, 'key.pem')),
      cert: fs.readFileSync(path.resolve(dir, 'cert.pem')),
    }
  }
  const files = fs.readdirSync(dir);
  const keyFile = files.find(f => f.endsWith('-key.pem') || f === 'key.pem');
  const certFile = files.find(f => f.endsWith('.pem') && !f.endsWith('-key.pem') && f !== 'key.pem');
  if (keyFile && certFile) {
    return {
      key: fs.readFileSync(path.resolve(dir, keyFile)),
      cert: fs.readFileSync(path.resolve(dir, certFile)),
    }
  }
  throw new Error('No SSL certificates found in app directory. Please run setup.bat or mkcert.');
}

export default defineConfig({
  plugins: [react()],
  server: {
    host: true,
    https: getCertFiles(),
    proxy: {
      '/api': {
        target: 'http://localhost:8081',
        changeOrigin: true,
      },
    },
  },
})