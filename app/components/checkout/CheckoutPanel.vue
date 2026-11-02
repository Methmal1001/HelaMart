<script setup lang="ts">
import type { CardDetails, DeliveryDetails, FulfilmentMethod, Order, PaymentMethod } from '~/types'
import { getProduct } from '~/data/products'
import { placeOrder } from '~/services/orderService'
import { ApiError, isUnauthorized } from '~/services/apiError'

type Step = 'review' | 'delivery' | 'payment' | 'done'

const { panel, closePanel } = useStoreUi()
const { user, authorized, isAuthenticated } = useAuth()
const { lines, clear } = useCart()
const { requestLogin } = useAuthDialog()
const { show } = useToasts()
const { choice: storeChoice, currentStore, refresh: refreshStores } = useStoreSelection()
const { load: loadOffers } = useOffers()
const { load: loadOrders, openOrders } = useMyOrders()
const { area } = useShoppingArea()
/** Home delivery only goes to the cities / villages in the chosen branch's delivery area. */
const branch = computed(() => currentStore.value?.branches.find((b) => b.id === storeChoice.value?.branchId))
const CITIES = computed(() => [...(branch.value?.coverage.places ?? [])].sort((a, b) => a.localeCompare(b)))
function pickCity() {
  if (CITIES.value.includes(delivery.city)) return
  delivery.city = area.value && CITIES.value.includes(area.value.label) ? area.value.label : (CITIES.value[0] ?? '')
}

const open = computed(() => panel.value === 'checkout')
const step = ref<Step>('review')
const fulfilment = ref<FulfilmentMethod>('delivery')
const bill = useBill(fulfilment)
const placing = ref(false)
const error = ref('')
const order = ref<Order | null>(null)


const slots = computed(() => {
  const day = new Intl.DateTimeFormat('en-LK', { weekday: 'short', day: 'numeric', month: 'short' })
  const today = new Date()
  const tomorrow = new Date(Date.now() + 864e5)
  return fulfilment.value === 'delivery'
    ? [`Today (${day.format(today)}), 4:00–6:00 PM`, `Today (${day.format(today)}), 6:00–8:00 PM`, `Tomorrow (${day.format(tomorrow)}), 9:00–11:00 AM`, `Tomorrow (${day.format(tomorrow)}), 2:00–4:00 PM`]
    : [`Today (${day.format(today)}), after 2 hours`, `Tomorrow (${day.format(tomorrow)}), 9:00 AM–9:00 PM`]
})

const delivery = reactive<DeliveryDetails>({ method: 'delivery', fullName: '', phone: '', address: '', city: '', slot: '', notes: '' })
watch(CITIES, pickCity)
const paymentMethod = ref<PaymentMethod>('cod')
const card = reactive<CardDetails>({ name: '', number: '', expiry: '', cvc: '' })
const errors = reactive<Record<string, string>>({})

watch(open, (v) => {
  if (!v) {
    // Reset after a completed order so the next checkout starts fresh.
    if (step.value === 'done') {
      step.value = 'review'
      order.value = null
    }
    return
  }
  error.value = ''
  refreshStores()
  if (!delivery.fullName) delivery.fullName = user.value?.name ?? ''
  if (!delivery.phone) delivery.phone = user.value?.phone ?? ''
  pickCity()
})
watch(fulfilment, (m) => {
  delivery.method = m
  delivery.slot = ''
})
// Signed out mid-checkout (e.g. session expired): close the flow.
watch(isAuthenticated, (v) => !v && open.value && step.value !== 'done' && closePanel())

const steps: { id: Step; label: string }[] = [
  { id: 'review', label: 'Review' },
  { id: 'delivery', label: 'Delivery' },
  { id: 'payment', label: 'Payment' },
]
const stepIndex = computed(() => steps.findIndex((s) => s.id === step.value))

function validateDelivery() {
  Object.keys(errors).forEach((k) => delete errors[k])
  if (delivery.fullName.trim().length < 3) errors.fullName = 'Enter your full name.'
  if (!/^(\+94|0)?7\d{8}$/.test(delivery.phone.replace(/[\s-]/g, ''))) errors.phone = 'Enter a Sri Lankan mobile number, e.g. 077 123 4567.'
  if (fulfilment.value === 'delivery') {
    if (delivery.address.trim().length < 5) errors.address = 'Enter your delivery address.'
    if (!delivery.city || !CITIES.value.includes(delivery.city)) errors.city = `${storeChoice.value?.branchName ?? 'This branch'} doesn’t deliver there. Choose a city in its delivery area, or store pickup.`
  }
  if (!delivery.slot) errors.slot = 'Choose a time slot.'
  return !Object.keys(errors).length
}

