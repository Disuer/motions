# The Editor

<https://league-of-nine.github.io/motions/editor/>

A browser page that writes `animation.json` for you. It opens your mod folder
directly — what you edit is what the game loads, with no export step.

**It needs Chrome or Edge.** Firefox and Safari cannot write to a folder yet.

## Opening a folder

Pick which kind of folder you have:

| | Folder |
|---|---|
| **New appearance** | `motion_appearances/<Name>/` — a character of your own |
| **Override a character** | `custom_motions/<appearanceID>/` — replaces an existing one |

Every `motions/<Motion>/` folder inside becomes a tab. A folder with no
`animation.json` opens as the 12fps default, so you can start from a pile of
PNGs and adjust from there.

## The canvas

The dashed box is one vanilla character: 1 × 2 world units, which is a 200×400
PNG at the default `ppu` of 200. The blue line is the ground.

**Your character stands on that line.** `offset` is measured in world units from
there — `[0, 0.2]` lifts a frame off the ground, `[0.1, 0]` nudges it right.

| | |
|---|---|
| Arrow keys | Nudge by 0.01 units |
| Shift + arrows | Nudge by 0.1 units |
| The `arrows move:` button | Switches between one frame and all of them |
| **Align all** | Snaps every frame's drawn pixels to bottom-centre |
| **Align X only** | Horizontal only — leaves a jump or crouch alone |

Use **Align all** when your frames were exported trimmed, or drawn on canvases of
different sizes. If you drew everything on one canvas with the feet at the
bottom, you will not need it.

## The timeline

Frame markers on top, sound cues underneath. Drag either to change its time.
Times are in **seconds** — unlike `S1.json`, where they are a fraction of
`totalDuration`.

**Space evenly at N fps** does the common case in one click.

## Saving

**Save** shows exactly which files it is about to write, then writes them. It
only ever writes `animation.json`, `appearance.json` and files you import, all
inside the folder you picked. **It never deletes anything** — removing a frame
takes it out of the JSON and leaves the PNG where it is.

## Importing

Drag PNGs, `.wav`s or `.ogg`s onto the canvas to copy them into the motion
folder.

PNGs the game cannot decode are refused right there, by name. That is
indexed/palette, 16-bit and interlaced files — see
[Sprite Motions](SpriteMotions.md#your-pngs). Getting told at import is much
better than the alternative, which is a frame that silently fails to appear
in game.
