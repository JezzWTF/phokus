import { useEffect, useState } from "react";
import { useGalleryStore } from "../store";

type SettingsSection = "ai" | "library" | "display" | "storage";

const SECTIONS: { id: SettingsSection; label: string; detail: string }[] = [
  { id: "ai", label: "Local AI", detail: "Captions and suggestions" },
  { id: "library", label: "Library", detail: "Indexing and scanning" },
  { id: "display", label: "Display", detail: "Gallery preferences" },
  { id: "storage", label: "Storage", detail: "Cache and model files" },
];

function ToggleSwitch({
  checked,
  disabled,
  onChange,
  label,
}: {
  checked: boolean;
  disabled?: boolean;
  onChange: (checked: boolean) => void;
  label: string;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      disabled={disabled}
      onClick={() => onChange(!checked)}
      className={`relative h-7 w-12 shrink-0 rounded-full border transition-colors duration-150 focus:outline-none focus:ring-2 focus:ring-emerald-400/30 disabled:cursor-not-allowed disabled:opacity-45 ${
        checked
          ? "border-emerald-400/50 bg-emerald-500/35"
          : "border-white/12 bg-white/[0.06]"
      }`}
    >
      <span
        className={`absolute left-0.5 top-0.5 h-6 w-6 rounded-full bg-white shadow-lg shadow-black/40 transition-transform duration-150 ${
          checked ? "translate-x-5" : "translate-x-0"
        }`}
      />
    </button>
  );
}

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
  const [activeSection, setActiveSection] = useState<SettingsSection>("ai");
  const [captionQueueStatus, setCaptionQueueStatus] = useState<string | null>(null);
  const [captionQueueing, setCaptionQueueing] = useState(false);
  const settingsOpen = useGalleryStore((state) => state.settingsOpen);
  const setSettingsOpen = useGalleryStore((state) => state.setSettingsOpen);
  const folders = useGalleryStore((state) => state.folders);
  const selectedFolderId = useGalleryStore((state) => state.selectedFolderId);
  const captionModelStatus = useGalleryStore((state) => state.captionModelStatus);
  const captionModelPreparing = useGalleryStore((state) => state.captionModelPreparing);
  const captionModelProgress = useGalleryStore((state) => state.captionModelProgress);
  const captionModelError = useGalleryStore((state) => state.captionModelError);
  const captionRuntimeProbe = useGalleryStore((state) => state.captionRuntimeProbe);
  const captionRuntimeChecking = useGalleryStore((state) => state.captionRuntimeChecking);
  const aiCaptionsEnabled = useGalleryStore((state) => state.aiCaptionsEnabled);
  const setAiCaptionsEnabled = useGalleryStore((state) => state.setAiCaptionsEnabled);
  const prepareCaptionModel = useGalleryStore((state) => state.prepareCaptionModel);
  const deleteCaptionModel = useGalleryStore((state) => state.deleteCaptionModel);
  const probeCaptionRuntime = useGalleryStore((state) => state.probeCaptionRuntime);
  const queueCaptionJobs = useGalleryStore((state) => state.queueCaptionJobs);

  useEffect(() => {
    if (!settingsOpen) return;
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") setSettingsOpen(false);
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [settingsOpen, setSettingsOpen]);

  if (!settingsOpen) return null;

  const modelReady = captionModelStatus?.ready ?? false;
  const downloadLabel = captionModelProgress
    ? `Downloading ${captionModelProgress.completed_files}/${captionModelProgress.total_files}`
    : captionModelPreparing
    ? "Preparing Florence-2..."
    : modelReady
    ? "Downloaded"
    : "Download Florence-2";
  const downloadPercent = captionModelProgress
    ? Math.round((captionModelProgress.completed_files / Math.max(captionModelProgress.total_files, 1)) * 100)
    : 0;
  const selectedFolder = folders.find((folder) => folder.id === selectedFolderId);
  const captionScopeLabel = selectedFolder ? selectedFolder.name : "all libraries";

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
          <div className="flex h-14 shrink-0 items-center justify-between border-b border-white/[0.07] px-6">
            <div className="flex items-center gap-2">
              {modelReady ? <StatusPill tone="ready">Florence-2 ready</StatusPill> : <StatusPill tone="muted">Optional</StatusPill>}
              {captionModelPreparing ? <StatusPill tone="busy">Working</StatusPill> : null}
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
            {activeSection === "ai" ? (
              <SectionShell eyebrow="Local AI" title="Captions and suggested tags">
                <SettingsRow
                  title="AI captions"
                  description="Generate captions and suggested tags with the local Florence-2 model."
                >
                  <ToggleSwitch
                    checked={aiCaptionsEnabled && modelReady}
                    disabled={!modelReady || captionModelPreparing}
                    onChange={setAiCaptionsEnabled}
                    label="AI captions"
                  />
                </SettingsRow>

                <SettingsRow
                  title="Florence-2 model"
                  description={modelReady ? "Stored locally and available offline." : "Download the model before enabling local captions."}
                >
                  <div className="flex flex-col items-end gap-2">
                    <button
                      className="relative overflow-hidden rounded-md border border-white/10 bg-white/[0.055] px-3 py-1.5 text-xs text-gray-300 transition-colors hover:bg-white/10 hover:text-white disabled:cursor-not-allowed disabled:opacity-45"
                      onClick={() => void prepareCaptionModel()}
                      disabled={captionModelPreparing || modelReady}
                    >
                      {captionModelProgress ? (
                        <span
                          className="absolute inset-y-0 left-0 bg-emerald-400/15 transition-[width] duration-200"
                          style={{ width: `${downloadPercent}%` }}
                        />
                      ) : null}
                      <span className="relative">{downloadLabel}</span>
                    </button>
                    {modelReady ? (
                      <>
                        <button
                          className="rounded-md border border-white/10 bg-white/[0.055] px-3 py-1.5 text-xs text-gray-300 transition-colors hover:bg-white/10 hover:text-white disabled:cursor-not-allowed disabled:opacity-45"
                          onClick={() => void probeCaptionRuntime()}
                          disabled={captionRuntimeChecking}
                        >
                          {captionRuntimeChecking ? "Checking runtime..." : "Check runtime"}
                        </button>
                        <button
                          className="rounded-md border border-red-400/20 bg-red-500/10 px-3 py-1.5 text-xs text-red-200 transition-colors hover:bg-red-500/15 disabled:cursor-not-allowed disabled:opacity-45"
                          onClick={() => void deleteCaptionModel()}
                          disabled={captionModelPreparing || captionRuntimeChecking}
                        >
                          Delete model files
                        </button>
                      </>
                    ) : null}
                  </div>
                </SettingsRow>

                <SettingsRow
                  title="Caption queue"
                  description={`Generate missing captions in ${captionScopeLabel}. Captions update in the gallery as the local worker finishes each image.`}
                >
                  <button
                    className="rounded-md border border-white/10 bg-white/[0.055] px-3 py-1.5 text-xs text-gray-300 transition-colors hover:bg-white/10 hover:text-white disabled:cursor-not-allowed disabled:opacity-45"
                    onClick={() => {
                      setCaptionQueueing(true);
                      setCaptionQueueStatus(null);
                      void queueCaptionJobs(selectedFolderId)
                        .then((queued) => {
                          setCaptionQueueStatus(
                            queued === 0
                              ? "No missing captions found."
                              : `Queued ${queued.toLocaleString()} image${queued === 1 ? "" : "s"}.`,
                          );
                        })
                        .catch((error) => setCaptionQueueStatus(String(error)))
                        .finally(() => setCaptionQueueing(false));
                    }}
                    disabled={!modelReady || !aiCaptionsEnabled || captionQueueing}
                  >
                    {captionQueueing ? "Queueing..." : selectedFolder ? "Caption this library" : "Caption all libraries"}
                  </button>
                </SettingsRow>

                <div className="py-4">
                  <p className="text-xs font-medium text-gray-400">Model location</p>
                  <p className="mt-2 break-all rounded-md border border-white/[0.07] bg-black/20 px-3 py-2 text-xs text-gray-600">
                    {modelReady ? captionModelStatus?.local_dir : "Not downloaded"}
                  </p>
                  {captionModelProgress?.current_file ? (
                    <p className="mt-3 break-all text-xs text-gray-500">{captionModelProgress.current_file}</p>
                  ) : null}
                  {captionModelError ? (
                    <p className="mt-3 text-xs text-amber-300">{captionModelError}</p>
                  ) : null}
                  {captionQueueStatus ? (
                    <p className="mt-3 text-xs text-gray-500">{captionQueueStatus}</p>
                  ) : null}
                  {captionRuntimeProbe ? (
                    <div className="mt-4 border-t border-white/[0.07] pt-4">
                      <div className="flex items-center justify-between gap-3">
                        <p className="text-xs font-medium text-gray-400">Runtime check</p>
                        <StatusPill tone="ready">Ready</StatusPill>
                      </div>
                      <p className="mt-2 text-xs text-gray-600">
                        Tokenizer vocabulary: {captionRuntimeProbe.tokenizer_vocab_size.toLocaleString()}
                      </p>
                      <div className="mt-3 space-y-2">
                        {captionRuntimeProbe.sessions.map((session) => (
                          <div key={session.file} className="rounded-md border border-white/[0.07] bg-black/20 px-3 py-2">
                            <p className="break-all text-xs text-gray-400">{session.file}</p>
                            <p className="mt-1 text-[11px] text-gray-600">
                              {session.inputs.length} input{session.inputs.length === 1 ? "" : "s"} · {session.outputs.length} output{session.outputs.length === 1 ? "" : "s"}
                            </p>
                          </div>
                        ))}
                      </div>
                    </div>
                  ) : null}
                </div>
              </SectionShell>
            ) : null}

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
                <SettingsRow title="Florence-2" description="Remove the local model without changing the rest of the library.">
                  <button
                    className="rounded-md border border-red-400/20 bg-red-500/10 px-3 py-1.5 text-xs text-red-200 transition-colors hover:bg-red-500/15 disabled:cursor-not-allowed disabled:opacity-45"
                    onClick={() => void deleteCaptionModel()}
                    disabled={captionModelPreparing || !modelReady}
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
