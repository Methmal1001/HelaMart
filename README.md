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

The storefront talks to the **HelaMart API** (`H:\HelaMart_API`, ASP.NET Core + SQL Server database
`helamart`). Start it first with `dotnet run --launch-profile http`. It listens on `http://localhost:5206`
and creates and seeds the database on first run. Point the frontend elsewhere with
`NUXT_PUBLIC_API_BASE=https://…/api`.

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

Offers belong to a supermarket. The personal ones below are at **Lanka Fresh Mart**; its
Divulapitiya branch also runs *10% off produce* for everyone, and Ceylon Daily Super has *5% off staples*.

| Test login | Password | Offers at Lanka Fresh Mart |
|---|---|---|
| `nimal@helamart.test` | `Password@123` | 10% off Beverages (max Rs. 1,000) · Rs. 500 off over Rs. 5,000 · one expired offer |
| `kavindi@helamart.test` | `Password@123` | Free delivery over Rs. 3,000 · Buy 2 get 1 free on Snacks · 15% off produce |
| `amal@helamart.test` | `Password@123` | none |
| Google: Shanika Fernando | — | Rs. 300 off over Rs. 2,000 · 20% off Ceylon tea |
| Google: Ruwan Jayawardena / any other email | — | none |

**Registering:** the login dialog has a *Create account* tab (name, email, optional Sri Lankan
mobile, password with strength rules, terms). New accounts, and first-time Google sign-ins with
any email, are stored in the `helamart` database. A first order at Lanka Fresh Mart gets
*Rs. 250 off over Rs. 1,500*. Registering an email that already exists (or belongs to a Google
account) is refused with a pointer to the right sign-in method.

Test cards: `4242 4242 4242 4242` succeeds · `4000 0000 0000 0002` is declined (any future expiry/CVC).

**Session handling:** 15-minute JWT access token + rotating refresh token (30 days with *Keep me
signed in*, otherwise a browser-session cookie capped at 12 hours). Tokens refresh silently before
expiry, rotation is serialised across tabs, reused refresh tokens revoke the session, five failed
logins lock the account for a minute, and an ended session signs the user out.

**Google sign-in:** without configuration a simulated account chooser is used (accepted only by an
API running in Development). To use the real Google button set
`NUXT_PUBLIC_GOOGLE_CLIENT_ID=<id>.apps.googleusercontent.com` here and the same id as
`Auth:GoogleClientId` on the API, which verifies the ID token with Google.

**Backend:** `app/services/*Service.ts` call the API through `app/services/http.ts`, one function
per endpoint (`/auth/*`, `/me/location`, `/me/offers`, `/stores`, `/stores/:id/catalog`, `/orders`,
`/partners/applications`). The server re-prices every order from its own prices and the shopper's
offers, and takes the items out of the branch's stock. The cart preview still uses `priceCart`
with the same rules. Still to do: move the refresh token into an HttpOnly cookie set by the server.

**Not yet on the API:** the `/admin` portal below still runs on its in-browser mock database
(`app/services/admin/*`). Its tables already exist and are seeded in `helamart`.

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

### Offers, promotions & homepage banners

**Supermarket offers** (*Promotions*, chain admins and branch heads): % off a category or product,
buy X get Y, amount off or % off the basket above a spend, free delivery. Each offer can run at
**all branches or chosen branches**, for all / new / selected customers, with optional
**conditions**: minimum spend, minimum items, days of the week, a daily time window, a start date,
delivery- or pickup-only, and a per-customer limit. A live coupon preview shows what shoppers see.

Shoppers (guests included) see the chosen branch's offers:
- product ribbons ("SAVE 20%", "BUY 2 GET 1") with was/now prices;
- an **Offers** drawer of coupons with progress bars ("Spend Rs. 260 more to unlock …");
- in the 3D store, red "special" shelf tags, promo boards on the end-caps of discounted aisles and
  an "Offers this week" board.

