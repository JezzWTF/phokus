import { useEffect, useMemo, useRef, useState } from "react";
import { CleanupOrphanedThumbnailsResult, DatabaseInfo, OrphanedThumbnailsInfo, TaggerAcceleration, TaggingQueueScope, VacuumResult, useGalleryStore } from "../store";

type SettingsSection = "workspace" | "general";

const SECTIONS: { id: SettingsSection; label: string; detail: string }[] = [
  { id: "workspace", label: "AI Workspace", detail: "Tagging models and queue targets" },
  { id: "general", label: "General", detail: "App data and diagnostics" },
];

function StatusPill({ children, tone }: { children: React.ReactNode; tone: "ready" | "muted" | "busy" }) {
  const className =
    tone === "ready"
      ? "border-emerald-400/25 bg-emerald-500/10 text-emerald-300"
      : tone === "busy"
        ? "border-sky-400/25 bg-sky-500/10 text-sky-300"
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
          ? "border-emerald-400/35 bg-emerald-500/15 text-emerald-200"
          : "border-transparent text-gray-500 hover:bg-white/[0.06] hover:text-gray-200"
      }`}
      onClick={() => onSelect(scope)}
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
          ? "border-emerald-400/35 bg-emerald-500/15 text-emerald-200"
          : "border-transparent text-gray-500 hover:bg-white/[0.06] hover:text-gray-200"
      }`}
      onClick={() => onSelect(acceleration)}
    >
      {children}
    </button>
  );
}

