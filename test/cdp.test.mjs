import test from "node:test";
import assert from "node:assert/strict";
import { createServer } from "node:http";
import { WebSocketServer } from "ws";
import { CDPClient } from "../dist/cdp/client.js";
import { findRendererPage } from "../dist/cdp/page-finder.js";

async function fixture(t, respond) {
  const server = createServer((req, res) => {
    res.setHeader("content-type", "application/json");
    res.end(
      JSON.stringify(
        ["worker", "editor"].map((id) => ({
          id,
          type: "page",
          url: "file:///Applications/Screen%20Studio.app/Contents/Resources/app.asar/dist/index.html",
          webSocketDebuggerUrl: `ws://127.0.0.1:${server.address().port}/${id}`,
        })),
      ),
    );
  });
  const wss = new WebSocketServer({ server });
  wss.on("connection", (ws, req) =>
    ws.on("message", (bytes) => {
      const msg = JSON.parse(bytes.toString());
      if (msg.params?.expression?.includes("IS_RENDER_WORKER")) {
        ws.send(
          JSON.stringify({
            id: msg.id,
            result: {
              result: {
                value: JSON.stringify({
                  studio: true,
                  worker: req.url === "/worker",
                  version: "4.0.1-4897",
                }),
              },
            },
          }),
        );
      } else respond(ws, msg);
    }),
  );
  await new Promise((r) => server.listen(0, "127.0.0.1", r));
  t.after(() => {
    for (const ws of wss.clients) ws.terminate();
    wss.close();
    server.close();
  });
  return server.address().port;
}

test("discovery skips the export worker even when it is first", async (t) => {
  const port = await fixture(t, () => {});
  assert.match(await findRendererPage(port), /\/editor$/);
});
test("top-level CDP failures reject instead of reporting success", async (t) => {
  const port = await fixture(t, (ws, msg) =>
    ws.send(
      JSON.stringify({
        id: msg.id,
        error: { code: -32602, message: "Invalid parameters" },
      }),
    ),
  );
  const client = new CDPClient(port);
  await client.connect();
  t.after(() => client.disconnect());
  await assert.rejects(client.evaluate("return 1;"), /Invalid parameters/);
});
test("disconnect rejects in-flight operations immediately", async (t) => {
  const port = await fixture(t, (ws) => ws.close());
  const client = new CDPClient(port);
  await client.connect();
  await assert.rejects(
    client.evaluateAwait("Promise.resolve(1)"),
    /closed|disconnect/i,
  );
});
test("evaluation timeout cleans up and leaves connection usable", async (t) => {
  let calls = 0;
  const port = await fixture(t, (ws, msg) => {
    if (++calls > 1)
      ws.send(
        JSON.stringify({
          id: msg.id,
          result: { result: { value: JSON.stringify(7) } },
        }),
      );
  });
  const client = new CDPClient(port, { timeoutMs: 30 });
  await client.connect();
  t.after(() => client.disconnect());
  await assert.rejects(client.evaluate("return 1;"), /timed out/i);
  assert.equal(await client.evaluate("return 7;"), 7);
});
test("renderer exceptions and async rejections reach the caller", async (t) => {
  const port = await fixture(t, (ws, msg) =>
    ws.send(
      JSON.stringify({
        id: msg.id,
        result: {
          exceptionDetails: {
            text: "Uncaught",
            exception: { description: "Error: recording failed" },
          },
        },
      }),
    ),
  );
  const client = new CDPClient(port);
  await client.connect();
  t.after(() => client.disconnect());
  await assert.rejects(
    client.evaluateAwait("Promise.reject(new Error())"),
    /recording failed/,
  );
});
