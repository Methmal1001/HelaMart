import type { Offer } from '~/types'
import { mockAccounts } from '~/data/mockUsers'
import { latency, verifyAccessToken } from './mock/server'

/** Every newly created customer (registration or first Google sign-in) gets this. */
const NEW_CUSTOMER_OFFER: Offer = {
  id: 'off_newcustomer',
  code: 'HELLOHELA',
  title: 'New customer: Rs. 250 off',
  description: 'Rs. 250 off your order of Rs. 1,500 or more.',
  rule: { kind: 'fixed-off', amountCents: 25000, minSpendCents: 150000 },
  expiresAt: '2027-12-31T23:59:59+05:30',
}

/** Server-side lookup of a customer's offers (also used when pricing orders). */
export function offersForUser(userId: string): Offer[] {
  const seeded = mockAccounts.find((a) => a.user.id === userId)
  return structuredClone(seeded ? seeded.offers : [NEW_CUSTOMER_OFFER])
}

/** GET /me/offers — promotions available to the signed-in customer. */
export async function listMyOffers(accessToken: string): Promise<Offer[]> {
  await latency(150, 350)
  return offersForUser(verifyAccessToken(accessToken))
}
