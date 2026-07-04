import { useEffect, useMemo, useRef, useState } from "react";
import { CleanupOrphanedThumbnailsResult, DatabaseInfo, OrphanedThumbnailsInfo, TaggerAcceleration, TaggerModel, TaggingQueueScope, VacuumResult, useGalleryStore } from "../store";
import { FfmpegStatusRow } from "./onboarding/StepWelcome";
import { Dropdown } from "./menu";
import { getChangelogForVersion } from "../changelog";
import { Tooltip } from "./Tooltip";
import { TAGGER_MODELS } from "../taggerModels";
import { CloseIcon } from "./icons";

type SettingsSection = "general" | "media" | "updates" | "storage" | "workspace";

const SECTIONS: { id: SettingsSection; label: string; detail: string }[] = [
  { id: "general", label: "General", detail: "Theme and notifications" },
  { id: "media", label: "Media", detail: "Playback and slideshow" },
  { id: "updates", label: "Updates & Setup", detail: "Versions, setup, and tour" },
  { id: "storage", label: "Storage", detail: "App data and maintenance" },
  { id: "workspace", label: "AI Workspace", detail: "Tagging models and queue targets" },
];

function formatBytesShort(bytes: number): string {
  if (bytes >= 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024 * 1024)).toFixed(1)} GB`;
  if (bytes >= 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(0)} MB`;
  return `${(bytes / 1024).toFixed(0)} KB`;
}

function StatusPill({ children, tone }: { children: React.ReactNode; tone: "ready" | "muted" | "busy" }) {
  const className =
    tone === "ready"
      ? "border-emerald-400/25 bg-emerald-500/10 text-emerald-300 light-theme:border-emerald-600/40 light-theme:bg-emerald-100 light-theme:text-emerald-700"
      : tone === "busy"
        ? "border-sky-400/25 bg-sky-500/10 text-sky-300 light-theme:border-sky-600/40 light-theme:bg-sky-100 light-theme:text-sky-700"
        : "border-white/10 bg-white/[0.04] text-gray-500";

  return <span className={`inline-flex rounded-md border px-2 py-0.5 text-[11px] font-medium ${className}`}>{children}</span>;
}

function SettingsGroup({ title, description, children }: {
  title: string;
  description?: string;
  children: React.ReactNode;
}) {
  return (
    <section>
      <h4 className="text-[12px] font-semibold uppercase tracking-[0.08em] text-gray-400">{title}</h4>
      {description ? <p className="mt-1 text-xs leading-relaxed text-gray-600">{description}</p> : null}
      <div className="mt-1 divide-y divide-white/[0.05]">{children}</div>
    </section>
  );
}

function SettingsItem({ label, description, children, vertical = false }: {
  label: React.ReactNode;
  description?: React.ReactNode;
  children?: React.ReactNode;
  vertical?: boolean;
}) {
  if (vertical) {
    return (
      <div className="py-4">
        <p className="text-sm text-white">{label}</p>
        {description ? <div className="mt-1 text-xs leading-relaxed text-gray-500">{description}</div> : null}
        {children ? <div className="mt-3">{children}</div> : null}
      </div>
    );
  }

  return (
    <div className="flex items-start justify-between gap-6 py-4">
      <div className="min-w-0">
        <p className="text-sm text-white">{label}</p>
        {description ? <div className="mt-1 max-w-xl text-xs leading-relaxed text-gray-500">{description}</div> : null}
      </div>
      <div className="shrink-0">{children}</div>
    </div>
  );
}

function StatPair({ label, value, accent = false }: { label: string; value: string; accent?: boolean }) {
  return (
    <span className="inline-flex items-baseline gap-2">
      <span className="text-[10px] uppercase tracking-[0.14em] text-gray-600">{label}</span>
      <span className={`text-sm font-semibold tabular-nums ${accent ? "text-emerald-300" : "text-white"}`}>{value}</span>
    </span>
  );
}

function ScopeButton({ scope, current, onSelect, children }: {
  scope: TaggingQueueScope;
  current: TaggingQueueScope;
  onSelect: (scope: TaggingQueueScope) => void;
  children: React.ReactNode;
}) {
  const active = scope === current;
  return (
    <button
      type="button"
      className={`rounded-md border px-3 py-1.5 text-xs transition-colors ${
        active
          ? "border-emerald-400/35 bg-emerald-500/15 text-emerald-200 light-theme:border-emerald-600/50 light-theme:bg-emerald-100 light-theme:text-emerald-700"
          : "border-transparent text-gray-500 hover:bg-white/[0.06] hover:text-gray-200 light-theme:text-gray-600 light-theme:hover:bg-gray-900 light-theme:hover:text-white"
      }`}
      onClick={() => onSelect(scope)}
    >
      {children}
    </button>
  );
}

function TaggerModelButton({ model, current, onSelect, children }: {
  model: TaggerModel;
  current: TaggerModel;
  onSelect: (model: TaggerModel) => void;
  children: React.ReactNode;
}) {
  const active = model === current;
  return (
    <button
      type="button"
      className={`rounded-md border px-3 py-1.5 text-xs transition-colors ${
        active
          ? "border-emerald-400/35 bg-emerald-500/15 text-emerald-200 light-theme:border-emerald-600/50 light-theme:bg-emerald-100 light-theme:text-emerald-700"
          : "border-transparent text-gray-500 hover:bg-white/[0.06] hover:text-gray-200 light-theme:text-gray-600 light-theme:hover:bg-gray-900 light-theme:hover:text-white"
      }`}
      onClick={() => onSelect(model)}
    >
      {children}
    </button>
  );
}

function TaggerAccelerationButton({ acceleration, current, onSelect, children }: {
  acceleration: TaggerAcceleration;
  current: TaggerAcceleration;
  onSelect: (acceleration: TaggerAcceleration) => void;
  children: React.ReactNode;
}) {
  const active = acceleration === current;
  return (
    <button
      type="button"
      className={`rounded-md border px-3 py-1.5 text-xs transition-colors ${
        active
          ? "border-emerald-400/35 bg-emerald-500/15 text-emerald-200 light-theme:border-emerald-600/50 light-theme:bg-emerald-100 light-theme:text-emerald-700"
          : "border-transparent text-gray-500 hover:bg-white/[0.06] hover:text-gray-200 light-theme:text-gray-600 light-theme:hover:bg-gray-900 light-theme:hover:text-white"
      }`}
      onClick={() => onSelect(acceleration)}
    >
      {children}
    </button>
  );
}

