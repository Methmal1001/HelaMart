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
