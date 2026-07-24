import { existsSync, readdirSync, readFileSync, statSync } from "fs";
import { homedir } from "os";
import { join } from "path";

/**
 * Locating saved recordings.
 *
 * Screen Studio does not expose its save directory over the tRPC bridge, and
 * it is not in the app's macOS preferences either. It defaults to
 * "~/Screen Studio Projects", but the user can point it elsewhere and old
 * folders linger, so we scan every "*Screen Studio Projects*" directory in the
 * home folder. SCREENSTUDIO_PROJECTS_DIR overrides the lot.
 */
export function projectDirs(): string[] {
  const override = process.env.SCREENSTUDIO_PROJECTS_DIR;
  if (override) return existsSync(override) ? [override] : [];

  const home = homedir();
  try {
    return readdirSync(home)
      .filter((name) => /screen studio projects/i.test(name))
      .map((name) => join(home, name))
      .filter((dir) => {
        try {
          return statSync(dir).isDirectory();
        } catch {
          return false;
        }
      });
  } catch {
    return [];
  }
}

export interface ProjectRef {
  path: string;
  mtimeMs: number;
}

/** Every .screenstudio bundle across all known project directories. */
export function listProjects(): ProjectRef[] {
  const out: ProjectRef[] = [];
  for (const dir of projectDirs()) {
    let entries: string[];
    try {
      entries = readdirSync(dir);
    } catch {
      continue;
    }
    for (const entry of entries) {
      if (!entry.endsWith(".screenstudio")) continue;
      const path = join(dir, entry);
      try {
        out.push({ path, mtimeMs: statSync(path).mtimeMs });
      } catch {
        // vanished between readdir and stat
      }
    }
  }
  return out;
}

/** Set of project paths, for before/after comparison. */
export function projectPathSet(): Set<string> {
  return new Set(listProjects().map((p) => p.path));
}

/**
 * Wait for a .screenstudio bundle to appear that was not in `before`.
 *
 * This is how we verify a recording actually saved. Screen Studio's
 * "capture.finish" mutation resolves before the file is fully written, and it
 * reports nothing useful, so we watch the filesystem for the real artifact
 * rather than trusting the app's own say-so.
 */
export async function waitForNewProject(
  before: Set<string>,
  timeoutMs = 120_000,
): Promise<string | null> {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    const fresh = listProjects().filter((p) => !before.has(p.path));
    if (fresh.length > 0) {
      const newest = fresh.sort((a, b) => b.mtimeMs - a.mtimeMs)[0].path;
      if (await isSettled(newest)) return newest;
    }
    await new Promise((r) => setTimeout(r, 400));
  }
  return null;
}

/**
 * A recording is still being flushed for a moment after it appears. Consider
 * it settled once its total size stops growing across two samples.
 */
async function isSettled(path: string): Promise<boolean> {
  const size = () => dirSize(path);
  const a = size();
  await new Promise((r) => setTimeout(r, 700));
  return a > 0 && a === size();
}

function dirSize(path: string): number {
  let total = 0;
  const walk = (p: string) => {
    let st;
    try {
      st = statSync(p);
    } catch {
      return;
    }
    if (st.isDirectory()) {
      let entries: string[];
      try {
        entries = readdirSync(p);
      } catch {
        return;
      }
      for (const e of entries) walk(join(p, e));
    } else {
      total += st.size;
    }
  };
  walk(path);
  return total;
}

/** Total captured seconds, read from the HLS playlist Screen Studio writes. */
export function capturedSeconds(projectPath: string): number | null {
  const recordingDir = join(projectPath, "recording");
  let entries: string[];
  try {
    entries = readdirSync(recordingDir);
  } catch {
    return null;
  }
  const playlist = entries.find(
    (e) => e.endsWith(".m3u8") && e.includes("display"),
  );
  if (!playlist) return null;
  try {
    const text = readFileSync(join(recordingDir, playlist), "utf-8");
    const total = text
      .split("\n")
      .filter((l) => l.startsWith("#EXTINF:"))
      .reduce((sum, l) => sum + parseFloat(l.replace("#EXTINF:", "")), 0);
    return Math.round(total * 100) / 100;
  } catch {
    return null;
  }
}
