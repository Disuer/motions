import { useRef } from 'react'
import { Plus } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Coin, clampFraction } from './skill'
import Ruler, { gridImage } from './Ruler'

export type TrackKey = 'phases' | 'hitCheckers' | 'zooms' | 'rotates' | 'shakes'

export interface Marker {
  track: TrackKey
  index: number
}

export const TRACKS: { key: TrackKey; label: string; hint: string }[] = [
  { key: 'phases', label: 'phases', hint: 'Movement and damage' },
  { key: 'hitCheckers', label: 'hits', hint: 'Where the coin may hand off' },
  { key: 'zooms', label: 'zooms', hint: 'Camera zoom' },
  { key: 'rotates', label: 'rotates', hint: 'Camera rotation' },
  { key: 'shakes', label: 'shakes', hint: 'Camera shake' },
]

const pct = (v: number) => `${clampFraction(v) * 100}%`

/** The axis is always 0..1 here, so the ruler is fixed at tenths - no fitting to a duration. */
const TICKS = Array.from({ length: 11 }, (_, i) => i / 10)
const GRID = gridImage('10%')

/**
 * A tick's label. The axis is a 0..1 fraction, but when a sprite motion resolves for the coin its
 * duration is what the game runs (TimelineBuilder.cs:385), so the same tick can be named in the
 * seconds the timeline above is ruled in and the two read as one axis.
 */
export function rulerLabel(t: number, seconds: number | null): string {
  if (seconds === null || seconds <= 0) return `${+t.toFixed(1)}`
  return `${+(t * seconds).toFixed(2)}s`
}

/** Where a marker sits, as a fraction. hitCheckers use `time`; everything else uses `start`. */
export function positionOf(coin: Coin, m: Marker): number {
  if (m.track === 'phases') return coin.phases[m.index]?.start ?? 0
  if (m.track === 'hitCheckers') return coin.hitCheckers?.[m.index]?.time ?? 0
  return coin[m.track]?.[m.index]?.start ?? 0
}

/**
 * How wide a marker is on a 0..1 axis. Phases span start..end, which are already fractions. Zooms,
 * rotates and shakes have a `duration` in SECONDS, so it is divided by totalDuration to be drawn
 * against the same axis. That conversion is the point of showing them here: the mismatch between
 * a fractional start and a duration in seconds is the easiest thing to get wrong in these files,
 * and on the timeline a half-second clip in a two second coin is visibly a quarter of the bar.
 */
export function widthOf(coin: Coin, m: Marker): number {
  if (m.track === 'phases') {
    const p = coin.phases[m.index]
    return Math.max(0, (p?.end ?? 0) - (p?.start ?? 0))
  }
  if (m.track === 'hitCheckers') return 0
  const seconds = coin[m.track]?.[m.index]?.duration ?? 0
  return coin.totalDuration > 0 ? seconds / coin.totalDuration : 0
}

/**
 * Writes fields onto one marker, in place. Lives here rather than in the panel because both the
 * inspector and the Delete key reach for it, and it takes the same (coin, marker) pair positionOf
 * and widthOf do.
 */
export function patchMarker(coin: Coin, m: Marker, patch: Record<string, unknown>): void {
  const list = m.track === 'phases' ? coin.phases : coin[m.track]
  const item = list?.[m.index] as Record<string, unknown> | undefined
  if (!item) return
  for (const [key, v] of Object.entries(patch)) {
    // undefined means the field was cleared, and cleared means the key goes. Assigning undefined
    // would leave it present in the object; JSON.stringify happens to drop it, but then the model
    // and the file disagree about whether it is set.
    if (v === undefined) delete item[key]
    else item[key] = v
  }
}

/** Removes one marker from its track, in place. */
export function removeMarker(coin: Coin, m: Marker): void {
  const list = m.track === 'phases' ? coin.phases : coin[m.track]
  list?.splice(m.index, 1)
}

function countOf(coin: Coin, key: TrackKey): number {
  return (key === 'phases' ? coin.phases : coin[key])?.length ?? 0
}

