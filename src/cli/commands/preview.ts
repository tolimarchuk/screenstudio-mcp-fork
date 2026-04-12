import { Command } from "commander";
import { writeFileSync } from "fs";
import { withClient } from "../../cdp/client.js";
import { FIND_SEEK_FN, INIT_PIXI, FORCE_RENDER } from "./seek.js";

export const previewCommand = new Command("preview")
  .description("Screenshot the video preview canvas only")
  .option("-o, --output <path>", "Output file path", "/tmp/screenstudio-preview.png")
  .option("--at <ms>", "Seek to playback time before capturing (ms, 'start', or 'end')")
  .option("--open", "Open the image after saving")
  .action(async (opts, cmd) => {
    const port = parseInt(cmd.parent?.opts().port || "9222");

    // If --at is specified, seek first
    if (opts.at !== undefined) {
      let timeMs: number;
      if (opts.at === "start") timeMs = 0;
      else if (opts.at === "end") timeMs = -1;
      else timeMs = parseInt(opts.at);

      await withClient(port, async (client) => {
        return client.evaluate(`
          var p = window.$project;
          if (!p) return { error: 'No project open' };
          var targetMs = ${timeMs === -1 ? "Math.round(p.playbackDurationMs)" : timeMs};
          ${FIND_SEEK_FN}
          if (window.__clickFn) { window.__clickFn(targetMs); }
          return { success: true };
        `);
      });
    }

    // Find the child window (preview renderer)
    const url = `http://localhost:${port}/json`;
    let response: Response;
    try {
      response = await fetch(url);
    } catch {
      console.error("Cannot connect to Screen Studio. Run: screenstudio launch");
      process.exit(1);
    }

    const pages: Array<{
      id: string;
      url: string;
      webSocketDebuggerUrl: string;
    }> = await response.json();

    // Find the child window (not index.html)
    const child = pages.find((p) => !p.url.includes("index.html"));
    if (!child) {
      console.error("Could not find preview window. Is a project open?");
      process.exit(1);
    }

    const ws = new WebSocket(child.webSocketDebuggerUrl);

    const result = await new Promise<string | null>((resolve) => {
      const timeout = setTimeout(() => {
        ws.close();
        resolve(null);
      }, 5000);

      ws.onopen = () => {
        // Step 1: Init pixi + force render
        ws.send(
          JSON.stringify({
            id: 1,
            method: "Runtime.evaluate",
            params: {
              expression: INIT_PIXI + FORCE_RENDER,
              returnByValue: true,
            },
          }),
        );
      };

      ws.onmessage = (e) => {
        const msg = JSON.parse(
          typeof e.data === "string" ? e.data : e.data.toString(),
        );

        if (msg.id === 1) {
          // Step 2: Get the document root
          ws.send(
            JSON.stringify({ id: 2, method: "DOM.getDocument" }),
          );
        } else if (msg.id === 2) {
          // Step 3: Find the canvas element
          ws.send(
            JSON.stringify({
              id: 3,
              method: "DOM.querySelector",
              params: {
                nodeId: msg.result.root.nodeId,
                selector: "canvas",
              },
            }),
          );
        } else if (msg.id === 3) {
          // Step 4: Get canvas box model for clipping
          ws.send(
            JSON.stringify({
              id: 4,
              method: "DOM.getBoxModel",
              params: { nodeId: msg.result.nodeId },
            }),
          );
        } else if (msg.id === 4) {
          // Step 5: Screenshot just the canvas
          const box = msg.result.model.content;
          const x = box[0];
          const y = box[1];
          const width = box[2] - box[0];
          const height = box[5] - box[1];

          ws.send(
            JSON.stringify({
              id: 5,
              method: "Page.captureScreenshot",
              params: {
                format: "png",
                clip: { x, y, width, height, scale: 2 },
              },
            }),
          );
        } else if (msg.id === 5 && msg.result?.data) {
          clearTimeout(timeout);
          resolve(msg.result.data);
          ws.close();
        }
      };

      ws.onerror = () => {
        clearTimeout(timeout);
        resolve(null);
      };
    });

    if (!result) {
      console.error("Could not capture preview. Is a project open?");
      process.exit(1);
    }

    const buf = Buffer.from(result, "base64");
    writeFileSync(opts.output, buf);
    console.log(`Preview saved to ${opts.output}`);

    if (opts.open) {
      const { execSync } = await import("child_process");
      execSync(`open "${opts.output}"`);
    }
  });
