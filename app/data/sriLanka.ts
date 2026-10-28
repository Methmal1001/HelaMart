/** Sri Lankan reference data and validators shared by forms and the (mock) API. */

export const DISTRICTS = [
  'Colombo', 'Gampaha', 'Kalutara', 'Kandy', 'Matale', 'Nuwara Eliya', 'Galle', 'Matara', 'Hambantota',
  'Jaffna', 'Kilinochchi', 'Mannar', 'Vavuniya', 'Mullaitivu', 'Batticaloa', 'Ampara', 'Trincomalee',
  'Kurunegala', 'Puttalam', 'Anuradhapura', 'Polonnaruwa', 'Badulla', 'Monaragala', 'Ratnapura', 'Kegalle',
] as const

export type District = (typeof DISTRICTS)[number]

export const PROVINCE_OF: Record<District, string> = {
  Colombo: 'Western', Gampaha: 'Western', Kalutara: 'Western',
  Kandy: 'Central', Matale: 'Central', 'Nuwara Eliya': 'Central',
  Galle: 'Southern', Matara: 'Southern', Hambantota: 'Southern',
  Jaffna: 'Northern', Kilinochchi: 'Northern', Mannar: 'Northern', Vavuniya: 'Northern', Mullaitivu: 'Northern',
  Batticaloa: 'Eastern', Ampara: 'Eastern', Trincomalee: 'Eastern',
  Kurunegala: 'North Western', Puttalam: 'North Western',
  Anuradhapura: 'North Central', Polonnaruwa: 'North Central',
  Badulla: 'Uva', Monaragala: 'Uva',
  Ratnapura: 'Sabaragamuwa', Kegalle: 'Sabaragamuwa',
}

/** National Identity Card: old format (9 digits + V/X) or new format (12 digits). */
export function isValidNic(value: string) {
  const v = value.trim().toUpperCase()
  return /^\d{9}[VX]$/.test(v) || /^(19|20)\d{10}$/.test(v)
}

/** Business registration number, e.g. "PV 00123456", "PB 1234", "W/12345", "GA 1234". */
export function isValidBrNumber(value: string) {
  return /^[A-Z]{1,3}\s?\/?\s?\d{3,9}$/.test(value.trim().toUpperCase())
}
