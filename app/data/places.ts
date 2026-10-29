import type { District } from './sriLanka'

/**
 * Sri Lankan towns with approximate coordinates (WGS84), used to place
 * branches on the map and to find supermarkets near a shopper. A real backend
 * would use a geocoding service; this offline gazetteer keeps the prototype
 * self-contained.
 */

export interface Place {
  name: string
  district: District
  lat: number
  lng: number
}

const T = (name: string, district: District, lat: number, lng: number): Place => ({ name, district, lat, lng })

export const PLACES: Place[] = [
  // Colombo
  T('Colombo', 'Colombo', 6.9271, 79.8612), T('Dehiwala', 'Colombo', 6.851, 79.866), T('Mount Lavinia', 'Colombo', 6.838, 79.863),
  T('Moratuwa', 'Colombo', 6.773, 79.882), T('Nugegoda', 'Colombo', 6.872, 79.889), T('Maharagama', 'Colombo', 6.848, 79.926),
  T('Kottawa', 'Colombo', 6.841, 79.965), T('Homagama', 'Colombo', 6.844, 80.002), T('Battaramulla', 'Colombo', 6.900, 79.918),
  T('Rajagiriya', 'Colombo', 6.909, 79.894), T('Kaduwela', 'Colombo', 6.936, 79.984), T('Avissawella', 'Colombo', 6.955, 80.210),
  T('Piliyandala', 'Colombo', 6.801, 79.922), T('Padukka', 'Colombo', 6.840, 80.090), T('Kolonnawa', 'Colombo', 6.930, 79.890),
  // Gampaha
  T('Gampaha', 'Gampaha', 7.0917, 79.9997), T('Negombo', 'Gampaha', 7.2083, 79.8358), T('Divulapitiya', 'Gampaha', 7.2236, 80.0156),
  T('Ja-Ela', 'Gampaha', 7.075, 79.891), T('Wattala', 'Gampaha', 6.990, 79.890), T('Kelaniya', 'Gampaha', 6.955, 79.920),
  T('Kadawatha', 'Gampaha', 7.001, 79.953), T('Ragama', 'Gampaha', 7.030, 79.922), T('Kiribathgoda', 'Gampaha', 6.980, 79.930),
  T('Minuwangoda', 'Gampaha', 7.170, 79.950), T('Veyangoda', 'Gampaha', 7.155, 80.096), T('Nittambuwa', 'Gampaha', 7.140, 80.100),
  T('Mirigama', 'Gampaha', 7.241, 80.130), T('Katunayake', 'Gampaha', 7.170, 79.880), T('Kandana', 'Gampaha', 7.050, 79.893),
  T('Seeduwa', 'Gampaha', 7.120, 79.880),
  // Kalutara
  T('Kalutara', 'Kalutara', 6.5854, 79.9607), T('Panadura', 'Kalutara', 6.7132, 79.9026), T('Horana', 'Kalutara', 6.7159, 80.0626),
  T('Beruwala', 'Kalutara', 6.4788, 79.9828), T('Matugama', 'Kalutara', 6.522, 80.114), T('Aluthgama', 'Kalutara', 6.434, 80.000),
  T('Bandaragama', 'Kalutara', 6.714, 79.990), T('Wadduwa', 'Kalutara', 6.667, 79.927),
  // Kandy
  T('Kandy', 'Kandy', 7.2906, 80.6337), T('Peradeniya', 'Kandy', 7.270, 80.597), T('Katugastota', 'Kandy', 7.330, 80.620),
  T('Gampola', 'Kandy', 7.165, 80.574), T('Nawalapitiya', 'Kandy', 7.050, 80.530), T('Kundasale', 'Kandy', 7.280, 80.680),
  T('Digana', 'Kandy', 7.290, 80.750), T('Akurana', 'Kandy', 7.367, 80.618),
  // Matale
  T('Matale', 'Matale', 7.4675, 80.6234), T('Dambulla', 'Matale', 7.860, 80.650), T('Sigiriya', 'Matale', 7.957, 80.760), T('Galewela', 'Matale', 7.760, 80.570),
  // Nuwara Eliya
  T('Nuwara Eliya', 'Nuwara Eliya', 6.9497, 80.7891), T('Hatton', 'Nuwara Eliya', 6.8916, 80.5955), T('Talawakelle', 'Nuwara Eliya', 6.937, 80.660),
  // Galle
  T('Galle', 'Galle', 6.0535, 80.2210), T('Hikkaduwa', 'Galle', 6.140, 80.100), T('Ambalangoda', 'Galle', 6.235, 80.054),
  T('Elpitiya', 'Galle', 6.290, 80.160), T('Karapitiya', 'Galle', 6.070, 80.230), T('Baddegama', 'Galle', 6.170, 80.180),
  // Matara
  T('Matara', 'Matara', 5.9549, 80.5550), T('Weligama', 'Matara', 5.972, 80.430), T('Akuressa', 'Matara', 6.100, 80.480),
  T('Dikwella', 'Matara', 5.970, 80.690), T('Deniyaya', 'Matara', 6.340, 80.560),
  // Hambantota
  T('Hambantota', 'Hambantota', 6.1241, 81.1185), T('Tangalle', 'Hambantota', 6.024, 80.795), T('Tissamaharama', 'Hambantota', 6.280, 81.290),
  T('Ambalantota', 'Hambantota', 6.120, 81.020),
  // North
  T('Jaffna', 'Jaffna', 9.6615, 80.0255), T('Chavakachcheri', 'Jaffna', 9.660, 80.160), T('Point Pedro', 'Jaffna', 9.820, 80.230),
  T('Nallur', 'Jaffna', 9.670, 80.030), T('Kilinochchi', 'Kilinochchi', 9.3803, 80.3770), T('Mannar', 'Mannar', 8.9810, 79.9044),
  T('Vavuniya', 'Vavuniya', 8.7514, 80.4971), T('Mullaitivu', 'Mullaitivu', 9.2671, 80.8142),
  // East
  T('Batticaloa', 'Batticaloa', 7.7102, 81.6924), T('Kattankudy', 'Batticaloa', 7.680, 81.730), T('Eravur', 'Batticaloa', 7.770, 81.600),
  T('Ampara', 'Ampara', 7.2975, 81.6820), T('Kalmunai', 'Ampara', 7.410, 81.830), T('Akkaraipattu', 'Ampara', 7.220, 81.850),
  T('Trincomalee', 'Trincomalee', 8.5874, 81.2152), T('Kinniya', 'Trincomalee', 8.490, 81.180),
  // North Western
  T('Kurunegala', 'Kurunegala', 7.4818, 80.3609), T('Kuliyapitiya', 'Kurunegala', 7.470, 80.040), T('Narammala', 'Kurunegala', 7.430, 80.210),
  T('Pannala', 'Kurunegala', 7.330, 80.020), T('Wariyapola', 'Kurunegala', 7.620, 80.240), T('Polgahawela', 'Kurunegala', 7.330, 80.300),
  T('Mawathagama', 'Kurunegala', 7.430, 80.440), T('Puttalam', 'Puttalam', 8.0362, 79.8283), T('Chilaw', 'Puttalam', 7.5758, 79.7953),
  T('Wennappuwa', 'Puttalam', 7.350, 79.850), T('Marawila', 'Puttalam', 7.410, 79.830), T('Nattandiya', 'Puttalam', 7.410, 79.870),
  // North Central
  T('Anuradhapura', 'Anuradhapura', 8.3114, 80.4037), T('Kekirawa', 'Anuradhapura', 8.040, 80.600), T('Medawachchiya', 'Anuradhapura', 8.540, 80.490),
  T('Eppawala', 'Anuradhapura', 8.150, 80.420), T('Polonnaruwa', 'Polonnaruwa', 7.9403, 81.0188), T('Kaduruwela', 'Polonnaruwa', 7.930, 81.030),
  T('Hingurakgoda', 'Polonnaruwa', 8.040, 80.950),
  // Uva
  T('Badulla', 'Badulla', 6.9934, 81.0550), T('Bandarawela', 'Badulla', 6.8259, 80.9982), T('Haputale', 'Badulla', 6.768, 80.958),
  T('Welimada', 'Badulla', 6.900, 80.910), T('Mahiyanganaya', 'Badulla', 7.320, 81.000), T('Monaragala', 'Monaragala', 6.8728, 81.3510),
  T('Wellawaya', 'Monaragala', 6.730, 81.100), T('Bibile', 'Monaragala', 7.160, 81.220),
  // Sabaragamuwa
  T('Ratnapura', 'Ratnapura', 6.6828, 80.3992), T('Balangoda', 'Ratnapura', 6.650, 80.700), T('Embilipitiya', 'Ratnapura', 6.340, 80.850),
  T('Pelmadulla', 'Ratnapura', 6.620, 80.540), T('Eheliyagoda', 'Ratnapura', 6.850, 80.270), T('Kegalle', 'Kegalle', 7.2513, 80.3464),
  T('Mawanella', 'Kegalle', 7.250, 80.450), T('Warakapola', 'Kegalle', 7.230, 80.200), T('Rambukkana', 'Kegalle', 7.320, 80.390),
]

