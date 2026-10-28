# HelaMart — 3D Virtual Supermarket (Frontend, Phase 1)

*Everything for Every Home.*

An immersive 3D supermarket built with **Nuxt 4 + Vue 3, Tailwind CSS 4 and Three.js**.
Shoppers choose an avatar, take a cart, walk through sensor doors and browse aisles of
procedurally stocked shelves. All products and prices are **fictional sample data**.

## Run it

Requires **Node.js 22.12+** (Node 22.22+ / 24 LTS recommended).

```bash
npm install
npm run dev          # http://localhost:3000
```

Other scripts: `npm run build` · `npm run preview` · `npm run typecheck`

## Pages

| Route     | Purpose |
|-----------|---------|
| `/`       | Entrance → avatar selection → entrance animation → navigable 3D store |
| `/browse` | Accessible, non-3D catalogue of every aisle (also the WebGL fallback) |
| `/cart`   | Cart review with totals; checkout is a placeholder for Phase 2 |

## Accounts, offers & checkout (test data)

Browsing and collecting items work as a guest; **paying requires login**. Pushing the cart into
the checkout area (or pressing *Checkout*) opens the billing flow, asking you to log in first.

| Test login | Password | Offers |
|---|---|---|
| `nimal@helamart.test` | `Password@123` | 10% off Beverages (max Rs. 1,000) · Rs. 500 off over Rs. 5,000 · one expired offer |
| `kavindi@helamart.test` | `Password@123` | Free delivery over Rs. 3,000 · Buy 2 get 1 free on Snacks · 15% off produce |
| `amal@helamart.test` | `Password@123` | none |
| Google: Shanika Fernando | — | Rs. 300 off over Rs. 2,000 · 20% off Ceylon tea |
| Google: Ruwan Jayawardena / any other email | — | none |

**Registering:** the login dialog has a *Create account* tab (name, email, optional Sri Lankan
mobile, password with strength rules, terms). New accounts — and first-time Google sign-ins with
any email — are stored in this browser's mock database and get a *Rs. 250 off over Rs. 1,500*
welcome offer. Registering an email that already exists (or belongs to a Google account) is
refused with a pointer to the right sign-in method.

Test cards: `4242 4242 4242 4242` succeeds · `4000 0000 0000 0002` is declined (any future expiry/CVC).

**Session handling:** 15-minute JWT access token + rotating refresh token (30 days with *Keep me
signed in*, otherwise a browser-session cookie capped at 12 hours). Tokens refresh silently before
expiry, rotation is serialised across tabs, reused refresh tokens revoke the session, five failed
logins lock the account for a minute, and an ended session signs the user out.

**Google sign-in:** without configuration a simulated account chooser is used. To use the real
Google button set `NUXT_PUBLIC_GOOGLE_CLIENT_ID=<id>.apps.googleusercontent.com`; the ID token is
then sent to `authService.loginWithGoogle`, which the backend must verify with Google.

**Replacing the mock backend:** `app/services/*Service.ts` are the only files that change — each
function maps to one endpoint (`/auth/login`, `/auth/google`, `/auth/refresh`, `/auth/logout`,
`/auth/me`, `/me/offers`, `/orders`). With a real backend, the refresh token should live in an
HttpOnly cookie set by the server, and prices/offers must be re-validated server-side (the mock
already re-prices orders with `priceCart`).

## Admin panel (`/admin`)

Back office with its own sign-in (password → 6-digit two-factor code → forced password change for
new/reset accounts). Sample data is seeded in this browser and can be reset from Settings.

| Account | Email | Password |
|---|---|---|
| **Super Admin** | `superadmin@helamart.test` | `Super@HelaMart2026` |
| Admin | `admin@helamart.test` | `Admin@HelaMart2026` |
| Store Manager / Inventory Clerk / Support | `manager@` · `stock@` · `support@helamart.test` | `Staff@HelaMart2026` |

In prototype mode the 2FA screen shows the current code (stands in for an authenticator app);
set `NUXT_PUBLIC_ADMIN_DEMO_MODE=false` to hide it.

Modules: Dashboard · Orders (incl. live storefront orders) · Products & stock · Categories ·
Customers · Promotions · Tasks · Staff · Roles & permissions · Audit log · Settings · My account.

Security model: 20 granular permissions grouped into roles; Super Admin (everything) and Admin
(everything except security/store settings) are built in; custom roles get a seniority level —
staff can only manage people/roles below them and can never grant permissions they don't hold;
at least one Super Admin must remain. Every page is guarded by route middleware and every API call
re-checks the session and permission. Sensitive actions (staff, roles, refunds, blocking customers,
settings) require the password again (valid 5 min). Sessions: 10-minute access tokens, rotating
refresh tokens with reuse detection, inactivity sign-out with a warning, absolute session limit,
browser-session-only cookie scoped to `/admin`, cross-tab sign-out. Lockout after repeated failed
sign-ins, a full audit log (exportable to CSV), and `noindex` / `no-store` / anti-framing headers
(+ a strict CSP in production builds).

## Controls

Desktop: **WASD / arrows** walk · **Q/E, ←/→** turn · **Shift** faster · **drag** to look ·
**L** mouse-look (Esc releases) · **V** first/third person · **click** a product.
Mobile: on-screen joystick · drag to look · tap a product. The minimap and the
"Browse" drawer jump straight to any section.

## Structure

```
app/
  pages/                 index (3D experience), browse, cart
  components/
    3d/                  SupermarketCanvas.client.vue (lazy-loads the engine), loading + fallback
    entrance/            WelcomePanel, AvatarCard
    store/               StoreHud, StoreMinimap, VirtualJoystick, ProductSheet, SettingsPanel
    cart/                CartDrawer, CartLineItem, CartSummary, QuantityStepper
    catalog/             CatalogBrowser
    ui/                  AppIcon, BrandLogo, ProductThumb, SidePanel, ToastStack, SiteHeader
  composables/           useCart, useAvatar, useStoreExperience (Vue ↔ engine bridge), useStoreUi, useToasts
  data/                  categories, products (mock), storeLayout (single floor plan for 3D + minimap)
  lib/three/             Framework-agnostic engine
    StoreEngine.ts       scene, loop, entrance sequence, movement, camera, picking
    builders/            shell (exterior/interior/signage), fixtures, doors, avatar, cart
    products/            procedural package shapes + instanced shelf filling
    controls/            keyboard / drag / pointer-lock / joystick input
  types/                 shared TypeScript domain types
  plugins/               localStorage persistence (cart, avatar, quality)
```

## Extending

- **Real product images/models:** set `image` / `model` on a product in `data/products.ts`.
  `ProductThumb` already prefers `image`; swap the instanced placeholder geometry in
  `ProductInstancer` for loaded GLTF meshes (put files in `public/models/`).
- **Rigged characters:** replace `Avatar.buildBody()` with a GLTF character; the public
  API (`update`, `wave`, `pushing`) stays the same.
- **Backend:** `useCart` and the `data/` modules are the integration points for catalogue,
  cart and pricing APIs. Prices are integer LKR cents.
