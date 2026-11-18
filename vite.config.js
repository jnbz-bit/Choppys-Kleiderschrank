import { defineConfig } from 'vite';
import { VitePWA } from 'vite-plugin-pwa';

export default defineConfig({
  build: { target: 'es2020', chunkSizeWarningLimit: 2000 },
  plugins: [
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['icons/apple-touch-icon.png', 'icons/favicon.svg'],
      manifest: {
        name: 'Kleiderschrank',
        short_name: 'Schrank',
        description: 'Kleidung einscannen, Outfits am eigenen Foto zusammenstellen und speichern.',
        lang: 'de',
        start_url: '/',
        scope: '/',
        display: 'standalone',
        orientation: 'portrait',
        background_color: '#F2F2F7',
        theme_color: '#F2F2F7',
        icons: [
          { src: '/icons/icon-192.png', sizes: '192x192', type: 'image/png' },
          { src: '/icons/icon-512.png', sizes: '512x512', type: 'image/png' },
          { src: '/icons/icon-512-maskable.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' }
        ]
      },
      workbox: {
        globPatterns: ['**/*.{js,css,html,svg,png,woff2,webmanifest}'],
        globIgnores: ['bgdata/**', 'seg/**'],
        maximumFileSizeToCacheInBytes: 6 * 1024 * 1024,
        navigateFallbackDenylist: [/^\/api\//],
        runtimeCaching: [
          {
            // Kleidungserkennung (MediaPipe): einmal laden, dann aus dem Cache
            urlPattern: ({ url }) => url.pathname.startsWith('/seg/'),
            handler: 'CacheFirst',
            options: {
              cacheName: 'kleidungserkennung',
              expiration: { maxEntries: 10 },
              cacheableResponse: { statuses: [0, 200] }
            }
          },
          {
            // Freisteller-Modell: einmal laden, dann dauerhaft aus dem Cache
            urlPattern: ({ url }) => url.pathname.startsWith('/bgdata/'),
            handler: 'CacheFirst',
            options: {
              cacheName: 'freisteller-modell',
              expiration: { maxEntries: 60 },
              cacheableResponse: { statuses: [0, 200] }
            }
          }
        ]
      }
    })
  ]
});
