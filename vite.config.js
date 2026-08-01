import { defineConfig } from 'vite';
import tailwindcss from '@tailwindcss/vite';
import { VitePWA } from 'vite-plugin-pwa';

// Served from https://bewfordq.github.io/ForgeTrackerWeb/, so assets need the
// repository name as their base path.
const BASE = '/ForgeTrackerWeb/';

export default defineConfig({
  base: BASE,
  plugins: [
    tailwindcss(),
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['favicon.svg'],
      manifest: {
        name: 'SkyBlock Forge Tracker',
        short_name: 'Forge Tracker',
        description:
          'Hypixel SkyBlock forge timers with Quick Forge perk levels and ntfy.sh push notifications.',
        theme_color: '#0f172a',
        background_color: '#0f172a',
        display: 'standalone',
        start_url: BASE,
        scope: BASE,
        icons: [
          { src: 'icon-192.png', sizes: '192x192', type: 'image/png' },
          { src: 'icon-512.png', sizes: '512x512', type: 'image/png' },
          { src: 'icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
        ],
      },
      workbox: {
        globPatterns: ['**/*.{js,css,html,svg,png,ico}'],
        // Publishing to ntfy must always hit the network, never a cache.
        navigateFallbackDenylist: [/^\/api/],
      },
    }),
  ],
  build: {
    target: 'es2020',
    sourcemap: true,
  },
  test: {
    environment: 'node',
    include: ['test/**/*.test.js'],
  },
});
