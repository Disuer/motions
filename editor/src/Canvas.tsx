import { useEffect, useRef, type PointerEvent as ReactPointerEvent } from 'react'
import { AnimationSpec, Frame, effectivePpu } from './spec'
import { LoadedAsset } from './fs'

/** The zoom range, shared by the wheel and the slider so the two cannot disagree. */
export const ZOOM_MIN = 0.25
export const ZOOM_MAX = 4

export function clampZoom(z: number): number {
  return Number.isFinite(z) ? Math.min(ZOOM_MAX, Math.max(ZOOM_MIN, z)) : 1
}

/**
 * How fast the wheel zooms. Applied as an exponent rather than a multiplier so a notch changes
 * the view by the same proportion at every zoom level, instead of crawling when zoomed out and
 * jumping when zoomed in.
 */
const WHEEL_SENSITIVITY = 0.0015

/**
 * Keeps the point under the pointer where it is while the zoom changes, by moving the pan the
 * complement of the zoom. Without it the view zooms towards the centre and whatever you were
 * looking at slides off, which means a pan after every zoom.
 *
 * `u` is the cursor's offset from the origin in screen pixels; scaling by the zoom ratio and
 * taking the difference is what holds it still.
 */
export function zoomAbout(
  pan: { x: number; y: number },
  cursor: { x: number; y: number },
  ratio: number,
): { x: number; y: number } {
  return {
    x: pan.x + (cursor.x - pan.x) * (1 - ratio),
    y: pan.y + (cursor.y - pan.y) * (1 - ratio),
  }
}

/** Where a frame sits, in world units. Bottom-centre anchored, exactly like the runtime pivot. */
export function frameRect(asset: LoadedAsset, frame: Frame, ppu: number) {
  const ep = effectivePpu(ppu, frame.scale)
  const width = asset.width / ep
  const height = asset.height / ep
  return {
    left: -width / 2 + frame.offset[0],
    bottom: frame.offset[1],
    width,
    height,
  }
}

/** Screen pixels per world unit at zoom 1. The 2-unit guide box is then 240px tall. */
export const BASE_Z = 120

interface Props {
  spec: AnimationSpec
  assets: Map<string, LoadedAsset>
  index: number
  onionSkin: boolean
  zoom: number
  /** Viewport pan, in screen pixels. */
  pan: { x: number; y: number }
  onPan: (p: { x: number; y: number }) => void
  onZoom: (z: number) => void
  /** World-unit delta from dragging the current frame with the left button. */
  onDragFrame: (dx: number, dy: number) => void
}

