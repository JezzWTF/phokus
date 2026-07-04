import { useEffect, useRef, useState } from "react";
import { ImageExif, ImageRecord, ImageTag, TaggerModelStatus } from "../../store";

interface UseLightboxMediaDetailsParams {
  selectedImage: ImageRecord | null;
  taggerModelStatus: TaggerModelStatus | null;
  getImageTags: (imageId: number) => Promise<ImageTag[]>;
  getImageExif: (imageId: number) => Promise<ImageExif>;
  loadTaggerModelStatus: () => Promise<void>;
  onSelectedImageReset: () => void;
}

export function useLightboxMediaDetails({
  selectedImage,
  taggerModelStatus,
  getImageTags,
  getImageExif,
  loadTaggerModelStatus,
  onSelectedImageReset,
}: UseLightboxMediaDetailsParams) {
  const [imageTags, setImageTags] = useState<ImageTag[]>([]);
  const [imageExif, setImageExif] = useState<ImageExif | null>(null);
  const [tagInput, setTagInput] = useState("");
  const [tagAdding, setTagAdding] = useState(false);
  const [tagsExpanded, setTagsExpanded] = useState(false);
  const [taggingQueued, setTaggingQueued] = useState(false);

  const currentImageIdRef = useRef<number | null>(null);
  currentImageIdRef.current = selectedImage?.id ?? null;

  useEffect(() => {
    setImageTags([]);
    setImageExif(null);
    setTagInput("");
    setTagsExpanded(false);
    setTaggingQueued(false);
    onSelectedImageReset();
  }, [onSelectedImageReset, selectedImage?.id]);

  useEffect(() => {
    if (!selectedImage) return;
    let cancelled = false;
    void getImageTags(selectedImage.id)
      .then((tags) => { if (!cancelled) setImageTags(tags); })
      .catch(() => { if (!cancelled) setImageTags([]); });
    return () => { cancelled = true; };
  }, [getImageTags, selectedImage?.ai_tagged_at, selectedImage?.id]);

  useEffect(() => {
    if (!selectedImage || selectedImage.media_kind !== "image") {
      setImageExif(null);
      return;
    }
    let cancelled = false;
    void getImageExif(selectedImage.id)
      .then((exif) => { if (!cancelled) setImageExif(exif); })
      .catch(() => { if (!cancelled) setImageExif(null); });
    return () => { cancelled = true; };
  }, [getImageExif, selectedImage?.id, selectedImage?.media_kind]);

  useEffect(() => {
    if (selectedImage?.media_kind !== "image" || taggerModelStatus !== null) return;
    void loadTaggerModelStatus();
  }, [loadTaggerModelStatus, selectedImage?.media_kind, taggerModelStatus]);

  useEffect(() => {
    if (selectedImage?.ai_tagged_at) setTaggingQueued(false);
  }, [selectedImage?.ai_tagged_at]);

  return {
    currentImageIdRef,
    imageTags,
    setImageTags,
    imageExif,
    tagInput,
    setTagInput,
    tagAdding,
    setTagAdding,
    tagsExpanded,
    setTagsExpanded,
    taggingQueued,
    setTaggingQueued,
  };
}
