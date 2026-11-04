import type { IconName } from '~/types'

/**
 * HelaMart's Terms & Conditions of Order and Privacy Policy. Shown (collapsed) at checkout and registration and
 * on /legal/terms · /legal/privacy. The API checks the versions a customer accepts (HelaMart_API Domain/Legal.cs):
 * when the text changes, raise the version here and there.
 */
export type LegalKey = 'terms' | 'privacy'

export interface LegalSection {
  id: string
  title: string
  paragraphs: string[]
  bullets?: string[]
  /** A clause the customer must notice (shown as a highlighted callout). */
  important?: boolean
}

export interface LegalDoc {
  key: LegalKey
  title: string
  short: string
  version: string
  effective: string
  intro: string
  keyPoints: { icon: IconName; title: string; text: string }[]
  sections: LegalSection[]
}

export const TERMS: LegalDoc = {
  key: 'terms',
  title: 'Terms & Conditions of Order',
  short: 'Terms of Order',
  version: '1.0',
  effective: '4 November 2026',
  intro:
    'These terms apply to every order placed on HelaMart (helamart.lk and the HelaMart 3D store). Please read them carefully. By ticking “I agree” and placing an order, you accept them.',
  keyPoints: [
    { icon: 'store', title: 'You buy from the supermarket', text: 'HelaMart is the platform. The supermarket you choose sells, packs and delivers your order.' },
    { icon: 'package', title: 'Item condition is the store’s responsibility', text: 'HelaMart isn’t responsible for damaged, broken, spoiled or missing items. Claims go to the supermarket.' },
    { icon: 'cash', title: 'Cash on delivery is between you and the store', text: 'HelaMart takes no responsibility for cash on delivery issues: damage, breakage, loss or payment disputes.' },
    { icon: 'clipboard', title: 'Check at hand-over', text: 'Check your items when you receive them and report problems to the store within 24 hours.' },
  ],
  sections: [
    {
      id: 'about',
      title: 'About HelaMart',
      paragraphs: [
        'HelaMart is an online marketplace platform that connects customers with independent supermarkets in Sri Lanka (each a “Store”).',
        'When you place an order you are buying from the Store you selected. HelaMart lists products, processes the order and passes it to the Store; HelaMart does not itself sell, pack, store or deliver the items.',
      ],
    },
    {
      id: 'ordering',
      title: 'Placing an order',
      paragraphs: [
        'Your order is an offer to buy. It is accepted when the Store confirms it and you receive an order number.',
        'The Store may cancel all or part of an order — for example if an item is out of stock, a price is wrong, the address is outside its delivery area, or it suspects fraud or misuse. Any amount already paid for cancelled items will be refunded.',
        'You must give a correct name, mobile number and address. Wrong or incomplete details may delay or cancel the order.',
      ],
    },
    {
      id: 'prices',
      title: 'Prices and offers',
      paragraphs: [
        'All prices are in Sri Lankan Rupees (Rs.) at the branch you selected, including taxes where applicable. Your total is re-calculated by HelaMart when you place the order, and that total is final.',
        'Offers and promotions are subject to their own conditions (minimum spend, items, dates, days, times and branch), cannot be exchanged for cash, and may end at any time.',
        'Delivery fees and minimum order values are shown before you place the order.',
      ],
    },
    {
      id: 'payment',
      title: 'Payment',
      paragraphs: [
        'Depending on the Store you can pay by credit or debit card, cash on delivery, or pay at pickup.',
        'Card payments are taken when the order is placed and processed securely. HelaMart never stores your full card number or CVC.',
        'For cash on delivery or pay at pickup, please have the payable amount ready. The Store may withhold the order until payment is made.',
      ],
    },
    {
      id: 'delivery',
      title: 'Delivery and pickup',
      paragraphs: [
        'Home delivery is only available inside the selected branch’s delivery area. Some branches are pickup only.',
        'Delivery and pickup times are estimates and may change because of traffic, weather, demand or other reasons outside the Store’s control.',
        'Someone must be available to receive the order. If no one is available, the Store may arrange another delivery (a charge may apply) or cancel the order.',
        'For pickup, collect the order at the branch counter in your chosen slot and show your order slip or QR code. Orders not collected within 24 hours may be cancelled; perishable items may not be refunded.',
      ],
    },
    {
      id: 'checking',
      title: 'Checking your order',
      paragraphs: [
        'Please check your items on receipt — before the delivery person leaves, or before you leave the counter.',
        'Report any missing, wrong or damaged item to the Store at hand-over or within 24 hours through the Store’s hotline. Confirming receipt (including by QR scan) confirms the order was received complete and in acceptable condition.',
      ],
    },
    {
      id: 'items',
      title: 'Condition of ordered items',
      important: true,
      paragraphs: [
        'HelaMart is not responsible for any issue related to the ordered items, including items that are damaged, broken, spoiled, expired, defective, incorrect or missing.',
        'The Store is solely responsible for the quality, safety, packaging, labelling, expiry dates and condition of every item it sells and delivers, and all such claims must be made directly with the Store.',
        'Product images are for illustration. Fresh produce, meat and fish naturally vary in size, weight and appearance, and weighed items may be charged at their actual weight.',
      ],
    },
    {
      id: 'cod',
      title: 'Cash on delivery',
      important: true,
      paragraphs: [
        'HelaMart takes no responsibility for any issue related to cash on delivery orders, including items damaged, broken or lost in transit, short or incorrect deliveries, payment disputes, incorrect change, or cash lost or mishandled by delivery staff.',
        'Cash payments are made directly to the Store or its delivery staff. Any dispute about cash paid or items received on a cash on delivery order must be settled with the Store.',
      ],
    },
    {
      id: 'cancellations',
      title: 'Cancellations, returns and refunds',
      paragraphs: [
        'You may cancel an order until the Store starts packing it. After that it can only be cancelled with the Store’s agreement.',
        'Refunds are decided and made by the Store, to the original payment method where possible. Card refunds can take 7–14 working days depending on your bank.',
        'Perishable, chilled, frozen and opened items generally cannot be returned unless the Store accepts a complaint made under “Checking your order”.',
      ],
    },
    {
      id: 'restricted',
      title: 'Restricted items',
      paragraphs: ['Some items (for example tobacco or medicines) may only be sold as Sri Lankan law allows. The Store may ask for proof of age or identity at hand-over and may refuse to hand over the item.'],
    },
    {
      id: 'account',
      title: 'Your account and fair use',
      paragraphs: [
        'Keep your sign-in details confidential. You are responsible for orders placed from your account.',
        'HelaMart may suspend or close accounts used for fraud, abuse, harassment of staff, or repeated refused or uncollected orders.',
      ],
    },
    {
      id: 'liability',
      title: 'Limitation of liability',
      paragraphs: [
        'To the fullest extent permitted by law, HelaMart’s total liability for any order is limited to the value of that order, and HelaMart is not liable for indirect or consequential loss, or loss of profit or opportunity.',
        'HelaMart and the Store are not liable for delay or failure caused by events beyond reasonable control, such as natural disasters, floods, curfews, strikes, power or network outages, or government restrictions.',
        'Nothing in these terms limits your statutory rights under the Consumer Affairs Authority Act No. 9 of 2003 or any other law of Sri Lanka.',
      ],
    },
    {
      id: 'privacy-link',
      title: 'Your personal data',
      paragraphs: ['How HelaMart and the Store use your personal data is explained in the HelaMart Privacy Policy, which forms part of these terms.'],
    },
    {
      id: 'changes',
      title: 'Changes and governing law',
      paragraphs: [
        'HelaMart may update these terms. The version shown when you place an order applies to that order.',
        'These terms are governed by the laws of the Democratic Socialist Republic of Sri Lanka, and disputes are subject to the courts of Sri Lanka.',
      ],
    },
  ],
}

