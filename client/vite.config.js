import { defineConfig } from 'vitest/config'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { VitePWA } from 'vite-plugin-pwa'

export default defineConfig({
  plugins: [
    react(),
    tailwindcss(),
    VitePWA({
      disable: Boolean(process.env.VITEST), // not needed while running tests
      registerType: 'prompt', // never reload by itself; the cashier chooses when to update
      injectRegister: false, // we register the service worker ourselves (src/pwa)
      manifest: {
        name: 'Clothing POS',
        short_name: 'Clothing POS',
        description: 'Offline-first billing and stock for a clothing shop',
        id: '/',
        start_url: '/billing',
        scope: '/',
        display: 'standalone',
        theme_color: '#1d4ed8',
        background_color: '#f1f5f9',
        icons: [
          {
            src: 'icons/icon-192.png',
            sizes: '192x192',
            type: 'image/png',
            purpose: 'any',
          },
          {
            src: 'icons/icon-512.png',
            sizes: '512x512',
            type: 'image/png',
            purpose: 'any',
          },
          {
            src: 'icons/icon-512.png',
            sizes: '512x512',
            type: 'image/png',
            purpose: 'maskable',
          },
        ],
      },
      workbox: {
        // wasm is the barcode reader. Without it the camera scanner would fail offline.
        globPatterns: ['**/*.{js,css,html,png,svg,ico,webmanifest,wasm}'],
        maximumFileSizeToCacheInBytes: 5 * 1024 * 1024,
        navigateFallback: 'index.html',
        navigateFallbackDenylist: [/^\/api\//],
        cleanupOutdatedCaches: true,
        clientsClaim: true,
      },
    }),
  ],
  build: {
    chunkSizeWarningLimit: 1000,
  },
  test: {
    environment: 'jsdom',
    globals: true,
    setupFiles: './src/setupTests.js',
  },
})
