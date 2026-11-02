<template>
  <div>
    <slot />
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