export const PRIVACY: LegalDoc = {
  key: 'privacy',
  title: 'Privacy Policy',
  short: 'Privacy Policy',
  version: '1.0',
  effective: '4 November 2026',
  intro:
    'Your privacy matters to us. This policy explains what personal data HelaMart collects, why, who we share it with, how long we keep it and the rights you have, in line with Sri Lanka’s Personal Data Protection Act No. 9 of 2022.',
  keyPoints: [
    { icon: 'shield', title: 'We never sell your data', text: 'Your data is used to run HelaMart and fulfil your orders. It is never sold or rented to anyone.' },
    { icon: 'store', title: 'Shared only to fulfil your order', text: 'The supermarket you order from gets the details it needs to pack, deliver or hand over your order.' },
    { icon: 'lock', title: 'Protected by design', text: 'Encrypted connections, hashed passwords and no stored card numbers. Staff access is limited and logged.' },
    { icon: 'user', title: 'You stay in control', text: 'Ask to see, correct or delete your data, or withdraw consent, at any time.' },
  ],
  sections: [
    {
      id: 'who',
      title: 'Who we are',
      paragraphs: [
        'HelaMart operates the HelaMart website and 3D store and is the controller of the personal data described in this policy.',
        'Each supermarket you order from is a separate controller of the order data it receives, and handles it under its own obligations.',
      ],
    },
    {
      id: 'collect',
      title: 'The data we collect',
      paragraphs: ['We collect only what we need:'],
      bullets: [
        'Account details — your name, email address, mobile number, password (stored only as a secure hash) and, if you use Google sign-in, your Google profile name and picture.',
        'Shopping area — the town or location you choose, used to show supermarkets that serve you. Precise device location is only used if you allow it.',
        'Orders — items, prices, offers used, delivery or pickup details, address, time slot, notes, and order and delivery history.',
        'Payment — the payment method, payment status and the last 4 digits of a card. Full card numbers and CVC are never stored by HelaMart.',
        'Device and usage — browser type, sign-in times, security logs and the pages and features you use, to keep the service secure and working well.',
      ],
    },
    {
      id: 'use',
      title: 'How we use your data',
      paragraphs: ['We use your data to:'],
      bullets: [
        'create and manage your account and keep it secure (performance of our contract with you);',
        'process, price, deliver and track your orders and handle refunds and complaints (contract);',
        'show supermarkets, prices and offers that apply to your area and account (contract and legitimate interest);',
        'prevent fraud and abuse, and protect customers, stores and staff (legitimate interest);',
        'keep financial and tax records and meet legal requests (legal obligation);',
        'send service messages about your orders. Marketing messages are only sent with your consent, and you can opt out at any time.',
      ],
    },
    {
      id: 'share',
      title: 'Who we share it with',
      important: true,
      paragraphs: ['We share personal data only when needed:'],
      bullets: [
        'The supermarket you order from, and its staff and delivery riders: your name, mobile number, address, time slot, notes and order details, so they can fulfil your order.',
        'Payment processors, to take card payments securely.',
        'Trusted service providers (hosting, email and SMS, security) who act on our instructions under confidentiality agreements.',
        'Authorities, when required by law or to protect someone’s safety.',
      ],
    },
    {
      id: 'storage',
      title: 'Cookies and storage on your device',
      paragraphs: [
        'HelaMart uses your browser’s storage to keep you signed in, remember your cart, chosen store, shopping area and avatar, and to keep the site secure. We do not use third-party advertising cookies.',
        'You can clear this storage at any time in your browser settings; you will then need to sign in again.',
      ],
    },
    {
      id: 'retention',
      title: 'How long we keep it',
      paragraphs: [
        'Account data is kept while your account is open. Order and payment records are kept for at least 5 years, as Sri Lankan tax and accounting laws require.',
        'Security and sign-in logs are kept for a short period (typically 7–90 days). When data is no longer needed it is deleted or anonymised.',
      ],
    },
    {
      id: 'security',
      title: 'How we protect it',
      paragraphs: [
        'All data travels over encrypted connections (HTTPS). Passwords are stored only as salted hashes, sign-in sessions expire, and repeated failed sign-ins are blocked.',
        'Supermarket staff can only see orders for their own store and branches, use two-step verification, and their actions are recorded in an audit log.',
        'No system is completely secure. If a breach affects your data, we will notify you and the Data Protection Authority as the law requires.',
      ],
    },
    {
      id: 'rights',
      title: 'Your rights',
      paragraphs: ['Under the Personal Data Protection Act No. 9 of 2022 you have the right to:'],
      bullets: [
        'access the personal data we hold about you;',
        'correct inaccurate or incomplete data;',
        'ask us to delete your data, where we don’t need to keep it by law;',
        'withdraw your consent at any time (this doesn’t affect what was done before);',
        'object to, or ask us to restrict, certain uses of your data;',
        'complain to the Data Protection Authority of Sri Lanka.',
      ],
    },
    {
      id: 'children',
      title: 'Children',
      paragraphs: ['HelaMart is meant for people aged 18 and over. We don’t knowingly collect data from children; if you believe a child has given us data, contact us and we will delete it.'],
    },
    {
      id: 'transfers',
      title: 'Where your data is stored',
      paragraphs: ['Your data is stored on secure servers. If it is processed outside Sri Lanka, we make sure it receives a level of protection that meets Sri Lankan law.'],
    },
    {
      id: 'contact',
      title: 'Contact us',
      paragraphs: [
        'For any privacy question or to use your rights, contact HelaMart’s Data Protection Officer at privacy@helamart.lk. We reply within 21 days.',
        'Questions about an order’s contents or delivery are best sent to the supermarket through its hotline, shown on your order.',
      ],
    },
    {
      id: 'changes',
      title: 'Changes to this policy',
      paragraphs: ['We may update this policy and will show the new version, with its date, before you next place an order or sign in. Significant changes will be highlighted.'],
    },
  ],
}

export const LEGAL: Record<LegalKey, LegalDoc> = { terms: TERMS, privacy: PRIVACY }

/** What a customer accepts at checkout and registration (sent to the API). */
export const LEGAL_CONSENT = { termsVersion: TERMS.version, privacyVersion: PRIVACY.version } as const
