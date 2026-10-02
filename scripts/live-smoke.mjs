// Run with SCREENSTUDIO_LIVE_TEST=1 and a sample project, never real client footage.
// Checks real app edit/read-back/render/encode and leaves a video + report artifact.
import assert from "node:assert/strict";
import { mkdir, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { Studio } from "../dist/studio/service.js";
if (process.env.SCREENSTUDIO_LIVE_TEST !== "1")
  throw new Error("Set SCREENSTUDIO_LIVE_TEST=1 to run desktop integration.");
const source = process.argv[2];
if (!source) throw new Error("Pass a seeded sample project.");
await mkdir(".artifacts", { recursive: true });
const studio = new Studio();
const copy = resolve(`.artifacts/smoke-${Date.now()}.screenstudio`);
await studio.duplicate(source, copy);
let p = await studio.readProject(copy);
const initial = p.revision;
p = await studio.edit(copy, p.revision, {
  type: "config",
  changes: {
    "cursor.size": 64,
    "output.aspectRatio": 16 / 9,
    "styles.background.type": "color",
    "styles.background.color": "#172039",
  },
});
assert.equal(p.project.config.cursor.size, 64);
assert.notEqual(p.revision, initial);
p = await studio.edit(copy, p.revision, {
  type: "zoom",
  sceneId: p.project.scenes[0].id,
  startMs: 1000,
  endMs: 5000,
  zoom: 1.6,
  presentation: "loupe",
});
p = await studio.edit(copy, p.revision, {
  type: "slices",
  sceneId: p.project.scenes[0].id,
  slices: [
    {
      startMs: 0,
      endMs: Math.min(12000, p.project.scenes[0].slices[0].sourceEndMs),
      speed: 1.5,
    },
  ],
});
const job = await studio.exportStart(copy, resolve(".artifacts/smoke.mp4"), {
  height: 720,
  fps: 30,
  format: "mp4",
  quality: "studio",
});
let status;
for (let i = 0; i < 120; i++) {
  status = await studio.exportStatus(job.jobId);
  if (["completed", "failed", "cancelled"].includes(status.status)) break;
  await new Promise((r) => setTimeout(r, 1000));
}
assert.equal(status.status, "completed", JSON.stringify(status));
assert.ok(Math.abs(Number(status.media.format.duration) - 8) < 0.1);
assert.equal(status.media.streams[0].height, 720);
assert.equal(status.media.streams[0].width, 1280);
await writeFile(
  ".artifacts/live-report.json",
  JSON.stringify(
    {
      version: await studio.version(),
      projectRevision: p.revision,
      export: status,
    },
    null,
    2,
  ),
);
console.log("Real edit and export passed.");
