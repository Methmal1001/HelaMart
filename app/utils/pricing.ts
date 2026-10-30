import type { AppliedOffer, CartLine, FulfilmentMethod, ItemTarget, Offer, OfferRule, PriceBreakdown, PricedLine, Product, UnmetOffer } from '~/types'
import { getProduct } from '~/data/products'
import { getCategory } from '~/data/categories'
import { formatLKR } from './currency'

/** Placeholder until delivery zones/pricing come from the backend. */
export const DELIVERY_FEE_CENTS = 35000

export function isOfferActive(offer: Offer, now = Date.now()) {
  return Date.parse(offer.expiresAt) > now && !(offer.conditions?.startsAt && Date.parse(offer.conditions.startsAt) > now)
}

const DAY_NAMES = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']
const hourText = (h: number) => `${h % 12 || 12}${h < 12 || h === 24 ? 'am' : 'pm'}`

/** Days / hours / delivery-or-pickup conditions: is the offer running now for this kind of order? */
export function offerTimingProblem(offer: Offer, now = Date.now(), fulfilment?: FulfilmentMethod): string | null {
  const c = offer.conditions
  if (!c) return null
  const d = new Date(now)
  if (c.days?.length && !c.days.includes(d.getDay())) return `Valid on ${c.days.map((x) => DAY_NAMES[x]).join(', ')}`
  if (c.fromHour !== undefined && c.toHour !== undefined) {
    const h = d.getHours()
    const inside = c.fromHour <= c.toHour ? h >= c.fromHour && h < c.toHour : h >= c.fromHour || h < c.toHour
    if (!inside) return `Valid ${hourText(c.fromHour)}–${hourText(c.toHour)}`
  }
  if (c.fulfilment && fulfilment && c.fulfilment !== fulfilment) return c.fulfilment === 'pickup' ? 'Store pickup orders only' : 'Home delivery orders only'
  return null
}

/** "Beverages items", "Ginger Beer", "eligible items" — for unlock hints. */
function targetPhrase(t: ItemTarget | null) {
  if (!t || t.all) return 'items'
  if (t.categoryIds.length === 1 && !t.productIds.length) return `${getCategory(t.categoryIds[0]!).name} items`
  if (t.productIds.length === 1 && !t.categoryIds.length) return getProduct(t.productIds[0]!)?.name ?? 'the product'
  return 'eligible items'
}

export const ITEM_RULES: OfferRule['kind'][] = ['percent-items', 'amount-items', 'percent-category', 'percent-product', 'bxgy']

/** The items an item offer applies to (older single-category / single-product offers included). Null for basket offers. */
export function ruleTarget(r: OfferRule): ItemTarget | null {
  switch (r.kind) {
    case 'percent-items':
    case 'amount-items':
      return r.target
    case 'percent-category':
      return { categoryIds: [r.categoryId], productIds: [] }
    case 'percent-product':
      return { categoryIds: [], productIds: [r.productId] }
    case 'bxgy':
      return r.target ?? { categoryIds: r.categoryId ? [r.categoryId] : [], productIds: r.productIds ?? [] }
    default:
      return null
  }
}

export function targetMatches(t: ItemTarget, product: Pick<Product, 'id' | 'categoryId'>) {
  return !!t.all || t.productIds.includes(product.id) || t.categoryIds.includes(product.categoryId)
}

function lineMatches(offer: Offer, product: Product) {
  const t = ruleTarget(offer.rule)
  return !!t && targetMatches(t, product)
}

/** Optional cap on an item offer's total discount. */
const itemCap = (r: OfferRule) => (r.kind === 'percent-category' || r.kind === 'percent-items' ? r.maxDiscountCents : undefined)

