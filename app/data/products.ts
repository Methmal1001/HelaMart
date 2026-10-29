import { ref } from 'vue'
import type { CategoryId, Product, ProductShape } from '~/types'

/**
 * SAMPLE CATALOGUE — fictional brands and illustrative prices for the
 * Phase 1 prototype only. Nothing here reflects real stock or real pricing.
 */

type Row = [
  id: string,
  name: string,
  brand: string,
  size: string,
  unit: string,
  rupees: number,
  shape: ProductShape,
  color: string,
  accent: string,
  description: string,
  badge?: Product['badge'],
]

function group(categoryId: CategoryId, rows: Row[]): Product[] {
  return rows.map(([id, name, brand, size, unit, rupees, shape, color, accent, description, badge]) => ({
    id,
    name,
    brand,
    categoryId,
    size,
    unit,
    priceCents: Math.round(rupees * 100),
    shape,
    color,
    accent,
    description,
    badge,
  }))
}

export const products: Product[] = [
  ...group('produce', [
    ['ambul-banana', 'Ambul Bananas', 'Hela Fresh', '1 kg', 'per kg', 320, 'long', '#E9C43A', '#7A9A2E', 'Sweet, tangy Ambul bananas from Kurunegala growers.', 'Local'],
    ['red-papaya', 'Red Lady Papaya', 'Hela Fresh', '≈ 1.2 kg', 'each', 450, 'round', '#E58A2E', '#5E8E3E', 'Ripe red-fleshed papaya, ideal for breakfast.', 'Fresh'],
    ['tjc-mango', 'TJC Mangoes', 'Hela Fresh', '1 kg', 'per kg', 980, 'round', '#F0B232', '#6E9B3A', 'Fragrant, juicy mangoes — seasonal favourite.', 'Popular'],
    ['king-coconut', 'King Coconut (Thambili)', 'Hela Fresh', '1 nut', 'each', 180, 'round', '#E89A2C', '#C9781E', 'Refreshing natural thambili water.', 'Local'],
    ['carrots', 'Nuwara Eliya Carrots', 'Upcountry Farms', '500 g', 'pack', 290, 'long', '#E46F23', '#4E8B35', 'Crunchy upcountry carrots, washed and graded.'],
    ['leeks', 'Fresh Leeks', 'Upcountry Farms', '500 g', 'pack', 260, 'long', '#B9D27A', '#5C8F3B', 'Tender leeks for curries and stir-fries.'],
    ['brinjal', 'Brinjal (Wambatu)', 'Hela Fresh', '500 g', 'pack', 210, 'long', '#5B2E6E', '#3F7A36', 'Glossy purple brinjals, perfect for moju.'],
    ['gotukola', 'Gotukola Bundle', 'Hela Fresh', '1 bundle', 'each', 120, 'round', '#4F9B3C', '#2F6E2A', 'Fresh gotukola for a healthy sambol.', 'Fresh'],
    ['limes', 'Green Limes', 'Hela Fresh', '250 g', 'pack', 190, 'round', '#8CC63F', '#4E8B35', 'Zesty limes for juices and curries.'],
    ['pumpkin', 'Pumpkin (Wattakka)', 'Hela Fresh', '1 kg', 'per kg', 240, 'round', '#D9862B', '#5E7F33', 'Sweet pumpkin wedges for curry.'],
  ]),
  ...group('bakery', [
    ['sandwich-bread', 'Sandwich Bread', 'HelaMart Bakery', '450 g', 'loaf', 210, 'loaf', '#D9A35B', '#F6E7C8', 'Soft white sandwich loaf, sliced.', 'Fresh'],
    ['roast-paan', 'Roast Paan', 'HelaMart Bakery', '4 pieces', 'pack', 180, 'loaf', '#B8742F', '#F1D9A8', 'Crusty roast bread, perfect with curry.', 'Local'],
    ['tea-buns', 'Tea Buns', 'HelaMart Bakery', '4 buns', 'pack', 240, 'round', '#C98A3E', '#F6E2B8', 'Sweet glazed tea buns for the evening cuppa.'],
    ['fish-buns', 'Fish Buns', 'HelaMart Bakery', '2 buns', 'pack', 300, 'round', '#B9772F', '#EED29A', 'Spicy fish-filled buns, freshly baked.', 'Popular'],
    ['butter-cake', 'Butter Cake', 'HelaMart Bakery', '500 g', 'each', 950, 'box', '#F2D27A', '#174D38', 'Classic golden butter cake.'],
    ['wholemeal-bread', 'Wholemeal Bread', 'HelaMart Bakery', '450 g', 'loaf', 260, 'loaf', '#9C6B3C', '#E9D3AE', 'Wholemeal loaf with added fibre.'],
    ['kimbula-banis', 'Kimbula Banis', 'HelaMart Bakery', '4 pieces', 'pack', 260, 'long', '#C7873A', '#F7E6BF', 'Sugar-topped “crocodile” buns.', 'Local'],
  ]),
  ...group('dairy', [
    ['fresh-milk', 'Fresh Milk', 'Lanka Dairies', '1 L', 'carton', 520, 'carton', '#F4F6F8', '#2F79C2', 'Pasteurised full-cream fresh milk.', 'Fresh'],
    ['buffalo-curd', 'Buffalo Curd', 'Ruhunu Farms', '900 ml', 'pot', 850, 'jar', '#E9DFCB', '#9B5A2E', 'Traditional clay-pot buffalo curd.', 'Local'],
    ['set-yoghurt', 'Set Yoghurt', 'Lanka Dairies', '80 g × 4', 'pack', 360, 'jar', '#FFFFFF', '#E25C7A', 'Creamy set yoghurt cups.'],
    ['cheddar', 'Cheddar Cheese Block', 'Highland Valley', '200 g', 'pack', 1350, 'box', '#F2C44C', '#174D38', 'Mild cheddar, great for sandwiches.'],
    ['salted-butter', 'Salted Butter', 'Highland Valley', '200 g', 'pack', 1150, 'box', '#F7E38A', '#2E6FB5', 'Rich salted table butter.'],
    ['brown-eggs', 'Farm Brown Eggs', 'Hela Farm', '10 eggs', 'tray', 650, 'tray', '#C99A6A', '#EADBC4', 'Fresh brown eggs from local farms.', 'Fresh'],
    ['flavoured-milk', 'Chocolate Milk', 'Lanka Dairies', '180 ml', 'bottle', 160, 'bottle', '#7A4A2B', '#F4E4C8', 'Chilled chocolate-flavoured milk.'],
  ]),
  ...group('meat-frozen', [
    ['chicken-curry-cut', 'Chicken Curry Cut', 'Hela Farm', '1 kg', 'pack', 1650, 'tray', '#F1C3B0', '#174D38', 'Skinless chicken curry cut, chilled.'],
    ['seer-fish', 'Seer Fish Slices', 'Southern Catch', '500 g', 'pack', 2200, 'tray', '#D9DEE3', '#2F79C2', 'Thick seer (thora) fish slices.', 'Fresh'],
    ['prawns', 'Lagoon Prawns', 'Southern Catch', '500 g', 'pack', 2650, 'tray', '#F0A27F', '#2F79C2', 'Cleaned and deveined lagoon prawns.'],
    ['chicken-sausages', 'Chicken Sausages', 'Hela Farm', '500 g', 'pack', 980, 'box', '#C9432F', '#F7E7C9', 'Frozen chicken sausages.'],
    ['frozen-peas', 'Frozen Green Peas', 'Frosty Fields', '400 g', 'pack', 590, 'bag', '#3F9B4A', '#EAF5E1', 'Sweet green peas, frozen fresh.'],
    ['vanilla-ice-cream', 'Vanilla Ice Cream', 'Frosty Fields', '1 L', 'tub', 890, 'jar', '#F7EBC9', '#8A4A2B', 'Creamy vanilla ice cream.', 'Popular'],
    ['fish-cutlets', 'Fish Cutlets', 'Southern Catch', '10 pieces', 'pack', 750, 'box', '#E9A23B', '#174D38', 'Ready-to-fry Sri Lankan fish cutlets.', 'Local'],
  ]),
  ...group('beverages', [
    ['ceylon-tea', 'Pure Ceylon Black Tea', 'Ceylon Leaf', '400 g', 'pack', 1280, 'box', '#174D38', '#E1C987', 'High-grown BOPF Ceylon tea.', 'Local'],
    ['ginger-beer', 'Ginger Beer', 'Island Fizz', '1.5 L', 'bottle', 420, 'bottle', '#D7A23A', '#174D38', 'Spicy, sparkling ginger beer.', 'Popular'],
    ['mineral-water', 'Mineral Water', 'Knuckles Spring', '1.5 L', 'bottle', 150, 'bottle', '#BFE3F2', '#2F79C2', 'Natural spring mineral water.'],
    ['orange-cordial', 'Orange Cordial', 'Island Fizz', '750 ml', 'bottle', 690, 'bottle', '#F08A24', '#FFFFFF', 'Concentrated orange drink cordial.'],
    ['instant-coffee', 'Instant Coffee', 'Kandy Roast', '100 g', 'jar', 1450, 'jar', '#5A3A24', '#E1C987', 'Smooth medium-roast instant coffee.'],
    ['cola-can', 'Cola', 'Island Fizz', '330 ml', 'can', 180, 'can', '#B3242C', '#FFFFFF', 'Classic cola in a chilled can.'],
    ['mango-nectar', 'Mango Nectar', 'Tropic Lanka', '1 L', 'carton', 560, 'carton', '#F3A51E', '#3E8E3A', 'Thick mango nectar.'],
    ['thambili-water', 'King Coconut Water', 'Tropic Lanka', '330 ml', 'can', 260, 'can', '#E8902A', '#3E8E3A', 'Pure king coconut water.', 'New'],
  ]),
  ...group('snacks', [
    ['cream-crackers', 'Cream Crackers', 'Lanka Biscuits', '490 g', 'pack', 520, 'box', '#E43A2E', '#F6E7B8', 'Light, crispy cream crackers.', 'Popular'],
    ['chocolate-bar', 'Milk Chocolate', 'Ceylon Cocoa', '100 g', 'bar', 480, 'box', '#6B3A22', '#E1C987', 'Smooth milk chocolate bar.'],
    ['murukku', 'Spicy Murukku', 'Amma’s Kitchen', '200 g', 'pack', 290, 'bag', '#E2A43B', '#B3242C', 'Crunchy, spicy murukku.', 'Local'],
    ['devilled-cashew', 'Devilled Cashews', 'Amma’s Kitchen', '100 g', 'pack', 690, 'bag', '#C2452D', '#F2D27A', 'Roasted cashews with chilli spice.'],
    ['kokis', 'Kokis', 'Amma’s Kitchen', '150 g', 'pack', 340, 'bag', '#EBCB7E', '#174D38', 'Traditional crispy kokis.', 'Local'],
    ['milk-toffee', 'Milk Toffee', 'Amma’s Kitchen', '200 g', 'pack', 380, 'box', '#F1E2C2', '#8A4A2B', 'Melt-in-the-mouth milk toffee.'],
    ['potato-chips', 'Potato Chips', 'Crunchy Isle', '100 g', 'pack', 360, 'bag', '#F5C518', '#2F79C2', 'Lightly salted potato chips.'],
    ['chocolate-biscuits', 'Chocolate Biscuits', 'Lanka Biscuits', '200 g', 'pack', 330, 'box', '#4A2A1C', '#E1C987', 'Chocolate sandwich biscuits.'],
  ]),
  ...group('staples', [
    ['samba-rice', 'Keeri Samba Rice', 'Polonnaruwa Mills', '5 kg', 'bag', 1650, 'bag', '#F6F1E1', '#174D38', 'Premium keeri samba rice.', 'Local'],
    ['red-raw-rice', 'Red Raw Rice', 'Polonnaruwa Mills', '5 kg', 'bag', 1450, 'bag', '#E7D3C1', '#9B3A2E', 'Nutritious red raw rice.', 'Local'],
    ['nadu-rice', 'White Nadu Rice', 'Polonnaruwa Mills', '5 kg', 'bag', 1250, 'bag', '#FAF7EE', '#2F79C2', 'Everyday white nadu rice.'],
    ['wheat-flour', 'Wheat Flour', 'Golden Mill', '1 kg', 'pack', 290, 'bag', '#FFFFFF', '#E1A23B', 'All-purpose wheat flour.'],
    ['kurakkan-flour', 'Kurakkan Flour', 'Golden Mill', '500 g', 'pack', 380, 'bag', '#8A5A3B', '#F1E2C2', 'Finger-millet flour for roti and pittu.', 'Local'],
    ['red-dhal', 'Mysore Red Dhal', 'Golden Mill', '1 kg', 'pack', 480, 'bag', '#E9813B', '#174D38', 'Quick-cooking red lentils.'],
    ['coconut-oil', 'Coconut Oil', 'Pol Gedara', '1 L', 'bottle', 950, 'bottle', '#F7F0D2', '#3E8E3A', 'Pure Sri Lankan coconut oil.', 'Local'],
    ['curry-powder', 'Roasted Curry Powder', 'Spice Isle', '250 g', 'pack', 520, 'box', '#8A3A1E', '#E1C987', 'Dark roasted Sri Lankan curry powder.', 'Popular'],
    ['chilli-powder', 'Chilli Powder', 'Spice Isle', '250 g', 'pack', 610, 'box', '#C2261E', '#F6E7B8', 'Hot red chilli powder.'],
    ['kithul-jaggery', 'Kithul Jaggery', 'Pol Gedara', '500 g', 'pack', 890, 'box', '#6B3A1E', '#E1C987', 'Traditional kithul palm jaggery.', 'Local'],
  ]),
  ...group('cleaning', [
    ['dishwash-liquid', 'Dishwash Liquid', 'Sparkle Home', '500 ml', 'bottle', 420, 'bottle', '#7BC043', '#FFFFFF', 'Lime-fresh grease-cutting dishwash.'],
    ['detergent-powder', 'Detergent Powder', 'Sparkle Home', '1 kg', 'pack', 690, 'box', '#2F79C2', '#F5C518', 'Front and top-load detergent powder.', 'Popular'],
    ['floor-cleaner', 'Floor Cleaner', 'Sparkle Home', '1 L', 'bottle', 560, 'bottle', '#9A6BC2', '#FFFFFF', 'Lavender disinfectant floor cleaner.'],
    ['toilet-cleaner', 'Toilet Cleaner', 'Sparkle Home', '500 ml', 'bottle', 480, 'bottle', '#3A74B8', '#E43A2E', 'Thick toilet bowl cleaner.'],
    ['bleach', 'Household Bleach', 'Sparkle Home', '1 L', 'bottle', 380, 'bottle', '#F4F6F8', '#3A74B8', 'Multipurpose disinfecting bleach.'],
    ['fabric-softener', 'Fabric Softener', 'Sparkle Home', '1 L', 'bottle', 720, 'bottle', '#F29BC2', '#FFFFFF', 'Long-lasting floral fabric softener.', 'New'],
    ['scrub-pads', 'Scrub Pads', 'Sparkle Home', '3 pack', 'pack', 250, 'box', '#F5C518', '#3E8E3A', 'Heavy-duty kitchen scrub pads.'],
  ]),
  ...group('personal-care', [
    ['herbal-soap', 'Herbal Soap', 'Ayu Herbals', '100 g × 3', 'pack', 450, 'box', '#3E8E3A', '#E1C987', 'Ayurvedic herbal bathing soap.', 'Local'],
    ['shampoo', 'Hibiscus Shampoo', 'Ayu Herbals', '180 ml', 'bottle', 690, 'bottle', '#C2265E', '#F7E7C9', 'Gentle hibiscus and amla shampoo.'],
    ['toothpaste', 'Clove Toothpaste', 'Ayu Herbals', '120 g', 'tube', 320, 'box', '#FFFFFF', '#C2261E', 'Herbal clove toothpaste.'],
    ['body-lotion', 'Coconut Body Lotion', 'Ayu Herbals', '200 ml', 'bottle', 780, 'bottle', '#F7F0D2', '#174D38', 'Moisturising coconut-milk lotion.'],
    ['herbal-oil', 'Herbal Hair Oil', 'Ayu Herbals', '100 ml', 'bottle', 540, 'bottle', '#2F6E2A', '#E1C987', 'Traditional herbal hair oil.', 'Local'],
    ['hand-wash', 'Hand Wash', 'Ayu Herbals', '250 ml', 'bottle', 420, 'bottle', '#5BB5C2', '#FFFFFF', 'Neem and turmeric hand wash.'],
    ['toothbrush', 'Soft Toothbrush', 'Smile Care', '2 pack', 'pack', 360, 'tallBox', '#2F79C2', '#FFFFFF', 'Soft-bristle toothbrushes.'],
  ]),
  ...group('household', [
    ['tissue-rolls', 'Toilet Tissue', 'SoftHome', '4 rolls', 'pack', 540, 'roll', '#FFFFFF', '#174D38', 'Soft two-ply toilet tissue.', 'Popular'],
    ['kitchen-towel', 'Kitchen Towels', 'SoftHome', '2 rolls', 'pack', 480, 'roll', '#F6F1E1', '#E1A23B', 'Absorbent kitchen paper towels.'],
    ['aluminium-foil', 'Aluminium Foil', 'SoftHome', '7.5 m', 'roll', 590, 'tallBox', '#C9CED3', '#174D38', 'Food-grade aluminium foil.'],
    ['garbage-bags', 'Garbage Bags', 'SoftHome', '30 bags', 'pack', 420, 'box', '#2B2F33', '#E1C987', 'Strong, leak-proof garbage bags.'],
    ['safety-matches', 'Safety Matches', 'Lanka Light', '10 boxes', 'pack', 150, 'box', '#E43A2E', '#F5C518', 'Pack of ten safety matchboxes.'],
    ['candles', 'Household Candles', 'Lanka Light', '6 candles', 'pack', 280, 'tallBox', '#F7F3E7', '#B9803F', 'Long-burning white candles.'],
    ['aa-batteries', 'AA Batteries', 'PowerCell', '4 pack', 'pack', 650, 'box', '#1F2A30', '#E1C987', 'Long-life alkaline batteries.'],
  ]),
]

/**
 * The master sample catalogue (never modified). Supermarkets start from it;
 * the admin seed must always read this, not the live registry below.
 */
export const masterProducts: readonly Product[] = products.map((p) => ({ ...p }))

/**
 * Live catalogue registry: the selected supermarket's own products, prices,
 * photos and branch stock. `products` is updated in place so every consumer
 * (cart, pricing, 3D shelves, aisle list) sees the same data.
 */
let byId = new Map(products.map((p) => [p.id, p]))

/** Bumped whenever the active catalogue changes (reactive consumers depend on it). */
export const catalogVersion = ref(0)

export function setActiveCatalog(list: Product[]) {
  products.splice(0, products.length, ...list)
  byId = new Map(products.map((p) => [p.id, p]))
  catalogVersion.value++
}

export function getProduct(id: string): Product | undefined {
  return byId.get(id)
}

export function productsInCategory(categoryId: CategoryId): Product[] {
  return products.filter((p) => p.categoryId === categoryId)
}
