# The Editor

<https://league-of-nine.github.io/motions/editor/>

A browser page that writes `animation.json` for you. It opens your mod folder
directly: what you edit is what the game loads, with no export step.

**It needs Chrome or Edge.** Firefox and Safari cannot write to a folder yet.

## Opening a folder

**Open mod folder**, and point it at your mod. There is nothing to classify
first. The editor works out what it found, the same way the plugin does:

| | Folder |
|---|---|
| **New appearance** | `motion_appearances/<Name>/`, a character of your own |
| **Override a character** | `custom_motions/<appearanceID>/`, replaces an existing one |

The kind is read off the path. A mod holding several characters asks which one
you meant, and that is the only question you normally see.

The one exception is a character folder opened *on its own*, with no
`motion_appearances/` or `custom_motions/` above it to say and no
`appearance.json` in it yet. That is genuinely ambiguous, so the editor asks rather
than guessing. Open the mod folder instead and it never comes up.

## Starting a new mod

**Start a new mod** asks for a folder, then for a name and which kind you are
making. It creates the rest:

```text
mods/MyMod/motion_appearances/MyGuy/motions/
```

**Point it at `Lethe/mods` itself and it will say so and stop.** Every folder
in there is a separate mod that the plugin loads on its own, so a character put
directly in `mods/` would sit outside all of them and never load: the folder
would be right, the game would simply never look at it. Instead you are asked
for a mod name, and that folder is made for you. A name starting with
`DISABLED_` or `FULLDISABLED_` is refused for the same reason: the plugin skips
those outright.

plus an `appearance.json` holding the donor the plugin would have defaulted to,
so the folder says what it is when you open it again later. An `appearance.json`
that already exists is left alone.

Opening a folder that holds no character offers the same thing rather than
just refusing. A mod folder you made a minute ago looks exactly like a folder
you picked by mistake, and only you know which it is.

From there, **Add motion** makes the first `motions/<Motion>/` folder and you
drop PNGs onto the canvas to fill it.

Every folder under those two is a character, exactly as the plugin treats it,
including a **bundle character** with no `motions/` folder at all. Those open
with no tabs, which is not an error: **Add motion** creates the first sprite
motion beside the bundle, and the bundle keeps working. The `DASHBOARD`,
`CUSTOMSCREEN` and `MOTIONBUFF_` folders are skipped, the same names the plugin
skips.

**The character's name at the top left is a menu.** It lists the other
characters found in the same mod, so switching is one click with no re-picking, and
and **Open another mod…** goes back to this screen. Either way, unsaved changes
are named and confirmed before they are dropped.

Every `motions/<Motion>/` folder inside becomes a tab. A folder with no
`animation.json` opens as the 12fps default, so you can start from a pile of
PNGs and adjust from there.

**Add motion** makes a new one. It lists the game's own motion names grouped by
kind (skills, skill coins, states, parrying, duel) and searches as you type;
names you already have are marked and cannot be added twice. Free text works
too: type anything and the list offers to create it, because the plugin logs a
warning for a name it does not recognise rather than rejecting it.

### Per-coin animations

A skill can have a different animation per coin, in a `<Skill>_N` folder, the
same as a bundle. Select a skill and a **Coins** row appears under its tab:

```text
Idle   S1 3   S2                    [+ Add motion]
Coins   all coins  coin 1  coin 2   [+ Add coin]
```

**all coins** is the plain `S1` folder, which every coin falls back to when it
has no animation of its own, so you only make the ones that actually differ.
**Add coin** makes the next one, as many as you like; there is no ceiling.

Coins do not appear in **Add motion**, because a coin belongs to a skill and
this row already knows which. The number beside a tab is how many folders that
motion has.

This has nothing to do with `S1.json`. How many coins that file declares is a
separate question on a separate tab, and it does not limit which animations you
can draw.

## Skill timings

A character with `S1.json` files beside its bundle gets a second view,
**Skill timings**, next to the sprite motions. One tab per file, one tab per
coin inside it, and every array in the schema drawn as a track:

| Track | What it holds |
|---|---|
| **phases** | Movement and damage, spanning `start` to `end` |
| **hits** | `hitCheckers`, where the coin may hand off |
| **zooms**, **rotates**, **shakes** | Camera work |

Drag a marker to move it. Double-click empty track space to add one there.
Everything on the axis is a **fraction of `totalDuration`**, so 0.5 is halfway
through the coin, and the panel on the right holds every field the schema
defines for whatever is selected.

**A camera duration is in seconds while its start is a fraction.** That is the
easiest thing to get wrong in these files, so the timeline converts: a 0.5s zoom
in a 2s coin is drawn a quarter of the bar wide, and the field is labelled
`duration (s)`.

