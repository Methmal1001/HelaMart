import type { Offer, User } from '~/types'

/**
 * TEST DATA ONLY — stands in for the user and promotions tables until the
 * backend exists. Passwords are plain text here purely so testers can log in;
 * a real backend stores only salted hashes.
 */

export interface MockAccount {
  user: User
  /** Only for password accounts. */
  password?: string
  offers: Offer[]
}

const lka = (date: string) => `${date}T23:59:59+05:30`

export const mockAccounts: MockAccount[] = [
  {
    user: {
      id: 'usr_nimal',
      name: 'Nimal Perera',
      email: 'nimal@helamart.test',
      provider: 'password',
      phone: '+94 77 123 4567',
      avatarColor: '#2F6E8F',
    },
    password: 'Password@123',
    offers: [
      {
        id: 'off_bev10',
        code: 'DRINKS10',
        title: '10% off Beverages',
        description: 'Save 10% on all beverages, up to Rs. 1,000.',
        rule: { kind: 'percent-category', categoryId: 'beverages', percent: 10, maxDiscountCents: 100000 },
        expiresAt: lka('2027-03-31'),
      },
      {
        id: 'off_500over5000',
        code: 'SAVE500',
        title: 'Rs. 500 off orders over Rs. 5,000',
        description: 'Spend Rs. 5,000 or more on items and get Rs. 500 off.',
        rule: { kind: 'fixed-off', amountCents: 50000, minSpendCents: 500000 },
        expiresAt: lka('2027-01-31'),
      },
      {
        // Expired on purpose: shows that out-of-date offers are ignored.
        id: 'off_expired',
        code: 'AVURUDU25',
        title: 'Avurudu 25% off Snacks',
        description: 'Seasonal offer — expired.',
        rule: { kind: 'percent-category', categoryId: 'snacks', percent: 25 },
        expiresAt: lka('2026-04-30'),
      },
    ],
  },
  {
    user: {
      id: 'usr_kavindi',
      name: 'Kavindi Silva',
      email: 'kavindi@helamart.test',
      provider: 'password',
      phone: '+94 71 987 6543',
      avatarColor: '#9E3A5A',
    },
    password: 'Password@123',
    offers: [
      {
        id: 'off_freedel',
        code: 'FREEDEL',
        title: 'Free delivery over Rs. 3,000',
        description: 'Delivery fee waived on orders of Rs. 3,000 or more.',
        rule: { kind: 'free-delivery', minSpendCents: 300000 },
        expiresAt: lka('2027-06-30'),
      },
      {
        id: 'off_snack_b2g1',
        code: 'SNACK3',
        title: 'Buy 2, get 1 free on Snacks',
        description: 'Every third pack of the same snack is free.',
        rule: { kind: 'bxgy', categoryId: 'snacks', buy: 2, get: 1 },
        expiresAt: lka('2027-02-28'),
      },
      {
        id: 'off_produce15',
        code: 'FRESH15',
        title: '15% off Fruits & Vegetables',
        description: 'Fresh produce at 15% off.',
        rule: { kind: 'percent-category', categoryId: 'produce', percent: 15 },
        expiresAt: lka('2027-01-15'),
      },
    ],
  },
  {
    user: {
      id: 'usr_amal',
      name: 'Amal Jayasinghe',
      email: 'amal@helamart.test',
      provider: 'password',
      phone: '+94 76 555 0101',
      avatarColor: '#5F7484',
    },
    password: 'Password@123',
    offers: [],
  },
  // Google accounts (used by the mock Google sign-in).
  {
    user: {
      id: 'usr_g_shanika',
      name: 'Shanika Fernando',
      email: 'shanika.fernando@gmail.com',
      provider: 'google',
      avatarColor: '#B9803F',
    },
    offers: [
      {
        id: 'off_welcome300',
        code: 'WELCOME300',
        title: 'Welcome gift: Rs. 300 off',
        description: 'Rs. 300 off your first order over Rs. 2,000.',
        rule: { kind: 'fixed-off', amountCents: 30000, minSpendCents: 200000 },
        expiresAt: lka('2027-12-31'),
      },
      {
        id: 'off_tea20',
        code: 'CEYLONTEA',
        title: '20% off Pure Ceylon Black Tea',
        description: 'Our favourite tea, 20% off.',
        rule: { kind: 'percent-product', productId: 'ceylon-tea', percent: 20 },
        expiresAt: lka('2027-03-31'),
      },
    ],
  },
  {
    user: {
      id: 'usr_g_ruwan',
      name: 'Ruwan Jayawardena',
      email: 'ruwan.jay@gmail.com',
      provider: 'google',
      avatarColor: '#3E8E3A',
    },
    offers: [],
  },
]

/** Credentials shown in the login dialog so testers can sign in quickly. */
export const TEST_LOGINS = mockAccounts
  .filter((a) => a.password)
  .map((a) => ({ email: a.user.email, password: a.password!, name: a.user.name, offers: a.offers.length }))

export const TEST_GOOGLE_ACCOUNTS = mockAccounts.filter((a) => a.user.provider === 'google').map((a) => a.user)
