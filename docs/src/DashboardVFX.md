# Dashboard VFX

In order to use dashboard VFX, it is recommended to have viewed the `vfx` guide before having viewed this one.

In order to use this, create a new `DASHBOARD` folder in your `custom_motions` folder. Within this folder, insert the bundle that contains your prefab.

Next, use the provided modular consequence in order to summon your custom dashboard VFX. The args are as follows:

`customslotvfx(var_1,var_2,var_3,var_4,opt_1,opt_2,opt_3,opt_4)`

The parameters are:
`var_1`: Target (see Modular's Mult-Targeting)

`var_2`: slotNum | 0 for first slot, 1 for 2nd, etc.

`var_3`: active? | `true` or `false`

`var_4`: vfxName | name of the bundle in the `DASHBOARD` folder (i.e `flowy.bundle` -> `flowy`

`opt_1`: topSlot | `"top` or `"bottom"`, defaults to bottom

`opt_2`: X Position | How much to offset the X position of your VFX (relative to the slot)

`opt_3`: Y Position | How much to offset the Y position of your VFX (relative to the slot)

`opt_4`: Y Position | How much to offset the Z position of your VFX (relative to the slot)

Reminder, `opt` parameters may be left blank. Here's an example use case of spawning custom VFX on the dashboard. (FakePower timing is reccomended)

`"Modular/TIMING:FakePower/customslotvfx(Self,0,true,indexflowy,bottom,0,4,1)"`

