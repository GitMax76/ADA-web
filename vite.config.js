import { defineConfig } from 'vite';
import { VitePWA } from 'vite-plugin-pwa';

export default defineConfig({
  base: '/ADA-web/',
  plugins: [VitePWA({
    registerType: 'prompt',
    injectRegister: 'script',
    strategies: 'injectManifest',
    srcDir: 'src',
    filename: 'sw.js',
    scope: '/ADA-web/',
    devOptions: { enabled: false },
    includeAssets: ['ada-icon.png', 'icons/*.png'],
    manifest: {
      id: '/ADA-web/',
      name: 'A.D.A. Web — Anonimizzatore Documenti Autonomo',
      short_name: 'A.D.A. Web',
      description: 'Anonimizzazione documenti locale nel browser',
      lang: 'it',
      theme_color: '#2D489D',
      background_color: '#eef2f6',
      display: 'standalone',
      start_url: '/ADA-web/',
      scope: '/ADA-web/',
      icons: [
        { src: 'icons/icon-192.png', sizes: '192x192', type: 'image/png', purpose: 'any' },
        { src: 'icons/icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'any' },
        { src: 'icons/maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
      ],
    },
    injectManifest: {
      globPatterns: ['**/*.{js,mjs,css,html,png,svg,woff2,webmanifest}'],
      maximumFileSizeToCacheInBytes: 8 * 1024 * 1024,
    },
  })],
});
