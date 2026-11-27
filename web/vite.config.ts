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
      // Приложение на телефоне ставится с dev-сервера: без манифеста ярлык получает стандартную иконку
      devOptions: { enabled: true },
      // Ссылки на иконки — в index.html: в dev-режиме с devOptions плагин их не вставляет
      pwaAssets: { image: 'public/icon.svg', includeHtmlHeadLinks: false, injectThemeColor: false },
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
