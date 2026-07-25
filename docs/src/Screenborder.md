# Screenborder Effects

This is a subset of VFX that should be read after having read the VFX guide. This will allow you to create effects akin to the RR line's edge of screen vfx, or the special LOR/Lob Corp walp effects.

In order to get started, create a folder named `CUSTOMSCREEN` in your motions folder. In this folder, add a bundle that contains only the VFX's prefab, material, and shader/shadergraph. Motions will automatically find the material and convert it to a canvas.

The naming of this bundle is important, as you will need to use the bundle's name to activate the effect. Here is an [example package](assets/TestVFX.unitypackage) that has a basic border effect.

In order to activate this effect, go to your encounter's `stageScriptList`, and add `ScreenBorder_(Bundlename)`, which will then prompt Motions to find the bundle and load it. An example is linked below.

[](assets/ScreenBorderExample.png)
