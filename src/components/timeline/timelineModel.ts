import { ImageRecord } from "../../store";
import { ScrubberYear, TimelineGroup, TimelineRow, TimelineRows } from "./types";

const MONTH_SHORT = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"] as const;

function buildLabel(key: string): string {
  if (key === "unknown") return "Unknown Date";
  const [yearStr, monthStr] = key.split("-");
  const year = Number(yearStr);
  const month = Number(monthStr);
  if (!isFinite(year) || !isFinite(month) || month < 1 || month > 12) return "Unknown Date";
  const date = new Date(year, month - 1);
  if (isNaN(date.getTime())) return "Unknown Date";
  return date.toLocaleDateString(undefined, { month: "long", year: "numeric" });
}

export function groupImages(images: ImageRecord[]): TimelineGroup[] {
  const map = new Map<string, ImageRecord[]>();
  for (const image of images) {
    const dateString = image.taken_at ?? image.modified_at;
    const key = dateString ? dateString.substring(0, 7) : "unknown";
    let bucket = map.get(key);
    if (bucket === undefined) {
      bucket = [];
      map.set(key, bucket);
    }
    bucket.push(image);
  }
  return Array.from(map.entries())
    .sort(([a], [b]) => {
      if (a === "unknown") return 1;
      if (b === "unknown") return -1;
      return a < b ? -1 : a > b ? 1 : 0;
    })
    .map(([key, imgs]) => ({ key, label: buildLabel(key), images: imgs }));
}

export function buildScrubberYears(groups: TimelineGroup[]): ScrubberYear[] {
  const byYear = new Map<string, ScrubberYear>();
  for (let i = 0; i < groups.length; i++) {
    const group = groups[i];
    if (group.key === "unknown") continue;
    const year = group.key.substring(0, 4);
    const monthNum = Number(group.key.substring(5, 7));
    if (!byYear.has(year)) {
      byYear.set(year, { year, firstGroupIndex: i, months: [] });
    }
    byYear.get(year)!.months.push({
      monthNum,
      label: MONTH_SHORT[monthNum - 1] ?? "",
      groupIndex: i,
    });
  }
  return Array.from(byYear.values());
}

export function buildTimelineRows(groups: TimelineGroup[], cols: number): TimelineRows {
  const rows: TimelineRow[] = [];
  const rowToGroupIndex: number[] = [];
  const groupFirstRow: number[] = [];
  groups.forEach((group, groupIndex) => {
    groupFirstRow[groupIndex] = rows.length;
    rows.push({ type: "header", group });
    rowToGroupIndex.push(groupIndex);
    for (let i = 0; i < group.images.length; i += cols) {
      rows.push({ type: "tiles", images: group.images.slice(i, i + cols) });
      rowToGroupIndex.push(groupIndex);
    }
  });
  return { rows, rowToGroupIndex, groupFirstRow };
}
