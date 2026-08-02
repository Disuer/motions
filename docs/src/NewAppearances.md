# New Appearances (no Unity)

[Sprite Motions](SpriteMotions.md) replaces the motions of a character that already
exists, which means every unit using that appearance changes. This page is for
adding a **brand new** appearance instead, colliding with nothing.

## The simplest version

```
MyMod /
    motion_appearances /
        MyGuy /
            motions /
                Idle /  stand_1.png  stand_2.png
```

That is a whole new appearance. The folder name is its name: `MyGuy` becomes the
appearance ID **`!motions_MyGuy`**.

Everything inside works exactly as it does for a normal character folder: same
`motions/` structure, same `animation.json`, same `S1.json`. See
[Sprite Motions](SpriteMotions.md) for those.

## Choosing a base: `appearance.json`

Your appearance is built by taking an existing one and drawing your sprites over
it. You never see that character, but you inherit its size, weight and height,
which is what makes knockback, targeting and the camera behave sensibly.

With no `appearance.json`, you get Yi Sang's base appearance. To build on someone
else, add one:

```json
{ "base": "10703_Heathcliff_BaseAppearance" }
```

| Field | Meaning |
|---|---|
| `base` | An existing appearance to build yours on top of |

Pick a base whose build is close to what you are drawing. A tall character based on
a short one will look like it is standing in a hole.

## Using it

Give a unit the appearance ID `!motions_MyGuy`. The usual route is a skill ability
script named `ChangeAppearance_!motions_MyGuy`, which swaps the unit's appearance
when the skill is used.

## Naming rule

**Your folder name must not contain the word `Appearance`.** Names containing it get
silently cut short, so `MyAppearance_v2` would end up resolving to something else
entirely. The plugin refuses these at load and says so in the log.

## When it does not work

Search `BepInEx/LogOutput.log` for `[Appearance]`. It says which base each
appearance was built on, and warns if a malformed `appearance.json` made it fall
back to the default.

A `base` naming an appearance that does not exist is the one thing that still
fails outright: the log says so, and the character will not load.

If parts of the base character show through your sprites, that is a bug worth
reporting with a screenshot. The fix is one more renderer to hide.
