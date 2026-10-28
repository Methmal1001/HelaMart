import type { Category, CategoryId } from '~/types'

export const categories: Category[] = [
  {
    id: 'produce',
    name: 'Fruits & Vegetables',
    shortName: 'Fresh Produce',
    description: 'Island-grown fruit, upcountry vegetables and fresh greens.',
    color: '#5E9E4A',
    icon: 'apple',
  },
  {
    id: 'bakery',
    name: 'Bakery',
    shortName: 'Bakery',
    description: 'Fresh bread, buns and cakes baked every morning.',
    color: '#B9803F',
    icon: 'bread',
  },
  {
    id: 'dairy',
    name: 'Dairy & Chilled',
    shortName: 'Dairy',
    description: 'Fresh milk, curd, yoghurt, cheese, butter and eggs.',
    color: '#3F86B8',
    icon: 'milk',
  },
  {
    id: 'meat-frozen',
    name: 'Meat & Frozen',
    shortName: 'Meat & Frozen',
    description: 'Chicken, seafood, frozen vegetables and ice cream.',
    color: '#B2504A',
    icon: 'snowflake',
  },
  {
    id: 'beverages',
    name: 'Beverages',
    shortName: 'Beverages',
    description: 'Ceylon tea, coffee, juices, soft drinks and water.',
    color: '#2C8A86',
    icon: 'bottle',
  },
  {
    id: 'snacks',
    name: 'Snacks & Confectionery',
    shortName: 'Snacks',
    description: 'Biscuits, chocolates, traditional sweets and savoury bites.',
    color: '#D27A2C',
    icon: 'cookie',
  },
  {
    id: 'staples',
    name: 'Rice, Flour & Staples',
    shortName: 'Staples',
    description: 'Rice, flour, dhal, spices, oil and pantry essentials.',
    color: '#A8862F',
    icon: 'wheat',
  },
  {
    id: 'cleaning',
    name: 'Cleaning',
    shortName: 'Cleaning',
    description: 'Detergents, dishwash, floor and bathroom care.',
    color: '#3A74B8',
    icon: 'spray',
  },
  {
    id: 'personal-care',
    name: 'Personal Care',
    shortName: 'Personal Care',
    description: 'Soap, shampoo, oral care and herbal wellness.',
    color: '#A65C88',
    icon: 'sparkle',
  },
  {
    id: 'household',
    name: 'Household Essentials',
    shortName: 'Household',
    description: 'Tissues, foil, storage, candles and everyday supplies.',
    color: '#5F7484',
    icon: 'home',
  },
]

const byId = new Map(categories.map((c) => [c.id, c]))

export function getCategory(id: CategoryId): Category {
  const category = byId.get(id)
  if (!category) throw new Error(`Unknown category: ${id}`)
  return category
}
