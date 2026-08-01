import { AnimationSpec, Frame } from './spec'

/** A labelled number input. Values are world units, as stored — never converted. */
function Num({ label, value, step = 0.01, onChange }: {
  label: string
  value: number
  step?: number
  onChange: (v: number) => void
}) {
  return (
    <label className="flex items-center justify-between gap-2 py-1">
      <span className="text-xs text-gray-600">{label}</span>
      <input
        type="number"
        className="w-24 rounded border px-1 py-0.5 text-right text-sm"
        value={value}
        step={step}
        onChange={(e) => onChange(Number(e.target.value))}
      />
    </label>
  )
}

interface Props {
  spec: AnimationSpec
  index: number
  onFrame: (patch: Partial<Frame>) => void
  onSpec: (patch: Partial<AnimationSpec>) => void
}

export default function Inspector({ spec, index, onFrame, onSpec }: Props) {
  const frame = spec.frames[index]

  return (
    <div className="w-56 shrink-0 border-l p-3">
      {frame ? (
        <>
          <div className="text-xs font-medium">frame {index + 1}</div>
          <div className="truncate text-xs text-gray-500" title={frame.sprite}>{frame.sprite}</div>
          <Num label="offset x" value={frame.offset[0]}
               onChange={(v) => onFrame({ offset: [v, frame.offset[1]] })} />
          <Num label="offset y" value={frame.offset[1]}
               onChange={(v) => onFrame({ offset: [frame.offset[0], v] })} />
          <Num label="scale" value={frame.scale} onChange={(v) => onFrame({ scale: v || 1 })} />
          <p className="mt-1 text-[10px] leading-tight text-gray-500">
            World units. 0, 0 is standing on the ground, centred.
          </p>
        </>
      ) : (
        <div className="text-xs text-gray-500">No frame selected.</div>
      )}

      <hr className="my-3" />
      <div className="text-xs font-medium">motion</div>
      {/* `v || fallback` would let a negative number through (a negative number is truthy);
          parseSpec rejects ppu/duration <= 0 on load, so this must too, or saving writes a file
          the editor - and the game - can't reopen. */}
      <Num label="ppu" value={spec.ppu} step={10} onChange={(v) => onSpec({ ppu: v > 0 ? v : 200 })} />
      <Num label="duration (s)" value={spec.duration} onChange={(v) => onSpec({ duration: v > 0 ? v : 0.01 })} />
      <label className="flex items-center justify-between gap-2 py-1">
        <span className="text-xs text-gray-600">filter</span>
        <select
          className="rounded border px-1 py-0.5 text-sm"
          value={spec.filter === 'point' ? 'point' : 'smooth'}
          onChange={(e) => onSpec({ filter: e.target.value === 'point' ? 'point' : undefined })}
        >
          <option value="smooth">smooth</option>
          <option value="point">point (pixel art)</option>
        </select>
      </label>
      <p className="mt-1 text-[10px] leading-tight text-gray-500">
        Halve ppu to make every frame twice as big.
      </p>
    </div>
  )
}
