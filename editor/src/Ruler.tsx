/**
 * The tick strip above a set of tracks. The two editors rule different axes - seconds for a sprite
 * motion, a 0..1 fraction for a skill - so the caller brings its own tick values, positions and
 * labels. What lives here is the part that was the same in both, including the end anchoring that
 * keeps the first and last labels from hanging off the strip.
 */
export default function Ruler({ ticks, at, label }: {
  ticks: number[]
  /** Tick value -> a CSS `left`, in whatever units the caller's axis uses. */
  at: (t: number) => string
  label: (t: number) => string
}) {
  return (
    <div className="relative h-5 text-[10px] tabular-nums text-muted-foreground">
      {ticks.map((t, i) => (
        <div
          key={i}
          className="absolute bottom-0"
          style={{
            left: at(t),
            transform: i === 0 ? 'none'
              : i === ticks.length - 1 ? 'translateX(-100%)' : 'translateX(-50%)',
          }}
        >
          {label(t)}
        </div>
      ))}
    </div>
  )
}

/**
 * Gridlines under a ruler, spaced to match its ticks. A background rather than an element per
 * line, which is what puts them behind the markers on a track without any stacking to arrange.
 */
export function gridImage(spacing: string): string {
  return `repeating-linear-gradient(to right, var(--border) 0 1px, transparent 1px ${spacing})`
}
