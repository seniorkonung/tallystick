import tailwindcss from '@tailwindcss/vite'
import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'
import { VitePWA } from 'vite-plugin-pwa'

export default defineConfig({
  plugins: [
    react(),
    tailwindcss(),
    VitePWA({
      registerType: 'autoUpdate',
      pwaAssets: { image: 'public/icon.svg' },
      manifest: {
        name: 'Tallystick',
        short_name: 'Tallystick',
        lang: 'ru',
        theme_color: '#ffffff',
        background_color: '#ffffff',
      },
    }),
  ],
})
