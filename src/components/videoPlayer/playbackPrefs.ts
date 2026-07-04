let persistedVolume = 1;
let persistedMuted = false;

export function getPersistedVolume(): number {
  return persistedVolume;
}

export function setPersistedVolume(volume: number) {
  persistedVolume = volume;
}

export function getPersistedMuted(): boolean {
  return persistedMuted;
}

export function setPersistedMuted(muted: boolean) {
  persistedMuted = muted;
}
