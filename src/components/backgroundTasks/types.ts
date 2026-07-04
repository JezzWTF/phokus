import type { WorkerKey } from "../../store";

export const WORKER_FOR_STAGE: Record<string, WorkerKey> = {
  Thumbnails: "thumbnail",
  Metadata: "metadata",
  Embeddings: "embedding",
  Tags: "tagging",
};

export interface TaskStage {
  label: string;
  detail: string;
  progress: number | null;
  failed: boolean;
}

export interface BackgroundTask {
  id: number;
  name: string;
  stages: TaskStage[];
  isActive: boolean;
  hasFailedEmbeddings: boolean;
  hasFailedTagging: boolean;
  hasFailedCaptions: boolean;
  pendingMediaWork: number;
  embeddingProcessed: number;
  embeddingTotal: number;
  currentFile: string | null;
  snapshot: string;
}

export interface FailedWorkerItem {
  image_id: number;
  filename: string;
  path: string;
  error: string | null;
}
