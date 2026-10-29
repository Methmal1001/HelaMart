<template>
  <div>
    <slot />
    <!-- Storefront overlays (order = stacking order). -->
    <ProductSheet />
    <CartDrawer />
    <CheckoutPanel />
    <AccountPanel />
    <AuthDialog />
    <AreaFinder />
  </div>
</template>