export function SettingsModal() {
  const [activeSection, setActiveSection] = useState<SettingsSection>("general");
  const [taggerQueueStatus, setTaggerQueueStatus] = useState<string | null>(null);
  const [taggerQueueing, setTaggerQueueing] = useState(false);
  const [taggerClearing, setTaggerClearing] = useState(false);
  const [taggerResetConfirming, setTaggerResetConfirming] = useState(false);
  const [taggerResetting, setTaggerResetting] = useState(false);
  const [taggerAccelerationSaving, setTaggerAccelerationSaving] = useState(false);
  const [taggerAccelerationError, setTaggerAccelerationError] = useState<string | null>(null);
  const [taggerModelSwitching, setTaggerModelSwitching] = useState(false);
  const [taggerModelSwitchError, setTaggerModelSwitchError] = useState<string | null>(null);
  const [taggerThresholdDraft, setTaggerThresholdDraft] = useState<string | null>(null);
  const [taggerThresholdSaving, setTaggerThresholdSaving] = useState(false);
  const [taggerThresholdError, setTaggerThresholdError] = useState<string | null>(null);
  const [taggerBatchSizeDraft, setTaggerBatchSizeDraft] = useState<string | null>(null);
  const [taggerBatchSizeSaving, setTaggerBatchSizeSaving] = useState(false);
  const [taggerBatchSizeError, setTaggerBatchSizeError] = useState<string | null>(null);
  const [openingDataFolder, setOpeningDataFolder] = useState(false);
  const [dbInfo, setDbInfo] = useState<DatabaseInfo | null>(null);
  const [vacuuming, setVacuuming] = useState(false);
  const [vacuumResult, setVacuumResult] = useState<VacuumResult | null>(null);
  const [rebuildingIndex, setRebuildingIndex] = useState(false);
  const [rebuildIndexResult, setRebuildIndexResult] = useState<string | null>(null);
  const [thumbnailInfo, setThumbnailInfo] = useState<OrphanedThumbnailsInfo | null>(null);
  const [cleaningThumbnails, setCleaningThumbnails] = useState(false);
  const [thumbnailCleanupResult, setThumbnailCleanupResult] = useState<CleanupOrphanedThumbnailsResult | null>(null);

  const thresholdErrorTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const batchSizeErrorTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const settingsOpen = useGalleryStore((state) => state.settingsOpen);
  const setSettingsOpen = useGalleryStore((state) => state.setSettingsOpen);
  const folders = useGalleryStore((state) => state.folders);
  const mediaJobProgress = useGalleryStore((state) => state.mediaJobProgress);
  const taggingQueueScope = useGalleryStore((state) => state.taggingQueueScope);
  const taggingQueueFolderIds = useGalleryStore((state) => state.taggingQueueFolderIds);
  const loadTaggingQueueScope = useGalleryStore((state) => state.loadTaggingQueueScope);
  const setTaggingQueueScope = useGalleryStore((state) => state.setTaggingQueueScope);
  const toggleTaggingQueueFolder = useGalleryStore((state) => state.toggleTaggingQueueFolder);
  const setTaggingQueueFolderIds = useGalleryStore((state) => state.setTaggingQueueFolderIds);
  const loadTaggingQueueFolderIds = useGalleryStore((state) => state.loadTaggingQueueFolderIds);
  const taggerModelStatus = useGalleryStore((state) => state.taggerModelStatus);
  const taggerModelPreparing = useGalleryStore((state) => state.taggerModelPreparing);
  const taggerModelProgress = useGalleryStore((state) => state.taggerModelProgress);
  const taggerModelError = useGalleryStore((state) => state.taggerModelError);
  const taggerAcceleration = useGalleryStore((state) => state.taggerAcceleration);
  const taggerThreshold = useGalleryStore((state) => state.taggerThreshold);
  const taggerBatchSize = useGalleryStore((state) => state.taggerBatchSize);
  const taggerRuntimeProbe = useGalleryStore((state) => state.taggerRuntimeProbe);
  const taggerRuntimeChecking = useGalleryStore((state) => state.taggerRuntimeChecking);
  const loadTaggerModelStatus = useGalleryStore((state) => state.loadTaggerModelStatus);
  const prepareTaggerModel = useGalleryStore((state) => state.prepareTaggerModel);
  const deleteTaggerModel = useGalleryStore((state) => state.deleteTaggerModel);
  const loadTaggerAcceleration = useGalleryStore((state) => state.loadTaggerAcceleration);
  const setTaggerAcceleration = useGalleryStore((state) => state.setTaggerAcceleration);
  const taggerModel = useGalleryStore((state) => state.taggerModel);
  const loadTaggerModel = useGalleryStore((state) => state.loadTaggerModel);
  const setTaggerModel = useGalleryStore((state) => state.setTaggerModel);
  const loadTaggerThreshold = useGalleryStore((state) => state.loadTaggerThreshold);
  const setTaggerThreshold = useGalleryStore((state) => state.setTaggerThreshold);
  const loadTaggerBatchSize = useGalleryStore((state) => state.loadTaggerBatchSize);
  const setTaggerBatchSize = useGalleryStore((state) => state.setTaggerBatchSize);
  const probeTaggerRuntime = useGalleryStore((state) => state.probeTaggerRuntime);
  const queueTaggingJobs = useGalleryStore((state) => state.queueTaggingJobs);
  const queueTaggingJobsForFolders = useGalleryStore((state) => state.queueTaggingJobsForFolders);
  const clearTaggingJobs = useGalleryStore((state) => state.clearTaggingJobs);
  const clearTaggingJobsForFolders = useGalleryStore((state) => state.clearTaggingJobsForFolders);
  const resetAiTags = useGalleryStore((state) => state.resetAiTags);
  const resetAiTagsForFolders = useGalleryStore((state) => state.resetAiTagsForFolders);
  const openAppDataFolder = useGalleryStore((state) => state.openAppDataFolder);
  const notificationsPaused = useGalleryStore((state) => state.notificationsPaused);
  const setNotificationsPaused = useGalleryStore((state) => state.setNotificationsPaused);
  const workerPausesPersist = useGalleryStore((state) => state.workerPausesPersist);
  const setWorkerPausesPersist = useGalleryStore((state) => state.setWorkerPausesPersist);
  const getDatabaseInfo = useGalleryStore((state) => state.getDatabaseInfo);
  const vacuumDatabase = useGalleryStore((state) => state.vacuumDatabase);
  const rebuildSemanticIndex = useGalleryStore((state) => state.rebuildSemanticIndex);
  const getOrphanedThumbnailsInfo = useGalleryStore((state) => state.getOrphanedThumbnailsInfo);
  const cleanupOrphanedThumbnails = useGalleryStore((state) => state.cleanupOrphanedThumbnails);
  const appVersion = useGalleryStore((state) => state.appVersion);
  const buildVariant = useGalleryStore((state) => state.buildVariant);
  const updateStatus = useGalleryStore((state) => state.updateStatus);
  const updateVersion = useGalleryStore((state) => state.updateVersion);
  const updateProgress = useGalleryStore((state) => state.updateProgress);
  const updateError = useGalleryStore((state) => state.updateError);
  const checkForUpdates = useGalleryStore((state) => state.checkForUpdates);
  const installUpdate = useGalleryStore((state) => state.installUpdate);
  const openWhatsNew = useGalleryStore((state) => state.openWhatsNew);
  const openOnboarding = useGalleryStore((state) => state.openOnboarding);
  const theme = useGalleryStore((state) => state.theme);
  const setTheme = useGalleryStore((state) => state.setTheme);
  const openTagManager = useGalleryStore((state) => state.openTagManager);
  const lightboxAutoplay = useGalleryStore((state) => state.lightboxAutoplay);
  const setLightboxAutoplay = useGalleryStore((state) => state.setLightboxAutoplay);
  const lightboxAutoMute = useGalleryStore((state) => state.lightboxAutoMute);
  const setLightboxAutoMute = useGalleryStore((state) => state.setLightboxAutoMute);
  const slideshowIntervalSeconds = useGalleryStore((state) => state.slideshowIntervalSeconds);
  const setSlideshowIntervalSeconds = useGalleryStore((state) => state.setSlideshowIntervalSeconds);
  const slideshowOrder = useGalleryStore((state) => state.slideshowOrder);
  const setSlideshowOrder = useGalleryStore((state) => state.setSlideshowOrder);
  const slideshowTransition = useGalleryStore((state) => state.slideshowTransition);
  const setSlideshowTransition = useGalleryStore((state) => state.setSlideshowTransition);

  useEffect(() => {
    if (!settingsOpen) return;
    void loadTaggerModelStatus();
    void loadTaggerModel();
    void loadTaggerAcceleration();
    void loadTaggerThreshold();
    void loadTaggerBatchSize();
    void loadTaggingQueueScope();
    void loadTaggingQueueFolderIds();

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") setSettingsOpen(false);
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [settingsOpen, loadTaggerModelStatus, loadTaggerModel, loadTaggerAcceleration, loadTaggerThreshold, loadTaggerBatchSize, loadTaggingQueueScope, loadTaggingQueueFolderIds, setSettingsOpen]);

  useEffect(() => {
    if (!settingsOpen || activeSection !== "storage") return;
    setVacuumResult(null);
    setThumbnailCleanupResult(null);
    void getDatabaseInfo().then(setDbInfo).catch(() => {});
    void getOrphanedThumbnailsInfo().then(setThumbnailInfo).catch(() => {});
  }, [settingsOpen, activeSection, getDatabaseInfo, getOrphanedThumbnailsInfo]);

  // Clean up error timers on unmount
  useEffect(() => {
    return () => {
      if (thresholdErrorTimerRef.current) clearTimeout(thresholdErrorTimerRef.current);
      if (batchSizeErrorTimerRef.current) clearTimeout(batchSizeErrorTimerRef.current);
    };
  }, []);

  const selectedFolders = useMemo(
    () => folders.filter((folder) => taggingQueueFolderIds.includes(folder.id)),
    [folders, taggingQueueFolderIds],
  );

  if (!settingsOpen) return null;

  const activeSectionMeta = SECTIONS.find((section) => section.id === activeSection) ?? SECTIONS[0];
  const taggerReady = taggerModelStatus?.ready ?? false;
  const queueScopeLabel =
    taggingQueueScope === "all"
      ? "all media"
      : selectedFolders.length > 0
        ? `${selectedFolders.length} selected folder${selectedFolders.length === 1 ? "" : "s"}`
        : "no folders selected";
  const thresholdDisplay = taggerThresholdDraft ?? String(taggerThreshold);
  const batchSizeDisplay = taggerBatchSizeDraft ?? String(taggerBatchSize);
  const taggerBytesKnown =
    taggerModelProgress?.downloaded_bytes != null &&
    taggerModelProgress.total_bytes != null &&
    taggerModelProgress.total_bytes > 0;
  const taggerDownloadLabel = taggerBytesKnown
    ? `Downloading ${formatBytesShort(taggerModelProgress!.downloaded_bytes!)} / ${formatBytesShort(taggerModelProgress!.total_bytes!)}`
    : taggerModelProgress
      ? `Downloading ${taggerModelProgress.completed_files}/${taggerModelProgress.total_files}`
      : taggerModelPreparing
        ? "Preparing AI tagger..."
        : taggerReady
          ? "Installed"
          : "Install model";
  const taggerDownloadPercent = taggerBytesKnown
    ? Math.round((taggerModelProgress!.downloaded_bytes! / taggerModelProgress!.total_bytes!) * 100)
    : taggerModelProgress
      ? Math.round((taggerModelProgress.completed_files / Math.max(taggerModelProgress.total_files, 1)) * 100)
      : 0;

  const runQueueAction = (action: "queue" | "clear") => {
    const selectedIds = taggingQueueFolderIds;
    const perform =
      taggingQueueScope === "all"
        ? action === "queue"
          ? queueTaggingJobs(null)
          : clearTaggingJobs(null)
        : selectedIds.length > 0
          ? action === "queue"
            ? queueTaggingJobsForFolders(selectedIds)
            : clearTaggingJobsForFolders(selectedIds)
          : Promise.resolve(0);

    if (action === "queue") {
      setTaggerQueueing(true);
    } else {
      setTaggerClearing(true);
    }
    setTaggerQueueStatus(null);
    setTaggerResetConfirming(false);

    void perform
      .then((count) => {
        if (taggingQueueScope === "selected" && selectedIds.length === 0) {
          setTaggerQueueStatus("Choose at least one folder before running tagging jobs.");
          return;
        }
        setTaggerQueueStatus(
          count === 0
            ? action === "queue"
              ? "No missing tags found for the current target."
              : "No queued tagging jobs to clear for the current target."
            : action === "queue"
              ? `Queued ${count.toLocaleString()} image${count === 1 ? "" : "s"} for tagging.`
              : `Cleared ${count.toLocaleString()} queued tagging job${count === 1 ? "" : "s"}.`,
        );
      })
      .catch((error) => setTaggerQueueStatus(String(error)))
      .finally(() => {
        if (action === "queue") {
          setTaggerQueueing(false);
        } else {
          setTaggerClearing(false);
        }
      });
  };

  const runResetAiTags = () => {
    if (!taggerResetConfirming) {
      setTaggerResetConfirming(true);
      setTaggerQueueStatus(
        `Reset AI tags for ${queueScopeLabel}? User tags are preserved, and retagging is not queued automatically.`,
      );
      return;
    }

    const selectedIds = taggingQueueFolderIds;
    const perform =
      taggingQueueScope === "all"
        ? resetAiTags(null)
        : selectedIds.length > 0
          ? resetAiTagsForFolders(selectedIds)
          : Promise.resolve(0);

    setTaggerResetting(true);
    setTaggerQueueStatus(null);

    void perform
      .then((count) => {
        if (taggingQueueScope === "selected" && selectedIds.length === 0) {
          setTaggerQueueStatus("Choose at least one folder before resetting AI tags.");
          return;
        }
        setTaggerQueueStatus(
          count === 0
            ? "No AI tag data found for the current target."
            : `Reset AI tags for ${count.toLocaleString()} image${count === 1 ? "" : "s"}. Queue tagging when you're ready to retag.`,
        );
      })
      .catch((error) => setTaggerQueueStatus(String(error)))
      .finally(() => {
        setTaggerResetting(false);
        setTaggerResetConfirming(false);
      });
  };

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/65 px-6 backdrop-blur-sm" onClick={() => setSettingsOpen(false)}>
      <div
        className="relative flex h-[min(85vh,900px)] w-[min(85vw,1400px)] overflow-hidden rounded-lg border border-white/10 bg-gray-950 shadow-2xl shadow-black/60"
        onClick={(event) => event.stopPropagation()}
      >
        <aside className="flex w-64 shrink-0 flex-col border-r border-white/[0.07] bg-white/[0.025]">
          <div className="border-b border-white/[0.07] px-5 py-5">
            <p className="text-base font-semibold text-white">Settings</p>
            <p className="mt-1 text-xs text-gray-600">Operational controls for AI workflows</p>
          </div>
          <div className="flex-1 space-y-1 overflow-y-auto p-2">
            {SECTIONS.map((section) => (
              <button
                key={section.id}
                className={`w-full rounded-md px-3 py-2.5 text-left transition-colors ${
                  activeSection === section.id ? "bg-white/10 text-white" : "text-gray-500 hover:bg-white/[0.055] hover:text-gray-200"
                }`}
                onClick={() => setActiveSection(section.id)}
              >
                <span className="block text-[13px] font-medium">{section.label}</span>
                <span className="mt-0.5 block text-[11px] text-gray-600">{section.detail}</span>
              </button>
            ))}
          </div>
        </aside>

        <div className="absolute right-4 top-4 z-10">
          <Tooltip label="Close settings" anchorToCursor>
            <button
              className="rounded-md p-1.5 text-gray-500 transition-colors hover:bg-white/[0.06] hover:text-white"
              onClick={() => setSettingsOpen(false)}
            >
              <CloseIcon className="h-4 w-4" />
            </button>
          </Tooltip>
        </div>

        <main className="min-w-0 flex-1 overflow-y-auto">
          <div className="px-10 py-8">
            <h3 className="text-lg font-semibold text-white">{activeSectionMeta.label}</h3>
            <p className="mt-1 text-xs text-gray-600">{activeSectionMeta.detail}</p>

            {activeSection === "workspace" ? (
              <div className="mt-8 space-y-9">
                <SettingsGroup title="Model">
                  <SettingsItem label="Tagging model" description="Choose which model generates tags. JoyTag suits photos and NSFW; WD is anime-focused. Switching may require a one-time download.">
                    <div className="flex flex-col items-end gap-1.5">
                      <div className="flex rounded-lg border border-white/[0.07] p-0.5 light-theme:border-gray-300/80">
                        {(["wd", "joytag"] as const).map((model) => (
                          <TaggerModelButton
                            key={model}
                            model={model}
                            current={taggerModel}
                            onSelect={(nextModel) => {
                              if (nextModel === taggerModel) return;
                              setTaggerThresholdDraft(null);
                              setTaggerThresholdError(null);
                              if (thresholdErrorTimerRef.current) clearTimeout(thresholdErrorTimerRef.current);
                              setTaggerModelSwitching(true);
                              setTaggerModelSwitchError(null);
                              void setTaggerModel(nextModel)
                                .catch((error: unknown) => setTaggerModelSwitchError(String(error)))
                                .finally(() => setTaggerModelSwitching(false));
                            }}
                          >
                            {TAGGER_MODELS[model].tab}
                          </TaggerModelButton>
                        ))}
                      </div>
                      {taggerModelSwitchError ? (
                        <p className="text-[11px] text-amber-300">{taggerModelSwitchError}</p>
                      ) : (
                        <p className="text-[11px] text-gray-600">{taggerModelSwitching ? "Switching..." : `Current: ${TAGGER_MODELS[taggerModel].name}`}</p>
                      )}
                    </div>
                  </SettingsItem>

                  <SettingsItem
                    label={
                      <>
                        {TAGGER_MODELS[taggerModel].name}{" "}
                        <span className="ml-1.5 align-middle">
                          <StatusPill tone={taggerReady ? "ready" : taggerModelPreparing ? "busy" : "muted"}>
                            {taggerReady ? "Installed" : taggerModelPreparing ? "Preparing" : "Not installed"}
                          </StatusPill>
                        </span>
                      </>
                    }
                    description={TAGGER_MODELS[taggerModel].description}
                  >
                    <div className="flex flex-col items-end gap-1.5">
                      <div className="flex items-center gap-2">
                        {taggerReady ? (
                          <>
                            <button
                              className="rounded-md border border-white/10 bg-white/[0.055] px-3 py-1.5 text-xs text-gray-300 transition-colors hover:bg-white/10 hover:text-white disabled:cursor-not-allowed disabled:opacity-45 light-theme:border-gray-700/50 light-theme:bg-gray-900 light-theme:text-white light-theme:hover:bg-gray-800 light-theme:hover:text-white"
                              onClick={() => void probeTaggerRuntime()}
                              disabled={taggerRuntimeChecking}
                            >
                              {taggerRuntimeChecking ? "Checking runtime..." : "Check runtime"}
                            </button>
                            <button
                              className="rounded-md border border-red-400/20 bg-red-500/10 px-3 py-1.5 text-xs text-red-200 transition-colors hover:bg-red-500/15 disabled:cursor-not-allowed disabled:opacity-45 light-theme:border-red-400/50 light-theme:bg-red-50 light-theme:text-red-700 light-theme:hover:bg-red-100"
                              onClick={() => void deleteTaggerModel()}
                              disabled={taggerModelPreparing}
                            >
                              Delete model files
                            </button>
                          </>
                        ) : (
                          <button
                            className="relative overflow-hidden rounded-md border border-white/10 bg-white/[0.055] px-3 py-1.5 text-xs text-gray-300 transition-colors hover:bg-white/10 hover:text-white disabled:cursor-not-allowed disabled:opacity-45 light-theme:border-gray-700/50 light-theme:bg-gray-900 light-theme:text-white light-theme:hover:bg-gray-800 light-theme:hover:text-white"
                            onClick={() => void prepareTaggerModel()}
                            disabled={taggerModelPreparing}
                          >
                            {taggerModelProgress ? <span className="absolute inset-y-0 left-0 bg-emerald-400/15 transition-[width] duration-200" style={{ width: `${taggerDownloadPercent}%` }} /> : null}
                            <span className="relative">{taggerDownloadLabel}</span>
                          </button>
                        )}
                      </div>
                      {taggerRuntimeProbe ? (
                        <div className="text-right">
                          <p className="text-xs text-gray-400">
                            Runtime check <span className="ml-1.5 align-middle"><StatusPill tone="ready">Ready</StatusPill></span>
                            {" "}<span className="ml-2 text-gray-600">· acceleration: {taggerRuntimeProbe.acceleration}</span>
                          </p>
                          <p className="mt-1 break-all font-mono text-xs text-gray-600">{taggerRuntimeProbe.session.file}</p>
                        </div>
                      ) : null}
                    </div>
                  </SettingsItem>

                  <SettingsItem label="Tagger acceleration" description="Use DirectML when available, or fall back to CPU for reliability.">
                    <div className="flex flex-col items-end gap-1.5">
                      <div className="flex rounded-lg border border-white/[0.07] p-0.5 light-theme:border-gray-300/80">
                        {(["auto", "directml", "cpu"] as const).map((acceleration) => (
                          <TaggerAccelerationButton
                            key={acceleration}
                            acceleration={acceleration}
                            current={taggerAcceleration}
                            onSelect={(nextAcceleration) => {
                              setTaggerAccelerationSaving(true);
                              setTaggerAccelerationError(null);
                              void setTaggerAcceleration(nextAcceleration)
                                .catch((error: unknown) => setTaggerAccelerationError(String(error)))
                                .finally(() => setTaggerAccelerationSaving(false));
                            }}
                          >
                            {acceleration === "directml" ? "DirectML" : acceleration === "cpu" ? "CPU" : "Auto"}
                          </TaggerAccelerationButton>
                        ))}
                      </div>
                      {taggerAccelerationError ? (
                        <p className="text-[11px] text-amber-300">{taggerAccelerationError}</p>
                      ) : (
                        <p className="text-[11px] text-gray-600">{taggerAccelerationSaving ? "Saving..." : `Current: ${taggerAcceleration}`}</p>
                      )}
                    </div>
                  </SettingsItem>

                  <SettingsItem label="Confidence threshold" description="Lower values keep more tags. Higher values are stricter and usually cleaner.">
                    <div className="flex flex-col items-end gap-1.5">
                      <input
                        type="number"
                        min="0.05"
                        max="0.99"
                        step="0.05"
                        className="w-20 rounded-md border border-white/10 bg-white/5 px-2 py-1.5 text-xs text-white focus:border-white/20 focus:outline-none"
                        value={thresholdDisplay}
                        onChange={(event) => setTaggerThresholdDraft(event.target.value)}
                        onBlur={(event) => {
                          const value = parseFloat(event.currentTarget.value);
                          if (!isNaN(value) && value >= 0.05 && value <= 0.99) {
                            setTaggerThresholdError(null);
                            setTaggerThresholdSaving(true);
                            void setTaggerThreshold(value, taggerModel)
                              .catch((error: unknown) => setTaggerThresholdError(String(error)))
                              .finally(() => {
                                setTaggerThresholdDraft(null);
                                setTaggerThresholdSaving(false);
                              });
                          } else {
                            setTaggerThresholdDraft(null);
                            setTaggerThresholdError("Must be 0.05 – 0.99");
                            if (thresholdErrorTimerRef.current) clearTimeout(thresholdErrorTimerRef.current);
                            thresholdErrorTimerRef.current = setTimeout(() => setTaggerThresholdError(null), 2000);
                          }
                        }}
                      />
                      {taggerThresholdError ? (
                        <p className="text-[11px] text-amber-300">{taggerThresholdError}</p>
                      ) : (
                        <p className="text-[11px] text-gray-600">{taggerThresholdSaving ? "Saving..." : `Default: ${TAGGER_MODELS[taggerModel].defaultThreshold}`}</p>
                      )}
                    </div>
                  </SettingsItem>

                  <SettingsItem label="Tagging batch size" description="Number of images processed concurrently during tag generation.">
                    <div className="flex flex-col items-end gap-1.5">
                      <input
                        type="number"
                        min="1"
                        max="100"
                        step="1"
                        className="w-20 rounded-md border border-white/10 bg-white/5 px-2 py-1.5 text-xs text-white focus:border-white/20 focus:outline-none"
                        value={batchSizeDisplay}
                        onChange={(event) => setTaggerBatchSizeDraft(event.target.value)}
                        onBlur={() => {
                          const value = parseInt(batchSizeDisplay, 10);
                          if (!isNaN(value) && value >= 1 && value <= 100) {
                            setTaggerBatchSizeError(null);
                            setTaggerBatchSizeSaving(true);
                            void setTaggerBatchSize(value)
                              .catch((error: unknown) => setTaggerQueueStatus(String(error)))
                              .finally(() => {
                                setTaggerBatchSizeDraft(null);
                                setTaggerBatchSizeSaving(false);
                              });
                          } else {
                            setTaggerBatchSizeDraft(null);
                            setTaggerBatchSizeError("Must be 1 – 100");
                            if (batchSizeErrorTimerRef.current) clearTimeout(batchSizeErrorTimerRef.current);
                            batchSizeErrorTimerRef.current = setTimeout(() => setTaggerBatchSizeError(null), 2000);
                          }
                        }}
                      />
                      {taggerBatchSizeError ? (
                        <p className="text-[11px] text-amber-300">{taggerBatchSizeError}</p>
                      ) : (
                        <p className="text-[11px] text-gray-600">{taggerBatchSizeSaving ? "Saving..." : "Default: 8"}</p>
                      )}
                    </div>
                  </SettingsItem>

                  <SettingsItem label="Model location" vertical>
                    <div>
                      <p className="break-all font-mono text-xs text-gray-600">
                        {taggerReady ? taggerModelStatus?.local_dir : "Not downloaded"}
                      </p>
                      {taggerModelProgress?.current_file ? <p className="mt-2 break-all text-xs text-gray-500">{taggerModelProgress.current_file}</p> : null}
                      {taggerModelError ? <p className="mt-2 text-xs text-amber-300">{taggerModelError}</p> : null}
                    </div>
                  </SettingsItem>
                </SettingsGroup>

                <SettingsGroup title="Queue targets" description="Choose which folders to include when queuing tagging jobs.">
                  <SettingsItem label="Target scope" description="Queue across the full library, or choose a specific folder set and keep the modal open while you work through it.">
                    <div className="flex rounded-lg border border-white/[0.07] p-0.5 light-theme:border-gray-300/80">
                      <ScopeButton scope="all" current={taggingQueueScope} onSelect={setTaggingQueueScope}>All media</ScopeButton>
                      <ScopeButton scope="selected" current={taggingQueueScope} onSelect={setTaggingQueueScope}>Selected folders</ScopeButton>
                    </div>
                  </SettingsItem>

                  <div className="py-4">
                    <div className="flex items-center justify-between gap-4">
                      <div>
                        <p className="text-sm text-white">Folder selection</p>
                        <p className="mt-1 text-xs leading-relaxed text-gray-500">Current target: {queueScopeLabel}.</p>
                      </div>
                      <div className="flex gap-2">
                        <button
                          className="rounded-md border border-white/10 bg-white/[0.045] px-2.5 py-1 text-[11px] text-gray-400 transition-colors hover:bg-white/[0.075] hover:text-white disabled:opacity-40 disabled:cursor-not-allowed light-theme:border-gray-700/50 light-theme:bg-gray-900 light-theme:text-white light-theme:hover:bg-gray-800 light-theme:hover:text-white"
                          onClick={() => setTaggingQueueFolderIds(folders.map((folder) => folder.id))}
                          disabled={taggingQueueScope === "all" || folders.length === 0}
                        >
                          Select all
                        </button>
                        <button
                          className="rounded-md border border-white/10 bg-white/[0.045] px-2.5 py-1 text-[11px] text-gray-400 transition-colors hover:bg-white/[0.075] hover:text-white disabled:opacity-40 disabled:cursor-not-allowed light-theme:border-gray-700/50 light-theme:bg-gray-900 light-theme:text-white light-theme:hover:bg-gray-800 light-theme:hover:text-white"
                          onClick={() => setTaggingQueueFolderIds([])}
                          disabled={taggingQueueScope === "all" || taggingQueueFolderIds.length === 0}
                        >
                          Clear
                        </button>
                      </div>
                    </div>

                    <div className={`mt-2 max-h-64 divide-y divide-white/[0.04] overflow-y-auto pr-1 ${taggingQueueScope === "selected" ? "opacity-100" : "opacity-60"}`}>
                      {folders.map((folder) => {
                        const active = taggingQueueFolderIds.includes(folder.id);
                        const progress = mediaJobProgress[folder.id];
                        return (
                          <button
                            key={folder.id}
                            type="button"
                            className={`flex w-full items-center justify-between gap-3 px-1 py-2 text-left transition-colors disabled:cursor-not-allowed ${
                              active ? "text-white" : "text-gray-400 hover:text-gray-200"
                            }`}
                            onClick={() => toggleTaggingQueueFolder(folder.id)}
                            disabled={taggingQueueScope === "all"}
                          >
                            <p className="min-w-0 truncate text-sm">{folder.name}</p>
                            <div className="flex shrink-0 items-center gap-3">
                              {(progress?.tagging_pending ?? 0) > 0 ? <StatusPill tone="busy">{progress?.tagging_pending} queued</StatusPill> : null}
                              <span className="text-[11px] tabular-nums text-gray-600">{folder.image_count.toLocaleString()} items</span>
                              <span className={`h-4 w-4 rounded-full border ${active ? "border-emerald-300 bg-emerald-300" : "border-white/15 bg-transparent"}`} />
                            </div>
                          </button>
                        );
                      })}
                      {folders.length === 0 ? <p className="py-2 text-sm text-gray-500">Add a folder first to enable targeted tagging queues.</p> : null}
                    </div>
                  </div>

                  <SettingsItem label="Queue tagging jobs" description="Generate missing AI tags for the current target. Results flow back into the library as the background worker finishes.">
                    <div className="flex items-center gap-2">
                      <button
                        className="rounded-md border border-white/10 bg-white/[0.055] px-3 py-1.5 text-xs text-gray-300 transition-colors hover:bg-white/10 hover:text-white disabled:cursor-not-allowed disabled:opacity-45 light-theme:border-gray-700/50 light-theme:bg-gray-900 light-theme:text-white light-theme:hover:bg-gray-800 light-theme:hover:text-white"
                        onClick={() => runQueueAction("queue")}
                        disabled={!taggerReady || taggerQueueing || taggerClearing || taggerResetting || (taggingQueueScope === "selected" && taggingQueueFolderIds.length === 0)}
                      >
                        {taggerQueueing ? "Queueing..." : "Queue tagging"}
                      </button>
                      <button
                        className="rounded-md border border-amber-400/20 bg-amber-500/10 px-3 py-1.5 text-xs text-amber-200 transition-colors hover:bg-amber-500/15 disabled:cursor-not-allowed disabled:opacity-45 light-theme:border-amber-500/50 light-theme:bg-amber-50 light-theme:text-amber-700 light-theme:hover:bg-amber-100"
                        onClick={() => runQueueAction("clear")}
                        disabled={taggerQueueing || taggerClearing || taggerResetting || (taggingQueueScope === "selected" && taggingQueueFolderIds.length === 0)}
                      >
                        {taggerClearing ? "Clearing..." : "Clear queued jobs"}
                      </button>
                      <button
                        className={`rounded-md border px-3 py-1.5 text-xs transition-colors disabled:cursor-not-allowed disabled:opacity-45 ${
                          taggerResetConfirming
                            ? "border-red-400/30 bg-red-500/15 text-red-200 hover:bg-red-500/25 light-theme:border-red-500/50 light-theme:bg-red-50 light-theme:text-red-700 light-theme:hover:bg-red-100"
                            : "border-white/10 bg-white/[0.055] text-gray-300 hover:bg-white/10 hover:text-white light-theme:border-gray-700/50 light-theme:bg-gray-900 light-theme:text-white light-theme:hover:bg-gray-800 light-theme:hover:text-white"
                        }`}
                        onClick={runResetAiTags}
                        disabled={taggerQueueing || taggerClearing || taggerResetting || (taggingQueueScope === "selected" && taggingQueueFolderIds.length === 0)}
                      >
                        {taggerResetting ? "Resetting..." : taggerResetConfirming ? "Confirm reset" : "Reset AI tags"}
                      </button>
                      {taggerResetConfirming ? (
                        <button
                          className="rounded-md border border-white/10 px-3 py-1.5 text-xs text-gray-400 transition-colors hover:bg-white/[0.06] hover:text-white light-theme:border-gray-700/50 light-theme:text-gray-600 light-theme:hover:bg-gray-900 light-theme:hover:text-white"
                          onClick={() => {
                            setTaggerResetConfirming(false);
                            setTaggerQueueStatus(null);
                          }}
                          disabled={taggerResetting}
                        >
                          Cancel
                        </button>
                      ) : null}
                    </div>
                  </SettingsItem>

                  {taggerQueueStatus ? <p className="pt-3 text-xs text-gray-500">{taggerQueueStatus}</p> : null}
                </SettingsGroup>

                <SettingsGroup title="Tag library" description="Review and clean up the tags across your library.">
                  <SettingsItem label="Manage tags" description="Open the tag manager in Explore to search, rename, and delete tags.">
                    <button
                      className="rounded-md border border-white/10 bg-white/[0.055] px-3 py-1.5 text-xs text-gray-300 transition-colors hover:bg-white/10 hover:text-white light-theme:border-gray-700/50 light-theme:bg-gray-900 light-theme:text-white light-theme:hover:bg-gray-800 light-theme:hover:text-white"
                      onClick={openTagManager}
                    >
                      Open tag manager
                    </button>
                  </SettingsItem>
                </SettingsGroup>
              </div>
            ) : (
              <div className="mt-8 space-y-9">
                {activeSection === "general" ? (
                  <>
                <SettingsGroup title="Appearance">
                  <SettingsItem label="Theme" description="Choose the app palette. Subtle Light uses a warm, low-glare background.">
                    <Dropdown
                      value={theme}
                      onChange={setTheme}
                      ariaLabel="App theme"
                      options={[
                        { value: "phokus", label: "Phokus" },
                        { value: "subtle-light", label: "Subtle Light" },
                        { value: "conventional-dark", label: "Conventional Dark" },
                      ]}
                    />
                  </SettingsItem>
                </SettingsGroup>

                <SettingsGroup title="Notifications">
                  <SettingsItem
                    label="Pause all notifications"
                    description="Notifications are batched per folder — a single alert fires once activity settles. Mute individual folders from their right-click menu."
                  >
                    <button
                      role="switch"
                      aria-checked={notificationsPaused}
                      className={`relative inline-flex h-5 w-9 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors focus:outline-none ${notificationsPaused ? "bg-sky-500" : "bg-white/15"}`}
                      onClick={() => setNotificationsPaused(!notificationsPaused)}
                    >
                      <span className={`inline-block h-4 w-4 transform rounded-full bg-white shadow transition-transform ${notificationsPaused ? "translate-x-4" : "translate-x-0"}`} />
                    </button>
                  </SettingsItem>
                  <SettingsItem
                    label="Keep background pauses after restart"
                    description="When enabled, folders you pause from the sidebar or background bar stay paused the next time Phokus opens."
                  >
                    <button
                      role="switch"
                      aria-checked={workerPausesPersist}
                      className={`relative inline-flex h-5 w-9 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors focus:outline-none ${workerPausesPersist ? "bg-sky-500" : "bg-white/15"}`}
                      onClick={() => setWorkerPausesPersist(!workerPausesPersist)}
                    >
                      <span className={`inline-block h-4 w-4 transform rounded-full bg-white shadow transition-transform ${workerPausesPersist ? "translate-x-4" : "translate-x-0"}`} />
                    </button>
                  </SettingsItem>
                </SettingsGroup>
                  </>
                ) : null}

                {activeSection === "media" ? (
                  <>
                <SettingsGroup title="Video playback">
                  <SettingsItem
                    label="Autoplay in lightbox"
                    description="Start playing videos automatically when opened in the lightbox."
                  >
                    <button
                      role="switch"
                      aria-checked={lightboxAutoplay}
                      className={`relative inline-flex h-5 w-9 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors focus:outline-none ${lightboxAutoplay ? "bg-sky-500" : "bg-white/15"}`}
                      onClick={() => setLightboxAutoplay(!lightboxAutoplay)}
                    >
                      <span className={`inline-block h-4 w-4 transform rounded-full bg-white shadow transition-transform ${lightboxAutoplay ? "translate-x-4" : "translate-x-0"}`} />
                    </button>
                  </SettingsItem>
                  <SettingsItem
                    label="Start muted"
                    description="Open videos with their audio muted — unmute from the player controls."
                  >
                    <button
                      role="switch"
                      aria-checked={lightboxAutoMute}
                      className={`relative inline-flex h-5 w-9 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors focus:outline-none ${lightboxAutoMute ? "bg-sky-500" : "bg-white/15"}`}
                      onClick={() => setLightboxAutoMute(!lightboxAutoMute)}
                    >
                      <span className={`inline-block h-4 w-4 transform rounded-full bg-white shadow transition-transform ${lightboxAutoMute ? "translate-x-4" : "translate-x-0"}`} />
                    </button>
                  </SettingsItem>
                </SettingsGroup>

                <SettingsGroup title="Slideshow">
                  <SettingsItem
                    label="Slide duration"
                    description="How long each image stays on screen before the slideshow advances."
                  >
                    <div className="flex items-center gap-2">
                      <input
                        type="range"
                        min={3}
                        max={60}
                        step={1}
                        value={slideshowIntervalSeconds}
                        aria-label="Slide duration"
                        className="w-32 accent-sky-500"
                        onChange={(event) => setSlideshowIntervalSeconds(Number(event.currentTarget.value))}
                      />
                      <span className="min-w-10 text-right text-xs tabular-nums text-gray-400">{slideshowIntervalSeconds}s</span>
                    </div>
                  </SettingsItem>
                  <SettingsItem
                    label="Playback order"
                    description="Sequential follows the current lightbox order. Random picks another image from the same collection."
                  >
                    <Dropdown
                      value={slideshowOrder}
                      onChange={setSlideshowOrder}
                      ariaLabel="Slideshow order"
                      options={[
                        { value: "sequential", label: "Sequential" },
                        { value: "random", label: "Random" },
                      ]}
                    />
                  </SettingsItem>
                  <SettingsItem
                    label="Transition"
                    description="Soft fade keeps images still. Gentle motion adds a slow, subtle drift while the next image settles in."
                  >
                    <Dropdown
                      value={slideshowTransition}
                      onChange={setSlideshowTransition}
                      ariaLabel="Slideshow transition"
                      options={[
                        { value: "soft-fade", label: "Soft fade" },
                        { value: "gentle-motion", label: "Gentle motion" },
                      ]}
                    />
                  </SettingsItem>
                </SettingsGroup>

                  </>
                ) : null}

                {activeSection === "updates" ? (
                  <>
                <SettingsGroup title="Updates">
                  <SettingsItem
                    label={
                      <span className="inline-flex items-center gap-2.5">
                        <span>Phokus {appVersion ? `v${appVersion}` : "—"}</span>
                        {buildVariant ? (
                          <StatusPill tone={buildVariant === "cuda" ? "ready" : "muted"}>
                            {buildVariant === "cuda" ? "CUDA" : "CPU"}
                          </StatusPill>
                        ) : null}
                        {updateStatus === "available" || updateStatus === "downloading" || updateStatus === "installing" ? (
                          <StatusPill tone="busy">v{updateVersion} available</StatusPill>
                        ) : updateStatus === "upToDate" ? (
                          <StatusPill tone="ready">Up to date</StatusPill>
                        ) : null}
                      </span>
                    }
                    description={
                      updateStatus === "error" ? (
                        <span className="text-amber-300/90">Update check failed: {updateError}</span>
                      ) : updateStatus === "downloading" || updateStatus === "installing" ? (
                        <span className="block">
                          <span className="text-gray-400">
                            {updateStatus === "installing"
                              ? "Installing update…"
                              : updateProgress !== null
                                ? `Downloading update — ${Math.round(updateProgress * 100)}%`
                                : "Downloading update…"}
                          </span>
                          <span className="mt-2 block h-1 overflow-hidden rounded-full bg-white/10">
                            <span
                              className={`block h-full rounded-full bg-emerald-400/80 transition-[width] duration-200 ${
                                updateProgress === null ? "w-full animate-pulse" : ""
                              }`}
                              style={updateProgress !== null ? { width: `${Math.round(updateProgress * 100)}%` } : undefined}
                            />
                          </span>
                          <span className="mt-1 block text-gray-600">The app will restart when it finishes.</span>
                        </span>
                      ) : (
                        "Updates are checked quietly at launch and installed only when you choose."
                      )
                    }
                  >
                    {updateStatus === "available" ? (
                      <button
                        className="rounded-md border border-emerald-400/35 bg-emerald-500/15 px-3 py-1.5 text-xs text-emerald-200 transition-colors hover:bg-emerald-500/25"
                        onClick={() => void installUpdate()}
                      >
                        Install &amp; restart
                      </button>
                    ) : (
                      <button
                        className="rounded-md border border-white/10 bg-white/[0.055] px-3 py-1.5 text-xs text-gray-300 transition-colors hover:bg-white/10 hover:text-white disabled:cursor-not-allowed disabled:opacity-45 light-theme:border-gray-700/50 light-theme:bg-gray-900 light-theme:text-white light-theme:hover:bg-gray-800 light-theme:hover:text-white"
                        onClick={() => void checkForUpdates()}
                        disabled={updateStatus === "checking" || updateStatus === "downloading" || updateStatus === "installing"}
                      >
                        {updateStatus === "checking" ? "Checking..." : "Check for updates"}
                      </button>
                    )}
                  </SettingsItem>
                  {getChangelogForVersion(appVersion) ? (
                    <SettingsItem
                      label="What's new"
                      description={`See what changed in Phokus v${appVersion}.`}
                    >
                      <button
                        className="rounded-md border border-white/10 bg-white/[0.055] px-3 py-1.5 text-xs text-gray-300 transition-colors hover:bg-white/10 hover:text-white light-theme:border-gray-700/50 light-theme:bg-gray-900 light-theme:text-white light-theme:hover:bg-gray-800 light-theme:hover:text-white"
                        onClick={openWhatsNew}
                      >
                        View changes
                      </button>
                    </SettingsItem>
                  ) : null}
                </SettingsGroup>

                <SettingsGroup title="Setup">
                  <FfmpegStatusRow />
                  <SettingsItem
                    label="Welcome tour"
                    description="Replay the guided first-run tour — library setup, the background pipeline, search modes, and AI features."
                  >
                    <button
                      className="rounded-md border border-white/10 bg-white/[0.055] px-3 py-1.5 text-xs text-gray-300 transition-colors hover:bg-white/10 hover:text-white light-theme:border-gray-700/50 light-theme:bg-gray-900 light-theme:text-white light-theme:hover:bg-gray-800 light-theme:hover:text-white"
                      onClick={() => {
                        setSettingsOpen(false);
                        openOnboarding();
                      }}
                    >
                      Show welcome tour
                    </button>
                  </SettingsItem>
                </SettingsGroup>

                  </>
                ) : null}

                {activeSection === "storage" ? (
                  <>
                <SettingsGroup title="App data">
                  <SettingsItem
                    label="App data folder"
                    description="Open the folder in Explorer to inspect or back up the database, thumbnails, and models."
                  >
                    <button
                      className="rounded-md border border-white/10 bg-white/[0.055] px-3 py-1.5 text-xs text-gray-300 transition-colors hover:bg-white/10 hover:text-white disabled:cursor-not-allowed disabled:opacity-45 light-theme:border-gray-700/50 light-theme:bg-gray-900 light-theme:text-white light-theme:hover:bg-gray-800 light-theme:hover:text-white"
                      onClick={() => {
                        setOpeningDataFolder(true);
                        void openAppDataFolder().finally(() => setOpeningDataFolder(false));
                      }}
                      disabled={openingDataFolder}
                    >
                      {openingDataFolder ? "Opening..." : "Open data folder"}
                    </button>
                  </SettingsItem>
                </SettingsGroup>

                <SettingsGroup title="Maintenance">
                  <SettingsItem
                    label="Compact database"
                    description={
                      <>
                        <span>Reclaims wasted space left behind when images or tags are deleted. Safe to run at any time.</span>
                        <span className="mt-2.5 flex flex-wrap items-center gap-x-5 gap-y-1">
                          <StatPair
                            label="Size"
                            value={
                              vacuumResult
                                ? `${vacuumResult.after_mb.toFixed(1)} MB`
                                : dbInfo
                                  ? `${dbInfo.size_mb.toFixed(1)} MB`
                                  : "—"
                            }
                          />
                          <StatPair
                            label="Reclaimable"
                            accent={vacuumResult !== null}
                            value={
                              vacuumResult
                                ? `${vacuumResult.freed_mb.toFixed(1)} MB freed`
                                : dbInfo
                                  ? `${dbInfo.reclaimable_mb.toFixed(1)} MB`
                                  : "—"
                            }
                          />
                        </span>
                        <span className="mt-2 block text-gray-600">
                          {vacuumResult
                            ? `Compacted from ${vacuumResult.before_mb.toFixed(1)} MB to ${vacuumResult.after_mb.toFixed(1)} MB.`
                            : dbInfo && dbInfo.reclaimable_mb < 0.5
                              ? "Database is already compact."
                              : "Run this after removing folders or bulk-deleting images."}
                        </span>
                      </>
                    }
                  >
                    <button
                      className="rounded-md border border-white/10 bg-white/[0.055] px-3 py-1.5 text-xs text-gray-300 transition-colors hover:bg-white/10 hover:text-white disabled:cursor-not-allowed disabled:opacity-45 light-theme:border-gray-700/50 light-theme:bg-gray-900 light-theme:text-white light-theme:hover:bg-gray-800 light-theme:hover:text-white"
                      onClick={() => {
                        setVacuuming(true);
                        setVacuumResult(null);
                        void vacuumDatabase()
                          .then((result) => {
                            setVacuumResult(result);
                            setDbInfo({ size_mb: result.after_mb, reclaimable_mb: 0 });
                          })
                          .catch(() => {})
                          .finally(() => setVacuuming(false));
                      }}
                      disabled={vacuuming || (dbInfo !== null && dbInfo.reclaimable_mb < 0.5)}
                    >
                      {vacuuming ? "Compacting..." : "Compact now"}
                    </button>
                  </SettingsItem>

                  <SettingsItem
                    label="Rebuild semantic index"
                    description={
                      <>
                        <span>
                          Recreates the visual-embedding index and re-embeds every image in the
                          background. Use this if semantic or similar-image search reports a
                          dimension-mismatch error (for example after experimenting with a
                          different embedding model).
                        </span>
                        {rebuildIndexResult !== null ? (
                          <span className="mt-2 block text-gray-600">{rebuildIndexResult}</span>
                        ) : null}
                      </>
                    }
                  >
                    <button
                      className="rounded-md border border-white/10 bg-white/[0.055] px-3 py-1.5 text-xs text-gray-300 transition-colors hover:bg-white/10 hover:text-white disabled:cursor-not-allowed disabled:opacity-45 light-theme:border-gray-700/50 light-theme:bg-gray-900 light-theme:text-white light-theme:hover:bg-gray-800 light-theme:hover:text-white"
                      onClick={() => {
                        setRebuildingIndex(true);
                        setRebuildIndexResult(null);
                        void rebuildSemanticIndex()
                          .then((count) =>
                            setRebuildIndexResult(
                              `Re-queued ${count.toLocaleString()} image${count === 1 ? "" : "s"} for embedding.`,
                            ),
                          )
                          .catch((error) => setRebuildIndexResult(String(error)))
                          .finally(() => setRebuildingIndex(false));
                      }}
                      disabled={rebuildingIndex}
                    >
                      {rebuildingIndex ? "Rebuilding…" : "Rebuild index"}
                    </button>
                  </SettingsItem>

                  <SettingsItem
                    label="Thumbnail cache"
                    description={
                      <>
                        <span>Thumbnails left behind when folders or images are removed. Safe to delete — they are regenerated if the originals are re-indexed.</span>
                        <span className="mt-2.5 flex flex-wrap items-center gap-x-5 gap-y-1">
                          <StatPair
                            label="Orphaned files"
                            value={
                              thumbnailCleanupResult
                                ? "0"
                                : thumbnailInfo
                                  ? thumbnailInfo.count.toLocaleString()
                                  : "—"
                            }
                          />
                          <StatPair
                            label="Reclaimable"
                            accent={thumbnailCleanupResult !== null}
                            value={
                              thumbnailCleanupResult
                                ? `${thumbnailCleanupResult.freed_mb.toFixed(1)} MB freed`
                                : thumbnailInfo
                                  ? `${thumbnailInfo.size_mb.toFixed(1)} MB`
                                  : "—"
                            }
                          />
                        </span>
                        <span className="mt-2 block text-gray-600">
                          {cleaningThumbnails
                            ? "Scanning and removing orphaned thumbnails…"
                            : thumbnailCleanupResult
                              ? `Removed ${thumbnailCleanupResult.deleted_count.toLocaleString()} file${thumbnailCleanupResult.deleted_count === 1 ? "" : "s"}, freed ${thumbnailCleanupResult.freed_mb.toFixed(1)} MB.`
                              : thumbnailInfo && thumbnailInfo.count === 0
                                ? "No orphaned thumbnails found."
                                : thumbnailInfo && thumbnailInfo.count > 1000
                                  ? "May take a few minutes for large collections."
                                  : "Remove thumbnails no longer associated with any indexed image."}
                        </span>
                      </>
                    }
                  >
                    <button
                      className="rounded-md border border-white/10 bg-white/[0.055] px-3 py-1.5 text-xs text-gray-300 transition-colors hover:bg-white/10 hover:text-white disabled:cursor-not-allowed disabled:opacity-45 light-theme:border-gray-700/50 light-theme:bg-gray-900 light-theme:text-white light-theme:hover:bg-gray-800 light-theme:hover:text-white"
                      onClick={() => {
                        setCleaningThumbnails(true);
                        cleanupOrphanedThumbnails()
                          .then((result) => {
                            setThumbnailCleanupResult(result);
                            setThumbnailInfo(null);
                          })
                          .catch(() => {})
                          .finally(() => setCleaningThumbnails(false));
                      }}
                      disabled={cleaningThumbnails || thumbnailCleanupResult !== null || (thumbnailInfo !== null && thumbnailInfo.count === 0)}
                    >
                      {cleaningThumbnails ? "Cleaning…" : "Clean up"}
                    </button>
                  </SettingsItem>
                </SettingsGroup>
                  </>
                ) : null}
              </div>
            )}
          </div>
        </main>
      </div>
    </div>
  );
}
