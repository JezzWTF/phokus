import { DuplicateScanProgress } from "../../store";

export function formatBytes(bytes: number): string {
  if (bytes >= 1_073_741_824) return `${(bytes / 1_073_741_824).toFixed(1)} GB`;
  if (bytes >= 1_048_576) return `${(bytes / 1_048_576).toFixed(1)} MB`;
  if (bytes >= 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${bytes} B`;
}

export function formatRelativeTime(unixSecs: number): string {
  const diff = Math.floor(Date.now() / 1000) - unixSecs;
  if (diff < 60) return "just now";
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
  return `${Math.floor(diff / 86400)}d ago`;
}

export function duplicateProgressLabel(progress: DuplicateScanProgress | null): string | null {
  if (!progress) return null;
  if (progress.phase === "checking") return "Checking file sizes";
  if (progress.phase === "hashing") return "Hashing duplicate candidates";
  return "Confirming exact matches";
}

export function duplicateProgressPercent(progress: DuplicateScanProgress | null): number {
  return progress && progress.total > 0
    ? Math.round((progress.processed / progress.total) * 100)
    : 0;
}
