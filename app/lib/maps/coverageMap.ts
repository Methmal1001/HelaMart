import type { LatLng } from '../geo'

/**
 * Map for drawing a branch's delivery area.
 *
 *  - Google Maps when NUXT_PUBLIC_GOOGLE_MAPS_API_KEY is set (editable polygon:
 *    click to add corners, drag to adjust, right-click a corner to delete)
 *  - otherwise OpenStreetMap via Leaflet, with the same controls, so the
 *    feature works without a key during development
 */

export interface CoverageMapOptions {
  center: { lat: number; lng: number }
  branchName: string
  polygon: LatLng[]
  color: string
  onChange: (polygon: LatLng[]) => void
  googleKey?: string
}

export interface CoverageMap {
  provider: 'google' | 'osm'
  setPolygon(polygon: LatLng[], fit?: boolean): void
  setTowns(towns: { name: string; lat: number; lng: number; included: boolean }[]): void
  destroy(): void
}

const round = (n: number) => Math.round(n * 1e5) / 1e5

export async function createCoverageMap(el: HTMLElement, opts: CoverageMapOptions): Promise<CoverageMap> {
  if (opts.googleKey) {
    try {
      return await createGoogle(el, opts)
    } catch (e) {
      console.warn('[HelaMart] Google Maps unavailable, using OpenStreetMap', e)
    }
  }
  return createLeaflet(el, opts)
}

// ------------------------------------------------------------------ Google Maps

/* eslint-disable @typescript-eslint/no-explicit-any */
let googleLoading: Promise<any> | null = null
function loadGoogle(key: string): Promise<any> {
  const w = window as any
  if (w.google?.maps?.Polygon) return Promise.resolve(w.google)
  if (!googleLoading) {
    googleLoading = new Promise((resolve, reject) => {
      const cb = `__hmGoogleMaps${Date.now()}`
      w[cb] = () => resolve(w.google)
      const s = document.createElement('script')
      s.src = `https://maps.googleapis.com/maps/api/js?key=${encodeURIComponent(key)}&v=weekly&loading=async&callback=${cb}`
      s.async = true
      s.referrerPolicy = 'strict-origin'
      s.onerror = () => reject(new Error('Google Maps failed to load'))
      document.head.appendChild(s)
    })
  }
  return googleLoading
}

async function createGoogle(el: HTMLElement, opts: CoverageMapOptions): Promise<CoverageMap> {
  const google = await loadGoogle(opts.googleKey!)
  const g = google.maps
  const map = new g.Map(el, { center: opts.center, zoom: 12, mapTypeControl: false, streetViewControl: false, clickableIcons: false, gestureHandling: 'greedy' })
  new g.Circle({ map, center: opts.center, radius: 120, strokeColor: '#174D38', strokeWeight: 3, fillColor: '#E1C987', fillOpacity: 1, clickable: false })
  const polygon = new g.Polygon({ map, paths: [], editable: true, strokeColor: opts.color, strokeWeight: 3, fillColor: opts.color, fillOpacity: 0.22 })
  let listeners: any[] = []
  let towns: any[] = []
  const emit = () => opts.onChange(polygon.getPath().getArray().map((p: any) => [round(p.lat()), round(p.lng())] as LatLng))
  const bindPath = () => {
    listeners.forEach((l) => l.remove())
    const path = polygon.getPath()
    listeners = ['set_at', 'insert_at', 'remove_at'].map((ev) => path.addListener(ev, emit))
  }
  const setPolygon = (pts: LatLng[], fit = false) => {
    polygon.setPath(pts.map(([lat, lng]) => ({ lat, lng })))
    bindPath()
    if (fit && pts.length) {
      const b = new g.LatLngBounds()
      pts.forEach(([lat, lng]) => b.extend({ lat, lng }))
      map.fitBounds(b, 40)
    }
  }
  map.addListener('click', (e: any) => polygon.getPath().push(e.latLng))
  polygon.addListener('rightclick', (e: any) => e.vertex !== undefined && polygon.getPath().removeAt(e.vertex))
  setPolygon(opts.polygon, true)
  return {
    provider: 'google',
    setPolygon,
    setTowns(list) {
      towns.forEach((t) => t.setMap(null))
      towns = list.map(
        (t) =>
          new g.Circle({ map, center: { lat: t.lat, lng: t.lng }, radius: 220, strokeWeight: 1, strokeColor: t.included ? '#174D38' : '#6b7280', fillColor: t.included ? '#2f8a5a' : '#9ca3af', fillOpacity: 0.85, clickable: false }),
      )
    },
    destroy() {
      listeners.forEach((l) => l.remove())
      towns.forEach((t) => t.setMap(null))
      g.event.clearInstanceListeners(map)
      el.innerHTML = ''
    },
  }
}
/* eslint-enable @typescript-eslint/no-explicit-any */

