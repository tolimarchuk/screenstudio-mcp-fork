#!/usr/bin/env node
import { readFile } from "node:fs/promises";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import { Studio, capabilities } from "../studio/service.js";
import { configFields, editSchema } from "../studio/project.js";
import { Desktop } from "../studio/desktop.js";
const server = new McpServer(
  { name: "screenstudio-mcp", version: "0.3.0" },
  {
    instructions:
      "Record with an exact window ID, observe before each native interaction, and use project copies for editing. After timeouts inspect real state before retrying. Render and inspect frames before calling a video finished.",
  },
);
const studio = new Studio();
const desktop = new Desktop();
const path = z.string().min(1),
  id = z.number().int().positive(),
  revision = z.string().regex(/^[a-f0-9]{64}$/);
const read = {
  readOnlyHint: true,
  destructiveHint: false,
  openWorldHint: false,
};
const write = {
  readOnlyHint: false,
  destructiveHint: false,
  openWorldHint: false,
};
function tool(
  name: string,
  description: string,
  schema: any,
  annotations: any,
  fn: (a: any) => Promise<any>,
) {
  server.registerTool(
    name,
    { description, inputSchema: schema, annotations },
    async (a: any) => {
      try {
        const value = await fn(a);
        if (value?.image)
          return {
            content: [
              {
                type: "image" as const,
                data: value.image,
                mimeType: "image/png" as const,
              },
              {
                type: "text" as const,
                text: JSON.stringify({ path: value.path }),
              },
            ],
          };
        return {
          content: [
            { type: "text" as const, text: JSON.stringify(value ?? null) },
          ],
        };
      } catch (error) {
        return {
          isError: true,
          content: [
            {
              type: "text" as const,
              text: error instanceof Error ? error.message : String(error),
            },
          ],
        };
      }
    },
  );
}
tool(
  "screenstudio_capabilities",
  "Supported features, compatibility and config field names. Works offline.",
  {},
  read,
  async () => ({ ...capabilities, configKeys: Object.keys(configFields) }),
);
tool(
  "screenstudio_launch",
  "Launch a local Screen Studio connection. A running app is never killed or restarted.",
  {},
  write,
  () => studio.launch(),
);
tool(
  "screenstudio_sources",
  "List actual capturable windows, display IDs, microphones and cameras.",
  {},
  read,
  () => studio.sources(),
);
tool(
  "screenstudio_record_state",
  "Inspect the current recording session. Null means idle.",
  {},
  read,
  () => studio.state(),
);
tool(
  "screenstudio_record_start",
  "Start recording one exact window or display. Audio and camera default off.",
  {
    windowId: id.optional(),
    displayId: id.optional(),
    name: z.string().min(1).max(100),
    microphoneDeviceId: z.string().optional(),
    cameraDeviceId: z.string().optional(),
    systemAudio: z.boolean().optional(),
  },
  write,
  (a) => studio.start(a),
);
tool(
  "screenstudio_record_control",
  "Pause, resume, add a marker, or finish and return the real saved project.",
  { action: z.enum(["pause", "resume", "addMarker", "finish"]) },
  write,
  (a) => studio.recordingAction(a.action),
);
tool(
  "screenstudio_project_read",
  "Read version 4 project config and scenes with a content revision.",
  { projectPath: path },
  read,
  (a) => studio.readProject(a.projectPath),
);
tool(
  "screenstudio_project_duplicate",
  "Copy a project bundle to a fresh destination before editing.",
  { projectPath: path, destinationPath: path },
  write,
  (a) => studio.duplicate(a.projectPath, a.destinationPath),
);
tool(
  "screenstudio_project_edit",
  "Apply one validated edit with a revision check and saved checkpoint. All intervals use source milliseconds. Slices replace the scene slice list. Speed 2 means twice as fast.",
  { projectPath: path, expectedRevision: revision, edit: editSchema },
  write,
  (a) => studio.edit(a.projectPath, a.expectedRevision, a.edit),
);
tool(
  "screenstudio_project_restore",
  "Restore a saved checkpoint after checking the current project revision.",
  { checkpointId: z.string().uuid(), expectedRevision: revision },
  write,
  (a) => studio.restore(a.checkpointId, a.expectedRevision),
);
tool(
  "screenstudio_export_start",
  "Render a local MP4 or GIF without a save dialog. Returns a job; poll until completion. Existing output files are protected.",
  {
    projectPath: path,
    outputPath: path,
    height: z.number().int().min(240).max(2160),
    fps: z.union([z.literal(24), z.literal(30), z.literal(60)]),
    format: z.enum(["mp4", "gif"]).default("mp4"),
    quality: z.enum(["studio"]).default("studio"),
  },
  write,
  (a) => studio.exportStart(a.projectPath, a.outputPath, a),
);
tool(
  "screenstudio_export_status",
  "Inspect a job and deliver the completed file with actual encoded media properties.",
  { jobId: z.string().uuid() },
  write,
  (a) => studio.exportStatus(a.jobId),
);
tool(
  "screenstudio_export_cancel",
  "Cancel a known export job without deleting the source project.",
  { jobId: z.string().uuid() },
  write,
  (a) => studio.exportCancel(a.jobId),
);
tool(
  "screenstudio_preview",
  "Return a frame of the actual completed render at playback milliseconds.",
  { jobId: z.string().uuid(), timeMs: z.number().finite().min(0) },
  write,
  async (a) => {
    const v = await studio.preview(a.jobId, a.timeMs);
    return { path: v.path, image: v.data.toString("base64") };
  },
);
tool(
  "screenstudio_transcript_read",
  "Read an existing transcript. Does not start transcription or upload audio.",
  { projectPath: path },
  read,
  async (a) => {
    await studio.requireVersion();
    return studio.call("query", "captions.getTranscript", {
      projectPath: await studio.path(a.projectPath),
    });
  },
);
tool(
  "screenstudio_desktop_inspect",
  "Inspect an exact native window and get a short-lived, single-use observation token.",
  { windowId: id },
  read,
  (a) => desktop.inspect(a.windowId),
);
tool(
  "screenstudio_desktop_screenshot",
  "Return the target native window screenshot before deciding what to click.",
  { windowId: id },
  read,
  async (a) => {
    const v = await desktop.screenshot(a.windowId, studio.stateDir);
    return { path: v.path, image: v.data.toString("base64") };
  },
);
const action = z.discriminatedUnion("type", [
  z
    .object({
      type: z.enum(["click", "move"]),
      x: z.number().finite().min(0),
      y: z.number().finite().min(0),
    })
    .strict(),
  z.object({ type: z.literal("type"), text: z.string().max(2000) }).strict(),
  z
    .object({
      type: z.literal("scroll"),
      lines: z.number().int().min(-100).max(100),
    })
    .strict(),
  z.object({ type: z.literal("focus") }).strict(),
  z
    .object({
      type: z.literal("key"),
      key: z.enum(["return", "tab", "escape", "backspace", "selectAll"]),
    })
    .strict(),
]);
tool(
  "screenstudio_desktop_action",
  "Perform visible native focus, move, click, type or scroll on an observed window. Coordinates are window-local points, including title bar. Reinspect after each action. Input fails when focus or window geometry changes.",
  { observationToken: z.string().uuid(), action },
  { ...write, destructiveHint: true, openWorldHint: true },
  (a) => desktop.action(a.observationToken, a.action),
);
for (const [name, relative] of Object.entries({
  compatibility: "docs/compatibility.md",
  workflow: "docs/agent-workflow.md",
  recovery: "skills/screenstudio-record/references/recovery.md",
})) {
  const uri = `screenstudio://${name}`;
  server.registerResource(
    name,
    uri,
    {
      description: `Screen Studio ${name} guidance`,
      mimeType: "text/markdown",
    },
    async () => ({
      contents: [
        {
          uri,
          mimeType: "text/markdown",
          text: await readFile(
            new URL(`../../${relative}`, import.meta.url),
            "utf8",
          ),
        },
      ],
    }),
  );
}
server.registerPrompt(
  "screenstudio_demo",
  {
    description: "Plan, perform, edit and deliver a Screen Studio walkthrough.",
    argsSchema: { goal: z.string(), target: z.string().optional() },
  },
  async ({ goal, target }) => {
    const skills = await Promise.all(
      ["record", "edit", "deliver"].map((name) =>
        readFile(
          new URL(
            `../../skills/screenstudio-${name}/SKILL.md`,
            import.meta.url,
          ),
          "utf8",
        ),
      ),
    );
    return {
      messages: [
        {
          role: "user",
          content: {
            type: "text",
            text: `Make this walkthrough: ${goal}\nTarget: ${target ?? "identify the requested app"}\n\n${skills.join("\n\n")}\nRead the workflow and compatibility resources when needed.`,
          },
        },
      ],
    };
  },
);
await server.connect(new StdioServerTransport());
