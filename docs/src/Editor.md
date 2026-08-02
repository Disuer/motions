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

**+ folder** makes a new one — type a name and click it, or pick from the
dropdown of the game's own motion names (`Idle`, `S1`, `Damaged_2`, and so
on). Free text works too; the plugin logs a warning for a name it does not
recognise rather than rejecting it.

## The canvas

The dashed box is one vanilla character: 1 × 2 world units, which is a 200×400
PNG at the default `ppu` of 200. The blue line is the ground.

**Your character stands on that line.** `offset` is measured in world units from
there — `[0, 0.2]` lifts a frame off the ground, `[0.1, 0]` nudges it right.

| | |
|---|---|
| Arrow keys | Nudge by 0.01 units |
| Shift + arrows | Nudge by 0.1 units |
| Delete / Backspace | Removes the frame shown in the panel on the right |
| The `arrows move:` button | Switches between one frame and all of them |
| **Align all** | Snaps every frame's drawn pixels to bottom-centre |
| **Align X only** | Horizontal only — leaves a jump or crouch alone |

Use **Align all** when your frames were exported trimmed, or drawn on canvases of
different sizes. If you drew everything on one canvas with the feet at the
bottom, you will not need it.

Removing a frame — with the key or the **remove frame** button in the panel —
only takes it out of `animation.json`. The PNG stays on disk and reappears
under **unused assets**, ready to be added back with one click. You cannot
remove a motion's last frame; an empty animation is a file the editor could
not reopen either, so the button disables itself and the key does nothing.

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

**A same-named file overwrites the old one.** Dropping `stand_1.png` onto a
folder that already has one replaces its bytes — that is someone's artwork
gone with no undo, so the message after a drop always splits out "N
imported" from "M replaced". Watch for the second number.

PNGs the game cannot decode are refused right there, by name. That is
indexed/palette, 16-bit and interlaced files — see
[Sprite Motions](SpriteMotions.md#your-pngs). Getting told at import is much
better than the alternative, which is a frame that silently fails to appear
in game.
