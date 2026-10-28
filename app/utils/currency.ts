const lkr = new Intl.NumberFormat('en-LK', {
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
})

/** Formats LKR cents as "Rs. 1,250.00". */
export function formatLKR(cents: number): string {
  return `Rs. ${lkr.format(cents / 100)}`
}
