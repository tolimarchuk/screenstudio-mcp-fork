import { withClient } from "../cdp/client.js";
import { applyEdit, revision, type Edit } from "./project.js";
import {
  access,
  copyFile,
  cp,
  mkdir,
  readFile,
  readdir,
  realpath,
  stat,
  writeFile,
} from "node:fs/promises";
import { constants } from "node:fs";
import { isAbsolute, join, resolve } from "node:path";
import { homedir } from "node:os";
import { randomUUID } from "node:crypto";
import { execFile, spawn } from "node:child_process";
import { promisify } from "node:util";
const exec = promisify(execFile);
const j = JSON.stringify;
export const capabilities = {
  app: "Screen Studio",
  testedVersion: "4.0.1-4897",
  schema: "4.0.0",
  transport: "local stdio",
  features: {
    recording: true,
    windowCapture: true,
    pauseResume: true,
    markers: true,
    config: true,
    trimSpeed: true,
    screenAndLoupeZoom: true,
    localExport: true,
    renderedPreview: true,
    desktopInput: true,
    transcriptRead: true,
    transcriptGeneration: false,
    voiceoverGeneration: false,
    maskEditing: false,
    layoutTimelineEditing: false,
  },
  notes: [
    "Unofficial integration. Screen Studio updates may change internal interfaces.",
    "Caption styling, webcam processing and layout defaults are available as config settings.",
    "Transcript generation, voiceovers, masks and layout timeline editing require the app UI in this version.",
    "Exports use the local QA render destination to avoid a save dialog, then copy to the requested destination. No sharing or upload.",
  ],
};
export class Studio {
  readonly port = Number(process.env.SCREENSTUDIO_PORT ?? 9222);
  readonly stateDir = resolve(
    process.env.SCREENSTUDIO_STATE_DIR ?? join(homedir(), ".screenstudio-mcp"),
  );
  private tail: Promise<unknown> = Promise.resolve();
  private jobs = new Map<
    string,
    { outputPath: string; format: string; delivered?: boolean; completed?: any }
  >();
  constructor() {
    if (!Number.isInteger(this.port) || this.port < 1024 || this.port > 65535)
      throw new Error(
        "SCREENSTUDIO_PORT must be an integer from 1024 to 65535.",
      );
  }
  private async getJob(jobId: string) {
    if (!/^[a-f0-9-]{36}$/.test(jobId))
      throw new Error("Invalid export job ID.");
    let job = this.jobs.get(jobId);
    if (!job) {
      try {
        job = JSON.parse(
          await readFile(join(this.stateDir, `export-${jobId}.json`), "utf8"),
        );
        this.jobs.set(jobId, job!);
      } catch {
        throw new Error("Unknown export job.");
      }
    }
    return job!;
  }
  private async saveJob(jobId: string) {
    await mkdir(this.stateDir, { recursive: true, mode: 0o700 });
    await writeFile(
      join(this.stateDir, `export-${jobId}.json`),
      j(this.jobs.get(jobId)),
      { mode: 0o600 },
    );
  }
  async lock<T>(fn: () => Promise<T>): Promise<T> {
    const previous = this.tail;
    let release!: () => void;
    this.tail = new Promise<void>((r) => (release = r));
    await previous;
    try {
      return await fn();
    } finally {
      release();
    }
  }
  async call<T = any>(
    kind: "query" | "mutation",
    route: string,
    input?: unknown,
    timeout = 30000,
  ): Promise<T> {
    return withClient(this.port, (c) =>
      c.evaluateAwait<T>(
        `bridge.client.${kind}(${j(route)},${j(input) ?? "undefined"})`,
        timeout,
      ),
    );
  }
  async subscription<T = any>(route: string, input?: unknown): Promise<T> {
    return withClient(this.port, (c) =>
      c.evaluate<T>(
        `return new Promise((resolve,reject)=>{let stop;const timer=setTimeout(()=>{stop?.();reject(new Error('State subscription timed out'));},5000);stop=bridge.client.subscription(${j(route)},${j(input) ?? "undefined"},{onNext(v){if(v.type==='data'){clearTimeout(timer);stop?.();resolve(v.data);}},onError(e){clearTimeout(timer);stop?.();reject(e);}});});`,
      ),
    );
  }
  async version() {
    return this.call<string>("query", "app.version");
  }
  async requireVersion() {
    const v = await this.version();
    if (v !== "4.0.1-4897")
      throw new Error(
        `Unsupported Screen Studio build ${v}. Supported build: 4.0.1-4897. Inspect compatibility before changing the app.`,
      );
    return v;
  }
  async launch() {
    if (process.platform !== "darwin")
      throw new Error("Screen Studio requires macOS.");
    try {
      return { version: await this.requireVersion(), connected: true };
    } catch (e) {
      if (String(e).includes("Unsupported")) throw e;
    }
    const app = resolve(
      process.env.SCREENSTUDIO_APP_PATH ?? "/Applications/Screen Studio.app",
    );
    await access(join(app, "Contents/MacOS/Screen Studio"));
    // Never restart or kill a running app: Electron's singleton may ignore these flags.
    const { stdout } = await exec("/usr/bin/pgrep", [
      "-f",
      `${app}/Contents/MacOS/Screen Studio`,
    ]).catch(() => ({ stdout: "" }));
    if (stdout.trim())
      throw new Error(
        "Screen Studio is already running without this connection. Quit it normally, then launch again through this server.",
      );
    const child = spawn(
      join(app, "Contents/MacOS/Screen Studio"),
      [
        `--remote-debugging-port=${this.port}`,
        "--remote-debugging-address=127.0.0.1",
      ],
      { detached: true, stdio: "ignore" },
    );
    child.on("error", () => {});
    child.unref();
    for (let i = 0; i < 40; i++) {
      await new Promise((r) => setTimeout(r, 250));
      try {
        return { version: await this.requireVersion(), connected: true };
      } catch (e) {
        if (String(e).includes("Unsupported")) throw e;
      }
    }
    throw new Error(
      "Screen Studio did not expose a connection. Inspect the running app; launch was not retried.",
    );
  }
  async state() {
    await this.requireVersion();
    return this.subscription("capture.currentSessionState");
  }
  async sources() {
    await this.requireVersion();
    return {
      devices: await this.subscription("capture.inputDiscovery"),
      windows: await this.call("query", "windows.capturableWindows"),
    };
  }
  async start(input: {
    windowId?: number;
    displayId?: number;
    name: string;
    microphoneDeviceId?: string;
    cameraDeviceId?: string;
    systemAudio?: boolean;
  }) {
    return this.lock(async () => {
      await this.requireVersion();
      if (await this.state())
        throw new Error(
          "A recording is already active. Inspect it before continuing.",
        );
      if ((input.windowId === undefined) === (input.displayId === undefined))
        throw new Error("Select exactly one window or display.");
      const sources = await this.sources();
      if (
        input.windowId !== undefined &&
        !sources.windows.some((w: any) => w.id === input.windowId)
      )
        throw new Error("Recording window is no longer available.");
      if (
        input.displayId !== undefined &&
        !sources.devices.displays.some(
          (d: any) => d.displayID === input.displayId,
        )
      )
        throw new Error("Display is no longer available.");
      const config = {
        windowId: input.windowId ?? null,
        displayId: input.displayId ?? null,
        bounds: null,
        microphoneDeviceId: input.microphoneDeviceId ?? null,
        cameraDeviceId: input.cameraDeviceId ?? null,
        externalDeviceId: null,
        recordSystemAudio: input.systemAudio ? { type: "all" } : null,
        enableScreenCaptureKit: true,
        hideDesktopIcons: false,
        name: input.name,
      };
      const started = await this.call(
        "mutation",
        "capture.start",
        { config, defaultConfig: {} },
        60000,
      );
      return { started, state: await this.state() };
    });
  }
  async recordingAction(action: "pause" | "resume" | "finish" | "addMarker") {
    return this.lock(async () => {
      await this.requireVersion();
      const state = await this.state();
      if (!state) throw new Error("No recording is active.");
      const type = state.type ?? state.recordingState?.type;
      if (action === "pause" && type !== "recording")
        throw new Error("Recording must be running before pausing.");
      if (action === "resume" && type !== "paused")
        throw new Error("Recording must be paused before resuming.");
      const result = await this.call(
        "mutation",
        `capture.${action}`,
        undefined,
        120000,
      );
      if (action === "finish") {
        if (result?.type !== "success" || !result.projectPath)
          throw new Error(`Recording did not produce a project: ${j(result)}`);
        await this.path(result.projectPath);
        return result;
      }
      return { result, state: await this.state() };
    });
  }
  async path(path: string) {
    if (!isAbsolute(path) || !path.endsWith(".screenstudio"))
      throw new Error("Use an absolute .screenstudio project path.");
    const p = await realpath(path);
    if (!(await stat(p)).isDirectory())
      throw new Error("Project must be a directory.");
    return p;
  }
  async readProject(path: string) {
    await this.requireVersion();
    const projectPath = await this.path(path);
    const data = await this.call("query", "project.readProject", {
      projectPath,
    });
    if (data.projectData?.version !== "4.0.0")
      throw new Error("Project schema is unsupported.");
    return {
      projectPath,
      revision: revision(data.projectData),
      project: data.projectData,
    };
  }
  async duplicate(path: string, destination: string) {
    return this.lock(async () => {
      const source = await this.path(path);
      if (!isAbsolute(destination) || !destination.endsWith(".screenstudio"))
        throw new Error("Destination must be an absolute .screenstudio path.");
      if (resolve(destination).startsWith(source + "/"))
        throw new Error("Destination cannot be inside the source project.");
      await cp(source, destination, {
        recursive: true,
        errorOnExist: true,
        force: false,
      });
      return this.readProject(destination);
    });
  }
  async edit(path: string, expectedRevision: string, edit: Edit) {
    return this.lock(async () => {
      const current = await this.readProject(path);
      if (current.revision !== expectedRevision)
        throw new Error(
          "Project changed since inspection. Read it again before editing.",
        );
      const next = applyEdit(current.project, edit);
      const checkpointId = randomUUID();
      await mkdir(this.stateDir, { recursive: true, mode: 0o700 });
      await writeFile(
        join(this.stateDir, `${checkpointId}.json`),
        j({
          projectPath: current.projectPath,
          before: current.project,
          afterRevision: revision(next),
        }),
        { flag: "wx", mode: 0o600 },
      );
      await this.call("mutation", "project.updateProject", {
        projectPath: current.projectPath,
        data: next,
      });
      const result = await this.readProject(path);
      if (result.revision !== revision(next))
        throw new Error(
          `App normalized or changed the saved project. Inspect current data. Backup checkpoint: ${checkpointId}`,
        );
      return { ...result, checkpointId };
    });
  }
  async restore(checkpointId: string, expectedRevision: string) {
    return this.lock(async () => {
      if (!/^[a-f0-9-]{36}$/.test(checkpointId))
        throw new Error("Invalid checkpoint.");
      const backup = JSON.parse(
        await readFile(join(this.stateDir, `${checkpointId}.json`), "utf8"),
      );
      const current = await this.readProject(backup.projectPath);
      if (current.revision !== expectedRevision)
        throw new Error("Project changed. Inspect it before restoring.");
      await this.call("mutation", "project.updateProject", {
        projectPath: current.projectPath,
        data: backup.before,
      });
      return this.readProject(current.projectPath);
    });
  }
  async exportStart(
    path: string,
    outputPath: string,
    options: { height: number; fps: number; format: string; quality: string },
  ) {
    return this.lock(async () => {
      const p = await this.readProject(path);
      if (!isAbsolute(outputPath) || !outputPath.endsWith("." + options.format))
        throw new Error(
          "Output must be an absolute path with matching extension.",
        );
      try {
        await stat(outputPath);
        throw new Error("Output already exists; choose a new destination.");
      } catch (e: any) {
        if (e.code !== "ENOENT") throw e;
      }
      const jobId = randomUUID();
      const config = {
        ...options,
        target: "file",
        qa: true,
        mp4Codec: "h264",
        projectPath: p.projectPath,
        projectData: p.project,
      };
      this.jobs.set(jobId, { outputPath, format: options.format });
      await this.saveJob(jobId);
      await withClient(this.port, (c) =>
        c.evaluate(
          `window.__screenstudioMcpJobs??=Object.create(null);const job={status:'starting',createdAt:Date.now()};window.__screenstudioMcpJobs[${j(jobId)}]=job;bridge.client.mutation('export.start',{config:${j(config)},onStarted:id=>{job.exportId=id;job.status='rendering';}}).then(result=>{job.result=result;job.status=result.status;}).catch(error=>{job.status='failed';job.error=String(error);});return {jobId:${j(jobId)}};`,
        ),
      );
      return { jobId, status: "starting", outputPath };
    });
  }
  async exportStatus(jobId: string) {
    return this.lock(() => this.deliverExport(jobId));
  }
  private async deliverExport(jobId: string) {
    const local = await this.getJob(jobId);
    if (local.completed) return local.completed;
    const job = await withClient(this.port, (c) =>
      c.evaluate<any>(
        `const job=window.__screenstudioMcpJobs?.[${j(jobId)}];if(!job)throw new Error('Export state was lost. Inspect the app and temporary exports before retrying.');return {...job};`,
      ),
    );
    if (job.status === "completed") {
      const dir = await this.call<string>(
        "query",
        "export.getTempQaExportsPath",
      );
      const candidates = (await readdir(dir)).filter((f) =>
        f.endsWith(`-${job.exportId}.${local.format}`),
      );
      if (candidates.length !== 1)
        throw new Error("Completed export file could not be uniquely located.");
      if (!local.delivered) {
        await copyFile(
          join(dir, candidates[0]),
          local.outputPath,
          constants.COPYFILE_EXCL,
        );
        local.delivered = true;
        await this.saveJob(jobId);
      }
      const media = await this.probe(local.outputPath);
      local.completed = {
        jobId,
        status: "completed",
        outputPath: local.outputPath,
        media,
      };
      await this.saveJob(jobId);
      return local.completed;
    }
    return { jobId, ...job };
  }
  async exportCancel(jobId: string) {
    await this.getJob(jobId);
    const job = await withClient(this.port, (c) =>
      c.evaluate<any>(
        `return window.__screenstudioMcpJobs?.[${j(jobId)}]??null;`,
      ),
    );
    if (!job?.exportId)
      throw new Error(
        "Export has not started. Inspect its status before cancelling.",
      );
    await this.call("mutation", "export.cancel", { exportId: job.exportId });
    return this.exportStatus(jobId);
  }
  async probe(path: string) {
    const { stdout } = await exec(
      process.env.SCREENSTUDIO_FFPROBE ?? "ffprobe",
      [
        "-v",
        "error",
        "-show_entries",
        "format=duration,size:stream=codec_name,width,height,avg_frame_rate",
        "-of",
        "json",
        path,
      ],
      { timeout: 15000, maxBuffer: 1024 * 1024 },
    );
    const media = JSON.parse(stdout);
    if (
      !media.streams.some((s: any) => s.width && s.height) ||
      Number(media.format.duration) <= 0
    )
      throw new Error("Export file has no playable video.");
    return media;
  }
  async preview(jobId: string, timeMs: number) {
    const job = await this.exportStatus(jobId);
    if (job.status !== "completed")
      throw new Error(
        "Wait for the canonical export to complete before previewing.",
      );
    if (timeMs < 0 || timeMs >= Number(job.media.format.duration) * 1000)
      throw new Error(
        "Preview time is outside the exported playback duration.",
      );
    const output = join(this.stateDir, `${jobId}-${Math.floor(timeMs)}.png`);
    await exec(
      process.env.SCREENSTUDIO_FFMPEG ?? "ffmpeg",
      [
        "-v",
        "error",
        "-ss",
        String(timeMs / 1000),
        "-i",
        job.outputPath,
        "-frames:v",
        "1",
        "-y",
        output,
      ],
      { timeout: 15000 },
    );
    return { path: output, data: await readFile(output) };
  }
}