function validateCard() {
  Object.keys(errors).forEach((k) => delete errors[k])
  if (paymentMethod.value !== 'card') return true
  const num = card.number.replace(/\s+/g, '')
  if (card.name.trim().length < 3) errors.cardName = 'Enter the name on the card.'
  if (!/^\d{13,19}$/.test(num)) errors.cardNumber = 'Enter a valid card number.'
  const m = /^(\d{2})\s*\/\s*(\d{2})$/.exec(card.expiry)
  if (!m || Number(m[1]) < 1 || Number(m[1]) > 12) errors.cardExpiry = 'Use MM/YY.'
  else {
    const end = new Date(2000 + Number(m[2]), Number(m[1]), 1)
    if (end.getTime() <= Date.now()) errors.cardExpiry = 'This card has expired.'
  }
  if (!/^\d{3,4}$/.test(card.cvc)) errors.cardCvc = '3 or 4 digits.'
  return !Object.keys(errors).length
}

function formatCardNumber() {
  card.number = card.number.replace(/\D/g, '').slice(0, 19).replace(/(\d{4})(?=\d)/g, '$1 ')
}

function next() {
  error.value = ''
  if (step.value === 'review') step.value = 'delivery'
  else if (step.value === 'delivery' && validateDelivery()) step.value = 'payment'
}

function back() {
  error.value = ''
  if (step.value === 'payment') step.value = 'delivery'
  else if (step.value === 'delivery') step.value = 'review'
}

async function pay() {
  if (!validateCard() || placing.value) return
  error.value = ''
  placing.value = true
  if (!storeChoice.value) {
    placing.value = false
    error.value = 'Choose the supermarket and branch you’re ordering from first.'
    return
  }
  const request = {
    storeId: storeChoice.value.storeId,
    branchId: storeChoice.value.branchId,
    lines: lines.value.map((l) => ({ ...l })),
    delivery: { ...delivery, method: fulfilment.value },
    payment: { method: paymentMethod.value, card: paymentMethod.value === 'card' ? { ...card } : undefined },
  }
  try {
    order.value = await authorized((token) => placeOrder(token, request, user.value!))
    clear()
    step.value = 'done'
    show(`Order ${order.value.number} confirmed. Thank you!`, 'success', 4000)
    // Stock and once-per-customer offers have changed.
    void refreshStores()
    void loadOffers()
    void loadOrders()
  } catch (e) {
    if (isUnauthorized(e)) {
      error.value = 'Your session expired. Please log in again to finish paying.'
      if (await requestLogin('Your session expired — log in again to complete payment.')) error.value = ''
    } else {
      error.value = e instanceof ApiError ? e.message : 'Payment could not be completed. Please try again.'
    }
  } finally {
    placing.value = false
  }
}

function printBill() {
  window.print()
}

const inputCls = 'h-11 w-full rounded-xl border-0 bg-white px-3.5 text-sm text-ink ring-1 ring-line focus:ring-2 focus:ring-hela-green focus:outline-none'
</script>

