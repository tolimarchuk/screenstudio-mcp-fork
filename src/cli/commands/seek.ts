import { Command } from "commander";
import { withClient } from "../../cdp/client.js";
import { output } from "../format.js";

// JS to find and cache the timeline seek functions from the React component tree
const FIND_SEEK_FN = `
  if (!window.__seekFn) {
    var root = document.getElementById('root');
    var fiberKey = Object.keys(root).find(function(k) { return k.startsWith('__reactContainer'); });
    var fiber = root[fiberKey];
    var queue = [fiber];
    var visited = 0;
    while (queue.length > 0 && visited < 500) {
      var node = queue.shift();
      visited++;
      if (!node) continue;
      if (node.memoizedProps && node.memoizedProps.onTimeSeek) {
        window.__seekFn = node.memoizedProps.onTimeSeek;
        window.__clickFn = node.memoizedProps.onTimeClick;
        window.__seekStopFn = node.memoizedProps.onSeekStop;
        break;
      }
      if (node.child) queue.push(node.child);
      if (node.sibling) queue.push(node.sibling);
    }
  }
`;

// JS to find the Pixi renderer in the child window and force a re-render
const INIT_PIXI = `
  if (!window.__pixiComponent) {
    var canvas = document.querySelector('canvas');
    if (canvas) {
      var fiberKey = Object.keys(canvas).find(function(k) { return k.startsWith('__reactFiber'); });
      if (fiberKey) {
        var fiber = canvas[fiberKey];
        if (fiber.return && fiber.return.stateNode && fiber.return.stateNode.app) {
          window.__pixiComponent = fiber.return.stateNode;
          window.__pixiApp = fiber.return.stateNode.app;
        }
      }
    }
  }
`;

const FORCE_RENDER = `
  if (window.__pixiComponent) {
    window.__pixiComponent._needsUpdate = true;
    window.__pixiComponent.needsRenderUpdate();
    window.__pixiComponent.renderStage();
    window.__pixiComponent.app.renderer.render(window.__pixiComponent.app.stage);
  }
`;

export { FIND_SEEK_FN, INIT_PIXI, FORCE_RENDER };

export const seekCommand = new Command("seek")
  .description("Move the playhead to a specific time (playback ms)")
  .argument("<timeMs>", "Playback time in milliseconds (or 'start' / 'end')")
  .action(async (timeArg, _opts, cmd) => {
    const port = parseInt(cmd.parent?.opts().port || "9222");
    const json = cmd.parent?.opts().json || false;

    let timeMs: number;
    if (timeArg === "start") {
      timeMs = 0;
    } else if (timeArg === "end") {
      timeMs = -1;
    } else {
      timeMs = parseInt(timeArg);
    }

    const result = await withClient(port, async (client) => {
      return client.evaluate(`
        var p = window.$project;
        if (!p) return { error: 'No project open' };
        var targetMs = ${timeMs === -1 ? "Math.round(p.playbackDurationMs)" : timeMs};
        ${FIND_SEEK_FN}
        if (window.__clickFn) { window.__clickFn(targetMs); }
        return { success: true, seekedToMs: targetMs };
      `);
    });

    // Force re-render in the child window
    const url = `http://localhost:${port}/json`;
    try {
      const res = await fetch(url);
      const pages: Array<{ id: string; url: string; webSocketDebuggerUrl: string }> =
        await res.json();
      const child = pages.find((p) => !p.url.includes("index.html"));
      if (child) {
        const ws = new WebSocket(child.webSocketDebuggerUrl);
        await new Promise<void>((resolve) => {
          ws.onopen = () => {
            ws.send(
              JSON.stringify({
                id: 1,
                method: "Runtime.evaluate",
                params: { expression: INIT_PIXI + FORCE_RENDER, returnByValue: true },
              }),
            );
          };
          ws.onmessage = () => {
            ws.close();
            resolve();
          };
          setTimeout(() => {
            ws.close();
            resolve();
          }, 2000);
        });
      }
    } catch {
      // Non-critical — preview just won't update
    }

    if (json) {
      output(result, true);
    } else {
      const r = result as Record<string, unknown>;
      if (r.error) {
        console.error(String(r.error));
        process.exit(1);
      }
      console.log(`Seeked to ${r.seekedToMs}ms`);
    }
  });
