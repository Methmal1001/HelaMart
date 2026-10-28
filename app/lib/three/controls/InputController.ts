const EDITABLE = new Set(['INPUT', 'TEXTAREA', 'SELECT'])
const MOVEMENT_KEYS = new Set([
  'KeyW', 'KeyA', 'KeyS', 'KeyD', 'KeyQ', 'KeyE',
  'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight',
  'ShiftLeft', 'ShiftRight',
])

export interface InputHandlers {
  onClick?: (x: number, y: number) => void
  onHoverMove?: (x: number, y: number) => void
  onHoverLeave?: () => void
  onPointerLock?: (locked: boolean) => void
  onToggleView?: () => void
  onToggleLock?: () => void
}

/**
 * Unified desktop + touch input: keyboard movement, drag-to-look (mouse or
 * touch), pointer-lock mouse look, and an external joystick vector.
 */
export class InputController {
  private keys = new Set<string>()
  private look = { x: 0, y: 0 }
  private joystick = { x: 0, y: 0 }
  private drag: { id: number; x: number; y: number; moved: boolean } | null = null
  private abort = new AbortController()
  enabled = true
  /** When false, keyboard/drag only orbit the welcome camera (not movement). */
  movementEnabled = false
  locked = false

  constructor(
    private el: HTMLElement,
    private handlers: InputHandlers,
  ) {
    const opts = { signal: this.abort.signal }
    window.addEventListener('keydown', this.onKeyDown, opts)
    window.addEventListener('keyup', this.onKeyUp, opts)
    window.addEventListener('blur', this.clear, opts)
    el.addEventListener('pointerdown', this.onPointerDown, opts)
    el.addEventListener('pointermove', this.onPointerMove, opts)
    el.addEventListener('pointerup', this.onPointerUp, opts)
    el.addEventListener('pointercancel', this.onPointerUp, opts)
    el.addEventListener('pointerleave', () => this.handlers.onHoverLeave?.(), opts)
    document.addEventListener('pointerlockchange', this.onLockChange, opts)
    document.addEventListener('mousemove', this.onLockedMouseMove, opts)
  }

  private isEditableTarget(e: Event) {
    const t = e.target as HTMLElement | null
    return !!t && (EDITABLE.has(t.tagName) || t.isContentEditable)
  }

  private onKeyDown = (e: KeyboardEvent) => {
    if (!this.enabled || !this.movementEnabled || this.isEditableTarget(e) || e.ctrlKey || e.metaKey || e.altKey) return
    if (e.code === 'KeyV' && !e.repeat) this.handlers.onToggleView?.()
    if (e.code === 'KeyL' && !e.repeat) this.handlers.onToggleLock?.()
    if (!MOVEMENT_KEYS.has(e.code)) return
    // Don't steal arrow keys from focused buttons/links (keyboard UI navigation).
    const t = e.target as HTMLElement | null
    if (e.code.startsWith('Arrow') && t && t !== document.body && t !== this.el && t.tagName !== 'CANVAS') return
    this.keys.add(e.code)
    if (e.code.startsWith('Arrow')) e.preventDefault()
  }

  private onKeyUp = (e: KeyboardEvent) => {
    this.keys.delete(e.code)
  }

  clear = () => {
    this.keys.clear()
    this.joystick.x = this.joystick.y = 0
    this.drag = null
  }

  private onPointerDown = (e: PointerEvent) => {
    if (!this.enabled) return
    this.el.focus({ preventScroll: true })
    if (this.locked) {
      // In pointer-lock mode, clicking picks whatever is under the crosshair.
      const r = this.el.getBoundingClientRect()
      this.handlers.onClick?.(r.width / 2, r.height / 2)
      return
    }
    if (e.button !== 0 && e.pointerType === 'mouse') return
    this.drag = { id: e.pointerId, x: e.clientX, y: e.clientY, moved: false }
    try {
      this.el.setPointerCapture(e.pointerId)
    } catch {
      /* ignore */
    }
  }

  private onPointerMove = (e: PointerEvent) => {
    if (this.locked) return
    const r = this.el.getBoundingClientRect()
    if (this.drag && this.drag.id === e.pointerId) {
      const dx = e.clientX - this.drag.x
      const dy = e.clientY - this.drag.y
      if (!this.drag.moved && Math.hypot(dx, dy) > 6) {
        this.drag.moved = true
        this.el.style.cursor = 'grabbing'
      }
      if (this.drag.moved) {
        const k = e.pointerType === 'touch' ? 1.4 : 1
        this.look.x += dx * k
        this.look.y += dy * k
        this.drag.x = e.clientX
        this.drag.y = e.clientY
      }
      return
    }
    if (e.pointerType === 'mouse') this.handlers.onHoverMove?.(e.clientX - r.left, e.clientY - r.top)
  }

  private onPointerUp = (e: PointerEvent) => {
    if (!this.drag || this.drag.id !== e.pointerId) return
    const wasClick = !this.drag.moved
    this.drag = null
    this.el.style.cursor = ''
    try {
      this.el.releasePointerCapture(e.pointerId)
    } catch {
      /* ignore */
    }
    if (wasClick && e.type === 'pointerup') {
      const r = this.el.getBoundingClientRect()
      this.handlers.onClick?.(e.clientX - r.left, e.clientY - r.top)
    }
  }

  private onLockedMouseMove = (e: MouseEvent) => {
    if (!this.locked) return
    this.look.x += e.movementX
    this.look.y += e.movementY
  }

  private onLockChange = () => {
    this.locked = document.pointerLockElement === this.el
    this.handlers.onPointerLock?.(this.locked)
  }

  requestLock() {
    try {
      const result = this.el.requestPointerLock() as unknown
      if (result instanceof Promise) result.catch(() => this.handlers.onPointerLock?.(false))
    } catch {
      this.handlers.onPointerLock?.(false)
    }
  }

  exitLock() {
    if (document.pointerLockElement === this.el) document.exitPointerLock()
  }

  setJoystick(x: number, y: number) {
    this.joystick.x = x
    this.joystick.y = y
  }

  /** Movement axes in [-1, 1]; forward is positive. */
  axes() {
    const k = (c: string) => (this.keys.has(c) ? 1 : 0)
    const forward = k('KeyW') + k('ArrowUp') - k('KeyS') - k('ArrowDown') + this.joystick.y
    const strafe = k('KeyD') - k('KeyA') + this.joystick.x
    const turn = k('ArrowRight') + k('KeyE') - k('ArrowLeft') - k('KeyQ')
    const run = this.keys.has('ShiftLeft') || this.keys.has('ShiftRight') || Math.hypot(this.joystick.x, this.joystick.y) > 0.92
    return {
      forward: Math.max(-1, Math.min(1, forward)),
      strafe: Math.max(-1, Math.min(1, strafe)),
      turn,
      run,
    }
  }

  consumeLook() {
    const l = { x: this.look.x, y: this.look.y }
    this.look.x = this.look.y = 0
    return l
  }

  dispose() {
    this.exitLock()
    this.abort.abort()
  }
}
