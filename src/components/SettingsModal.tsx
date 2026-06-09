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

  return <span className={`inline-flex rounded-md border px-2 py-1 text-[11px] font-medium ${className}`}>{children}</span>;
}

function SectionShell({ eyebrow, title, description, children }: {
  eyebrow: string;
  title: string;
  description?: string;
  children: React.ReactNode;
}) {
  return (
    <section>
      <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-gray-600">{eyebrow}</p>
      <h3 className="mt-1 text-lg font-semibold text-white">{title}</h3>
      {description ? <p className="mt-2 max-w-2xl text-sm leading-relaxed text-gray-500">{description}</p> : null}
      <div className="mt-5 space-y-4">{children}</div>
    </section>
  );
}

function SettingsCard({ title, description, children }: { title: string; description?: string; children: React.ReactNode }) {
  return (
    <div className="rounded-2xl border border-white/[0.07] bg-white/[0.03] p-5">
      <div className="flex flex-col gap-1 border-b border-white/[0.07] pb-4">
        <p className="text-sm font-medium text-white">{title}</p>
        {description ? <p className="text-xs leading-relaxed text-gray-500">{description}</p> : null}
      </div>
      <div className="pt-4">{children}</div>
    </div>
  );
}

function SettingsRow({ title, description, children }: { title: string; description: string; children: React.ReactNode }) {
  return (
    <div className="flex items-start justify-between gap-5 border-b border-white/[0.07] py-4 last:border-b-0 first:pt-0 last:pb-0">
      <div className="min-w-0">
        <p className="text-sm font-medium text-white">{title}</p>
        <p className="mt-1 max-w-md text-xs leading-relaxed text-gray-500">{description}</p>
      </div>
      <div className="shrink-0">{children}</div>
    </div>
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
          : "border-white/10 bg-white/[0.045] text-gray-500 hover:bg-white/[0.075] hover:text-gray-200"
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
          : "border-white/10 bg-white/[0.045] text-gray-500 hover:bg-white/[0.075] hover:text-gray-200"
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
        className="flex h-[min(760px,calc(100vh-56px))] w-full max-w-5xl overflow-hidden rounded-lg border border-white/10 bg-[#07080f] shadow-2xl shadow-black/60"
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

        <main className="flex min-w-0 flex-1 flex-col">
          <div className="flex h-14 shrink-0 items-center justify-between border-b border-white/[0.07] px-6">
            <div>
              <p className="text-sm font-medium text-white">{activeSection === "workspace" ? "AI Workspace" : "General"}</p>
              <p className="text-xs text-gray-600">{activeSection === "workspace" ? "Model setup and queue targets" : "App data and diagnostics"}</p>
            </div>
            <button
              className="rounded-md p-1.5 text-gray-500 transition-colors hover:bg-white/[0.06] hover:text-white"
              onClick={() => setSettingsOpen(false)}
              title="Close settings"
            >
              <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>

          <div className="flex-1 overflow-y-auto px-7 py-6">
            {activeSection === "workspace" ? (
              <div className="space-y-8">
                <SectionShell
                  eyebrow="AI Workspace"
                  title="Tagging"
                >
                  <SettingsCard title="Tagging Models">
                    <div className="rounded-xl border border-white/[0.07] bg-black/20 p-4">
                      <div className="flex items-start justify-between gap-4">
                        <div>
                          <div className="flex items-center gap-2">
                            <p className="text-sm font-medium text-white">WD SwinV2 Tagger v3</p>
                            <StatusPill tone={taggerReady ? "ready" : taggerModelPreparing ? "busy" : "muted"}>
                              {taggerReady ? "Installed" : taggerModelPreparing ? "Preparing" : "Not installed"}
                            </StatusPill>
                          </div>
                          <p className="mt-1 max-w-xl text-xs leading-relaxed text-gray-500">
                            Anime-focused vision model by SmilingWolf. Generates booru-style tags with configurable confidence thresholds.
                          </p>
                        </div>
                        <div className="flex flex-col items-end gap-2">
                          <button
                            className="relative overflow-hidden rounded-md border border-white/10 bg-white/[0.055] px-3 py-1.5 text-xs text-gray-300 transition-colors hover:bg-white/10 hover:text-white disabled:cursor-not-allowed disabled:opacity-45"
                            onClick={() => void prepareTaggerModel()}
                            disabled={taggerModelPreparing || taggerReady}
                          >
                            {taggerModelProgress ? <span className="absolute inset-y-0 left-0 bg-emerald-400/15 transition-[width] duration-200" style={{ width: `${taggerDownloadPercent}%` }} /> : null}
                            <span className="relative">{taggerDownloadLabel}</span>
                          </button>
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
                          ) : null}
                        </div>
                      </div>

                      <div className="mt-4 space-y-4 border-t border-white/[0.07] pt-4">
                        <SettingsRow title="Tagger acceleration" description="Use DirectML when available, or fall back to CPU for reliability.">
                          <div className="flex flex-col items-end gap-2">
                            <div className="flex rounded-lg border border-white/[0.07] bg-black/20 p-1">
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
                        </SettingsRow>

                        <SettingsRow title="Confidence threshold" description="Lower values keep more tags. Higher values are stricter and usually cleaner.">
                          <div className="flex flex-col items-end gap-2">
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
                        </SettingsRow>

                        <SettingsRow title="Tagging batch size" description="Number of images processed concurrently during tag generation.">
                          <div className="flex flex-col items-end gap-2">
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
                        </SettingsRow>

                        <div>
                          <p className="text-xs font-medium text-gray-400">Model location</p>
                          <p className="mt-2 break-all rounded-md border border-white/[0.07] bg-black/20 px-3 py-2 text-xs text-gray-600">
                            {taggerReady ? taggerModelStatus?.local_dir : "Not downloaded"}
                          </p>
                          {taggerModelProgress?.current_file ? <p className="mt-3 break-all text-xs text-gray-500">{taggerModelProgress.current_file}</p> : null}
                          {taggerModelError ? <p className="mt-3 text-xs text-amber-300">{taggerModelError}</p> : null}
                          {taggerRuntimeProbe ? (
                            <div className="mt-4 rounded-lg border border-white/[0.07] bg-black/20 px-3 py-3">
                              <div className="flex items-center justify-between gap-3">
                                <p className="text-xs font-medium text-gray-400">Runtime check</p>
                                <StatusPill tone="ready">Ready</StatusPill>
                              </div>
                              <p className="mt-2 text-xs text-gray-600">Tagger acceleration: {taggerRuntimeProbe.acceleration}</p>
                              <p className="mt-2 break-all text-xs text-gray-500">{taggerRuntimeProbe.session.file}</p>
                            </div>
                          ) : null}
                        </div>
                      </div>
                    </div>
                  </SettingsCard>

                  <SettingsCard title="Queue Targets" description="Choose which folders to include when queuing tagging jobs.">
                    <SettingsRow title="Target scope" description="Queue across the full library, or choose a specific folder set and keep the modal open while you work through it.">
                      <div className="flex rounded-lg border border-white/[0.07] bg-black/20 p-1">
                        <ScopeButton scope="all" current={taggingQueueScope} onSelect={setTaggingQueueScope}>All media</ScopeButton>
                        <ScopeButton scope="selected" current={taggingQueueScope} onSelect={setTaggingQueueScope}>Selected folders</ScopeButton>
                      </div>
                    </SettingsRow>

                    <div className="border-b border-white/[0.07] py-4">
                      <div className="flex items-center justify-between gap-4">
                        <div>
                          <p className="text-sm font-medium text-white">Folder selection</p>
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

                      <div className={`mt-4 grid max-h-64 gap-2 overflow-y-auto pr-1 ${taggingQueueScope === "selected" ? "opacity-100" : "opacity-60"}`}>
                        {folders.map((folder) => {
                          const active = taggingQueueFolderIds.includes(folder.id);
                          const progress = mediaJobProgress[folder.id];
                          return (
                            <button
                              key={folder.id}
                              type="button"
                              className={`flex items-center justify-between rounded-xl border px-3 py-2 text-left transition-colors disabled:cursor-not-allowed ${
                                active
                                  ? "border-emerald-400/30 bg-emerald-500/10 text-white"
                                  : "border-white/[0.07] bg-black/20 text-gray-300 hover:border-white/15 hover:bg-white/[0.04]"
                              }`}
                              onClick={() => toggleTaggingQueueFolder(folder.id)}
                              disabled={taggingQueueScope === "all"}
                            >
                              <div>
                                <p className="text-sm font-medium">{folder.name}</p>
                                <p className="mt-1 text-[11px] text-gray-500">{folder.image_count.toLocaleString()} items</p>
                              </div>
                              <div className="flex items-center gap-2">
                                {(progress?.tagging_pending ?? 0) > 0 ? <StatusPill tone="busy">{progress?.tagging_pending} queued</StatusPill> : null}
                                <span className={`h-4 w-4 rounded-full border ${active ? "border-emerald-300 bg-emerald-300" : "border-white/15 bg-transparent"}`} />
                              </div>
                            </button>
                          );
                        })}
                        {folders.length === 0 ? <p className="text-sm text-gray-500">Add a folder first to enable targeted tagging queues.</p> : null}
                      </div>
                    </div>

                    <SettingsRow title="Queue tagging jobs" description="Generate missing AI tags for the current target. Results flow back into the library as the background worker finishes.">
                      <div className="flex flex-col items-end gap-2">
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
                    </SettingsRow>

                    {taggerQueueStatus ? <p className="pt-4 text-xs text-gray-500">{taggerQueueStatus}</p> : null}
                  </SettingsCard>
                </SectionShell>
              </div>
            ) : (
              <div className="space-y-8">
                <SectionShell
                  eyebrow="General"
                  title="App data"
                  description="Access the folder where Phokus stores its database, thumbnails, AI models, and settings."
                >
                  <SettingsCard title="Storage location">
                    <div className="flex items-center justify-between gap-4 rounded-xl border border-white/[0.07] bg-black/20 p-4">
                      <p className="text-sm text-gray-400">Open the app data folder in Explorer to inspect or back up files.</p>
                      <button
                        className="shrink-0 rounded-md border border-white/10 bg-white/[0.055] px-3 py-1.5 text-xs text-gray-300 transition-colors hover:bg-white/10 hover:text-white disabled:cursor-not-allowed disabled:opacity-45"
                        onClick={() => {
                          setOpeningDataFolder(true);
                          void openAppDataFolder().finally(() => setOpeningDataFolder(false));
                        }}
                        disabled={openingDataFolder}
                      >
                        {openingDataFolder ? "Opening..." : "Open data folder"}
                      </button>
                    </div>
                  </SettingsCard>

                  <SettingsCard
                    title="Compact database"
                    description="Reclaims wasted space left behind when images or tags are deleted. Safe to run at any time."
                  >
                    <div className="space-y-3">
                      <div className="grid grid-cols-2 gap-3">
                        <div className="rounded-xl border border-white/[0.07] bg-black/20 p-4">
                          <p className="text-[11px] uppercase tracking-[0.14em] text-gray-600">Database size</p>
                          <p className="mt-2 text-2xl font-semibold text-white">
                            {vacuumResult
                              ? `${vacuumResult.after_mb.toFixed(1)} MB`
                              : dbInfo
                                ? `${dbInfo.size_mb.toFixed(1)} MB`
                                : "—"}
                          </p>
                        </div>
                        <div className="rounded-xl border border-white/[0.07] bg-black/20 p-4">
                          <p className="text-[11px] uppercase tracking-[0.14em] text-gray-600">Reclaimable</p>
                          <p className={`mt-2 text-2xl font-semibold ${vacuumResult ? "text-emerald-300" : "text-white"}`}>
                            {vacuumResult
                              ? `−${vacuumResult.freed_mb.toFixed(1)} MB freed`
                              : dbInfo
                                ? `${dbInfo.reclaimable_mb.toFixed(1)} MB`
                                : "—"}
                          </p>
                        </div>
                      </div>
                      <div className="flex items-center justify-between gap-4 rounded-xl border border-white/[0.07] bg-black/20 p-4">
                        <p className="text-sm text-gray-400">
                          {vacuumResult
                            ? `Compacted from ${vacuumResult.before_mb.toFixed(1)} MB to ${vacuumResult.after_mb.toFixed(1)} MB.`
                            : dbInfo && dbInfo.reclaimable_mb < 0.5
                              ? "Database is already compact."
                              : "Run this after removing folders or bulk-deleting images."}
                        </p>
                        <button
                          className="shrink-0 rounded-md border border-white/10 bg-white/[0.055] px-3 py-1.5 text-xs text-gray-300 transition-colors hover:bg-white/10 hover:text-white disabled:cursor-not-allowed disabled:opacity-45"
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
                          disabled={vacuuming || (dbInfo !== null && dbInfo.reclaimable_mb < 0.5 && vacuumResult === null)}
                        >
                          {vacuuming ? "Compacting..." : "Compact now"}
                        </button>
                      </div>
                    </div>
                  </SettingsCard>

                  <SettingsCard
                    title="Thumbnail cache"
                    description="Thumbnails left behind when folders or images are removed. Safe to delete — they will be regenerated if the original files are re-indexed."
                  >
                    <div className="space-y-3">
                      <div className="grid grid-cols-2 gap-3">
                        <div className="rounded-xl border border-white/[0.07] bg-black/20 p-4">
                          <p className="text-[11px] uppercase tracking-[0.14em] text-gray-600">Orphaned files</p>
                          <p className="mt-2 text-2xl font-semibold text-white">
                            {thumbnailCleanupResult
                              ? thumbnailCleanupResult.deleted_count.toLocaleString()
                              : thumbnailInfo
                                ? thumbnailInfo.count.toLocaleString()
                                : "—"}
                          </p>
                        </div>
                        <div className="rounded-xl border border-white/[0.07] bg-black/20 p-4">
                          <p className="text-[11px] uppercase tracking-[0.14em] text-gray-600">Reclaimable</p>
                          <p className={`mt-2 text-2xl font-semibold ${thumbnailCleanupResult ? "text-emerald-300" : "text-white"}`}>
                            {thumbnailCleanupResult
                              ? `−${thumbnailCleanupResult.freed_mb.toFixed(1)} MB freed`
                              : thumbnailInfo
                                ? `${thumbnailInfo.size_mb.toFixed(1)} MB`
                                : "—"}
                          </p>
                        </div>
                      </div>
                      <div className="flex items-center justify-between gap-4 rounded-xl border border-white/[0.07] bg-black/20 p-4">
                        <p className="text-sm text-gray-400">
                          {thumbnailCleanupResult
                            ? `Removed ${thumbnailCleanupResult.deleted_count.toLocaleString()} orphaned thumbnail${thumbnailCleanupResult.deleted_count === 1 ? "" : "s"}.`
                            : thumbnailInfo && thumbnailInfo.count === 0
                              ? "No orphaned thumbnails found."
                              : "Remove thumbnails no longer associated with any indexed image."}
                        </p>
                        <button
                          className="shrink-0 rounded-lg bg-white/[0.07] px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-white/[0.11] disabled:cursor-not-allowed disabled:opacity-40"
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
                          {cleaningThumbnails ? "Cleaning..." : "Clean up"}
                        </button>
                      </div>
                    </div>
                  </SettingsCard>
                </SectionShell>
              </div>
            )}
          </div>
        </main>
      </div>
    </div>
  );
}
