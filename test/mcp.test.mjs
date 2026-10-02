// Real protocol client: discover schemas, call offline capabilities, and ensure
// malformed recording/edit requests fail without touching the desktop.
import { test } from "node:test";
import assert from "node:assert/strict";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
test("stdio server advertises tools and rejects malformed edits", async () => {
  const transport = new StdioClientTransport({
    command: process.execPath,
    args: ["dist/mcp/main.js"],
    stderr: "pipe",
  });
  const client = new Client({ name: "smoke", version: "1" });
  try {
    await client.connect(transport);
    const { tools } = await client.listTools();
    const { resources } = await client.listResources();
    assert.ok(resources.some((r) => r.uri === "screenstudio://compatibility"));
    const { prompts } = await client.listPrompts();
    assert.ok(prompts.some((p) => p.name === "screenstudio_demo"));
    assert.ok(tools.some((t) => t.name === "screenstudio_record_start"));
    assert.ok(tools.some((t) => t.name === "screenstudio_desktop_action"));
    const result = await client.callTool({
      name: "screenstudio_capabilities",
      arguments: {},
    });
    assert.equal(result.isError, undefined);
    const bad = await client.callTool({
      name: "screenstudio_project_edit",
      arguments: {
        projectPath: "/tmp/x",
        expectedRevision: "x",
        edit: {
          type: "slices",
          sceneId: "x",
          slices: [{ startMs: 0, endMs: 1, speed: 0 }],
        },
      },
    });
    assert.equal(bad.isError, true);
  } finally {
    await client.close();
  }
});
