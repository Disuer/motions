using System;
using System.Collections.Generic;
using UnityEngine;
using UnityEngine.Playables;
using UnityEngine.Timeline;

namespace Motions
{
    public static class ProduceModConfig
    {
        // Instantiated template prefab for each produce.
        public static readonly Dictionary<string, GameObject> producePrefabs = new();

        // Factory used to create the registered ProduceAddOn for each produce.
        public static readonly Dictionary<string, Func<GameObject, ProduceAddOn>> produceAddOns = new();
    }

    public static class BattleProduceInjector
    {
        // ----------------------------------------------------------------
        // Public registration API
        // ----------------------------------------------------------------

        public static void RegisterProduce(string key)
        {
            if (!MotionData.produceAssets.TryGetValue(key, out var bundle) || bundle == null)
            {
                Debug.LogError($"[Produce] No AssetBundle found for produce '{key}'.");
                return;
            }

            RegisterProduceInternal(key, bundle, null);
        }

        public static void RegisterProduce(string key, AssetBundle bundle)
        {
            RegisterProduceInternal(key, bundle, null);
        }

        public static void RegisterProduce<TAddon>(string key)
            where TAddon : ProduceAddOn
        {
            // Register the factory first so addon registration survives even if
            // the AssetBundle isn't loaded yet.
            ProduceModConfig.produceAddOns[key] =
                go => go.AddComponent<TAddon>();

            if (!MotionData.produceAssets.TryGetValue(key, out var bundle) || bundle == null)
            {
                Debug.LogWarning(
                    $"[Produce] Bundle for '{key}' is not available yet. " +
                    $"Addon registration was retained.");
                return;
            }

            RegisterProduceInternal(key, bundle, ProduceModConfig.produceAddOns[key]);
        }

        public static void RegisterProduce<TAddon>(string key, AssetBundle bundle)
            where TAddon : ProduceAddOn
        {
            ProduceModConfig.produceAddOns[key] =
                go => go.AddComponent<TAddon>();

            RegisterProduceInternal(key, bundle, ProduceModConfig.produceAddOns[key]);
        }

        // ----------------------------------------------------------------
        // Internal registration
        // ----------------------------------------------------------------

        private static void RegisterProduceInternal(
            string key,
            AssetBundle bundle,
            Func<GameObject, ProduceAddOn> addonFactory)
        {
            if (string.IsNullOrEmpty(key))
            {
                Debug.LogError("[Produce] Cannot register produce with an empty key.");
                return;
            }

            if (bundle == null)
            {
                Debug.LogError($"[Produce] AssetBundle for produce '{key}' is null.");
                return;
            }

            MotionData.produceAssets[key] = bundle;

            // A non-generic RegisterProduce call preserves any existing factory.
            if (addonFactory != null)
            {
                ProduceModConfig.produceAddOns[key] = addonFactory;
            }

            RegisterProducePrefab(key, bundle);
        }

        public static void InitializeProducePrefabs()
        {
            foreach (var pair in MotionData.produceAssets)
            {
                string key = pair.Key;
                AssetBundle bundle = pair.Value;

                if (ProduceModConfig.producePrefabs.TryGetValue(key, out var existing)
                    && existing != null)
                {
                    continue;
                }

                RegisterProducePrefab(key, bundle);
            }
        }

        private static void RegisterProducePrefab(string key, AssetBundle bundle)
        {
            if (bundle == null)
            {
                Debug.LogError($"[Produce] AssetBundle for key '{key}' is null.");
                return;
            }

            string[] assetNames = bundle.GetAllAssetNames();
            if (assetNames == null || assetNames.Length == 0)
            {
                Debug.LogWarning($"[Produce] AssetBundle '{key}' contains no assets.");
                return;
            }

            GameObject prefab = null;
            foreach (string assetName in assetNames)
            {
                try
                {
                    var candidate = bundle.LoadAsset<GameObject>(assetName);
                    if (candidate != null)
                    {
                        prefab = candidate;
                        break;
                    }
                }
                catch (Exception ex)
                {
                    Debug.LogWarning(
                        $"[Produce] Failed to load '{assetName}' from bundle '{key}': {ex}");
                }
            }

            if (prefab == null)
            {
                Debug.LogWarning($"[Produce] No prefab found in AssetBundle '{key}'.");
                return;
            }

            if (ProduceModConfig.producePrefabs.TryGetValue(key, out var oldPrefab)
                && oldPrefab != null)
            {
                UnityEngine.Object.Destroy(oldPrefab);
            }

            GameObject instance = UnityEngine.Object.Instantiate(prefab);
            instance.name = $"CustomBattleProduce_{key}";
            instance.SetActive(false);

            ProduceModConfig.producePrefabs[key] = instance;
        }

