const fixtureMedia = Array.from(
  { length: 48 },
  (_, index) => `/dev-media/fixture-${String(index + 1).padStart(2, "0")}.webp`,
);

export function fixtureMediaPath(index: number): string {
  return fixtureMedia[index % fixtureMedia.length];
}