export default function Canvas({
  spec, assets, index, onionSkin, zoom, pan, onPan, onZoom, onDragFrame,
}: Props) {
  const z = BASE_Z * zoom
  const point = spec.filter === 'point'
  const box = useRef<HTMLDivElement>(null)

  // The wheel handler is bound once and reads through a ref, rather than being rebound whenever
  // the pan changes: dragging a frame re-renders on every pointermove, and rebinding a listener
  // at that rate to capture fresh props is a lot of churn for values a ref holds for free.
  const latest = useRef({ zoom, pan, onPan, onZoom })
  latest.current = { zoom, pan, onPan, onZoom }

  useEffect(() => {
    const el = box.current
    if (!el) return

    function onWheel(e: WheelEvent) {
      // Bound with passive: false because of this. React attaches its own wheel listeners
      // passively, so an onWheel prop cannot stop the page scrolling behind the canvas.
      e.preventDefault()
      const { zoom: current, pan: at, onPan: pan_, onZoom: zoom_ } = latest.current
      const rect = el!.getBoundingClientRect()

      // deltaMode 1 is lines and 2 is pages; normalised so a mouse wheel and a trackpad agree.
      const unit = e.deltaMode === 1 ? 16 : e.deltaMode === 2 ? rect.height : 1
      const next = clampZoom(current * Math.exp(-e.deltaY * unit * WHEEL_SENSITIVITY))
      if (next === current) return

      // Cursor relative to the canvas centre, which is where the origin sits at pan 0,0.
      const cursor = {
        x: e.clientX - rect.left - rect.width / 2,
        y: e.clientY - rect.top - rect.height / 2,
      }
      pan_(zoomAbout(at, cursor, next / current))
      zoom_(next)
    }

    el.addEventListener('wheel', onWheel, { passive: false })
    return () => el.removeEventListener('wheel', onWheel)
  }, [])

  // The origin is the character's feet: horizontally centred, sitting on the ground line.
  const originX = pan.x
  const originY = pan.y

  /**
   * Left button drags the current frame, middle or right button pans the viewport. Both work
   * on deltas so there is no hit-testing and no pointer-capture bookkeeping.
   */
  function onPointerDown(e: ReactPointerEvent) {
    if (e.button === 0 && spec.frames[index] === undefined) return
    e.preventDefault()
    let lastX = e.clientX
    let lastY = e.clientY
    const panning = e.button !== 0
    let px = pan.x
    let py = pan.y

    const move = (ev: PointerEvent) => {
      const dx = ev.clientX - lastX
      const dy = ev.clientY - lastY
      lastX = ev.clientX
      lastY = ev.clientY
      if (panning) {
        px += dx
        py += dy
        onPan({ x: px, y: py })
      } else {
        // screen y grows downward; world y grows upward
        onDragFrame(dx / z, -dy / z)
      }
    }
    const up = () => {
      window.removeEventListener('pointermove', move)
      window.removeEventListener('pointerup', up)
    }
    window.addEventListener('pointermove', move)
    window.addEventListener('pointerup', up)
  }

  function imgFor(i: number, opacity: number, key: string) {
    const frame = spec.frames[i]
    if (!frame) return null
    const asset = assets.get(frame.sprite)
    if (!asset || asset.width === 0) return null

    const r = frameRect(asset, frame, spec.ppu)
    return (
      <img
        key={key}
        src={asset.url}
        alt=""
        draggable={false}
        style={{
          position: 'absolute',
          left: `calc(50% + ${originX + r.left * z}px)`,
          // screen y grows downward, so the frame's TOP is bottom + height above the ground
          top: `calc(50% + ${originY - (r.bottom + r.height) * z}px)`,
          width: r.width * z,
          height: r.height * z,
          opacity,
          imageRendering: point ? 'pixelated' : 'auto',
          pointerEvents: 'none',
        }}
      />
    )
  }

  return (
    <div
      ref={box}
      className="relative h-full w-full cursor-move overflow-hidden bg-neutral-100"
      onPointerDown={onPointerDown}
      onContextMenu={(e) => e.preventDefault()}
      title="Scroll to zoom. Left drag moves the frame, middle or right drag pans."
    >
      {/* 0.5u grid */}
      <div
        className="absolute inset-0"
        style={{
          backgroundImage:
            'linear-gradient(to right, rgba(0,0,0,.06) 1px, transparent 1px),' +
            'linear-gradient(to bottom, rgba(0,0,0,.06) 1px, transparent 1px)',
          backgroundSize: `${z / 2}px ${z / 2}px`,
          backgroundPosition: `calc(50% + ${originX}px) calc(50% + ${originY}px)`,
        }}
      />

      {/* guide box: 1 x 2 world units, the size of a vanilla character */}
      <div
        className="absolute border border-dashed border-sky-500/60"
        style={{
          left: `calc(50% + ${originX - 0.5 * z}px)`,
          top: `calc(50% + ${originY - 2 * z}px)`,
          width: 1 * z,
          height: 2 * z,
        }}
      />

      {/* ground line at y = 0 */}
      <div
        className="absolute h-px w-full bg-sky-600"
        style={{ top: `calc(50% + ${originY}px)`, left: 0 }}
      />

      {onionSkin && imgFor(index - 1, 0.25, 'prev')}
      {onionSkin && imgFor(index + 1, 0.25, 'next')}
      {imgFor(index, 1, 'current')}
    </div>
  )
}
