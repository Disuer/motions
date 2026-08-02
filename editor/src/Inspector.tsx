import { Copy, Trash2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import NumberField from './NumberField'
import { Label } from '@/components/ui/label'
import { Separator } from '@/components/ui/separator'
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select'
import { AnimationSpec, Frame, Sfx } from './spec'

/**
 * A labelled number input. Values are world units, as stored, never converted. The commit rules
 * live in NumberField: an offset is routinely negative, and typing the minus sign used to clear
 * the field to 0 before the digits arrived.
 */
function Num({ label, value, step = 0.01, min, onChange }: {
  label: string
  value: number
  step?: number
  min?: number
  onChange: (v: number) => void
}) {
  const id = `num-${label.replace(/\W+/g, '-')}`
  return (
    <div className="flex items-center justify-between gap-2 py-1">
      <Label htmlFor={id} className="text-xs font-normal text-muted-foreground">{label}</Label>
      <NumberField id={id} value={value} step={step} min={min} className="w-24"
                   onCommit={(v) => { if (v !== undefined) onChange(v) }} />
    </div>
  )
}

/** The same row, for a field that is allowed to be absent. Clearing it removes the key. */
function OptionalNum({ label, value, placeholder, onCommit }: {
  label: string
  value: number | undefined
  placeholder: string
  onCommit: (v: number | undefined) => void
}) {
  const id = `num-${label.replace(/\W+/g, '-')}`
  return (
    <div className="flex items-center justify-between gap-2 py-1">
      <Label htmlFor={id} className="text-xs font-normal text-muted-foreground">{label}</Label>
      <NumberField id={id} value={value} step={0.05} min={0} optional placeholder={placeholder}
                   className="w-24" onCommit={onCommit} />
    </div>
  )
}

interface Props {
  spec: AnimationSpec
  index: number
  /** Set when a sound is selected on the timeline. It takes the panel over from the frame. */
  sfxIndex: number | null
  onFrame: (patch: Partial<Frame>) => void
  onSfx: (patch: Partial<Sfx>) => void
  onSpec: (patch: Partial<AnimationSpec>) => void
  onRemove: () => void
  onDuplicate: () => void
  onRemoveSfx: () => void
}

export default function Inspector({
  spec, index, sfxIndex, onFrame, onSfx, onSpec, onRemove, onDuplicate, onRemoveSfx,
}: Props) {
  const frame = spec.frames[index]
  const sound = sfxIndex === null ? undefined : spec.sfx[sfxIndex]

  return (
    <div className="w-56 shrink-0 overflow-y-auto border-l p-3">
      {sound ? (
        <>
          <div className="flex items-center justify-between">
            <div className="text-xs font-medium">Sound {sfxIndex! + 1}</div>
            <Button variant="ghost" size="sm" onClick={onRemoveSfx}
                    title="Takes it out of animation.json. The file stays on disk."
                    className="h-7 px-2 text-[11px] text-destructive hover:text-destructive">
              <Trash2 className="size-3" />
              Remove
            </Button>
          </div>
          <div className="truncate font-mono text-[11px] text-muted-foreground" title={sound.file}>
            {sound.file}
          </div>
          <Num label="time (s)" value={sound.t} step={0.05} min={0}
               onChange={(v) => onSfx({ t: v })} />
          {/* Both are optional in the file and absent means something specific, so an empty box
              clears the key rather than writing a zero: clipIn 0 and "start at the beginning"
              happen to agree, but duration 0 is a sound that never plays. Shown as genuinely
              empty, not as 0, so "unset" and "set to zero" do not look identical. */}
          <OptionalNum label="skip in (s)" value={sound.clipIn} placeholder="whole file"
                       onCommit={(v) => onSfx({ clipIn: v })} />
          <OptionalNum label="play for (s)" value={sound.duration} placeholder="to the end"
                       onCommit={(v) => onSfx({ duration: v })} />
          <p className="mt-1 text-[10px] leading-tight text-muted-foreground">
            Seconds, like the frames. Leave skip and play empty to play the whole file.
          </p>
        </>
      ) : frame ? (
        <>
          <div className="flex items-center justify-between">
            <div className="text-xs font-medium">Frame {index + 1}</div>
            <div className="flex items-center">
              <Button variant="ghost" size="sm" onClick={onDuplicate}
                      title="Adds a copy just after this one, keeping its offset and scale."
                      className="h-7 px-2 text-[11px]">
                <Copy className="size-3" />
                Duplicate
              </Button>
              {/* Disabled rather than hidden on the last frame: an empty frames array is a spec
                  the game (and the editor) can no longer reopen, so removeFrame refuses it - the
                  button should say so up front instead of silently doing nothing on click. */}
              <Button variant="ghost" size="sm" onClick={onRemove} disabled={spec.frames.length <= 1}
                      title={spec.frames.length <= 1
                        ? 'A motion needs at least one frame'
                        : 'Takes it off the timeline. The PNG stays on disk.'}
                      className="h-7 px-2 text-[11px] text-destructive hover:text-destructive">
                <Trash2 className="size-3" />
                Remove
              </Button>
            </div>
          </div>
          <div className="truncate font-mono text-[11px] text-muted-foreground" title={frame.sprite}>
            {frame.sprite}
          </div>
          <Num label="offset x" value={frame.offset[0]}
               onChange={(v) => onFrame({ offset: [v, frame.offset[1]] })} />
          <Num label="offset y" value={frame.offset[1]}
               onChange={(v) => onFrame({ offset: [frame.offset[0], v] })} />
          {/* v > 0, not `v || 1`: a negative number is truthy, and it would flip the sprite and
              divide effectivePpu the wrong way - the same trap the note below guards ppu and
              duration against. */}
          <Num label="scale" value={frame.scale} min={0.01} onChange={(v) => onFrame({ scale: v })} />
          <p className="mt-1 text-[10px] leading-tight text-muted-foreground">
            World units. 0, 0 is standing on the ground, centred.
          </p>
        </>
      ) : (
        <div className="text-xs text-muted-foreground">
          No frame selected. Pick one on the timeline.
        </div>
      )}

      <Separator className="my-3" />
      <div className="text-xs font-medium">Motion</div>
      {/* `v || fallback` would let a negative number through (a negative number is truthy);
          parseSpec rejects ppu/duration <= 0 on load, so this must too, or saving writes a file
          the editor - and the game - can't reopen. */}
      <Num label="ppu" value={spec.ppu} step={10} min={1} onChange={(v) => onSpec({ ppu: v })} />
      <Num label="duration (s)" value={spec.duration} min={0.01}
           onChange={(v) => onSpec({ duration: v })} />
      <div className="flex items-center justify-between gap-2 py-1">
        <Label htmlFor="filter" className="text-xs font-normal text-muted-foreground">filter</Label>
        {/* undefined, not 'smooth': the field is omitted from animation.json unless it is point,
            and writing the default back would add a key the author never set. */}
        <Select value={spec.filter === 'point' ? 'point' : 'smooth'}
                onValueChange={(v) => onSpec({ filter: v === 'point' ? 'point' : undefined })}>
          <SelectTrigger id="filter" size="sm" className="w-32">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="smooth">smooth</SelectItem>
            <SelectItem value="point">point (pixel art)</SelectItem>
          </SelectContent>
        </Select>
      </div>
      <p className="mt-1 text-[10px] leading-tight text-muted-foreground">
        Halve ppu to make every frame twice as big.
      </p>
    </div>
  )
}
