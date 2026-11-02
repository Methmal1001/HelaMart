import type { Offer, OfferRule, Product } from '~/types'
import { getCategory } from '~/data/categories'
import { getProduct } from '~/data/products'
import { formatLKR } from './currency'
import { isOfferActive, offerTimingProblem } from './pricing'

/**
 * Shopper-facing wording for offers — the same text on admin previews,
 * coupon cards, product ribbons and the 3D store's promo boards.
 */

const DAY = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']
const hour = (h: number) => `${h % 12 || 12}${h < 12 || h === 24 ? 'am' : 'pm'}`
const rs = (c: number) => formatLKR(c).replace('.00', '')

/** Big promo text: "20% OFF", "Rs. 500 OFF", "BUY 2 GET 1", "FREE DELIVERY". */
export function offerHeadline(rule: OfferRule) {
  switch (rule.kind) {
    case 'percent-category':
    case 'percent-product':
    case 'percent-order':
      return `${rule.percent}% OFF`
    case 'fixed-off':
      return `${rs(rule.amountCents)} OFF`
    case 'bxgy':
      return `BUY ${rule.buy} GET ${rule.get}`
    case 'free-delivery':
      return 'FREE DELIVERY'
  }
}

/** What it applies to: "Beverages", "Ginger Beer", "your basket". */
export function offerSubject(rule: OfferRule) {
  switch (rule.kind) {
    case 'percent-category':
      return getCategory(rule.categoryId).name
    case 'percent-product':
      return getProduct(rule.productId)?.name ?? 'Selected product'
    case 'bxgy':
      return rule.categoryId ? `${getCategory(rule.categoryId).name} (same item)` : 'Selected items'
    case 'fixed-off':
    case 'percent-order':
      return rule.minSpendCents ? `Orders over ${rs(rule.minSpendCents)}` : 'Your whole basket'
    case 'free-delivery':
      return rule.minSpendCents ? `Orders over ${rs(rule.minSpendCents)}` : 'Every order'
  }
}

/** One-line admin description of the rule. */
export function describeRule(rule: OfferRule) {
  switch (rule.kind) {
    case 'percent-category': return `${rule.percent}% off ${getCategory(rule.categoryId).name}${rule.maxDiscountCents ? ` (max ${formatLKR(rule.maxDiscountCents)})` : ''}`
    case 'percent-product': return `${rule.percent}% off ${getProduct(rule.productId)?.name ?? rule.productId}`
    case 'bxgy': return `Buy ${rule.buy} get ${rule.get} free${rule.categoryId ? ` · ${getCategory(rule.categoryId).name}` : ''}`
    case 'fixed-off': return `${formatLKR(rule.amountCents)} off over ${formatLKR(rule.minSpendCents)}`
    case 'free-delivery': return `Free delivery over ${formatLKR(rule.minSpendCents)}`
    case 'percent-order': return `${rule.percent}% off the basket over ${formatLKR(rule.minSpendCents)}${rule.maxDiscountCents ? ` (max ${formatLKR(rule.maxDiscountCents)})` : ''}`
  }
}

/** Short condition chips: "Min. spend Rs. 5,000", "Sat, Sun", "6pm–9pm", "Pickup only"… */
export function offerConditionChips(offer: Offer): string[] {
  const c = offer.conditions
  const out: string[] = []
  if (offer.forNewCustomers) out.push('New customers')
  if (c?.minSpendCents) out.push(`Min. spend ${rs(c.minSpendCents)}`)
  if (c?.minItems) out.push(`${c.minItems}+ items`)
  if (c?.days?.length && c.days.length < 7) out.push(c.days.length === 2 && c.days.includes(0) && c.days.includes(6) ? 'Weekends' : c.days.map((d) => DAY[d]).join(', '))
  if (c?.fromHour !== undefined && c?.toHour !== undefined) out.push(`${hour(c.fromHour)}–${hour(c.toHour)}`)
  if (c?.fulfilment) out.push(c.fulfilment === 'pickup' ? 'Pickup only' : 'Delivery only')
  if (c?.perCustomerLimit) out.push(c.perCustomerLimit === 1 ? 'Once per customer' : `${c.perCustomerLimit}× per customer`)
  if (c?.startsAt && Date.parse(c.startsAt) > Date.now()) out.push(`Starts ${new Date(c.startsAt).toLocaleDateString('en-LK', { day: 'numeric', month: 'short' })}`)
  return out
}

export interface ProductPromo {
  offer: Offer
  /** "SAVE 20%" / "BUY 2 GET 1". */
  badge: string
  /** Promo price per unit for % offers. */
  nowCents?: number
  /** Needs a minimum spend / item count first. */
  conditional: boolean
}

/** The best running item offer for a product (for ribbons, was/now prices and shelf tags). */
export function productPromo(product: Pick<Product, 'id' | 'categoryId' | 'priceCents'>, offers: Offer[], now = Date.now()): ProductPromo | null {
  let best: ProductPromo | null = null
  let bestValue = 0
  for (const o of offers) {
    if (!isOfferActive(o, now) || offerTimingProblem(o, now)) continue
    const r = o.rule
    const conditional = !!(o.conditions?.minSpendCents || o.conditions?.minItems)
    let promo: ProductPromo | null = null
    let value = 0
    if ((r.kind === 'percent-product' && r.productId === product.id) || (r.kind === 'percent-category' && r.categoryId === product.categoryId)) {
      promo = { offer: o, badge: `SAVE ${r.percent}%`, nowCents: Math.round((product.priceCents * (100 - r.percent)) / 100), conditional }
      value = r.percent
    } else if (r.kind === 'bxgy' && (r.productIds?.includes(product.id) || r.categoryId === product.categoryId)) {
      promo = { offer: o, badge: `BUY ${r.buy} GET ${r.get}`, conditional }
      value = (100 * r.get) / (r.buy + r.get)
    }
    // Unconditional offers win ties: they're what the shopper actually pays.
    if (promo && (value > bestValue || (value === bestValue && best?.conditional && !conditional))) {
      best = promo
      bestValue = value
    }
  }
  return best
}
