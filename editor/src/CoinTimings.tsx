import { useState } from 'react'
import { TriangleAlert } from 'lucide-react'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import NumberField from './NumberField'
import SkillInspector from './SkillInspector'
import SkillTimeline, { Marker, TrackKey, patchMarker, removeMarker } from './SkillTimeline'
import {
  Coin, clampFraction, newHitChecker, newPhase, newRotate, newShake, newZoom,
} from './skill'

/** Builds the marker a track's + button adds. One place, so the timeline stays presentational. */
function blankFor(track: TrackKey, at: number): unknown {
  if (track === 'phases') return newPhase('GiveDamage', at)
  if (track === 'hitCheckers') return newHitChecker(at)
  if (track === 'zooms') return newZoom(at)
  if (track === 'rotates') return newRotate(at)
  return newShake(at)
}

interface Props {
  coin: Coin
  /**
   * The seconds this coin actually runs for, or null when nothing overrides totalDuration.
   * TimelineBuilder.cs:385 replaces totalDuration with the sprite motion's duration whenever one
   * resolves for the coin, so when this is non-null the field below is a readout, not a setting.
   */
  duration: number | null
  /** The skill file's hitCheckers advice, or null when every coin already has one. */
  warning: string | null
  selected: Marker | null
  onSelect: (m: Marker | null) => void
  /** Mutates the coin inside a clone. Every edit here funnels through it. */
  onEdit: (patch: (c: Coin) => void) => void
  onRemoveCoin: () => void
}

export default function CoinTimings({
  coin, duration, warning, selected, onSelect, onEdit, onRemoveCoin,
}: Props) {
  /** The VFX list as typed, while it is being typed. null means show the parsed value. */
  const [vfxText, setVfxText] = useState<string | null>(null)

  function addMarker(track: TrackKey, at: number) {
    onEdit((c) => {
      const list = (c[track] ??= []) as unknown[]
      list.push(blankFor(track, clampFraction(at)))
    })
    // Select what was just added, so the inspector is already showing it.
    onSelect({ track, index: coin[track]?.length ?? 0 })
  }

  /** Moves a marker. A phase keeps its length, so start and end travel together. */
  function moveMarker(m: Marker, to: number) {
    onEdit((c) => {
      if (m.track === 'phases') {
        const p = c.phases[m.index]
        if (!p) return
        const length = Math.max(0, (p.end ?? 0) - (p.start ?? 0))
        // The start is held back so the END lands at 1.0 at the furthest, rather than clamping
        // both independently. Clamping the end was lossy: drag a 0.3-long phase off the right and
        // its length was recomputed as 0.1 on the next pointermove, then 0 - dragging it back
        // left a phase permanently shorter than it started.
        p.start = clampFraction(Math.min(to, 1 - length))
        p.end = clampFraction(p.start + length)
        return
      }
      if (m.track === 'hitCheckers') {
        const h = c.hitCheckers?.[m.index]
        if (h) h.time = clampFraction(to)
        return
      }
      const item = c[m.track]?.[m.index]
      if (item) item.start = clampFraction(to)
    })
  }

  return (
    <div className="mt-3">
      {warning && (
        <Alert className="mb-3">
          <TriangleAlert />
          <AlertDescription>{warning}</AlertDescription>
        </Alert>
      )}

      <div className="flex gap-3">
        <div className="flex-1">
          <div className="mb-3 flex items-center gap-2">
            <Label htmlFor="totalDuration" className="text-xs">Total duration</Label>
            {/* The one value in a coin measured in seconds. Everything else on screen is a
                fraction of it. Read-only when a sprite motion resolves: the game overwrites it
                with that motion's duration (TimelineBuilder.cs:385), so an editable box here
                would be a number nothing reads. parseSkill refuses a file where it is not above
                zero, so the floor holds on commit too - typing the "0" of "0.5" is not snapped. */}
            {duration === null ? (
              <>
                <NumberField
                  id="totalDuration"
                  value={coin.totalDuration}
                  min={0.01}
                  step={0.1}
                  className="w-24"
                  onCommit={(v) => { if (v !== undefined) onEdit((c) => { c.totalDuration = v }) }}
                />
                <span className="text-xs text-muted-foreground">
                  seconds. Every other time in this coin is a fraction of it.
                </span>
              </>
            ) : (
              <>
                <span className="tabular-nums text-xs">{duration}s</span>
                <span className="text-xs text-muted-foreground">
                  from the animation, which the game uses in place of this coin's{' '}
                  <code>totalDuration</code> of {coin.totalDuration}s.
                </span>
              </>
            )}
          </div>

          <SkillTimeline
            coin={coin}
            duration={duration}
            selected={selected}
            onSelect={onSelect}
            onMove={moveMarker}
            onAdd={addMarker}
          />

          <div className="mt-3 flex items-center gap-2">
            <Label htmlFor="vfx" className="text-xs">Reused VFX tracks</Label>
            {/* Free text rather than a list widget: the values are a handful of integers read
                off the plugin's startup log, and typing "1, 3" is faster than three clicks. The
                text is held locally while typing - deriving `value` from the parsed array meant
                the comma you typed was parsed away and deleted before the next digit. */}
            <Input
              id="vfx"
              className="h-8 w-40 text-xs"
              placeholder="1, 3"
              value={vfxText ?? (coin.vfx ?? []).join(', ')}
              onChange={(e) => {
                setVfxText(e.target.value)
                const parsed = e.target.value
                  .split(',')
                  .map((part) => Number(part.trim()))
                  .filter((n) => Number.isInteger(n) && n >= 1)
                onEdit((c) => {
                  if (parsed.length > 0) c.vfx = parsed
                  else delete c.vfx
                })
              }}
              onBlur={() => setVfxText(null)}
            />
            <span className="text-xs text-muted-foreground">
              1-indexed into the character's own VFX, logged by the plugin at startup.
            </span>
          </div>

          {/* Never touches the folder: the editor has no action that deletes one. */}
          <Button variant="ghost" size="sm" className="mt-3 text-destructive hover:text-destructive"
                  onClick={onRemoveCoin}>
            Remove this coin from the file
          </Button>
        </div>

        <SkillInspector
          coin={coin}
          selected={selected}
          onPatch={(patch) => { if (selected) onEdit((c) => patchMarker(c, selected, patch)) }}
          onRemove={() => {
            if (!selected) return
            onEdit((c) => removeMarker(c, selected))
            onSelect(null)
          }}
        />
      </div>
    </div>
  )
}