Only files the game actually reads get a tab: `<Motion>.json` for a name in
`MOTION_DETAIL`, so `S1.json` and `Idle.json` but not `CharacterVFX.json`.
Comments and trailing commas are fine, exactly as they are for the plugin.

A field you never set stays out of the file. The panel shows the game's default
as grey placeholder text, and clearing a box puts it back to unset rather than
writing a zero. Only a value you actually type is written, and keys the editor
does not recognise, including the `$schema` line at the top, survive a save
untouched.

**The placeholders come from the plugin's own C#, not from `schema.json`**,
which disagrees with it in three places: `isUpAttack` really defaults to *true*
once a `damage` object exists, and `focusRotateSpeed` and every camera
`duration` really default to `0`.

**Add coin** creates one with a hit checker at the very end rather than none,
because a coin with no `hitCheckers` hands off at 15% of its length, which
shows up much later as an attack that gets cut short.

A file that cannot be parsed is shown as an error and never rewritten. Fix it
in a text editor and reopen the character.

## The canvas

The dashed box is one vanilla character: 1 × 2 world units, which is a 200×400
PNG at the default `ppu` of 200. The blue line is the ground.

**Your character stands on that line.** `offset` is measured in world units from
there. `[0, 0.2]` lifts a frame off the ground, `[0.1, 0]` nudges it right.

| | |
|---|---|
| Left drag | Moves the frame you are looking at |
| Middle or right drag | Pans the view |
| Scroll wheel | Zooms towards the pointer |
| The **zoom** slider | 0.25× to 4×, the view only, never the frame. Click the number to reset |
| Arrow keys | Nudge by 0.01 units |
| Shift + arrows | Nudge by 0.1 units |
| Delete / Backspace | Removes the frame shown in the panel on the right |
| The `arrows move:` button | Switches between one frame and all of them |
| **Align all** | Snaps every frame's drawn pixels to bottom-centre |
| **Align X only** | Horizontal only, leaves a jump or crouch alone |

Panning and zooming change nothing in the file: the ground line and the
dashed box move with the view, so what you align against stays honest.

Use **Align all** when your frames were exported trimmed, or drawn on canvases of
different sizes. If you drew everything on one canvas with the feet at the
bottom, you will not need it.

## Adding frames

Two ways, both on the right:

**Sprites** lists every PNG in the motion folder and adds one as a frame at the
end. A sprite already on the timeline stays in the list, so you can place it
again for a held pose or a there-and-back cycle; the ones not used yet are
tagged **unused**.

**Duplicate**, in the frame panel, copies the frame you are on and drops the
copy halfway to the next one, keeping its offset and scale. That is the quicker
start when a frame only differs slightly from the one before it.

Removing a frame, with the key or the **Remove** button in the panel, only
takes it out of `animation.json`. The PNG stays on disk and stays in the
**Sprites** list. You cannot remove a motion's last frame; an empty animation
is a file the editor could not reopen either, so the button disables itself and
the key does nothing.

## The timeline

Frame markers on top, sound cues underneath. Drag either to change its time.
Times are in **seconds**, unlike `S1.json`, where they are a fraction of
`totalDuration`.

**Space evenly at N fps** does the common case in one click.

## Sounds

Drop a `.wav` or `.ogg` onto the canvas and it lands in the motion folder,
where it appears under **Sounds** in the right-hand panel. Clicking it adds a
cue at the frame you are looking at, which is usually where you want the hit
sound, and you can drag it from there.

Click a cue to select it. The panel then holds its three fields:

| | |
|---|---|
| **time** | When it fires, in seconds |
| **skip in** | Start this far into the file. `0` plays from the beginning |
| **play for** | Stop after this long. `0` plays to the end |

Leaving skip and play at `0` writes neither key, so the whole file plays.

The same sound can be cued as many times as you like, so it stays in the list
after you use it, unlike an unused PNG. **Remove** takes a cue out of
`animation.json` and leaves the sound file on disk.

## Saving

**Save** shows exactly which files it is about to write, then writes them. It
only ever writes `animation.json`, `appearance.json` and files you import, all
inside the folder you picked. **It never deletes anything**. Removing a frame
takes it out of the JSON and leaves the PNG where it is.

## Importing

Drag PNGs, `.wav`s or `.ogg`s onto the canvas to copy them into the motion
folder.

**A same-named file overwrites the old one.** Dropping `stand_1.png` onto a
folder that already has one replaces its bytes, and that is someone's artwork
gone with no undo, so the message after a drop counts the two separately:
"3 imported, 1 replaced" if both happened, and only the part that did
happen otherwise. Watch for the "replaced" number.

PNGs the game cannot decode are refused right there, by name. That is
indexed/palette, 16-bit and interlaced files. See
[Sprite Motions](SpriteMotions.md#your-pngs). Getting told at import is much
better than the alternative, which is a frame that silently fails to appear
in game.
