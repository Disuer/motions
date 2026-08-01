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

    private static readonly JsonSerializerOptions Options = new()
    {
        IncludeFields = true,
        AllowTrailingCommas = true,
        ReadCommentHandling = JsonCommentHandling.Skip
    };

    public static string ReadBase(string appearanceDir)
    {
        string path = Path.Combine(appearanceDir, "appearance.json");
        if (!File.Exists(path))
        {
            Logger.LogError($"[Appearance] '{Path.GetFileName(appearanceDir)}' has no appearance.json, skipping.");
            return null;
        }

        try
        {
            var config = JsonSerializer.Deserialize<AppearanceConfig>(File.ReadAllText(path), Options);
            if (config == null || string.IsNullOrEmpty(config.@base))
            {
                Logger.LogError($"[Appearance] '{path}' has no \"base\", skipping.");
                return null;
            }
            return config.@base;
        }
        catch (Exception ex)
        {
            Logger.LogError($"[Appearance] '{path}' is malformed - {ex.Message}. Skipping.");
            return null;
        }
    }
}
