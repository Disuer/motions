# New Appearances (no Unity)

[Sprite Motions](SpriteMotions.md) replaces the motions of a character that already
exists — which means every unit using that appearance changes. This page is for
adding a **brand new** appearance instead, colliding with nothing.

## Layout

```
MyMod /
    motion_appearances /
        MyGuy /
            appearance.json
            S1.json
            motions /
                Idle /  stand_1.png  stand_2.png
                S1 /    swing_1.png  swing_2.png  slash.wav
```

The folder name is the appearance name. `MyGuy` becomes the appearance ID
**`!motions_MyGuy`**.

Everything inside works exactly as it does for a normal character folder — same
`motions/` structure, same `animation.json`, same `S1.json`. The only new file is
`appearance.json`.

## `appearance.json`

```json
{ "base": "10101_YiSang_BaseAppearance" }
```

| Field | Meaning |
|---|---|
| `base` | An existing appearance to build yours on top of |

Your appearance is built by taking that one and drawing your sprites over it. You
never see the base character — but you inherit its size, weight and height, which
is what makes knockback, targeting and the camera behave sensibly.

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

Search `BepInEx/LogOutput.log` for `[Appearance]`. A missing or malformed
`appearance.json`, a `base` that is not a real appearance, or a rejected folder name
each log a line saying which and why.

If parts of the base character show through your sprites, that is a bug worth
reporting with a screenshot — the fix is one more renderer to hide.
