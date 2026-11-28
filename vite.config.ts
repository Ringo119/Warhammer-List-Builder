import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { VitePWA } from 'vite-plugin-pwa';

// Relative base so the build works on GitHub Pages (https://<user>.github.io/<repo>/) or any sub path.
export default defineConfig({
  base: './',
  plugins: [
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      injectRegister: false, // registered in src/pwa.ts (with update checks for iOS home-screen apps)
      includeAssets: ['icons/*.png', 'icons/*.svg'],
      manifest: {
        name: 'List Builder',
        short_name: 'List Builder',
        description: 'Tabletop army list builder (Warhammer 40,000)',
        theme_color: '#0e1013',
        background_color: '#0e1013',
        display: 'standalone',
        orientation: 'portrait',
        start_url: './',
        scope: './',
        icons: [
          { src: 'icons/icon-192.png', sizes: '192x192', type: 'image/png' },
          { src: 'icons/icon-512.png', sizes: '512x512', type: 'image/png' },
          { src: 'icons/icon-maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
        ],
      },
      workbox: {
        // app shell is precached; faction data is cached the first time a faction is opened
        globPatterns: ['**/*.{js,css,html,svg,png,woff2}', 'data/index.json'],
        runtimeCaching: [
          {
            urlPattern: ({ url }) => url.pathname.includes('/data/') && url.pathname.endsWith('.json'),
            handler: 'StaleWhileRevalidate',
            options: { cacheName: 'faction-data', expiration: { maxEntries: 200 } },
          },
        ],
        navigateFallback: 'index.html',
        cleanupOutdatedCaches: true,
        clientsClaim: true,
        skipWaiting: true,
      },
    }),
  ],
});
