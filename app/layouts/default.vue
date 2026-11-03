<template>
  <div>
    <slot />
    <ApiStatusBanner />
    <!-- Storefront overlays (order = stacking order). -->
    <ProductSheet />
    <CartDrawer />
    <CheckoutPanel />
    <AccountPanel />
    <OrdersPanel />
    <OffersPanel />
    <AuthDialog />
    <AreaFinder />
    <PhoneRequiredDialog />
  </div>
</template>
