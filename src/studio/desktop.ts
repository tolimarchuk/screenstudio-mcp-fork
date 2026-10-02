import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { fileURLToPath } from "node:url";
import { mkdir, readFile, access } from "node:fs/promises";
import { join } from "node:path";
import { randomUUID } from "node:crypto";
const exec = promisify(execFile);
const helper = fileURLToPath(
  new URL("../../native/desktop-helper", import.meta.url),
);
export class Desktop {
  private observations = new Map<
    string,
    { windowId: number; bounds: string; pid: number; at: number }
  >();
  private async run(action: string, windowId: number, args: string[] = []) {
    if (process.platform !== "darwin")
      throw new Error("Desktop input requires macOS.");
    await access(helper).catch(() => {
      throw new Error(
        "Build the native desktop helper with npm run build:native.",
      );
    });
    const { stdout } = await exec(helper, [action, String(windowId), ...args], {
      timeout: 80000,
    });
    return JSON.parse(stdout);
  }
  async inspect(windowId: number) {
    const state = await this.run("inspect", windowId);
    const token = randomUUID();
    this.observations.set(token, {
      windowId,
      bounds: JSON.stringify(state.bounds),
      pid: state.pid,
      at: Date.now(),
    });
    for (const [k, v] of this.observations)
      if (Date.now() - v.at > 15000) this.observations.delete(k);
    return { ...state, observationToken: token, expiresInMs: 15000 };
  }
  async action(
    token: string,
    input: {
      type: string;
      x?: number;
      y?: number;
      text?: string;
      lines?: number;
      key?: string;
    },
  ) {
    const observation = this.observations.get(token);
    this.observations.delete(token);
    if (!observation || Date.now() - observation.at > 15000)
      throw new Error("Observation expired. Inspect the target again.");
    const current = await this.run("inspect", observation.windowId);
    if (
      current.pid !== observation.pid ||
      JSON.stringify(current.bounds) !== observation.bounds
    )
      throw new Error("Target window changed. Inspect again before input.");
    const args =
      input.type === "click" || input.type === "move"
        ? [String(input.x), String(input.y)]
        : input.type === "type"
          ? [input.text ?? ""]
          : input.type === "scroll"
            ? [String(input.lines)]
            : input.type === "key"
              ? [input.key ?? ""]
              : [];
    return this.run(input.type, observation.windowId, args);
  }
  async screenshot(windowId: number, stateDir: string) {
    await this.run("inspect", windowId);
    await mkdir(stateDir, { recursive: true, mode: 0o700 });
    const path = join(stateDir, `window-${windowId}-${randomUUID()}.png`);
    await exec(
      "/usr/sbin/screencapture",
      ["-x", "-o", "-l", String(windowId), path],
      { timeout: 10000 },
    );
    return { path, data: await readFile(path) };
  }
}