Offers apply automatically in the cart, and the order API re-prices with the same rules (and counts usage).

**Scheduling (offers and banners):** set a **Publish at** date-time (empty means straight away) and an
**Ends at** date-time. Lists show **Live / Scheduled / Paused / Ended** tabs, with **Publish now** and
**End now** buttons. Offers can be **announced as "Coming soon"** up to 14 days before they start
(shown in a separate section; they apply only from the publish time). Shoppers' pages pick up
start and end times automatically, without a reload.

Coupons and the Offers drawer use each supermarket's **logo and theme colour**. In-store signage
(name banner, offer boards, aisle signs) is rendered as true-colour backlit panels.

**HelaMart homepage banners** (*Homepage banners*, head office only): headline, theme or uploaded
image, an optional featured supermarket and offer, a button ("Shop at …" / "See the offer"),
schedule and priority. Targeting: everyone, chosen districts, or **only where the featured
supermarket delivers** (so shoppers only see stores they can order from). They appear as a floating
card on the welcome screen (a slim strip on phones) and a hero carousel on Browse. The admin page
previews them "as a shopper in <town>".

**Super Admin → Manage portal** (*Supermarkets → open one → Manage portal*): HelaMart's Super Admin
works inside any approved supermarket's portal with full chain-admin access (offers, products,
branches, staff, branding). It requires password confirmation, a purple bar shows it's active, and
every action is logged in that supermarket's audit log as "(HelaMart Super Admin)".

### Categories (per supermarket)

Every new supermarket starts with HelaMart's **10 standard categories**. Each standard category owns
one physical area of the 3D store. In *Categories*, a supermarket can:
- rename, recolour, re-icon, describe, show/hide and **reorder** its categories;
- **add its own** (e.g. "Baby Care") and choose which store area shelves them;
- **remove** one, moving its products (and offers on it) to another category, or hiding them;
- **add back** a removed standard category.

The shop follows straight away: the aisle list and filters (in the supermarket's order), product
pages, offers, and in the 3D store the aisle signs, minimap and "You're in…" chip (e.g.
"Aisle 5 · Personal Care · Baby Care"). Removed or hidden categories take their products off the
shelves. A store area with no category shows "Coming soon", and the admin page warns about it.

### Customer mobile numbers

Every signed-in customer must have a **Sri Lankan mobile number** (stored as `+94 7X XXX XXXX`, one
account per number). It's required when registering. Accounts without one (e.g. a first Google
sign-in) are asked for it before continuing (`PUT /me/phone`), and customers can change it in
*Your account*. HelaMart head office (*Customers — all of Sri Lanka*) and each supermarket
(*Customers*) see it in a searchable **Mobile** column.

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

**Delivery areas (strict):** each branch's home-delivery area is set by the supermarket in
*Branches → Delivery area*. The admin draws the area on a map (click to add corners, drag to move,
right-click to delete, or start from a circle) and lists the **cities and villages** inside it
(suggested from the drawn shape; villages can be typed in). Rules enforced by the API: at least 3
corners, no crossing edges, ≤ 2,500 km², branch inside the area, at least one place.

- A branch without a delivery area is **hidden from shoppers**. New branches open the editor straight away.
- A supermarket is "available" to a shopper only if a branch's area contains the shopper's area,
  or lists their town. Others are shown greyed out ("not delivering to …").
- **Before entering the 3D store**, the shopper must have an area and the chosen supermarket must
  deliver there. Otherwise *Enter* is replaced by a prompt to pick one that does.
- At checkout, home delivery is limited to the branch's listed places. The order API rejects
  delivery outside the area (store pickup is still allowed).
- Maps: set `NUXT_PUBLIC_GOOGLE_MAPS_API_KEY` to draw on **Google Maps** (restrict the key to your
  domains). Without a key, the editor uses **OpenStreetMap** (Leaflet) with the same controls.
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
