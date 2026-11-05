import type { ReviewReplyDto } from '../apiTypes'
import { apiGet as get, apiSend as send, encodeId as id } from './common'

/**
 * Customer reviews in the supermarket portal (HelaMart backend, /admin/store/reviews). A reply is public: shoppers see
 * it under the review, signed with the supermarket's name. Branch staff only see their own branches' reviews.
 */

export interface AdminReview {
  id: string
  productId: string
  productName: string
  customerName: string
  rating: number
  comment: string
  orderNumber: string
  branchId: string
  branchName: string
  createdAt: string
  updatedAt: string
  reply?: ReviewReplyDto
  /** False when reviews are turned off for this product: shoppers don't see this review. */
  productReviewsEnabled: boolean
}

export function listReviews(token: string): Promise<AdminReview[]> {
  return get(token, '/admin/store/reviews')
}

export function replyToReview(token: string, reviewId: string, text: string): Promise<AdminReview> {
  return send(token, 'PUT', `/admin/store/reviews/${id(reviewId)}/reply`, { text })
}

export function removeReviewReply(token: string, reviewId: string): Promise<AdminReview> {
  return send(token, 'DELETE', `/admin/store/reviews/${id(reviewId)}/reply`)
}
