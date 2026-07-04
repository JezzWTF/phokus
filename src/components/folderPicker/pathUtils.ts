export interface Breadcrumb {
  label: string;
  path: string | null;
}

export function normalizePath(path: string): string {
  return path.replace(/\\/g, "/").replace(/\/+$/, "").toLowerCase();
}

export function cleanAddressInput(path: string): string {
  const trimmed = path.trim();
  if (trimmed.length >= 2) {
    const first = trimmed[0];
    const last = trimmed[trimmed.length - 1];
    if ((first === "\"" && last === "\"") || (first === "'" && last === "'")) {
      return trimmed.slice(1, -1).trim();
    }
  }
  return trimmed;
}

export function friendlyDirectoryError(error: unknown): string {
  const message = error instanceof Error ? error.message : String(error);
  if (/cannot find the path|os error 3|not found|no such file/i.test(message)) {
    return "Folder not found. Check the path and try again.";
  }
  return message;
}

export function folderName(path: string): string {
  const trimmed = path.replace(/[\\/]+$/, "");
  const parts = trimmed.split(/[\\/]+/).filter(Boolean);
  return parts.length > 0 ? parts[parts.length - 1] : path;
}

export function buildBreadcrumbs(path: string | null): Breadcrumb[] {
  if (!path) return [{ label: "This PC / Home", path: null }];

  const separator = path.includes("\\") ? "\\" : "/";
  const normalized = path.replace(/[\\/]+$/, "");
  const windowsDrive = normalized.match(/^[A-Za-z]:/);

  if (windowsDrive) {
    const drive = windowsDrive[0];
    const rest = normalized.slice(2).split(/[\\/]+/).filter(Boolean);
    let current = drive;
    return [
      { label: "This PC", path: null },
      { label: drive, path: drive },
      ...rest.map((part) => {
        current = current.endsWith("\\") ? `${current}${part}` : `${current}\\${part}`;
        return { label: part, path: current };
      }),
    ];
  }

  const parts = normalized.split(/[\\/]+/).filter(Boolean);
  let current = separator === "/" ? "" : "";
  return [
    { label: "/", path: null },
    ...parts.map((part) => {
      current = `${current}/${part}`;
      return { label: part, path: current };
    }),
  ];
}
