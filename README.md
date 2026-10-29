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

## Multi-supermarket portal (`/admin`)

HelaMart is a platform for **verified Sri Lankan supermarkets**. Three levels:

| Level | Who | Can do |
|---|---|---|
| **Platform** | Super Admin (+ HelaMart head-office team) | Review applications, approve / reject, **restrict / ban / reinstate** supermarkets, manage every chain's admins, see all customers island-wide, platform security & commission |
| **Chain** | Chain Admin (the supermarket's owner/head) | Open branches and appoint branch heads, add officers with custom roles and permissions, products & prices, branch stock, orders, promotions, tasks, chain customers across Sri Lanka, settings |
| **Branch** | Branch Manager (branch head) + officers | Their branch's orders, stock, team, tasks — nothing from other branches or other chains |

Restricted supermarkets can sign in read-only and disappear from the storefront; banned ones are
signed out and blocked. Shoppers pick a verified supermarket + branch, and their orders go to that
branch's admin. New supermarkets apply at **`/partner`** (status check with reference + email).

| Test account | Email | Password |
|---|---|---|
| **Super Admin** | `superadmin@helamart.test` | `Super@HelaMart2026` |
| Platform Support | `support@helamart.test` | `Staff@HelaMart2026` |
| Chain Admin — Lanka Fresh Mart | `admin@lankafresh.test` | `Admin@HelaMart2026` |
| Branch Manager — Divulapitiya | `divulapitiya@lankafresh.test` | `Staff@HelaMart2026` |
| Cashier / Stock Officer — Divulapitiya | `cashier.div@` · `stock.div@lankafresh.test` | `Staff@HelaMart2026` |
| Chain Admin — Ceylon Daily Super | `admin@ceylondaily.test` | `Admin@HelaMart2026` |
| Chain Admin — Ruhuna Mega Mart (restricted) | `admin@ruhunamega.test` | `Admin@HelaMart2026` |
| Chain Admin — QuickBuy (banned → blocked) | `admin@quickbuy.test` | `Admin@HelaMart2026` |

Every sign-in needs a 6-digit two-factor code; in prototype mode it is shown on the sign-in screen
(`NUXT_PUBLIC_ADMIN_DEMO_MODE=false` hides it). All supermarkets and people are fictional sample data.

**Security model:** tenant isolation enforced in every API call (other chains' records behave as
"not found"), branch scoping for branch staff, separate platform vs. supermarket permission sets,
seniority levels (you can only manage people/roles below you and only grant permissions you hold),
password step-up for sensitive actions, 10-minute rotating sessions with inactivity sign-out,
lockouts, forced password change for temporary passwords, full audit trail per supermarket and
platform-wide, security headers / no-index / no-store on `/admin`, strict CSP in production.

### Finding supermarkets by area

Shoppers see the HelaMart-verified supermarkets **near their area**, nearest first, with distances
and whether the branch delivers to them (each branch's delivery radius).

- **Guests:** *Find supermarkets near you* (store picker, account panel, or the 📍 chip inside the
  store) opens a **3D map of Sri Lanka**. Every branch is a pin in its supermarket's colour. Search
  a town, use the current location, or tap the island. Pick 5 / 10 / 25 / 50 km and the matching
  supermarkets light up and are listed. The area is remembered in this browser.
- **Signed-in customers:** the area is saved **on the account** (`PUT /me/location`) and follows
  them to any device. New accounts give their town at sign-up. At first sign-in, the area already
  chosen (or the town of the chosen branch) is saved automatically. Change it any time.
- Changing the area switches to the nearest supermarket in it if the current one is outside.
- Branches are pinned from their town when a chain admin saves them (offline Sri Lanka gazetteer in
  `app/data/places.ts`). The sample data has 11 verified chains across the island.

### Supermarket branding (approved by HelaMart)

HelaMart's own look (app, logo, colours, storefront) never changes. Each supermarket can theme
**its space inside the store**: rack bases and top bands, checkout counters and the board above them,
wall trims and bakery awning, plus a welcome banner inside the entrance.

1. A chain admin opens **Store branding** (`/admin/branding`), edits a draft with a live preview,
   and clicks **Submit for approval** (password confirmation). Shoppers keep seeing the live
   version meanwhile.
2. HelaMart staff open **Branding approvals** (`/admin/branding-approvals`), compare *Live now* vs
   *Requested*, and **Approve & publish** or **Reject** with a reason the supermarket sees.
3. Once approved, it shows inside the 3D store, on the store picker and in the "Shopping at" chip.

| | Standard plan | Premium plan |
|---|---|---|
| Logo, 1 main banner, main theme colour, slogan | ✓ | ✓ |
| Accent colour, up to 3 promotional wall banners, welcome message, logo on every aisle end-cap | — | ✓ |

Plan limits are enforced by the API, not just the form. If a supermarket is moved to Standard,
its premium items stop showing automatically. Sample data includes Lanka Fresh Mart (Premium,
branded) and a pending request from Ceylon Daily Super (Standard). Older browser data: use
*Platform settings → reset sample data* as Super Admin to load them.

### Product photos on the shelves

The 3D shelves show each product as a picture (faced up in rows, with a yellow price tag on the
shelf edge), using the chosen supermarket's own catalogue, prices and branch stock. Out-of-stock
items leave the shelf.

- **Real photos:** in *Products & stock → Edit/Add product → Product photo*, a chain admin (or anyone
  with `products.manage`) uploads a JPG/PNG/WebP front-of-pack photo (≥ 200 px, ≤ 8 MB). It is
  checked by file signature, has its plain studio background removed (optional), is cropped and
  resized, and is stored for that supermarket only. It then appears on the shelves, in the catalogue,
  in the cart and in the product sheet.
- **No photo yet:** generated packaging artwork is shown instead, and the admin table flags the
  product with **No photo**. The sample products ship without photos, because real brand packshots
  are copyrighted. Photos must come from each supermarket.
- In this prototype, photos are kept in the browser's IndexedDB (`helamart-media`). A real backend
  would store them in object storage / a CDN.

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
