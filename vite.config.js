import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'
import { readFile } from 'node:fs/promises'

const ocrAssets = {
  'ort-wasm-simd-threaded.mjs': 'node_modules/onnxruntime-web/dist/ort-wasm-simd-threaded.mjs',
  'ort-wasm-simd-threaded.wasm': 'node_modules/onnxruntime-web/dist/ort-wasm-simd-threaded.wasm',
}

const contentTypes = { '.mjs': 'text/javascript', '.wasm': 'application/wasm' }

function localOcrAssets() {
  return {
    name: 'local-ocr-assets',
    configureServer(server) {
      server.middlewares.use('/ocr', async (request, response, next) => {
        const path = ocrAssets[request.url?.split('?')[0].slice(1)]
        if (!path) return next()
        try {
          response.setHeader('Content-Type', contentTypes[path.slice(path.lastIndexOf('.'))])
          response.end(await readFile(new URL(path, import.meta.url)))
        } catch (error) {
          next(error)
        }
      })
    },
    async generateBundle() {
      for (const [name, path] of Object.entries(ocrAssets)) {
        this.emitFile({ type: 'asset', fileName: `ocr/${name}`, source: await readFile(new URL(path, import.meta.url)) })
      }
    },
  }
}

// https://vite.dev/config/
export default defineConfig({
  plugins: [react(), localOcrAssets()],
  server: { port: 1343, strictPort: true },
  preview: { port: 1343, strictPort: true },
})
