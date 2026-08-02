import { useState } from 'react'
import { Plus, TriangleAlert } from 'lucide-react'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs'
import NumberField from './NumberField'
import SkillInspector from './SkillInspector'
import SkillTimeline, { Marker, TrackKey } from './SkillTimeline'
import { LoadedSkill } from './fs'
import {
  Coin, Skill, clampFraction, newCoin, newHitChecker, newPhase, newRotate, newShake, newZoom,
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
  /** The file as read from disk: its name, and the parse error if it had one. */
  file: LoadedSkill
  /** The edited document, or null when the file could not be parsed. */
  doc: Skill | null
  coinTab: number
  selected: Marker | null
  onCoinTab: (i: number) => void
  onSelect: (m: Marker | null) => void
  onEdit: (patch: (s: Skill) => Skill) => void
}

export default function SkillEditor({
  file, doc, coinTab, selected, onCoinTab, onSelect, onEdit,
}: Props) {
  /** The VFX list as typed, while it is being typed. null means show the parsed value. */
  const [vfxText, setVfxText] = useState<string | null>(null)
  // A file the editor cannot parse is shown, never rewritten. Offering an editor over a document
  // it failed to read would mean saving a guess over someone's file.
  if (!doc) {
    return (
      <Alert variant="destructive" className="mt-4">
        <TriangleAlert />
        <AlertDescription>
          <p><strong>{file.name}</strong> could not be read: {file.error}</p>
          <p>
            It is left exactly as it is on disk. Fix it in a text editor and reopen the character.
          </p>
        </AlertDescription>
      </Alert>
    )
  }

  const coin: Coin | undefined = doc.coins[coinTab]

  /** Edits the coin on screen. Every mutation below funnels through here. */
  function editCoin(patch: (c: Coin) => void) {
    onEdit((s) => {
      const c = s.coins[coinTab]
      if (c) patch(c)
      return s
    })
  }

  function addMarker(track: TrackKey, at: number) {
    editCoin((c) => {
      const list = (c[track] ??= []) as unknown[]
      list.push(blankFor(track, clampFraction(at)))
    })
    // Select what was just added, so the inspector is already showing it.
    onSelect({ track, index: (coin?.[track]?.length ?? 0) })
  }

  /** Moves a marker. A phase keeps its length, so start and end travel together. */
  function moveMarker(m: Marker, to: number) {
    editCoin((c) => {
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

  function patchSelected(patch: Record<string, unknown>) {
    if (!selected) return
    editCoin((c) => {
      const list = selected.track === 'phases' ? c.phases : c[selected.track]
      const item = list?.[selected.index] as Record<string, unknown> | undefined
      if (!item) return
      for (const [key, v] of Object.entries(patch)) {
        // undefined means the field was cleared, and cleared means the key goes. Assigning
        // undefined would leave it present in the object; JSON.stringify happens to drop it, but
        // then the model and the file disagree about whether it is set.
        if (v === undefined) delete item[key]
        else item[key] = v
      }
    })
  }

  function removeSelected() {
    if (!selected) return
    editCoin((c) => {
      const list = selected.track === 'phases' ? c.phases : c[selected.track]
      list?.splice(selected.index, 1)
    })
    onSelect(null)
  }

  return (
    <div className="mt-3">
      <div className="flex flex-wrap items-center gap-2">
        <Tabs value={String(coinTab)} onValueChange={(v) => { onCoinTab(Number(v)); onSelect(null) }}>
          <TabsList>
            {doc.coins.map((_, i) => (
              <TabsTrigger key={i} value={String(i)}>coin {i + 1}</TabsTrigger>
            ))}
          </TabsList>
        </Tabs>

        <Button variant="outline" size="sm"
                onClick={() => {
                  onEdit((s) => { s.coins.push(newCoin()); return s })
                  onCoinTab(doc.coins.length)
                  onSelect(null)
                }}>
          <Plus className="size-3.5" />
          Add coin
        </Button>

        {coin && (
          <Button variant="ghost" size="sm" className="text-destructive hover:text-destructive"
                  onClick={() => {
                    onEdit((s) => { s.coins.splice(coinTab, 1); return s })
                    onCoinTab(Math.max(0, coinTab - 1))
                    onSelect(null)
                  }}>
            Remove coin {coinTab + 1}
          </Button>
        )}
      </div>

      {file.warning && (
        <Alert className="mt-3">
          <TriangleAlert />
          <AlertDescription>{file.warning}</AlertDescription>
        </Alert>
      )}

      {!coin ? (
        <p className="mt-4 text-sm text-muted-foreground">
          No coins in this file yet. <strong>Add coin</strong> makes the first one, with a hit
          checker at the end so the animation is not cut short.
        </p>
      ) : (
        <div className="mt-3 flex gap-3">
          <div className="flex-1">
            <div className="mb-3 flex items-center gap-2">
              <Label htmlFor="totalDuration" className="text-xs">Total duration</Label>
              {/* The one value in a coin measured in seconds. Everything else on screen is a
                  fraction of it, and parseSkill refuses a file where it is not above zero, so the
                  floor holds here too - on commit, so typing the "0" of "0.5" is not snapped. */}
              <NumberField
                id="totalDuration"
                value={coin.totalDuration}
                min={0.01}
                step={0.1}
                className="w-24"
                onCommit={(v) => { if (v !== undefined) editCoin((c) => { c.totalDuration = v }) }}
              />
              <span className="text-xs text-muted-foreground">
                seconds. Every other time in this coin is a fraction of it.
              </span>
            </div>

            <SkillTimeline
              coin={coin}
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
                  editCoin((c) => {
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
          </div>

          <SkillInspector
            coin={coin}
            selected={selected}
            onPatch={patchSelected}
            onRemove={removeSelected}
          />
        </div>
      )}
    </div>
  )
}
