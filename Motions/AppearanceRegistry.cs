using System;
using System.IO;
using System.Text.Json;

namespace Motions;

[System.Serializable]
public class AppearanceConfig
{
    /// <summary>The vanilla appearance ID to clone as a donor rig.</summary>
    public string @base;
}

/// <summary>
/// Reads motion_appearances/&lt;Name&gt;/appearance.json and owns the custom appearance ID prefix.
/// </summary>
public static class AppearanceRegistry
{
    /// <summary>
    /// Deliberately not Lethe's "!custom_" - that prefix routes into Lethe's own bundle scan
    /// (Lethe/Patches/Skin.cs), and two plugins resolving the same ID would race.
    /// </summary>
    public const string Prefix = "!motions_";

    /// <summary>
    /// Used when a folder has no usable appearance.json. Yi Sang's base appearance is always
    /// present and is the character the docs use throughout, so it is the least surprising rig to
    /// land on. Never failing here matters: an unregistered appearance surfaces later as a null
    /// skin, which the game does not check and crashes on.
    /// </summary>
    public const string DefaultBase = "10101_YiSang_BaseAppearance";

    private static readonly JsonSerializerOptions Options = new()
    {
        IncludeFields = true,
        AllowTrailingCommas = true,
        ReadCommentHandling = JsonCommentHandling.Skip
    };

    /// <summary>
    /// The donor appearance for this folder. Never returns null: a folder of PNGs and nothing else
    /// is a valid mod, and every failure here would otherwise become a crash far from its cause.
    /// </summary>
    public static string ReadBase(string appearanceDir)
    {
        string name = Path.GetFileName(appearanceDir);
        string path = Path.Combine(appearanceDir, "appearance.json");

        if (!File.Exists(path))
        {
            Logger.LogInfo($"[Appearance] '{name}' has no appearance.json; building on {DefaultBase}. " +
                           "Add one with a \"base\" to build on a different character.");
            return DefaultBase;
        }

        try
        {
            var config = JsonSerializer.Deserialize<AppearanceConfig>(File.ReadAllText(path), Options);
            if (config == null || string.IsNullOrEmpty(config.@base))
            {
                Logger.LogWarning($"[Appearance] '{path}' has no \"base\"; falling back to {DefaultBase}.");
                return DefaultBase;
            }
            return config.@base;
        }
        catch (Exception ex)
        {
            Logger.LogWarning($"[Appearance] '{path}' is malformed - {ex.Message}. " +
                              $"Falling back to {DefaultBase}.");
            return DefaultBase;
        }
    }
}