function lineDiscount(offer: Offer, line: PricedLine): number {
  const r = offer.rule
  if (r.kind === 'percent-category' || r.kind === 'percent-product' || r.kind === 'percent-items') {
    return Math.floor((line.lineTotalCents * r.percent) / 100)
  }
  if (r.kind === 'amount-items') return Math.min(r.amountCents, line.unitPriceCents) * line.quantity
  if (r.kind === 'bxgy') {
    const free = Math.floor(line.quantity / (r.buy + r.get)) * r.get
    return free * line.unitPriceCents
  }
  return 0
}

/**
 * Prices a cart and applies the shopper's promotions.
 *
 * Rules (mirrors what the backend will enforce):
 *  1. Item offers (% off, buy-X-get-Y): each line gets the single best offer — no stacking per item.
 *     Offers with a cap are scaled down proportionally across their lines.
 *  2. Order offers (fixed amount off above a spend): the best one applies to the item total after step 1.
 *  3. Delivery offers waive the delivery fee above a spend.
 *  Expired offers are ignored. All amounts are integer LKR cents.
 */
export function priceCart(
  cart: CartLine[],
  offers: Offer[] = [],
  options: { fulfilment?: FulfilmentMethod; now?: number } = {},
): PriceBreakdown {
  const now = options.now ?? Date.now()
  const live = offers.filter((o) => isOfferActive(o, now))
  const unmet: UnmetOffer[] = []

  // Basket conditions (minimum spend / items) are checked on the undiscounted basket.
  const basket = { value: 0, items: 0 }
  for (const l of cart) {
    const p = getProduct(l.productId)
    if (!p || l.quantity <= 0) continue
    basket.value += p.priceCents * l.quantity
    basket.items += l.quantity
  }
  const active = live.filter((o) => {
    const timing = offerTimingProblem(o, now, options.fulfilment)
    if (timing) {
      if (basket.items) unmet.push({ offer: o, hint: timing })
      return false
    }
    const c = o.conditions
    if (c?.minSpendCents && basket.value < c.minSpendCents) {
      if (basket.items) unmet.push({ offer: o, hint: `Spend ${formatLKR(c.minSpendCents - basket.value)} more to unlock ${o.title}.` })
      return false
    }
    if (c?.minItems && basket.items < c.minItems) {
      const n = c.minItems - basket.items
      if (basket.items) unmet.push({ offer: o, hint: `Add ${n} more item${n === 1 ? '' : 's'} to unlock ${o.title}.` })
      return false
    }
    return true
  })
  const itemOffers = active.filter((o) => ITEM_RULES.includes(o.rule.kind))

  const products = new Map<string, Product>()
  const lines: PricedLine[] = cart.flatMap((l) => {
    const p = getProduct(l.productId)
    if (!p || l.quantity <= 0) return []
    products.set(p.id, p)
    const total = p.priceCents * l.quantity
    return [{ productId: p.id, quantity: l.quantity, unitPriceCents: p.priceCents, lineTotalCents: total, discountCents: 0, finalCents: total }]
  })

  // 1. Best item offer per line.
  for (const line of lines) {
    const product = products.get(line.productId)!
    let best: { offer: Offer; amount: number } | null = null
    for (const offer of itemOffers) {
      if (!lineMatches(offer, product)) continue
      const amount = lineDiscount(offer, line)
      if (amount > 0 && (!best || amount > best.amount)) best = { offer, amount }
    }
    if (best) {
      line.discountCents = best.amount
      line.offerId = best.offer.id
    }
  }
  // Apply per-offer caps.
  for (const offer of itemOffers) {
    const cap = itemCap(offer.rule)
    if (!cap) continue
    const affected = lines.filter((l) => l.offerId === offer.id)
    const sum = affected.reduce((s, l) => s + l.discountCents, 0)
    if (sum <= cap) continue
    let remaining = cap
    affected.forEach((l, i) => {
      const share = i === affected.length - 1 ? remaining : Math.floor((l.discountCents * cap) / sum)
      l.discountCents = share
      remaining -= share
    })
  }
  for (const l of lines) l.finalCents = l.lineTotalCents - l.discountCents

  const applied: AppliedOffer[] = []

  for (const offer of itemOffers) {
    const amount = lines.filter((l) => l.offerId === offer.id).reduce((s, l) => s + l.discountCents, 0)
    if (amount > 0) {
      applied.push({ offer, discountCents: amount, scope: 'items' })
      continue
    }
    const r = offer.rule
    const matching = lines.filter((l) => lineMatches(offer, products.get(l.productId)!))
    if (r.kind === 'bxgy' && matching.length) {
      const l = matching.reduce((a, b) => (b.quantity > a.quantity ? b : a))
      const need = r.buy + r.get - (l.quantity % (r.buy + r.get))
      unmet.push({ offer, hint: `Add ${need} more ${products.get(l.productId)!.name} to get ${r.get} free.` })
    } else if (!matching.length) {
      unmet.push({ offer, hint: `Add ${targetPhrase(ruleTarget(r))} to use this offer.` })
    }
  }

  const subtotalCents = lines.reduce((s, l) => s + l.lineTotalCents, 0)
  const itemDiscountCents = lines.reduce((s, l) => s + l.discountCents, 0)
  const afterItems = subtotalCents - itemDiscountCents

  // 2. Best order-level offer (fixed amount, or % of the basket).
  let orderDiscountCents = 0
  const orderOffers = active.filter((o) => o.rule.kind === 'fixed-off' || o.rule.kind === 'percent-order')
  let bestOrder: Offer | null = null
  const orderAmount = (r: OfferRule) =>
    r.kind === 'fixed-off' ? Math.min(r.amountCents, afterItems)
    : r.kind === 'percent-order' ? Math.min(Math.floor((afterItems * r.percent) / 100), r.maxDiscountCents ?? Number.POSITIVE_INFINITY)
    : 0
  for (const offer of orderOffers) {
    const r = offer.rule
    if ((r.kind === 'fixed-off' || r.kind === 'percent-order') && afterItems >= r.minSpendCents) {
      const amount = orderAmount(r)
      if (amount > orderDiscountCents) {
        orderDiscountCents = amount
        bestOrder = offer
      }
    }
  }
  for (const offer of orderOffers) {
    const r = offer.rule
    if (r.kind !== 'fixed-off' && r.kind !== 'percent-order') continue
    if (offer === bestOrder) applied.push({ offer, discountCents: orderDiscountCents, scope: 'order' })
    else if (afterItems < r.minSpendCents)
      unmet.push({ offer, hint: `Spend ${formatLKR(r.minSpendCents - afterItems)} more to save ${r.kind === 'fixed-off' ? formatLKR(r.amountCents) : `${r.percent}%`}.` })
  }

  const itemsTotalCents = afterItems - orderDiscountCents

  // 3. Delivery.
  const fulfilment = options.fulfilment ?? 'delivery'
  const deliveryFeeCents = lines.length && fulfilment === 'delivery' ? DELIVERY_FEE_CENTS : 0
  let deliveryDiscountCents = 0
  for (const offer of active) {
    if (offer.rule.kind !== 'free-delivery' || !deliveryFeeCents) continue
    if (itemsTotalCents >= offer.rule.minSpendCents) {
      deliveryDiscountCents = deliveryFeeCents
      applied.push({ offer, discountCents: deliveryFeeCents, scope: 'delivery' })
      break
    }
    unmet.push({ offer, hint: `Spend ${formatLKR(offer.rule.minSpendCents - itemsTotalCents)} more for free delivery.` })
  }

  const totalDiscountCents = itemDiscountCents + orderDiscountCents + deliveryDiscountCents
  return {
    lines,
    itemCount: lines.reduce((s, l) => s + l.quantity, 0),
    subtotalCents,
    itemDiscountCents,
    orderDiscountCents,
    deliveryFeeCents,
    deliveryDiscountCents,
    totalDiscountCents,
    itemsTotalCents,
    totalCents: itemsTotalCents + deliveryFeeCents - deliveryDiscountCents,
    applied,
    unmet,
  }
}
