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

  runtimeConfig: {
    public: {
      // HelaMart API (H:\HelaMart_API). Set via env: NUXT_PUBLIC_API_BASE=https://api.example.lk/api
      apiBase: 'http://localhost:5206/api',
      // Google OAuth Web client ID. Empty → simulated Google sign-in for testing.
      // Set via env: NUXT_PUBLIC_GOOGLE_CLIENT_ID=xxxx.apps.googleusercontent.com
      googleClientId: '',
      // Prototype helper that shows the 2FA code on the admin sign-in screen.
      // MUST be false in production: NUXT_PUBLIC_ADMIN_DEMO_MODE=false
      adminDemoMode: true,
    },
  },

  routeRules: {
    // Baseline security headers for every page.
    '/**': {
      headers: {
        'X-Content-Type-Options': 'nosniff',
        'X-Frame-Options': 'DENY',
        'Referrer-Policy': 'strict-origin-when-cross-origin',
        'Permissions-Policy': 'camera=(), microphone=(), geolocation=(), payment=()',
        'Cross-Origin-Opener-Policy': 'same-origin-allow-popups',
      },
    },
    // Back office: client-rendered only, never cached or indexed.
    '/admin/**': {
      ssr: false,
      headers: {
        'Cache-Control': 'no-store',
        'X-Robots-Tag': 'noindex, nofollow',
        'X-Frame-Options': 'DENY',
        'X-Content-Type-Options': 'nosniff',
        'Referrer-Policy': 'no-referrer',
      },
    },
    '/admin': { ssr: false, headers: { 'Cache-Control': 'no-store', 'X-Robots-Tag': 'noindex, nofollow' } },
  },

  // A strict Content-Security-Policy in production builds (dev needs inline/eval for HMR).
  $production: {
    routeRules: {
      '/admin/**': {
        headers: {
          'Content-Security-Policy':
            "default-src 'self'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; font-src 'self' https://fonts.gstatic.com; img-src 'self' data: blob:; connect-src 'self'; frame-ancestors 'none'; base-uri 'self'; form-action 'self'; object-src 'none'",
          'Strict-Transport-Security': 'max-age=63072000; includeSubDomains',
        },
      },
    },
  },

  typescript: { strict: true },
})