<template>
  <SidePanel :open="open" :title="step === 'done' ? 'Order confirmed' : 'Checkout'" width="sm:max-w-lg" @close="closePanel">
    <template #subtitle>
      <ol v-if="step !== 'done'" class="mt-1.5 flex items-center gap-1.5 text-xs" aria-label="Checkout steps">
        <li v-for="(s, i) in steps" :key="s.id" class="flex items-center gap-1.5">
          <span
            class="grid size-5 place-items-center rounded-full text-[0.65rem] font-bold"
            :class="i < stepIndex ? 'bg-hela-green text-hela-gold' : i === stepIndex ? 'bg-hela-green text-white' : 'bg-line text-muted'"
          >
            <AppIcon v-if="i < stepIndex" name="check" :size="11" :stroke-width="3" />
            <template v-else>{{ i + 1 }}</template>
          </span>
          <span :class="i === stepIndex ? 'font-bold text-ink' : 'text-muted'" :aria-current="i === stepIndex ? 'step' : undefined">{{ s.label }}</span>
          <span v-if="i < steps.length - 1" class="mx-0.5 h-px w-4 bg-line" aria-hidden="true" />
        </li>
      </ol>
    </template>

    <div class="px-5 py-5">
      <!-- 1. Review -->
      <section v-if="step === 'review'" aria-label="Review items">
        <div class="mb-3"><StorePicker compact /></div>
        <p v-if="user" class="mb-4 flex items-center gap-2 text-sm text-muted">
          <UserAvatar :name="user.name" :color="user.avatarColor" :picture="user.pictureUrl" :size="26" />
          Billing to <b class="text-ink">{{ user.name }}</b>
        </p>
        <ul class="divide-y divide-line rounded-2xl bg-white px-4 ring-1 ring-line">
          <li v-for="l in bill.lines" :key="l.productId" class="flex items-center gap-3 py-3">
            <ProductThumb :product="getProduct(l.productId)!" class="size-12 shrink-0" />
            <div class="min-w-0 flex-1">
              <p class="truncate text-sm font-semibold text-ink">{{ getProduct(l.productId)?.name }}</p>
              <p class="text-xs text-muted">{{ l.quantity }} × {{ formatLKR(l.unitPriceCents) }}</p>
              <p v-if="l.discountCents" class="text-xs font-semibold text-hela-green">Offer − {{ formatLKR(l.discountCents) }}</p>
            </div>
            <div class="text-right text-sm tabular-nums">
              <s v-if="l.discountCents" class="block text-xs text-muted">{{ formatLKR(l.lineTotalCents) }}</s>
              <span class="font-bold text-ink">{{ formatLKR(l.finalCents) }}</span>
            </div>
          </li>
        </ul>
        <div class="mt-4 rounded-2xl bg-white p-4 ring-1 ring-line">
          <CartSummary :bill="bill" />
        </div>
      </section>

      <!-- 2. Delivery -->
      <section v-else-if="step === 'delivery'" class="space-y-4" aria-label="Delivery details">
        <div class="grid grid-cols-2 gap-2" role="radiogroup" aria-label="How do you want your order?">
          <button
            v-for="m in (['delivery', 'pickup'] as const)"
            :key="m"
            type="button"
            role="radio"
            :aria-checked="fulfilment === m"
            class="flex items-center gap-2.5 rounded-xl bg-white p-3 text-left text-sm ring-1 transition"
            :class="fulfilment === m ? 'ring-2 ring-hela-green' : 'ring-line hover:bg-hela-green-50'"
            @click="fulfilment = m"
          >
            <AppIcon :name="m === 'delivery' ? 'truck' : 'store'" :size="20" class="text-hela-green" />
            <span>
              <span class="block font-semibold text-ink">{{ m === 'delivery' ? 'Home delivery' : 'Store pickup' }}</span>
              <span class="block text-xs text-muted">{{ m === 'delivery' ? 'To your door' : 'No delivery fee' }}</span>
            </span>
          </button>
        </div>

        <label class="block">
          <span class="mb-1.5 block text-sm font-semibold text-ink">Full name</span>
          <input v-model="delivery.fullName" :class="inputCls" autocomplete="name" data-autofocus :aria-invalid="!!errors.fullName">
          <span v-if="errors.fullName" class="mt-1 block text-xs text-[#8A2E2E]">{{ errors.fullName }}</span>
        </label>
        <label class="block">
          <span class="mb-1.5 block text-sm font-semibold text-ink">Mobile number</span>
          <input v-model="delivery.phone" :class="inputCls" type="tel" autocomplete="tel" placeholder="077 123 4567" :aria-invalid="!!errors.phone">
          <span v-if="errors.phone" class="mt-1 block text-xs text-[#8A2E2E]">{{ errors.phone }}</span>
        </label>
        <template v-if="fulfilment === 'delivery'">
          <label class="block">
            <span class="mb-1.5 block text-sm font-semibold text-ink">Delivery address</span>
            <input v-model="delivery.address" :class="inputCls" autocomplete="street-address" placeholder="No. 12, Galle Road" :aria-invalid="!!errors.address">
            <span v-if="errors.address" class="mt-1 block text-xs text-[#8A2E2E]">{{ errors.address }}</span>
          </label>
          <label class="block">
            <span class="mb-1.5 block text-sm font-semibold text-ink">City / village</span>
            <select v-model="delivery.city" :class="inputCls" :aria-invalid="!!errors.city" data-testid="delivery-city">
              <option v-for="c in CITIES" :key="c" :value="c">{{ c }}</option>
            </select>
            <span v-if="errors.city" class="mt-1 block text-xs text-[#8A2E2E]">{{ errors.city }}</span>
            <span v-else class="mt-1 block text-xs text-muted">{{ storeChoice?.branchName }} delivers to {{ CITIES.length }} {{ CITIES.length === 1 ? 'place' : 'places' }}. Not listed? Choose store pickup or another supermarket.</span>
          </label>
        </template>
        <fieldset>
          <legend class="mb-1.5 text-sm font-semibold text-ink">{{ fulfilment === 'delivery' ? 'Delivery slot' : 'Pickup time' }}</legend>
          <div class="grid gap-2">
            <label
              v-for="s in slots"
              :key="s"
              class="flex cursor-pointer items-center gap-2.5 rounded-xl bg-white px-3.5 py-2.5 text-sm ring-1 transition"
              :class="delivery.slot === s ? 'ring-2 ring-hela-green' : 'ring-line hover:bg-hela-green-50'"
            >
              <input v-model="delivery.slot" type="radio" name="slot" :value="s" class="accent-hela-green">
              {{ s }}
            </label>
          </div>
          <span v-if="errors.slot" class="mt-1 block text-xs text-[#8A2E2E]">{{ errors.slot }}</span>
        </fieldset>
        <label class="block">
          <span class="mb-1.5 block text-sm font-semibold text-ink">Notes <span class="font-normal text-muted">(optional)</span></span>
          <input v-model="delivery.notes" :class="inputCls" placeholder="e.g. Call when you arrive">
        </label>
      </section>

      <!-- 3. Payment -->
      <section v-else-if="step === 'payment'" class="space-y-4" aria-label="Payment">
        <div class="grid grid-cols-2 gap-2" role="radiogroup" aria-label="Payment method">
          <button
            v-for="m in (['cod', 'card'] as const)"
            :key="m"
            type="button"
            role="radio"
            :aria-checked="paymentMethod === m"
            class="flex items-center gap-2.5 rounded-xl bg-white p-3 text-left text-sm ring-1 transition"
            :class="paymentMethod === m ? 'ring-2 ring-hela-green' : 'ring-line hover:bg-hela-green-50'"
            @click="paymentMethod = m"
          >
            <AppIcon :name="m === 'cod' ? 'cash' : 'card'" :size="20" class="text-hela-green" />
            <span>
              <span class="block font-semibold text-ink">{{ m === 'cod' ? (fulfilment === 'delivery' ? 'Cash on delivery' : 'Pay at pickup') : 'Credit / debit card' }}</span>
              <span class="block text-xs text-muted">{{ m === 'cod' ? 'Pay when you receive' : 'Visa · Mastercard · Amex' }}</span>
            </span>
          </button>
        </div>

        <div v-if="paymentMethod === 'card'" class="space-y-3 rounded-2xl bg-white p-4 ring-1 ring-line">
          <label class="block">
            <span class="mb-1.5 block text-xs font-semibold text-ink">Name on card</span>
            <input v-model="card.name" :class="inputCls" autocomplete="cc-name" data-autofocus>
            <span v-if="errors.cardName" class="mt-1 block text-xs text-[#8A2E2E]">{{ errors.cardName }}</span>
          </label>
          <label class="block">
            <span class="mb-1.5 block text-xs font-semibold text-ink">Card number</span>
            <input v-model="card.number" :class="inputCls" inputmode="numeric" autocomplete="cc-number" placeholder="4242 4242 4242 4242" @input="formatCardNumber">
            <span v-if="errors.cardNumber" class="mt-1 block text-xs text-[#8A2E2E]">{{ errors.cardNumber }}</span>
          </label>
          <div class="grid grid-cols-2 gap-3">
            <label class="block">
              <span class="mb-1.5 block text-xs font-semibold text-ink">Expiry</span>
              <input v-model="card.expiry" :class="inputCls" inputmode="numeric" autocomplete="cc-exp" placeholder="MM/YY" maxlength="5">
              <span v-if="errors.cardExpiry" class="mt-1 block text-xs text-[#8A2E2E]">{{ errors.cardExpiry }}</span>
            </label>
            <label class="block">
              <span class="mb-1.5 block text-xs font-semibold text-ink">CVC</span>
              <input v-model="card.cvc" :class="inputCls" inputmode="numeric" autocomplete="cc-csc" maxlength="4">
              <span v-if="errors.cardCvc" class="mt-1 block text-xs text-[#8A2E2E]">{{ errors.cardCvc }}</span>
            </label>
          </div>
          <p class="text-xs text-muted">Test cards: <b>4242 4242 4242 4242</b> succeeds · <b>4000 0000 0000 0002</b> is declined. Any future expiry and CVC.</p>
        </div>

        <div class="rounded-2xl bg-white p-4 ring-1 ring-line">
          <CartSummary :bill="bill" :show-hints="false" />
        </div>
      </section>

      <!-- 4. Done -->
      <section v-else-if="order" aria-label="Order confirmation">
        <div class="mb-4 flex items-center gap-3 rounded-2xl bg-hela-green p-4 text-white">
          <span class="grid size-10 place-items-center rounded-full bg-hela-gold text-hela-green-900"><AppIcon name="check" :size="22" :stroke-width="3" /></span>
          <div>
            <p class="font-extrabold">Thank you, {{ order.customerName.split(' ')[0] }}!</p>
            <p class="text-xs text-white/80">Order {{ order.number }} has been placed.</p>
          </div>
        </div>
        <p class="mb-3 flex items-start gap-2 rounded-xl bg-hela-gold-100/60 px-3 py-2.5 text-xs text-[#6d5622]" data-testid="bill-saved-note">
          <AppIcon name="receipt" :size="15" class="mt-px shrink-0" />
          <span>This bill is saved to your account. Reopen or print it — and track your {{ order.delivery.method === 'delivery' ? 'delivery' : 'pickup' }} — any time from
            <button type="button" class="font-bold text-hela-green underline" data-testid="open-my-orders" @click="openOrders(order.id)">Your orders</button>.</span>
        </p>
        <OrderReceipt :order="order" />
      </section>

      <p v-if="error" class="mt-4 flex items-start gap-2 rounded-xl bg-[#fbeaea] px-3.5 py-2.5 text-sm text-[#8A2E2E]" role="alert">
        <AppIcon name="alert" :size="16" class="mt-0.5 shrink-0" />
        {{ error }}
      </p>
    </div>

    <template #footer>
      <div v-if="step === 'done'" class="grid grid-cols-2 gap-2">
        <button type="button" class="btn-ghost" @click="printBill">
          <AppIcon name="printer" :size="17" />
          Print bill
        </button>
        <button type="button" class="btn-primary" @click="closePanel">Continue shopping</button>
      </div>
      <div v-else class="flex items-center gap-3">
        <button v-if="step !== 'review'" type="button" class="btn-ghost h-12" @click="back">
          <AppIcon name="arrow-left" :size="16" />
          Back
        </button>
        <div class="min-w-0 flex-1 text-right">
          <p class="text-xs text-muted">Total</p>
          <p class="text-lg font-extrabold tabular-nums text-hela-green">{{ formatLKR(bill.totalCents) }}</p>
        </div>
        <button v-if="step !== 'payment'" type="button" class="btn-primary h-12 px-5" :disabled="!bill.itemCount" @click="next">
          Continue
          <AppIcon name="arrow-right" :size="16" />
        </button>
        <button v-else type="button" class="btn-primary h-12 px-5" :disabled="placing || !bill.itemCount" @click="pay">
          <span v-if="placing" class="size-4 animate-spin rounded-full border-2 border-white/40 border-t-white" aria-hidden="true" />
          <AppIcon v-else name="lock" :size="16" />
          {{ placing ? 'Processing…' : paymentMethod === 'card' ? `Pay ${formatLKR(bill.totalCents)}` : 'Place order' }}
        </button>
      </div>
    </template>
  </SidePanel>
</template>
