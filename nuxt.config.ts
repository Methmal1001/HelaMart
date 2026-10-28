import tailwindcss from '@tailwindcss/vite'

// https://nuxt.com/docs/api/configuration/nuxt-config
export default defineNuxtConfig({
  compatibilityDate: '2026-10-01',
  devtools: { enabled: false },

  css: ['~/assets/css/main.css'],

  // `components/3d/*` would otherwise be prefixed "3d…", which is not a valid component name.
  components: [{ path: '~/components', pathPrefix: false }],

  app: {
    head: {
      htmlAttrs: { lang: 'en' },
      title: 'HelaMart — Everything for Every Home.',
      meta: [
        { name: 'viewport', content: 'width=device-width, initial-scale=1, viewport-fit=cover' },
        { name: 'description', content: 'Step inside HelaMart, an immersive 3D virtual supermarket for Sri Lankan homes.' },
        { name: 'theme-color', content: '#174D38' },
      ],
      link: [
        { rel: 'icon', type: 'image/svg+xml', href: '/favicon.svg' },
        { rel: 'preconnect', href: 'https://fonts.googleapis.com' },
        { rel: 'preconnect', href: 'https://fonts.gstatic.com', crossorigin: '' },
        {
          rel: 'stylesheet',
          href: 'https://fonts.googleapis.com/css2?family=Plus+Jakarta+Sans:wght@400;500;600;700;800&display=swap',
        },
      ],
    },
  },

  vite: {
    plugins: [tailwindcss()],
    optimizeDeps: { include: ['three'] },
    // The Three.js engine is a deliberately separate, lazy-loaded chunk.
    build: { chunkSizeWarningLimit: 900 },
  },

  typescript: { strict: true },
})
