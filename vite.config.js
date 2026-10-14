import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import { VitePWA } from 'vite-plugin-pwa';
import path from 'node:path';

// Modo demonstração (npm run dev:demo): troca login e Firestore por dados fictícios em memória (src/demo),
// para testar as telas sem login e sem tocar na produção. Não afeta o build normal.
const pastaDemo = path.resolve(import.meta.dirname, 'src/demo').replace(/\\/g, '/');
const aliasDemo = [
  { find: /^(?:\.{1,2}\/)+firebase(?:\.js)?$/, replacement: `${pastaDemo}/firebase.js` },
  { find: /^(?:\.{1,2}\/)+hooks\/(useAuth|useTransactions|useCards|useWallets|useGoals|useConfig)(?:\.js)?$/, replacement: `${pastaDemo}/$1.js` },
];

export default defineConfig(({ mode }) => ({
  resolve: { alias: mode === 'demo' ? aliasDemo : [] },  plugins: [
    react(),
    tailwindcss(),
    VitePWA({
      // injectManifest: usa firebase-messaging-sw.js como SW único
      // que combina PWA caching (Workbox) + FCM push handling.
      // Elimina o conflito de escopo entre sw.js e firebase-messaging-sw.js.
      strategies: 'injectManifest',
      srcDir: 'public',
      filename: 'firebase-messaging-sw.js',
      registerType: 'prompt',
      injectManifest: {
        globPatterns: ['**/*.{js,css,html,ico,png,svg,webp,woff2}'],
        rollupFormat: 'iife',
      },
      includeAssets: ['favicon.svg', 'icons/icon-192.png', 'icons/icon-512.png'],
      manifest: {
        name: 'Matoba Finanças',
        short_name: 'Finanças',
        description: 'Controle financeiro pessoal',
        start_url: './',
        display: 'standalone',
        background_color: '#0a0f1e',
        theme_color: '#0a0f1e',
        orientation: 'portrait',
        gcm_sender_id: '103953800507',
        icons: [
          { src: './icons/icon-192.png', sizes: '192x192', type: 'image/png', purpose: 'any maskable' },
          { src: './icons/icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'any maskable' }
        ]
      }
    })
  ],
  base: './',
}));
