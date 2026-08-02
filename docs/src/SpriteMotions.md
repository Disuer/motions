# Sprite Motions (no Unity)

For a motion that is just sprite frames, with no custom particles or shaders, you do
not need Unity at all. Drop PNGs in a folder and the plugin animates them.

## The simplest version

```
MyMod /
    custom_motions /
        10101_YiSang_BaseAppearance /
            motions /
                Idle /
                    stand_1.png
                    stand_2.png
                    stand_3.png
```

That is a working motion. The frames play in order at 12fps and loop.

Files are sorted **naturally**, so `stand_2.png` comes before `stand_10.png`. You do
not have to zero-pad.

## Taking control: `animation.json`

Put an `animation.json` next to the PNGs when the default is not what you want.
You can also [write it in the browser](Editor.md) instead of by hand.

```json
{
  "duration": 1.2,
  "ppu": 200,
  "frames": [
    { "t": 0.00, "sprite": "swing_1.png", "offset": [0, 0] },
    { "t": 0.10, "sprite": "swing_2.png", "offset": [0.05, 0.02] },
    { "t": 0.18, "sprite": "swing_3.png", "offset": [0.31, 0] }
  ],
  "sfx": [
    { "t": 0.25, "file": "slash.wav" }
  ]
}
```

| Field | Meaning |
|---|---|
| `duration` | How long the whole motion lasts, in seconds |
| `ppu` | Pixels per unit. Halve it to make every frame twice as big |
| `filter` | `"point"` for crisp pixel art. Anything else is smoothed |
| `frames[].t` | When this frame appears, **in seconds** |
| `frames[].sprite` | Filename of the PNG, in this same folder |
| `frames[].offset` | `[x, y]` in world units, nudging the frame from where it would sit |
| `frames[].scale` | Size multiplier for this frame. Defaults to `1` |
| `sfx[].t` | When the sound fires, in seconds |
| `sfx[].file` | A `.wav` or `.ogg` in this same folder |
| `sfx[].clipIn` | Skip this many seconds into the sound file. Defaults to `0` |
| `sfx[].duration` | Stop after this long. Defaults to playing to the end |

### Seconds, not fractions

Times here are **seconds**. This is different from `S1.json`, where times are a
fraction of `totalDuration`. See [JSON Reference](JsonReference.md). The difference
exists because `animation.json` is the file that decides how long the motion is, so
there is nothing for a fraction to be relative to.

### Your character stands on the ground

By default each frame is placed **centred left-to-right, with its bottom edge on the
ground**. So if you draw a character standing on the bottom of the canvas, it just
works, with no `offset` needed.

`offset` is there for when it doesn't. `[0, 0.2]` lifts the frame off the ground by
0.2 units; `[0.1, 0]` nudges it right. Use it to line up frames drawn on
different-sized canvases, or ones where your character isn't sitting on the bottom
edge.

### Frames do not blend

A frame stays on screen until the next one's `t`. Nothing is interpolated. If you
want your character to travel across the screen, that is `phases` in
[the skill JSON](JsonReference.md), not `offset`.

## Folder names

Folder names match the motion, exactly like timeline asset names do for bundles:

| Folder | Used for |
|---|---|
| `S1` | `S1`, first coin |
| `S1_1` | `S1`, second coin |
| `Idle` | `Idle` |
| `Damaged` | `Damaged` |

**A skill with several coins does not need a folder each.** If `S1_1` is missing,
coin two reuses `S1`. Add the numbered folders only when you want each coin to look
different.

Non-skill motions do not support `_N` variants yet: `Idle_1` is ignored. Bundles
still do.

## Attacks that get cut short

If your attack animation stops partway through, the culprit is almost always
`hitCheckers` in your `S1.json`. It marks the point where the coin may hand off, and
if you have written an `S1.json` without one, it defaults to **15%** of the coin,
so a two second animation stops after 0.3s.

```json
"hitCheckers": [{ "time": 1.0, "isNextMotionCoinDelay": 0.0 }]
```

`1.0` means "hand off at the end". With no `S1.json` at all, sprite motions already
do this for you.

## Your PNGs

Save them as ordinary 8-bit RGB or RGBA PNGs. **Indexed / palette PNGs will not
load**. Some tools export those by default, so if a frame goes missing, re-save it
as a normal PNG. Greyscale is fine; 16-bit and interlaced are not.

## Mixing with bundles

A character folder can have both. Each motion is resolved on its own:

1. A `motions/<Motion>/` folder, if there is one
2. Otherwise the `.bundle`
3. Otherwise the game's own motion

So you can animate `S1` and `Idle` from PNGs while still shipping a Unity-built
bundle for your custom VFX prefabs.

## What still needs Unity

Custom particles, shaders and materials. Those are real Unity prefabs and there is
no way around building them in the editor. See [Bundles](Bundles.md) and
[VFX](VFX.md).

You can still reuse the **game's own** VFX with no bundle at all, using the `vfx`
array in the skill JSON.

## When it does not work

Everything degrades quietly rather than crashing, so check
`BepInEx/LogOutput.log` and search for `[SpriteMotion]`. A rejected
`animation.json`, a missing PNG or an undecodable file each log a line saying which
file and why.
