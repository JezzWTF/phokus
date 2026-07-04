import { useEffect, useState } from "react";
import { useGalleryStore } from "../store";
import { Tooltip } from "./Tooltip";
import { CloseIcon } from "./icons";
import { AiWorkspaceSettingsSection } from "./settings/AiWorkspaceSettingsSection";
import { GeneralSettingsSection } from "./settings/GeneralSettingsSection";
import { MediaSettingsSection } from "./settings/MediaSettingsSection";
import { StorageSettingsSection } from "./settings/StorageSettingsSection";
import { UpdatesSettingsSection } from "./settings/UpdatesSettingsSection";
import { SETTINGS_SECTIONS, SettingsSection } from "./settings/shared";

function ActiveSettingsSection({ section }: { section: SettingsSection }) {
  switch (section) {
    case "workspace":
      return <AiWorkspaceSettingsSection />;
    case "media":
      return <MediaSettingsSection />;
    case "updates":
      return <UpdatesSettingsSection />;
    case "storage":
      return <StorageSettingsSection />;
    case "general":
    default:
      return <GeneralSettingsSection />;
  }
}

export function SettingsModal() {
  const [activeSection, setActiveSection] = useState<SettingsSection>("general");

  const settingsOpen = useGalleryStore((state) => state.settingsOpen);
  const setSettingsOpen = useGalleryStore((state) => state.setSettingsOpen);
  const loadTaggingQueueScope = useGalleryStore((state) => state.loadTaggingQueueScope);
  const loadTaggingQueueFolderIds = useGalleryStore((state) => state.loadTaggingQueueFolderIds);
  const loadTaggerModelStatus = useGalleryStore((state) => state.loadTaggerModelStatus);
  const loadTaggerAcceleration = useGalleryStore((state) => state.loadTaggerAcceleration);
  const loadTaggerModel = useGalleryStore((state) => state.loadTaggerModel);
  const loadTaggerThreshold = useGalleryStore((state) => state.loadTaggerThreshold);
  const loadTaggerBatchSize = useGalleryStore((state) => state.loadTaggerBatchSize);

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
  }, [
    settingsOpen,
    loadTaggerModelStatus,
    loadTaggerModel,
    loadTaggerAcceleration,
    loadTaggerThreshold,
    loadTaggerBatchSize,
    loadTaggingQueueScope,
    loadTaggingQueueFolderIds,
    setSettingsOpen,
  ]);

  if (!settingsOpen) return null;

  const activeSectionMeta = SETTINGS_SECTIONS.find((section) => section.id === activeSection) ?? SETTINGS_SECTIONS[0];

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/65 px-6 backdrop-blur-sm" onClick={() => setSettingsOpen(false)}>
      <div
        className="relative flex h-[min(85vh,900px)] w-[min(85vw,1400px)] overflow-hidden rounded-lg border border-white/10 bg-gray-950 shadow-2xl shadow-black/60"
        onClick={(event) => event.stopPropagation()}
      >
        <aside className="flex w-64 shrink-0 flex-col border-r border-white/[0.07] bg-white/[0.025]">
          <div className="border-b border-white/[0.07] px-5 py-5">
            <p className="text-base font-semibold text-white">Settings</p>
          </div>
          <div className="flex-1 space-y-1 overflow-y-auto p-2">
            {SETTINGS_SECTIONS.map((section) => (
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
            <ActiveSettingsSection section={activeSection} />
          </div>
        </main>
      </div>
    </div>
  );
}