interface Props {
  coin: Coin
  /**
   * The seconds this coin actually runs for, or null when nothing overrides totalDuration. Only
   * changes how the axis is labelled; every position on it is still a fraction.
   */
  duration: number | null
  selected: Marker | null
  onSelect: (m: Marker) => void
  /** Moves a marker to a fraction. A phase keeps its length, so this sets start and end together. */
  onMove: (m: Marker, fraction: number) => void
  onAdd: (track: TrackKey, at: number) => void
}

export default function SkillTimeline({ coin, duration, selected, onSelect, onMove, onAdd }: Props) {
  const strips = useRef<Map<TrackKey, HTMLDivElement | null>>(new Map())

  function fractionAt(track: TrackKey, clientX: number): number {
    const box = strips.current.get(track)?.getBoundingClientRect()
    if (!box || box.width === 0) return 0
    return clampFraction((clientX - box.left) / box.width)
  }

  // Bound on window rather than the element, so a drag that leaves the strip keeps tracking -
  // same approach as the sprite timeline, and the reason the pointer can run off the end and
  // still clamp to 1.0 rather than sticking wherever it left.
  function drag(e: React.PointerEvent, m: Marker) {
    e.preventDefault()
    e.stopPropagation()
    onSelect(m)
    const move = (ev: PointerEvent) => onMove(m, fractionAt(m.track, ev.clientX))
    const up = () => {
      window.removeEventListener('pointermove', move)
      window.removeEventListener('pointerup', up)
    }
    window.addEventListener('pointermove', move)
    window.addEventListener('pointerup', up)
  }

  const isSelected = (m: Marker) => selected?.track === m.track && selected.index === m.index

  return (
    <div className="rounded-lg border">
      <div className="flex items-center justify-between border-b px-3 py-2 text-xs">
        <span className="text-muted-foreground">
          Positions are a fraction of <code>totalDuration</code>, so 0.5 is halfway.
        </span>
        <span className="tabular-nums text-muted-foreground">
          {duration ?? coin.totalDuration}s
        </span>
      </div>

      <div className="flex flex-col gap-1 p-3">
        {/* Same gutters as a track row: w-16 label + gap-2 on the left, add button + gap on the
            right, so a tick sits over the fraction it names. */}
        <div className="pl-18 pr-9">
          <Ruler ticks={TICKS} at={pct} label={(t) => rulerLabel(t, duration)} />
        </div>

        {TRACKS.map((track) => (
          <div key={track.key} className="flex items-center gap-2">
            <span className="w-16 shrink-0 text-right text-[11px] text-muted-foreground"
                  title={track.hint}>
              {track.label}
            </span>

            <div
              ref={(el) => { strips.current.set(track.key, el) }}
              className="relative h-7 flex-1 rounded-md border bg-muted"
              style={{ backgroundImage: GRID }}
              // Clicking empty track space adds there, which is how a marker gets created at a
              // time rather than at 0 and dragged over.
              onDoubleClick={(e) => onAdd(track.key, fractionAt(track.key, e.clientX))}
              title={`${track.hint}. Double-click to add one here.`}
            >
              {Array.from({ length: countOf(coin, track.key) }, (_, i) => {
                const m: Marker = { track: track.key, index: i }
                const width = widthOf(coin, m)
                const on = isSelected(m)
                return (
                  <button
                    key={i}
                    onPointerDown={(e) => drag(e, m)}
                    title={`${track.label} ${i + 1} at ${positionOf(coin, m).toFixed(3)}`}
                    className={`absolute top-1 h-5 rounded-sm border ${
                      on ? 'z-10 border-primary bg-primary' : 'border-foreground/20 bg-foreground/40'
                    }`}
                    style={{
                      left: pct(positionOf(coin, m)),
                      // A zero-length marker still needs to be grabbable, so it gets a fixed
                      // 8px rather than a percentage of nothing.
                      width: width > 0 ? pct(width) : '8px',
                      marginLeft: width > 0 ? 0 : '-4px',
                    }}
                  />
                )
              })}
            </div>

            <Button variant="ghost" size="sm" className="h-7 px-2"
                    title={`Add a ${track.label.replace(/e?s$/, '')} at the start`}
                    onClick={() => onAdd(track.key, 0)}>
              <Plus className="size-3" />
            </Button>
          </div>
        ))}

        <div className="mt-1 pl-18 text-[10px] text-muted-foreground">
          drag to move, double-click a track to add
        </div>
      </div>
    </div>
  )
}
