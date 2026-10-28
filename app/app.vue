<template>
  <div>
    <NuxtRouteAnnouncer />
    <NuxtPage />
    <!-- Shared overlays available on every page (order = stacking order). -->
    <ProductSheet />
    <CartDrawer />
    <CheckoutPanel />
    <AccountPanel />
    <AuthDialog />
    <ToastStack />
  </div>
</template>