/** Rough outline of the island (lat, lng), clockwise from the Jaffna peninsula — for the 3D area map. */
export const ISLAND_OUTLINE: [number, number][] = [
  [9.66, 79.90], [9.76, 80.0], [9.83, 80.25], [9.74, 80.42], [9.55, 80.56], [9.38, 80.70], [9.25, 80.83], [9.02, 80.98],
  [8.80, 81.10], [8.57, 81.24], [8.34, 81.38], [8.08, 81.50], [7.88, 81.60], [7.70, 81.71], [7.45, 81.82], [7.20, 81.87],
  [6.95, 81.86], [6.72, 81.80], [6.48, 81.68], [6.30, 81.50], [6.18, 81.28], [6.11, 81.10], [6.02, 80.86], [5.94, 80.65],
  [5.92, 80.52], [5.97, 80.38], [6.03, 80.22], [6.15, 80.10], [6.32, 80.02], [6.50, 79.97], [6.70, 79.90], [6.90, 79.85],
  [7.10, 79.83], [7.30, 79.82], [7.55, 79.79], [7.80, 79.78], [8.05, 79.72], [8.30, 79.77], [8.55, 79.87], [8.78, 79.92],
  [8.98, 79.88], [9.10, 79.92], [9.30, 80.05], [9.45, 80.12], [9.52, 80.02], [9.58, 79.92],
]

