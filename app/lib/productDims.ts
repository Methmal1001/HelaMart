import type { Product as CatalogProduct } from '~/types'

/** Anything with a product's look (catalogue items and admin records alike). */
type Product = Omit<CatalogProduct, 'stock'>

/** Real-world-ish package dimensions (w, h, d in metres) used for shelf layout. */
export function productDimensions(p: Product): [number, number, number] {
  const big = /5 kg/.test(p.size)
  const litre = /1(\.5)? L/.test(p.size)
  switch (p.shape) {
    case 'box':
      return [0.17, 0.22, 0.07]
    case 'tallBox':
      return [0.07, 0.24, 0.05]
    case 'bottle':
      return litre ? [0.095, 0.31, 0.095] : [0.07, 0.21, 0.07]
    case 'can':
      return [0.066, 0.122, 0.066]
    case 'jar':
      return [0.1, 0.13, 0.1]
    case 'bag':
      return big ? [0.32, 0.4, 0.13] : [0.19, 0.27, 0.08]
    case 'carton':
      return [0.085, 0.24, 0.085]
    case 'tray':
      return [0.25, 0.06, 0.18]
    case 'loaf':
      return [0.24, 0.13, 0.12]
    case 'round': {
      if (/papaya|pumpkin/.test(p.id)) return [0.2, 0.2, 0.2]
      if (/coconut|mango/.test(p.id)) return [0.14, 0.14, 0.14]
      if (/gotukola/.test(p.id)) return [0.16, 0.12, 0.16]
      if (/bun/.test(p.id)) return [0.11, 0.08, 0.11]
      return [0.075, 0.075, 0.075]
    }
    case 'long':
      return /banana/.test(p.id) ? [0.19, 0.045, 0.045] : [0.2, 0.04, 0.04]
    case 'roll':
      return /tissue/.test(p.id) ? [0.2, 0.11, 0.2] : [0.12, 0.24, 0.12]
  }
}