// ------------------------------------------------------------------ OpenStreetMap (Leaflet)

async function createLeaflet(el: HTMLElement, opts: CoverageMapOptions): Promise<CoverageMap> {
  const L = (await import('leaflet')).default
  await import('leaflet/dist/leaflet.css')
  const map = L.map(el, { zoomControl: true, doubleClickZoom: false }).setView([opts.center.lat, opts.center.lng], 12)
  // OpenStreetMap's tile policy requires a referrer; send the site origin only.
  const tiles = L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', { maxZoom: 19, attribution: '© OpenStreetMap contributors', referrerPolicy: 'strict-origin' }).addTo(map)
  // If imagery can't load (offline / blocked), say so — drawing still works, and town dots show where places are.
  let tileErrors = 0
  let tileOk = false
  tiles.on('tileload', () => (tileOk = true))
  tiles.on('tileerror', () => {
    if (tileOk || ++tileErrors !== 6) return
    const note = document.createElement('div')
    note.className = 'hm-cov-offline'
    note.textContent = 'Street map couldn’t load (check your connection). You can still draw the area — dots mark nearby towns.'
    el.appendChild(note)
  })
  L.circleMarker([opts.center.lat, opts.center.lng], { radius: 8, color: '#174D38', weight: 3, fillColor: '#E1C987', fillOpacity: 1 }).bindTooltip(opts.branchName, { permanent: true, direction: 'top', offset: [0, -8] }).addTo(map)

  let pts: LatLng[] = []
  const shape = L.polygon([], { color: opts.color, weight: 3, fillOpacity: 0.22 }).addTo(map)
  const handles = L.layerGroup().addTo(map)
  const townLayer = L.layerGroup().addTo(map)
  const corner = L.divIcon({ className: 'hm-cov-corner', iconSize: [16, 16] })
  const mid = L.divIcon({ className: 'hm-cov-mid', iconSize: [12, 12] })

  const changed = () => opts.onChange(pts.map(([a, b]) => [a, b] as LatLng))
  function draw() {
    shape.setLatLngs(pts)
    handles.clearLayers()
    pts.forEach((p, i) => {
      const m = L.marker(p, { icon: corner, draggable: true, keyboard: false, title: 'Drag to move · right-click to delete' })
      m.on('drag', (e) => {
        const ll = (e.target as L.Marker).getLatLng()
        pts[i] = [round(ll.lat), round(ll.lng)]
        shape.setLatLngs(pts)
      })
      m.on('dragend', () => {
        draw()
        changed()
      })
      m.on('contextmenu', () => {
        pts.splice(i, 1)
        draw()
        changed()
      })
      handles.addLayer(m)
    })
    // Midpoint handles: click to add a corner between two others.
    if (pts.length >= 2) {
      pts.forEach((p, i) => {
        const q = pts[(i + 1) % pts.length]!
        if (pts.length === 2 && i === 1) return
        const m = L.marker([(p[0] + q[0]) / 2, (p[1] + q[1]) / 2], { icon: mid, keyboard: false, title: 'Click to add a corner here' })
        m.on('click', (e) => {
          L.DomEvent.stopPropagation(e)
          pts.splice(i + 1, 0, [round((p[0] + q[0]) / 2), round((p[1] + q[1]) / 2)])
          draw()
          changed()
        })
        handles.addLayer(m)
      })
    }
  }
  map.on('click', (e) => {
    pts.push([round(e.latlng.lat), round(e.latlng.lng)])
    draw()
    changed()
  })
  const setPolygon = (next: LatLng[], fit = false) => {
    pts = next.map(([a, b]) => [a, b] as LatLng)
    draw()
    if (fit && pts.length >= 2) map.fitBounds(L.latLngBounds(pts), { padding: [30, 30] })
  }
  setPolygon(opts.polygon, true)
  // The editor often opens inside an animated dialog: re-measure once it has settled.
  setTimeout(() => map.invalidateSize(), 250)

  return {
    provider: 'osm',
    setPolygon,
    setTowns(list) {
      townLayer.clearLayers()
      for (const t of list) {
        L.circleMarker([t.lat, t.lng], { radius: 5, weight: 1.5, color: t.included ? '#174D38' : '#6b7280', fillColor: t.included ? '#2f8a5a' : '#ffffff', fillOpacity: 0.95 })
          .bindTooltip(t.name, { direction: 'top' })
          .addTo(townLayer)
      }
    },
    destroy() {
      map.remove()
    },
  }
}
