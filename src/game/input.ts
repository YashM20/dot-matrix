/**
 * Input map (browser side): keyboard, Gamepad API and the on-screen touch pad all fold into one
 * button mask per sim step (`BTN`), plus mouse / right-stick look for the corridor. The sim only
 * ever sees `StepInput`, so a replay is just the list of what `read()` returned.
 */
import { BTN, type StepInput } from './buttons'

export const KEYMAP: Record<string, number> = {
  ArrowLeft: BTN.left, KeyA: BTN.left, ArrowRight: BTN.right, KeyD: BTN.right,
  ArrowUp: BTN.up, KeyW: BTN.up, ArrowDown: BTN.down, KeyS: BTN.down,
  Space: BTN.a, KeyJ: BTN.a, KeyZ: BTN.a,
  ShiftLeft: BTN.b, ShiftRight: BTN.b, KeyX: BTN.b, KeyK: BTN.b,
  Enter: BTN.start, KeyP: BTN.start,
  KeyQ: BTN.strafeL, KeyE: BTN.strafeR,
}
const DEAD = .35

export class GameInput {
  /** Buttons held on the keyboard / the touch pad. */
  keys = 0
  touch = 0
  /** Mouse look accumulated since the last step (mrad). */
  private look = 0
  /** Was any gamepad seen (for the on-screen hint)? */
  padSeen = false

  /** Listen on `target`; returns the detach function. `onEscape` fires on Escape. */
  attach(target: Window, onEscape: () => void): () => void {
    const down = (e: KeyboardEvent) => {
      if (e.code === 'Escape') { onEscape(); return }
      const b = KEYMAP[e.code]
      if (!b) return
      e.preventDefault()
      this.keys |= b
    }
    const up = (e: KeyboardEvent) => { const b = KEYMAP[e.code]; if (b) this.keys &= ~b }
    const clear = () => { this.keys = 0; this.touch = 0 }
    const move = (e: MouseEvent) => { if (document.pointerLockElement) this.look += e.movementX * 2.2 }
    target.addEventListener('keydown', down)
    target.addEventListener('keyup', up)
    target.addEventListener('blur', clear)
    target.addEventListener('mousemove', move)
    return () => {
      target.removeEventListener('keydown', down)
      target.removeEventListener('keyup', up)
      target.removeEventListener('blur', clear)
      target.removeEventListener('mousemove', move)
    }
  }

  /** Standard-mapping gamepad → buttons (+ right-stick look). */
  private pad(): { b: number; look: number } {
    const pads = typeof navigator !== 'undefined' && navigator.getGamepads ? navigator.getGamepads() : []
    let b = 0, look = 0
    for (const p of pads) {
      if (!p || !p.connected) continue
      this.padSeen = true
      const on = (i: number) => !!p.buttons[i]?.pressed
      const [x = 0, y = 0, rx = 0] = p.axes
      if (x < -DEAD || on(14)) b |= BTN.left
      if (x > DEAD || on(15)) b |= BTN.right
      if (y < -DEAD || on(12)) b |= BTN.up
      if (y > DEAD || on(13)) b |= BTN.down
      if (on(0) || on(2) || on(7)) b |= BTN.a
      if (on(1) || on(3) || on(6)) b |= BTN.b
      if (on(9) || on(8)) b |= BTN.start
      if (on(4)) b |= BTN.strafeL
      if (on(5)) b |= BTN.strafeR
      if (Math.abs(rx) > .2) look += rx * 40
    }
    return { b, look }
  }

  /** The input for one sim step (consumes the accumulated look). */
  read(): StepInput {
    const p = this.pad(), look = Math.round(this.look + p.look)
    this.look = 0
    return look ? { b: this.keys | this.touch | p.b, look } : { b: this.keys | this.touch | p.b }
  }
}
