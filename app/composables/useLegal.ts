import type { LegalKey } from '~/data/legal'

let resolver: ((agreed: boolean) => void) | null = null

/** The Terms of Order / Privacy Policy reader (one overlay for the whole storefront). */
export function useLegal() {
  const openDoc = useState<LegalKey | null>('legal-open', () => null)
  const acceptable = useState<boolean>('legal-acceptable', () => false)

  /** Opens a document. With `acceptable`, it ends with an "I agree" button and resolves true when pressed. */
  function read(key: LegalKey, opts: { acceptable?: boolean } = {}): Promise<boolean> {
    resolver?.(false)
    acceptable.value = !!opts.acceptable
    openDoc.value = key
    return new Promise((resolve) => (resolver = resolve))
  }

  function close(agreed = false) {
    openDoc.value = null
    const r = resolver
    resolver = null
    r?.(agreed)
  }

  return { openDoc, acceptable, read, close }
}
