import { useRef, useState } from 'react'
import { AnimationSpec, DEFAULT_FPS } from './spec'

interface Props {
  spec: AnimationSpec
  index: number
  /** Current preview time in seconds, or null when not playing. */
  playhead: number | null
  onPick: (i: number) => void
  onFrameTime: (i: number, t: number) => void
  /**
   * Fires once, when a frame drag ends. spec.frames must stay in ascending t for frameIndexAt
   * (used by both the preview and the game) to find the right frame — dragging one marker past
   * a neighbour puts them out of order otherwise. This is deliberately not called during the
   * drag: re-sorting mid-drag would renumber the frame under the pointer.
   */
  onFrameDragEnd: (i: number) => void
  onSfxTime: (i: number, t: number) => void
  onSpace: (fps: number) => void
}

export default function Timeline({
  spec, index, playhead, onPick, onFrameTime, onFrameDragEnd, onSfxTime, onSpace,
}: Props) {
  const strip = useRef<HTMLDivElement>(null)
  const [fps, setFps] = useState(DEFAULT_FPS)

  /** Screen x within the strip -> time in seconds, clamped to the motion. */
  function timeAt(clientX: number): number {
    const box = strip.current!.getBoundingClientRect()
    const fraction = (clientX - box.left) / box.width
    return Math.min(spec.duration, Math.max(0, fraction * spec.duration))
  }

  function drag(e: React.PointerEvent, apply: (t: number) => void, onEnd?: () => void) {
    e.preventDefault()
    const move = (ev: PointerEvent) => apply(timeAt(ev.clientX))
    const up = () => {
      window.removeEventListener('pointermove', move)
      window.removeEventListener('pointerup', up)
      onEnd?.()
    }
    window.addEventListener('pointermove', move)
    window.addEventListener('pointerup', up)
  }

  const pct = (t: number) => `${(t / spec.duration) * 100}%`

  return (
    <div className="border-t p-3">
      <div className="mb-2 flex items-center gap-3 text-xs">
        <span>duration {spec.duration.toFixed(2)}s</span>
        <span className="text-gray-400">|</span>
        <label>
          space evenly at
          <input type="number" className="mx-1 w-14 rounded border px-1 text-right" value={fps}
                 onChange={(e) => setFps(Number(e.target.value) || DEFAULT_FPS)} />
          fps
        </label>
        <button onClick={() => onSpace(fps)} className="rounded border px-2 py-0.5">apply</button>
      </div>

      {/* frames */}
      <div ref={strip} className="relative h-8 rounded bg-neutral-100">
        {spec.frames.map((f, i) => (
          <button
            key={i}
            onPointerDown={(e) => { onPick(i); drag(e, (t) => onFrameTime(i, t), () => onFrameDragEnd(i)) }}
            title={`frame ${i + 1} — ${f.sprite} @ ${f.t.toFixed(3)}s`}
            className={`absolute top-1 h-6 w-2 -translate-x-1/2 rounded ${
              i === index ? 'bg-black' : 'bg-neutral-400'}`}
            style={{ left: pct(f.t) }}
          />
        ))}
        {playhead !== null && (
          <div className="pointer-events-none absolute inset-y-0 w-px bg-red-500"
               style={{ left: pct(playhead) }} />
        )}
      </div>

      {/* sfx */}
      <div className="relative mt-1 h-6 rounded bg-neutral-50">
        {spec.sfx.map((s, i) => (
          <button
            key={i}
            onPointerDown={(e) => drag(e, (t) => onSfxTime(i, t))}
            title={`${s.file} @ ${s.t.toFixed(3)}s`}
            className="absolute top-1 h-4 w-4 -translate-x-1/2 rounded-full bg-emerald-600 text-[8px] text-white"
            style={{ left: pct(s.t) }}
          />
        ))}
      </div>

      <div className="mt-1 flex justify-between text-[10px] text-gray-500">
        <span>0s</span>
        <span>seconds — not a fraction of totalDuration, unlike S1.json</span>
        <span>{spec.duration.toFixed(2)}s</span>
      </div>
    </div>
  )
}
