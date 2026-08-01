using System;
using System.Collections.Generic;
using System.Linq;
using Motions;

static class Program
{
    static int failures = 0;

    static void Check(bool condition, string label)
    {
        if (condition) { Console.WriteLine($"  PASS  {label}"); }
        else { failures++; Console.WriteLine($"  FAIL  {label}"); }
    }

    static void Near(double actual, double expected, string label)
        => Check(Math.Abs(actual - expected) < 1e-9, $"{label} (got {actual}, want {expected})");

    static void Main()
    {
        Console.WriteLine("ParseFolderName");
        Check(SpriteMotionSpec.ParseFolderName("S1") == ("S1", 0), "S1 -> (S1, 0)");
        Check(SpriteMotionSpec.ParseFolderName("S1_1") == ("S1", 1), "S1_1 -> (S1, 1)");
        Check(SpriteMotionSpec.ParseFolderName("S1_12") == ("S1", 12), "S1_12 -> (S1, 12)");
        Check(SpriteMotionSpec.ParseFolderName("Idle") == ("Idle", 0), "Idle -> (Idle, 0)");
        // A trailing segment that is not a number is part of the name, not an index.
        Check(SpriteMotionSpec.ParseFolderName("Parrying_Success") == ("Parrying_Success", 0),
              "Parrying_Success keeps its underscore");
        Check(SpriteMotionSpec.ParseFolderName("S1_") == ("S1_", 0), "trailing underscore is not an index");
        Check(SpriteMotionSpec.ParseFolderName("S1_-2") == ("S1_-2", 0), "negative suffix is not an index");

        Console.WriteLine("CompareNatural");
        var names = new List<string> { "frame_10.png", "frame_2.png", "frame_1.png" };
        names.Sort(SpriteMotionSpec.CompareNatural);
        Check(names.SequenceEqual(new[] { "frame_1.png", "frame_2.png", "frame_10.png" }),
              "2 sorts before 10");
        var padded = new List<string> { "a_002.png", "a_1.png" };
        padded.Sort(SpriteMotionSpec.CompareNatural);
        Check(padded.SequenceEqual(new[] { "a_1.png", "a_002.png" }), "zero padding does not change order");

        Console.WriteLine("EffectivePpu");
        Near(SpriteMotionSpec.EffectivePpu(100, 1.0), 100, "scale 1 leaves ppu alone");
        Near(SpriteMotionSpec.EffectivePpu(100, 2.0), 50, "scale 2 halves ppu (sprite renders twice as big)");

        Console.WriteLine("Pivot");
        Near(SpriteMotionSpec.PivotX(0, 100, 100), 0.5, "no offset is horizontally centred");
        // Vertical anchor is the bottom edge - the transform sits at the character's feet.
        Near(SpriteMotionSpec.PivotY(0, 200, 100), 0.0, "no offset stands on the origin");
        // 100px wide at 100 ppu is 1 world unit, so a 0.5 unit shift is half the sprite.
        Near(SpriteMotionSpec.PivotX(0.5, 100, 100), 0.0, "half-width shift lands the pivot on the edge");
        Near(SpriteMotionSpec.PivotX(1.0, 100, 100), -0.5, "pivot outside the rect is legal");
        // 200px tall at 100 ppu is 2 world units; lifting by 0.5 is a quarter of the height.
        Near(SpriteMotionSpec.PivotY(0.5, 200, 100), -0.25, "positive offset lifts the frame off the ground");
        Near(SpriteMotionSpec.PivotY(-0.5, 200, 100), 0.25, "negative offset sinks the frame");

        Console.WriteLine("FrameIndexAt");
        var times = new double[] { 0.0, 0.1, 0.2 };
        Check(SpriteMotionSpec.FrameIndexAt(times, 0.0) == 0, "t at first boundary");
        Check(SpriteMotionSpec.FrameIndexAt(times, 0.05) == 0, "t between frames holds the earlier one");
        Check(SpriteMotionSpec.FrameIndexAt(times, 0.1) == 1, "t exactly on a boundary takes the new frame");
        Check(SpriteMotionSpec.FrameIndexAt(times, 99.0) == 2, "past the end holds the last frame");
        Check(SpriteMotionSpec.FrameIndexAt(times, -1.0) == 0, "before the start clamps to the first frame");
        Check(SpriteMotionSpec.FrameIndexAt(new double[0], 0.5) == -1, "empty is -1");
        // A first frame that starts late must still show something, or the character is invisible.
        Check(SpriteMotionSpec.FrameIndexAt(new double[] { 0.5, 1.0 }, 0.0) == 0, "late first frame still clamps");

        Console.WriteLine("DefaultSpec");
        var def = SpriteMotionSpec.DefaultSpec(new[] { "b_10.png", "b_2.png", "b_1.png" });
        Check(def.frames.Count == 3, "one frame per png");
        Check(def.frames[0].sprite == "b_1.png", "natural order applied");
        Check(def.frames[2].sprite == "b_10.png", "10 comes last");
        Near(def.frames[1].t, 1.0 / SpriteMotionSpec.DefaultFps, "frames evenly spaced at DefaultFps");
        Near(def.duration, 3.0 / SpriteMotionSpec.DefaultFps, "duration covers every frame");
        Near(def.ppu, SpriteMotionSpec.DefaultPpu, "default ppu");
        Check(def.frames[0].scale == 1.0, "default scale is 1");

        Console.WriteLine("Parse");
        var ok = SpriteMotionSpec.Parse(
            "{\"duration\":1.2,\"ppu\":50,\"frames\":[{\"t\":0,\"sprite\":\"a.png\",\"offset\":[0.1,0.2]}]," +
            "\"sfx\":[{\"t\":0.25,\"file\":\"s.wav\"}]}", out string err);
        Check(ok != null && err == null, "valid json parses");
        Near(ok.duration, 1.2, "duration read");
        Near(ok.ppu, 50, "ppu read");
        Near(ok.frames[0].offset[0], 0.1, "offset x read");
        Check(ok.frames[0].scale == 1.0, "omitted scale defaults to 1");
        Check(ok.sfx[0].file == "s.wav", "sfx read");
        Near(ok.sfx[0].clipIn, 0.0, "omitted clipIn defaults to 0");

        // An omitted ppu must fall back to the measured default, not 0.
        var noPpu = SpriteMotionSpec.Parse("{\"duration\":1.0,\"frames\":[{\"t\":0,\"sprite\":\"a.png\"}]}", out _);
        Near(noPpu.ppu, SpriteMotionSpec.DefaultPpu, "omitted ppu defaults");
        Check(noPpu.frames[0].offset != null && noPpu.frames[0].offset.Length == 2, "omitted offset becomes [0,0]");
        Check(noPpu.sfx != null && noPpu.sfx.Count == 0, "omitted sfx becomes an empty list");

        // Trailing commas and comments are tolerated, matching TimelineBuilder.JsonOptions.
        Check(SpriteMotionSpec.Parse("{\"duration\":1.0,\"frames\":[{\"t\":0,\"sprite\":\"a.png\"},],}", out _) != null,
              "trailing commas tolerated");

        Check(SpriteMotionSpec.Parse("{ not json", out string e1) == null && e1 != null,
              "malformed json returns null and a reason");
        Check(SpriteMotionSpec.Parse("{\"duration\":1.0}", out string e2) == null && e2 != null,
              "no frames returns null and a reason");
        Check(SpriteMotionSpec.Parse("{\"duration\":1.0,\"frames\":[]}", out string e3) == null && e3 != null,
              "empty frames returns null and a reason");
        Check(SpriteMotionSpec.Parse("{\"duration\":0,\"frames\":[{\"t\":0,\"sprite\":\"a.png\"}]}", out string e4) == null && e4 != null,
              "zero duration returns null and a reason");
        Check(SpriteMotionSpec.Parse("{\"duration\":1.0,\"frames\":[{\"t\":0}]}", out string e5) == null && e5 != null,
              "frame with no sprite returns null and a reason");

        // Frames given out of order are sorted, not rejected.
        var unsorted = SpriteMotionSpec.Parse(
            "{\"duration\":1.0,\"frames\":[{\"t\":0.5,\"sprite\":\"b.png\"},{\"t\":0.0,\"sprite\":\"a.png\"}]}", out _);
        Check(unsorted.frames[0].sprite == "a.png", "frames sorted by t");

        Console.WriteLine();
        Console.WriteLine(failures == 0 ? "ALL PASS" : $"{failures} FAILURE(S)");
        Environment.Exit(failures == 0 ? 0 : 1);
    }
}
