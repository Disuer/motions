import type { PointerEvent as ReactPointerEvent } from 'react'
import { AnimationSpec, Frame, effectivePpu } from './spec'
import { LoadedAsset } from './fs'

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
  /** World-unit delta from dragging the current frame with the left button. */
  onDragFrame: (dx: number, dy: number) => void
}

export default function Canvas({
  spec, assets, index, onionSkin, zoom, pan, onPan, onDragFrame,
}: Props) {
  const z = BASE_Z * zoom
  const point = spec.filter === 'point'

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
      className="relative h-full w-full cursor-move overflow-hidden bg-neutral-100"
      onPointerDown={onPointerDown}
      onContextMenu={(e) => e.preventDefault()}
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