export function SettingsModal() {
  const [activeSection, setActiveSection] = useState<SettingsSection>("workspace");
  const [taggerQueueStatus, setTaggerQueueStatus] = useState<string | null>(null);
  const [taggerQueueing, setTaggerQueueing] = useState(false);
  const [taggerClearing, setTaggerClearing] = useState(false);
  const [taggerAccelerationSaving, setTaggerAccelerationSaving] = useState(false);
  const [taggerAccelerationError, setTaggerAccelerationError] = useState<string | null>(null);
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
  const loadTaggerThreshold = useGalleryStore((state) => state.loadTaggerThreshold);
  const setTaggerThreshold = useGalleryStore((state) => state.setTaggerThreshold);
  const loadTaggerBatchSize = useGalleryStore((state) => state.loadTaggerBatchSize);
  const setTaggerBatchSize = useGalleryStore((state) => state.setTaggerBatchSize);
  const probeTaggerRuntime = useGalleryStore((state) => state.probeTaggerRuntime);
  const queueTaggingJobs = useGalleryStore((state) => state.queueTaggingJobs);
  const queueTaggingJobsForFolders = useGalleryStore((state) => state.queueTaggingJobsForFolders);
  const clearTaggingJobs = useGalleryStore((state) => state.clearTaggingJobs);
  const clearTaggingJobsForFolders = useGalleryStore((state) => state.clearTaggingJobsForFolders);
  const openAppDataFolder = useGalleryStore((state) => state.openAppDataFolder);
  const notificationsPaused = useGalleryStore((state) => state.notificationsPaused);
  const setNotificationsPaused = useGalleryStore((state) => state.setNotificationsPaused);
  const getDatabaseInfo = useGalleryStore((state) => state.getDatabaseInfo);
  const vacuumDatabase = useGalleryStore((state) => state.vacuumDatabase);
  const getOrphanedThumbnailsInfo = useGalleryStore((state) => state.getOrphanedThumbnailsInfo);
  const cleanupOrphanedThumbnails = useGalleryStore((state) => state.cleanupOrphanedThumbnails);

  useEffect(() => {
    if (!settingsOpen) return;
    void loadTaggerModelStatus();
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
  }, [settingsOpen, loadTaggerModelStatus, loadTaggerAcceleration, loadTaggerThreshold, loadTaggerBatchSize, loadTaggingQueueScope, loadTaggingQueueFolderIds, setSettingsOpen]);

  useEffect(() => {
    if (!settingsOpen || activeSection !== "general") return;
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

  const taggerReady = taggerModelStatus?.ready ?? false;
  const queueScopeLabel =
    taggingQueueScope === "all"
      ? "all media"
      : selectedFolders.length > 0
        ? `${selectedFolders.length} selected folder${selectedFolders.length === 1 ? "" : "s"}`
        : "no folders selected";
  const thresholdDisplay = taggerThresholdDraft ?? String(taggerThreshold);
  const batchSizeDisplay = taggerBatchSizeDraft ?? String(taggerBatchSize);
  const taggerDownloadLabel = taggerModelProgress
    ? `Downloading ${taggerModelProgress.completed_files}/${taggerModelProgress.total_files}`
    : taggerModelPreparing
      ? "Preparing WD Tagger..."
      : taggerReady
        ? "Installed"
        : "Install model";
  const taggerDownloadPercent = taggerModelProgress
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

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/65 px-6 backdrop-blur-sm" onClick={() => setSettingsOpen(false)}>
      <div
        className="relative flex h-[min(85vh,900px)] w-[min(85vw,1400px)] overflow-hidden rounded-lg border border-white/10 bg-[#07080f] shadow-2xl shadow-black/60"
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

        <button
          className="absolute right-4 top-4 z-10 rounded-md p-1.5 text-gray-500 transition-colors hover:bg-white/[0.06] hover:text-white"
          onClick={() => setSettingsOpen(false)}
          title="Close settings"
        >
          <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>

        <main className="min-w-0 flex-1 overflow-y-auto">
          <div className="px-10 py-8">
            <h3 className="text-lg font-semibold text-white">{activeSection === "workspace" ? "AI Workspace" : "General"}</h3>
            <p className="mt-1 text-xs text-gray-600">{activeSection === "workspace" ? "Model setup and queue targets" : "App data and diagnostics"}</p>

            {activeSection === "workspace" ? (
              <div className="mt-8 space-y-9">
                <SettingsGroup title="Model">
                  <SettingsItem
                    label={
                      <>
                        WD SwinV2 Tagger v3{" "}
                        <span className="ml-1.5 align-middle">
                          <StatusPill tone={taggerReady ? "ready" : taggerModelPreparing ? "busy" : "muted"}>
                            {taggerReady ? "Installed" : taggerModelPreparing ? "Preparing" : "Not installed"}
                          </StatusPill>
                        </span>
                      </>
                    }
                    description="Anime-focused vision model by SmilingWolf. Generates booru-style tags with configurable confidence thresholds."
                  >
                    <div className="flex items-center gap-2">
                      {taggerReady ? (
                        <>
                          <button
                            className="rounded-md border border-white/10 bg-white/[0.055] px-3 py-1.5 text-xs text-gray-300 transition-colors hover:bg-white/10 hover:text-white disabled:cursor-not-allowed disabled:opacity-45"
                            onClick={() => void probeTaggerRuntime()}
                            disabled={taggerRuntimeChecking}
                          >
                            {taggerRuntimeChecking ? "Checking runtime..." : "Check runtime"}
                          </button>
                          <button
                            className="rounded-md border border-red-400/20 bg-red-500/10 px-3 py-1.5 text-xs text-red-200 transition-colors hover:bg-red-500/15 disabled:cursor-not-allowed disabled:opacity-45"
                            onClick={() => void deleteTaggerModel()}
                            disabled={taggerModelPreparing}
                          >
                            Delete model files
                          </button>
                        </>
                      ) : (
                        <button
                          className="relative overflow-hidden rounded-md border border-white/10 bg-white/[0.055] px-3 py-1.5 text-xs text-gray-300 transition-colors hover:bg-white/10 hover:text-white disabled:cursor-not-allowed disabled:opacity-45"
                          onClick={() => void prepareTaggerModel()}
                          disabled={taggerModelPreparing}
                        >
                          {taggerModelProgress ? <span className="absolute inset-y-0 left-0 bg-emerald-400/15 transition-[width] duration-200" style={{ width: `${taggerDownloadPercent}%` }} /> : null}
                          <span className="relative">{taggerDownloadLabel}</span>
                        </button>
                      )}
                    </div>
                  </SettingsItem>

                  <SettingsItem label="Tagger acceleration" description="Use DirectML when available, or fall back to CPU for reliability.">
                    <div className="flex flex-col items-end gap-1.5">
                      <div className="flex rounded-lg border border-white/[0.07] p-0.5">
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
                        onBlur={() => {
                          const value = parseFloat(thresholdDisplay);
                          if (!isNaN(value) && value >= 0.05 && value <= 0.99) {
                            setTaggerThresholdError(null);
                            setTaggerThresholdSaving(true);
                            void setTaggerThreshold(value)
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
                        <p className="text-[11px] text-gray-600">{taggerThresholdSaving ? "Saving..." : "Default: 0.35"}</p>
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
                      {taggerRuntimeProbe ? (
                        <div className="mt-3">
                          <p className="text-xs text-gray-400">
                            Runtime check <span className="ml-1.5 align-middle"><StatusPill tone="ready">Ready</StatusPill></span>
                            <span className="ml-2 text-gray-600">acceleration: {taggerRuntimeProbe.acceleration}</span>
                          </p>
                          <p className="mt-1.5 break-all font-mono text-xs text-gray-600">{taggerRuntimeProbe.session.file}</p>
                        </div>
                      ) : null}
                    </div>
                  </SettingsItem>
                </SettingsGroup>

                <SettingsGroup title="Queue targets" description="Choose which folders to include when queuing tagging jobs.">
                  <SettingsItem label="Target scope" description="Queue across the full library, or choose a specific folder set and keep the modal open while you work through it.">
                    <div className="flex rounded-lg border border-white/[0.07] p-0.5">
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
                          className="rounded-md border border-white/10 bg-white/[0.045] px-2.5 py-1 text-[11px] text-gray-400 transition-colors hover:bg-white/[0.075] hover:text-white disabled:opacity-40 disabled:cursor-not-allowed"
                          onClick={() => setTaggingQueueFolderIds(folders.map((folder) => folder.id))}
                          disabled={taggingQueueScope === "all" || folders.length === 0}
                        >
                          Select all
                        </button>
                        <button
                          className="rounded-md border border-white/10 bg-white/[0.045] px-2.5 py-1 text-[11px] text-gray-400 transition-colors hover:bg-white/[0.075] hover:text-white disabled:opacity-40 disabled:cursor-not-allowed"
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
                        className="rounded-md border border-white/10 bg-white/[0.055] px-3 py-1.5 text-xs text-gray-300 transition-colors hover:bg-white/10 hover:text-white disabled:cursor-not-allowed disabled:opacity-45"
                        onClick={() => runQueueAction("queue")}
                        disabled={!taggerReady || taggerQueueing || taggerClearing || (taggingQueueScope === "selected" && taggingQueueFolderIds.length === 0)}
                      >
                        {taggerQueueing ? "Queueing..." : "Queue tagging"}
                      </button>
                      <button
                        className="rounded-md border border-amber-400/20 bg-amber-500/10 px-3 py-1.5 text-xs text-amber-200 transition-colors hover:bg-amber-500/15 disabled:cursor-not-allowed disabled:opacity-45"
                        onClick={() => runQueueAction("clear")}
                        disabled={taggerQueueing || taggerClearing || (taggingQueueScope === "selected" && taggingQueueFolderIds.length === 0)}
                      >
                        {taggerClearing ? "Clearing..." : "Clear queued jobs"}
                      </button>
                    </div>
                  </SettingsItem>

                  {taggerQueueStatus ? <p className="pt-3 text-xs text-gray-500">{taggerQueueStatus}</p> : null}
                </SettingsGroup>
              </div>
            ) : (
              <div className="mt-8 space-y-9">
                <SettingsGroup title="Storage & notifications">
                  <SettingsItem
                    label="App data folder"
                    description="Open the folder in Explorer to inspect or back up the database, thumbnails, and models."
                  >
                    <button
                      className="rounded-md border border-white/10 bg-white/[0.055] px-3 py-1.5 text-xs text-gray-300 transition-colors hover:bg-white/10 hover:text-white disabled:cursor-not-allowed disabled:opacity-45"
                      onClick={() => {
                        setOpeningDataFolder(true);
                        void openAppDataFolder().finally(() => setOpeningDataFolder(false));
                      }}
                      disabled={openingDataFolder}
                    >
                      {openingDataFolder ? "Opening..." : "Open data folder"}
                    </button>
                  </SettingsItem>
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
                      className="rounded-md border border-white/10 bg-white/[0.055] px-3 py-1.5 text-xs text-gray-300 transition-colors hover:bg-white/10 hover:text-white disabled:cursor-not-allowed disabled:opacity-45"
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
                      className="rounded-md border border-white/10 bg-white/[0.055] px-3 py-1.5 text-xs text-gray-300 transition-colors hover:bg-white/10 hover:text-white disabled:cursor-not-allowed disabled:opacity-45"
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
              </div>
            )}
          </div>
        </main>
      </div>
    </div>
  );
}
