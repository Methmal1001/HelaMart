import { api } from './http'
import type { ProductReviewsDto, ReviewDto } from './apiTypes'

const url = (storeId: string, productId: string) => `/stores/${encodeURIComponent(storeId)}/products/${encodeURIComponent(productId)}/reviews`

/** GET /stores/:id/products/:id/reviews?page= — public; a token adds the shopper's own review and whether they can write one. */
export function listProductReviews(storeId: string, productId: string, page = 1, accessToken?: string | null): Promise<ProductReviewsDto> {
  return api<ProductReviewsDto>(url(storeId, productId), { token: accessToken, query: { page } })
}

/**
 * PUT /stores/:id/products/:id/reviews — write or edit the shopper's own review. The server only accepts it
 * from a customer who has a delivered order from this supermarket containing the product.
 */
export function saveProductReview(accessToken: string, storeId: string, productId: string, input: { rating: number; comment: string }): Promise<ReviewDto> {
  return api<ReviewDto>(url(storeId, productId), { method: 'PUT', token: accessToken, body: input })
}