/** Island bounds (for validating coordinates sent to the API). */
export const SRI_LANKA_BOUNDS = { minLat: 5.85, maxLat: 9.9, minLng: 79.5, maxLng: 81.95 }

export function inSriLanka(lat: number, lng: number) {
  const b = SRI_LANKA_BOUNDS
  return Number.isFinite(lat) && Number.isFinite(lng) && lat >= b.minLat && lat <= b.maxLat && lng >= b.minLng && lng <= b.maxLng
}

/** Great-circle distance in km. */
export function distanceKm(a: { lat: number; lng: number }, b: { lat: number; lng: number }) {
  const R = 6371
  const dLat = ((b.lat - a.lat) * Math.PI) / 180
  const dLng = ((b.lng - a.lng) * Math.PI) / 180
  const s = Math.sin(dLat / 2) ** 2 + Math.cos((a.lat * Math.PI) / 180) * Math.cos((b.lat * Math.PI) / 180) * Math.sin(dLng / 2) ** 2
  return 2 * R * Math.asin(Math.min(1, Math.sqrt(s)))
}

const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, '')

export function findPlace(name: string, district?: string): Place | undefined {
  const n = norm(name)
  if (!n) return undefined
  return PLACES.find((p) => norm(p.name) === n && (!district || p.district === district)) ?? PLACES.find((p) => norm(p.name) === n)
}

/** Town search for autocompletes: prefix matches first, then district matches. */
export function searchPlaces(query: string, limit = 8): Place[] {
  const q = norm(query)
  if (!q) return []
  const starts = PLACES.filter((p) => norm(p.name).startsWith(q))
  const contains = PLACES.filter((p) => !starts.includes(p) && norm(p.name).includes(q))
  const byDistrict = PLACES.filter((p) => !starts.includes(p) && !contains.includes(p) && norm(p.district).startsWith(q))
  return [...starts, ...contains, ...byDistrict].slice(0, limit)
}

export function nearestPlace(lat: number, lng: number): Place {
  let best = PLACES[0]!
  let bestD = Infinity
  for (const p of PLACES) {
    const d = distanceKm(p, { lat, lng })
    if (d < bestD) {
      bestD = d
      best = p
    }
  }
  return best
}

/** Centre of a district (mean of its towns). */
export function districtCentre(district: string): { lat: number; lng: number } | null {
  const towns = PLACES.filter((p) => p.district === district)
  if (!towns.length) return null
  return { lat: towns.reduce((s, p) => s + p.lat, 0) / towns.length, lng: towns.reduce((s, p) => s + p.lng, 0) / towns.length }
}

/** Where a branch is: its saved pin, else its town, else its district centre. */
export function locateBranch(b: { lat?: number; lng?: number; city: string; district: string }): { lat: number; lng: number; exact: boolean } {
  if (b.lat !== undefined && b.lng !== undefined) return { lat: b.lat, lng: b.lng, exact: true }
  const town = findPlace(b.city, b.district)
  if (town) return { lat: town.lat, lng: town.lng, exact: true }
  return { ...(districtCentre(b.district) ?? { lat: 7.87, lng: 80.77 }), exact: false }
}
