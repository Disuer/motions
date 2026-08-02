import { useRef, useState } from 'react'
import { Button } from '@/components/ui/button'
import NumberField from './NumberField'
import { Label } from '@/components/ui/label'
import { Separator } from '@/components/ui/separator'
import { AnimationSpec, DEFAULT_FPS } from './spec'

/**
 * t as a percentage of duration, for a CSS `left`. Duration should always be positive - parseSpec
 * rejects <= 0 on load, and both places that can set it while editing guard against that - but
 * this is the one function that actually divides by it, so it doesn't trust either of them: a
 * non-positive or NaN duration piles every marker at 0% (visibly wrong, an author notices) rather
 * than computing Infinity or NaN (silently wrong, every marker vanishes to nowhere).
 */
export function pct(t: number, duration: number): string {
  return duration > 0 ? `${(t / duration) * 100}%` : '0%'
}

interface Props {
  spec: AnimationSpec
  index: number
  /** Current preview time in seconds, or null when not playing. */
  playhead: number | null
  onPick: (i: number) => void
  onFrameTime: (i: number, t: number) => void
  /**
   * Fires once, when a frame drag ends. spec.frames must stay in ascending t for frameIndexAt
   * (used by both the preview and the game) to find the right frame: dragging one marker past
   * a neighbour puts them out of order otherwise. This is deliberately not called during the
   * drag: re-sorting mid-drag would renumber the frame under the pointer.
   */
  onFrameDragEnd: (i: number) => void
  onSfxTime: (i: number, t: number) => void
  /** Which sound is selected, or null. Selecting one is what puts it in the inspector. */
  sfxIndex: number | null
  onPickSfx: (i: number) => void
  onSpace: (fps: number) => void
  /** Same setter the inspector's duration field uses; this is the second view of one value. */
  onDuration: (seconds: number) => void
}

export default function Timeline({
  spec, index, playhead, onPick, onFrameTime, onFrameDragEnd, onSfxTime, sfxIndex, onPickSfx,
  onSpace, onDuration,
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

  return (
    <div className="border-t p-3">
      <div className="mb-3 flex flex-wrap items-center gap-x-4 gap-y-2 text-xs">
        <div className="flex items-center gap-2">
          <Label htmlFor="duration" className="text-xs font-normal text-muted-foreground">Duration</Label>
          {/* Clamped the same way as the inspector's copy: parseSpec rejects duration <= 0 on
              load, and pct() below divides by it. Typing over the field passes through 0 for an
              empty box, so the floor has to hold here, not just on blur. */}
          <NumberField id="duration" min={0.01} step={0.05} className="w-20"
                       value={spec.duration}
                       onCommit={(v) => { if (v !== undefined) onDuration(v) }} />
          <span className="text-muted-foreground">s</span>
        </div>

        <Separator orientation="vertical" className="h-5" />

        <div className="flex items-center gap-2">
          <Label htmlFor="fps" className="text-xs font-normal text-muted-foreground">Space evenly at</Label>
          {/* min is a hint the browser doesn't enforce on typed input, so the real guard is
              clamping the value itself: a zero or negative fps turns into a zero or negative
              duration, and pct() below divides by duration. */}
          <NumberField id="fps" min={1} step={1} integer className="w-16" value={fps}
                       onCommit={(v) => { if (v !== undefined) setFps(v) }} />
          <span className="text-muted-foreground">fps</span>
          <Button variant="outline" size="sm" onClick={() => onSpace(fps)}>Apply</Button>
        </div>
      </div>

      {/* frames */}
      <div ref={strip} className="relative h-8 rounded-md border bg-muted">
        {spec.frames.map((f, i) => (
          <button
            key={i}
            onPointerDown={(e) => { onPick(i); drag(e, (t) => onFrameTime(i, t), () => onFrameDragEnd(i)) }}
            title={`frame ${i + 1}: ${f.sprite} @ ${f.t.toFixed(3)}s`}
            className={`absolute top-1 h-6 w-2 -translate-x-1/2 rounded ${
              i === index ? 'bg-primary' : 'bg-muted-foreground/50 hover:bg-muted-foreground'}`}
            style={{ left: pct(f.t, spec.duration) }}
          />
        ))}
        {playhead !== null && (
          <div className="pointer-events-none absolute inset-y-0 w-px bg-red-500"
               style={{ left: pct(playhead, spec.duration) }} />
        )}
      </div>

      {/* sfx */}
      <div className="relative mt-1 h-6 rounded-md border bg-muted/40">
        {spec.sfx.map((s, i) => (
          <button
            key={i}
            onPointerDown={(e) => { onPickSfx(i); drag(e, (t) => onSfxTime(i, t)) }}
            title={`${s.file} @ ${s.t.toFixed(3)}s`}
            className={`absolute top-1 h-4 w-4 -translate-x-1/2 rounded-full text-[8px] ${
              i === sfxIndex ? 'ring-2 ring-primary ring-offset-1 bg-emerald-600' : 'bg-emerald-600/70'}`}
            style={{ left: pct(s.t, spec.duration) }}
          />
        ))}
      </div>

      <div className="mt-1 flex justify-between text-[10px] text-muted-foreground">
        <span>0s</span>
        <span>seconds, not a fraction of totalDuration, unlike S1.json</span>
        <span>{spec.duration.toFixed(2)}s</span>
      </div>
    </div>
  )
}
