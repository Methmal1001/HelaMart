/** How an order was paid. The store credit part is shown as well when it covered only some of the order. */
interface PaymentInfo {
  method: 'cod' | 'card' | 'credit' | 'none'
  cardLast4?: string | null
  storeCreditCents?: number
}

/** "Card •••• 4242", "Cash on delivery + Rs. 500.00 store credit", "Store credit"… (short: "Card •4242"). */
export function paymentLabel(p: PaymentInfo, short = false): string {
  if (p.method === 'none') return 'No charge (replacement)'
  const main = p.method === 'card' ? (short ? `Card •${p.cardLast4}` : `Card •••• ${p.cardLast4}`) : p.method === 'cod' ? 'Cash on delivery' : 'Store credit'
  return p.method !== 'credit' && p.storeCreditCents ? `${main} + ${formatLKR(p.storeCreditCents)} store credit` : main
}

/** What the card or cash covers (the order total minus store credit used). */
export function amountDue(o: { breakdown: { totalCents: number }; payment: { storeCreditCents?: number } }): number {
  return o.breakdown.totalCents - (o.payment.storeCreditCents ?? 0)
}