        // ----------------------------------------------------------------
        // Playback
        // ----------------------------------------------------------------

        public static void PlayProduce(
            string key,
            int produceIndex = 0,
            bool autoEnd = true,
            DelegateEvent endCallback = null)
        {
            var manager = ProduceManager.Instance?.TryCast<BattleProduceManager>();
            if (manager == null)
            {
                Debug.LogError("[Produce] ProduceManager.Instance is NULL.");
                return;
            }

            if (manager.isProducing)
            {
                Debug.LogWarning($"[Produce] Already producing; ignoring request for '{key}'.");
                return;
            }

            if (!ProduceModConfig.producePrefabs.TryGetValue(key, out var prefab) || prefab == null)
            {
                Debug.LogError($"[Produce] Prefab for key '{key}' is NULL.");
                return;
            }

            var camManager = BattleCamManager.Instance;
            var objManager = BattleObjectManager.Instance;

            if (camManager == null) { Debug.LogError("[Produce] BattleCamManager.Instance is NULL."); return; }
            if (objManager == null) { Debug.LogError("[Produce] BattleObjectManager.Instance is NULL."); return; }
            if (camManager.MainCam == null) { Debug.LogError("[Produce] camManager.MainCam is NULL."); return; }

            GameObject produceGO = UnityEngine.Object.Instantiate(prefab);
            produceGO.name = $"CustomBattleProduce_{key}_Playback";
            produceGO.SetActive(true);

            var director = produceGO.GetComponent<PlayableDirector>();
            if (director == null)
            {
                Debug.LogWarning("[Produce] Prefab missing PlayableDirector; adding one.");
                director = produceGO.AddComponent<PlayableDirector>();
            }

            var timeline = director.playableAsset?.TryCast<TimelineAsset>();
            if (timeline == null)
            {
                Debug.LogError(
                    $"[Produce] '{key}': director.playableAsset is null or not a TimelineAsset.");
                UnityEngine.Object.Destroy(produceGO);
                return;
            }

            var produceBase =
                produceGO.GetComponent<ProduceBase>() ??
                produceGO.AddComponent<ProduceBase>();

            produceBase._director = director;
            produceBase._timeline = timeline;
            produceBase._mainCam = camManager.MainCam;
            produceBase._produceCam = camManager.MainCam;

            // --- ProduceAddOn: prefer the prefab's own, else the registered factory ---
            ProduceAddOn addon = produceGO.GetComponent<ProduceAddOn>();

            if (addon == null
                && ProduceModConfig.produceAddOns.TryGetValue(key, out var factory)
                && factory != null)
            {
                try
                {
                    addon = factory(produceGO);
                }
                catch (Exception ex)
                {
                    Debug.LogError($"[Produce] Addon factory threw for '{key}': {ex}");
                    UnityEngine.Object.Destroy(produceGO);
                    return;
                }
            }

            if (addon == null)
            {
                Debug.LogError($"[Produce] Aborting '{key}': no ProduceAddOn could be created.");
                UnityEngine.Object.Destroy(produceGO);
                return;
            }

            var addonList = new Il2CppSystem.Collections.Generic.List<ProduceAddOn>();
            addonList.Add(addon);
            produceBase._produceAddOn = addonList;

            // --- Manager state ---
            // isSetProduce is the gate on both SetProduce() and PlayProduce().
            // If left false the entire native produce pipeline silently no-ops.
            manager._curProduceBase = produceBase;
            manager.isProducing = true;
            manager.isMainCam = true;
            manager.isSetProduce = true;

            // --- Native produce initialization ---
            var liveViews = objManager.GetAliveViewList(UNIT_FACTION.NONE, false, false);

            produceBase.Init(manager);
            produceBase.InitViews(liveViews, includeDeadUnit: false);
            manager.SetProduce();

            // --- Play ---
            manager.PlayProduce(produceIndex, autoEnd, endCallback, isMainCamera: true);
        }
    }
}