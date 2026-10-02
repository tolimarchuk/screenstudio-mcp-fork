// Seeded native fixture only. This integration test moves the real pointer.
// Launch the demo app first; pass its exact window ID. Output stays in .artifacts.
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import { writeFile, mkdir } from "node:fs/promises";
import { resolve } from "node:path";
import assert from "node:assert/strict";
if (process.env.SCREENSTUDIO_LIVE_TEST !== "1")
  throw new Error("Set SCREENSTUDIO_LIVE_TEST=1.");
const windowId = Number(process.argv[2]);
assert.ok(windowId > 0);
await mkdir(".artifacts", { recursive: true });
const client = new Client({ name: "live-recorder", version: "1" });
await client.connect(
  new StdioClientTransport({
    command: process.execPath,
    args: ["dist/mcp/main.js"],
    env: { ...process.env },
    stderr: "inherit",
  }),
);
async function call(name, args = {}) {
  const r = await client.callTool({
    name: "screenstudio_" + name,
    arguments: args,
  });
  if (r.isError) throw new Error(r.content[0].text);
  return JSON.parse(r.content.find((c) => c.type === "text")?.text ?? "null");
}
async function act(action) {
  const observed = await call("desktop_inspect", { windowId });
  assert.equal(observed.title, "Screen Studio MCP Demo");
  assert.equal(observed.bounds.width, 1200);
  return call("desktop_action", {
    observationToken: observed.observationToken,
    action,
  });
}
let recording = false;
try {
  await act({ type: "focus" });
  await call("record_start", { windowId, name: "MCP native walkthrough" });
  recording = true;
  assert.equal((await call("record_state")).type, "recording");
  await call("record_control", { action: "pause" });
  assert.equal((await call("record_state")).type, "paused");
  await call("record_control", { action: "resume" });
  assert.equal((await call("record_state")).type, "recording");
  await act({ type: "focus" });
  await act({ type: "click", x: 380, y: 490 });
  await act({ type: "key", key: "selectAll" });
  await act({ type: "type", text: "Made by an agent" });
  assert.equal(
    (await call("desktop_inspect", { windowId })).focusedElement?.value,
    "Made by an agent",
    "Native select-all and typing must replace the input exactly",
  );
  await act({ type: "click", x: 960, y: 490 });
  await call("record_control", { action: "addMarker" });
  await act({ type: "click", x: 225, y: 641 });
  const screenshot = await client.callTool({
    name: "screenstudio_desktop_screenshot",
    arguments: { windowId },
  });
  assert.ok(!screenshot.isError);
  const shot = screenshot.content.find((c) => c.type === "image");
  const pixels = Buffer.from(shot.data, "base64");
  const observed = await call("desktop_inspect", { windowId });
  assert.ok(
    Math.abs(
      pixels.readUInt32BE(16) / observed.bounds.width -
        pixels.readUInt32BE(20) / observed.bounds.height,
    ) < 0.001,
    "Screenshot must exclude window shadows for accurate coordinate mapping",
  );
  await writeFile(".artifacts/native-result.png", pixels);
  const captured = await call("record_control", { action: "finish" });
  recording = false;
  await writeFile(
    ".artifacts/native-capture.json",
    JSON.stringify(captured, null, 2),
  );
  const outputPath = resolve(`.artifacts/native-${Date.now()}.mp4`);
  const job = await call("export_start", {
    projectPath: captured.projectPath,
    outputPath,
    height: 720,
    fps: 30,
  });
  let status;
  for (let i = 0; i < 120; i++) {
    status = await call("export_status", { jobId: job.jobId });
    if (["completed", "failed", "cancelled"].includes(status.status)) break;
    await new Promise((r) => setTimeout(r, 1000));
  }
  assert.equal(status.status, "completed");
  await writeFile(
    ".artifacts/native-report.json",
    JSON.stringify(status, null, 2),
  );
  console.log(
    "MCP recorded native clicks and typing, saved a project, and rendered a video.",
  );
} finally {
  if (recording)
    await call("record_control", { action: "finish" }).catch((e) =>
      console.error("Recording cleanup failed:", e.message),
    );
  await client.close();
}
