import tailwindcss from '@tailwindcss/vite'
import basicSsl from '@vitejs/plugin-basic-ssl'
import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'
import { VitePWA } from 'vite-plugin-pwa'

export default defineConfig({
  plugins: [
    react(),
    tailwindcss(),
    // HTTPS для dev-сервера: телефон открывает его по адресу в локальной сети
    basicSsl(),
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
