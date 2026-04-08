import { useEffect, useState } from "react";
import { TaggerAcceleration, useGalleryStore } from "../store";

type SettingsSection = "tagging" | "library" | "display" | "storage";

const SECTIONS: { id: SettingsSection; label: string; detail: string }[] = [
  { id: "tagging", label: "AI Tagging", detail: "WD tagger model" },
  { id: "library", label: "Library", detail: "Indexing and scanning" },
  { id: "display", label: "Display", detail: "Gallery preferences" },
  { id: "storage", label: "Storage", detail: "Cache and model files" },
];


function StatusPill({ children, tone }: { children: React.ReactNode; tone: "ready" | "muted" | "busy" }) {
  const className =
    tone === "ready"
      ? "border-emerald-400/25 bg-emerald-500/10 text-emerald-300"
      : tone === "busy"
      ? "border-sky-400/25 bg-sky-500/10 text-sky-300"
      : "border-white/10 bg-white/[0.04] text-gray-500";

  return (
    <span className={`inline-flex rounded-md border px-2 py-1 text-[11px] font-medium ${className}`}>
      {children}
    </span>
  );
}

function TaggerAccelerationButton({
  acceleration,
  current,
  onSelect,
  children,
}: {
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


function SettingsRow({
  title,
  description,
  children,
}: {
  title: string;
  description: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex items-start justify-between gap-5 border-b border-white/[0.07] py-4 last:border-b-0">
      <div className="min-w-0">
        <p className="text-sm font-medium text-white">{title}</p>
        <p className="mt-1 max-w-md text-xs leading-relaxed text-gray-500">{description}</p>
      </div>
      <div className="shrink-0">{children}</div>
    </div>
  );
}

function SectionShell({
  eyebrow,
  title,
  children,
}: {
  eyebrow: string;
  title: string;
  children: React.ReactNode;
}) {
  return (
    <div>
      <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-gray-600">{eyebrow}</p>
      <h3 className="mt-1 text-lg font-semibold text-white">{title}</h3>
      <div className="mt-5 border-t border-white/[0.08]">{children}</div>
    </div>
  );
}

export function SettingsModal() {
  const [activeSection, setActiveSection] = useState<SettingsSection>("tagging");
  const [taggerQueueStatus, setTaggerQueueStatus] = useState<string | null>(null);
  const [taggerQueueing, setTaggerQueueing] = useState(false);
  const [taggerClearing, setTaggerClearing] = useState(false);
  const [taggerAccelerationSaving, setTaggerAccelerationSaving] = useState(false);
  const [taggerThresholdDraft, setTaggerThresholdDraft] = useState<string | null>(null);
  const [taggerThresholdSaving, setTaggerThresholdSaving] = useState(false);
  const settingsOpen = useGalleryStore((state) => state.settingsOpen);
  const setSettingsOpen = useGalleryStore((state) => state.setSettingsOpen);
  const selectedFolderId = useGalleryStore((state) => state.selectedFolderId);
  const folders = useGalleryStore((state) => state.folders);
  const taggerModelStatus = useGalleryStore((state) => state.taggerModelStatus);
  const taggerModelPreparing = useGalleryStore((state) => state.taggerModelPreparing);
  const taggerModelProgress = useGalleryStore((state) => state.taggerModelProgress);
  const taggerModelError = useGalleryStore((state) => state.taggerModelError);
  const taggerAcceleration = useGalleryStore((state) => state.taggerAcceleration);
  const taggerThreshold = useGalleryStore((state) => state.taggerThreshold);
  const taggerRuntimeProbe = useGalleryStore((state) => state.taggerRuntimeProbe);
  const taggerRuntimeChecking = useGalleryStore((state) => state.taggerRuntimeChecking);
  const loadTaggerModelStatus = useGalleryStore((state) => state.loadTaggerModelStatus);
  const prepareTaggerModel = useGalleryStore((state) => state.prepareTaggerModel);
  const deleteTaggerModel = useGalleryStore((state) => state.deleteTaggerModel);
  const loadTaggerAcceleration = useGalleryStore((state) => state.loadTaggerAcceleration);
  const setTaggerAcceleration = useGalleryStore((state) => state.setTaggerAcceleration);
  const loadTaggerThreshold = useGalleryStore((state) => state.loadTaggerThreshold);
  const setTaggerThreshold = useGalleryStore((state) => state.setTaggerThreshold);
  const probeTaggerRuntime = useGalleryStore((state) => state.probeTaggerRuntime);
  const queueTaggingJobs = useGalleryStore((state) => state.queueTaggingJobs);
  const clearTaggingJobs = useGalleryStore((state) => state.clearTaggingJobs);

  useEffect(() => {
    if (!settingsOpen) return;
    void loadTaggerModelStatus();
    void loadTaggerAcceleration();
    void loadTaggerThreshold();
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") setSettingsOpen(false);
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [settingsOpen, loadTaggerModelStatus, loadTaggerAcceleration, loadTaggerThreshold, setSettingsOpen]);

  if (!settingsOpen) return null;

  const selectedFolder = folders.find((folder) => folder.id === selectedFolderId);
  const scopeLabel = selectedFolder ? selectedFolder.name : "all libraries";

  return (
    <div
      className="fixed inset-0 z-[60] flex items-center justify-center bg-black/65 px-6 backdrop-blur-sm"
      onClick={() => setSettingsOpen(false)}
    >
      <div
        className="flex h-[min(680px,calc(100vh-56px))] w-full max-w-4xl overflow-hidden rounded-lg border border-white/10 bg-[#07080f] shadow-2xl shadow-black/60"
        onClick={(event) => event.stopPropagation()}
      >
        <aside className="flex w-56 shrink-0 flex-col border-r border-white/[0.07] bg-white/[0.025]">
          <div className="border-b border-white/[0.07] px-5 py-5">
            <p className="text-base font-semibold text-white">Settings</p>
            <p className="mt-1 text-xs text-gray-600">Phokus preferences</p>
          </div>
          <div className="flex-1 space-y-1 overflow-y-auto p-2">
            {SECTIONS.map((section) => (
              <button
                key={section.id}
                className={`w-full rounded-md px-3 py-2.5 text-left transition-colors ${
                  activeSection === section.id
                    ? "bg-white/10 text-white"
                    : "text-gray-500 hover:bg-white/[0.055] hover:text-gray-200"
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
          <div className="flex h-14 shrink-0 items-center justify-end border-b border-white/[0.07] px-6">
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
            {activeSection === "tagging" ? (() => {
              const taggerReady = taggerModelStatus?.ready ?? false;
              const taggerDownloadLabel = taggerModelProgress
                ? `Downloading ${taggerModelProgress.completed_files}/${taggerModelProgress.total_files}`
                : taggerModelPreparing
                ? "Preparing WD Tagger..."
                : taggerReady
                ? "Downloaded"
                : "Download WD Tagger";
              const taggerDownloadPercent = taggerModelProgress
                ? Math.round((taggerModelProgress.completed_files / Math.max(taggerModelProgress.total_files, 1)) * 100)
                : 0;
              const thresholdDisplay = taggerThresholdDraft ?? String(taggerThreshold);
              return (
                <SectionShell eyebrow="AI Tagging" title="WD SwinV2 Tagger v3">
                  <SettingsRow
                    title="WD Tagger model"
                    description={taggerReady ? "Stored locally and available offline." : "Download the model to enable automatic AI tagging."}
                  >
                    <div className="flex flex-col items-end gap-2">
                      <button
                        className="relative overflow-hidden rounded-md border border-white/10 bg-white/[0.055] px-3 py-1.5 text-xs text-gray-300 transition-colors hover:bg-white/10 hover:text-white disabled:cursor-not-allowed disabled:opacity-45"
                        onClick={() => void prepareTaggerModel()}
                        disabled={taggerModelPreparing || taggerReady}
                      >
                        {taggerModelProgress ? (
                          <span
                            className="absolute inset-y-0 left-0 bg-emerald-400/15 transition-[width] duration-200"
                            style={{ width: `${taggerDownloadPercent}%` }}
                          />
                        ) : null}
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
                  </SettingsRow>

                  <SettingsRow
                    title="Tagger acceleration"
                    description="Use DirectML for GPU-accelerated tagging when available."
                  >
                    <div className="flex flex-col items-end gap-2">
                      <div className="flex rounded-lg border border-white/[0.07] bg-black/20 p-1">
                        <TaggerAccelerationButton
                          acceleration="auto"
                          current={taggerAcceleration}
                          onSelect={(acceleration) => {
                            setTaggerAccelerationSaving(true);
                            void setTaggerAcceleration(acceleration)
                              .catch((error) => setTaggerQueueStatus(String(error)))
                              .finally(() => setTaggerAccelerationSaving(false));
                          }}
                        >
                          Auto
                        </TaggerAccelerationButton>
                        <TaggerAccelerationButton
                          acceleration="directml"
                          current={taggerAcceleration}
                          onSelect={(acceleration) => {
                            setTaggerAccelerationSaving(true);
                            void setTaggerAcceleration(acceleration)
                              .catch((error) => setTaggerQueueStatus(String(error)))
                              .finally(() => setTaggerAccelerationSaving(false));
                          }}
                        >
                          DirectML
                        </TaggerAccelerationButton>
                        <TaggerAccelerationButton
                          acceleration="cpu"
                          current={taggerAcceleration}
                          onSelect={(acceleration) => {
                            setTaggerAccelerationSaving(true);
                            void setTaggerAcceleration(acceleration)
                              .catch((error) => setTaggerQueueStatus(String(error)))
                              .finally(() => setTaggerAccelerationSaving(false));
                          }}
                        >
                          CPU
                        </TaggerAccelerationButton>
                      </div>
                      <p className="text-[11px] text-gray-600">
                        {taggerAccelerationSaving ? "Saving..." : `Current: ${taggerAcceleration}`}
                      </p>
                    </div>
                  </SettingsRow>

                  <SettingsRow
                    title="Confidence threshold"
                    description="Tags with confidence below this value are discarded. Lower = more tags, higher = fewer but more accurate."
                  >
                    <div className="flex flex-col items-end gap-2">
                      <div className="flex items-center gap-2">
                        <input
                          type="number"
                          min="0.05"
                          max="0.99"
                          step="0.05"
                          className="w-20 rounded-md border border-white/10 bg-white/5 px-2 py-1.5 text-xs text-white focus:border-white/20 focus:outline-none"
                          value={thresholdDisplay}
                          onChange={(e) => setTaggerThresholdDraft(e.target.value)}
                          onBlur={() => {
                            const val = parseFloat(thresholdDisplay);
                            if (!isNaN(val) && val >= 0.05 && val <= 0.99) {
                              setTaggerThresholdSaving(true);
                              void setTaggerThreshold(val)
                                .catch((error) => setTaggerQueueStatus(String(error)))
                                .finally(() => {
                                  setTaggerThresholdDraft(null);
                                  setTaggerThresholdSaving(false);
                                });
                            } else {
                              setTaggerThresholdDraft(null);
                            }
                          }}
                        />
                      </div>
                      <p className="text-[11px] text-gray-600">
                        {taggerThresholdSaving ? "Saving..." : "Default: 0.35"}
                      </p>
                    </div>
                  </SettingsRow>

                  <SettingsRow
                    title="Tagging queue"
                    description={`Generate missing AI tags in ${scopeLabel}. Tags update as the background worker finishes each image.`}
                  >
                    <div className="flex flex-col items-end gap-2">
                      <button
                        className="rounded-md border border-white/10 bg-white/[0.055] px-3 py-1.5 text-xs text-gray-300 transition-colors hover:bg-white/10 hover:text-white disabled:cursor-not-allowed disabled:opacity-45"
                        onClick={() => {
                          setTaggerQueueing(true);
                          setTaggerQueueStatus(null);
                          void queueTaggingJobs(selectedFolderId)
                            .then((queued) => {
                              setTaggerQueueStatus(
                                queued === 0
                                  ? "No missing tags found."
                                  : `Queued ${queued.toLocaleString()} image${queued === 1 ? "" : "s"}.`,
                              );
                            })
                            .catch((error) => setTaggerQueueStatus(String(error)))
                            .finally(() => setTaggerQueueing(false));
                        }}
                        disabled={!taggerReady || taggerQueueing || taggerClearing}
                      >
                        {taggerQueueing
                          ? "Queueing..."
                          : selectedFolder
                          ? "Tag this library"
                          : "Tag all libraries"}
                      </button>
                      <button
                        className="rounded-md border border-amber-400/20 bg-amber-500/10 px-3 py-1.5 text-xs text-amber-200 transition-colors hover:bg-amber-500/15 disabled:cursor-not-allowed disabled:opacity-45"
                        onClick={() => {
                          setTaggerClearing(true);
                          setTaggerQueueStatus(null);
                          void clearTaggingJobs(selectedFolderId)
                            .then((cleared) => {
                              setTaggerQueueStatus(
                                cleared === 0
                                  ? "No queued tagging jobs to clear."
                                  : `Cleared ${cleared.toLocaleString()} queued job${cleared === 1 ? "" : "s"}.`,
                              );
                            })
                            .catch((error) => setTaggerQueueStatus(String(error)))
                            .finally(() => setTaggerClearing(false));
                        }}
                        disabled={taggerQueueing || taggerClearing}
                      >
                        {taggerClearing
                          ? "Clearing..."
                          : selectedFolder
                          ? "Clear this queue"
                          : "Clear all queued tags"}
                      </button>
                    </div>
                  </SettingsRow>

                  <div className="py-4">
                    <p className="text-xs font-medium text-gray-400">Model location</p>
                    <p className="mt-2 break-all rounded-md border border-white/[0.07] bg-black/20 px-3 py-2 text-xs text-gray-600">
                      {taggerReady ? taggerModelStatus?.local_dir : "Not downloaded"}
                    </p>
                    {taggerModelProgress?.current_file ? (
                      <p className="mt-3 break-all text-xs text-gray-500">{taggerModelProgress.current_file}</p>
                    ) : null}
                    {taggerModelError ? (
                      <p className="mt-3 text-xs text-amber-300">{taggerModelError}</p>
                    ) : null}
                    {taggerQueueStatus ? (
                      <p className="mt-3 text-xs text-gray-500">{taggerQueueStatus}</p>
                    ) : null}
                    {taggerRuntimeProbe ? (
                      <div className="mt-4 border-t border-white/[0.07] pt-4">
                        <div className="flex items-center justify-between gap-3">
                          <p className="text-xs font-medium text-gray-400">Runtime check</p>
                          <StatusPill tone="ready">Ready</StatusPill>
                        </div>
                        <p className="mt-2 text-xs text-gray-600">
                          Tagger acceleration: {taggerRuntimeProbe.acceleration}
                        </p>
                        <div className="mt-3 space-y-2">
                          <div className="rounded-md border border-white/[0.07] bg-black/20 px-3 py-2">
                            <p className="break-all text-xs text-gray-400">{taggerRuntimeProbe.session.file}</p>
                            <p className="mt-1 text-[11px] text-gray-600">
                              {taggerRuntimeProbe.session.inputs.length} input{taggerRuntimeProbe.session.inputs.length === 1 ? "" : "s"} · {taggerRuntimeProbe.session.outputs.join(", ")}
                            </p>
                          </div>
                        </div>
                      </div>
                    ) : null}
                  </div>
                </SectionShell>
              );
            })() : null}

            {activeSection === "library" ? (
              <SectionShell eyebrow="Library" title="Indexing and scanning">
                <SettingsRow title="Background workers" description="Folder-level pause controls remain in the background tasks panel.">
                  <StatusPill tone="muted">Managed per folder</StatusPill>
                </SettingsRow>
                <SettingsRow title="Reindexing" description="Use the library sidebar to rescan a folder when files change.">
                  <StatusPill tone="muted">Available</StatusPill>
                </SettingsRow>
              </SectionShell>
            ) : null}

            {activeSection === "display" ? (
              <SectionShell eyebrow="Display" title="Gallery preferences">
                <SettingsRow title="Grid density" description="Use the toolbar size control to change thumbnail density.">
                  <StatusPill tone="muted">Toolbar</StatusPill>
                </SettingsRow>
                <SettingsRow title="Result view" description="Similar results reset to the top on each new search.">
                  <StatusPill tone="ready">Enabled</StatusPill>
                </SettingsRow>
              </SectionShell>
            ) : null}

            {activeSection === "storage" ? (
              <SectionShell eyebrow="Storage" title="Local files">
                <SettingsRow title="WD Tagger" description="Remove the local tagger model without changing the rest of the library.">
                  <button
                    className="rounded-md border border-red-400/20 bg-red-500/10 px-3 py-1.5 text-xs text-red-200 transition-colors hover:bg-red-500/15 disabled:cursor-not-allowed disabled:opacity-45"
                    onClick={() => void deleteTaggerModel()}
                    disabled={taggerModelPreparing || !(taggerModelStatus?.ready ?? false)}
                  >
                    Delete model files
                  </button>
                </SettingsRow>
              </SectionShell>
            ) : null}
          </div>
        </main>
      </div>
    </div>
  );
}
