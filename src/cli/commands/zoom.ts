import { Command } from "commander";
import { withClient } from "../../cdp/client.js";
import { output, table } from "../format.js";

// Helper JS to serialize all zoom ranges as data objects
const GET_ALL_ZOOM_DATA = `
  scene.zoomRanges.map(function(z) {
    return JSON.parse(JSON.stringify(z.data));
  })
`;

// Generate a short random ID
const GENERATE_ID = `
  (function() {
    var chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
    var id = '';
    for (var i = 0; i < 10; i++) id += chars.charAt(Math.floor(Math.random() * chars.length));
    return id;
  })()
`;

const zoomList = new Command("list")
  .description("List all zoom ranges")
  .action(async (_opts, cmd) => {
    const port = parseInt(cmd.parent?.parent?.opts().port || "9222");
    const json = cmd.parent?.parent?.opts().json || false;

    const zooms = await withClient(port, async (client) => {
      return client.evaluate(`
        var p = window.$project;
        if (!p) return { error: 'No project open' };
        var scene = p.scenes[0];
        if (!scene) return { error: 'No scene' };
        return scene.zoomRanges.map(function(z) {
          return {
            id: z.id, type: z.type, zoom: z.zoom,
            sourceStartTime: Math.round(z.sourceStartTime),
            sourceEndTime: Math.round(z.sourceEndTime),
            duration: Math.round(z.duration),
            isDisabled: z.isDisabled, glideSpeed: z.glideSpeed,
            manualTargetPoint: z.manualTargetPoint || null,
          };
        });
      `);
    });

    if (json) {
      output(zooms, true);
    } else {
      const rows = (zooms as Array<Record<string, unknown>>).map((z) => [
        String(z.id),
        String(z.type),
        `${z.zoom}x`,
        `${z.sourceStartTime}ms`,
        `${z.sourceEndTime}ms`,
        z.isDisabled ? "yes" : "no",
      ]);
      table(["ID", "Type", "Zoom", "Start", "End", "Disabled"], rows);
    }
  });

const zoomAdd = new Command("add")
  .description("Add a zoom range at a source time")
  .argument("<timeMs>", "Source time in milliseconds")
  .option("--level <n>", "Zoom level", "2")
  .option("--end <ms>", "End time in ms (default: start + 3000)")
  .option("--id <id>", "Custom ID for the zoom range")
  .option("--x <n>", "Target point X (0-1)")
  .option("--y <n>", "Target point Y (0-1)")
  .action(async (timeMs, opts, cmd) => {
    const port = parseInt(cmd.parent?.parent?.opts().port || "9222");
    const json = cmd.parent?.parent?.opts().json || false;
    const time = parseInt(timeMs);
    const level = parseFloat(opts.level);
    const endTime = opts.end ? parseInt(opts.end) : time + 3000;
    const customId = opts.id || null;
    const x = opts.x !== undefined ? parseFloat(opts.x) : 0.5;
    const y = opts.y !== undefined ? parseFloat(opts.y) : 0.5;

    const result = await withClient(port, async (client) => {
      return client.evaluate(`
        var p = window.$project;
        if (!p) return { error: 'No project open' };
        p.history.update();
        var scene = p.scenes[0];
        var allData = ${GET_ALL_ZOOM_DATA};
        var newId = ${customId ? JSON.stringify(customId) : GENERATE_ID};
        var newZoom = {
          id: newId,
          zoom: ${level},
          type: "manual",
          snapToEdgesRatio: 0.25,
          manualTargetPoint: { x: ${x}, y: ${y} },
          glideDirection: null,
          glideSpeed: 0.3,
          isDisabled: false,
          startTime: ${time},
          endTime: ${endTime},
          isSystem: false,
          hasInstantAnimation: false,
        };
        allData.push(newZoom);
        scene.update({ zoomRanges: allData });
        return {
          success: true, id: newId, zoomCount: scene.zoomRanges.length,
          start: ${time}, end: ${endTime}, zoom: ${level},
        };
      `);
    });

    output(result, json);
  });

const zoomRemove = new Command("remove")
  .description("Remove a zoom range by ID")
  .argument("<id>", "Zoom range ID")
  .action(async (id, _opts, cmd) => {
    const port = parseInt(cmd.parent?.parent?.opts().port || "9222");
    const json = cmd.parent?.parent?.opts().json || false;

    const result = await withClient(port, async (client) => {
      return client.evaluate(`
        var p = window.$project;
        if (!p) return { error: 'No project open' };
        p.history.update();
        var scene = p.scenes[0];
        var allData = ${GET_ALL_ZOOM_DATA};
        var filtered = allData.filter(function(d) { return d.id !== ${JSON.stringify(id)}; });
        if (filtered.length === allData.length) return { error: 'Zoom range not found: ${id}' };
        scene.update({ zoomRanges: filtered });
        return { success: true, zoomCount: scene.zoomRanges.length };
      `);
    });

    output(result, json);
  });

const zoomUpdate = new Command("update")
  .description("Update a zoom range")
  .argument("<id>", "Zoom range ID")
  .option("--level <n>", "Zoom level")
  .option("--speed <n>", "Glide speed")
  .option("--start <ms>", "Start time in ms")
  .option("--end <ms>", "End time in ms")
  .option("--x <n>", "Target point X (0-1)")
  .option("--y <n>", "Target point Y (0-1)")
  .option("--disable", "Disable zoom range")
  .option("--enable", "Enable zoom range")
  .action(async (id, opts, cmd) => {
    const port = parseInt(cmd.parent?.parent?.opts().port || "9222");
    const json = cmd.parent?.parent?.opts().json || false;

    const changes: Record<string, unknown> = {};
    if (opts.level) changes.zoom = parseFloat(opts.level);
    if (opts.speed) changes.glideSpeed = parseFloat(opts.speed);
    if (opts.start) changes.startTime = parseInt(opts.start);
    if (opts.end) changes.endTime = parseInt(opts.end);
    if (opts.disable) changes.isDisabled = true;
    if (opts.enable) changes.isDisabled = false;

    // Build manualTargetPoint update
    const hasX = opts.x !== undefined;
    const hasY = opts.y !== undefined;

    const result = await withClient(port, async (client) => {
      return client.evaluate(`
        var p = window.$project;
        if (!p) return { error: 'No project open' };
        p.history.update();
        var scene = p.scenes[0];
        var allData = ${GET_ALL_ZOOM_DATA};
        var found = false;
        for (var i = 0; i < allData.length; i++) {
          if (allData[i].id === ${JSON.stringify(id)}) {
            found = true;
            var d = allData[i];
            var changes = ${JSON.stringify(changes)};
            for (var k in changes) { d[k] = changes[k]; }
            ${hasX || hasY ? `
              var current = d.manualTargetPoint || { x: 0.5, y: 0.5 };
              d.manualTargetPoint = {
                x: ${hasX ? parseFloat(opts.x) : "current.x"},
                y: ${hasY ? parseFloat(opts.y) : "current.y"},
              };
            ` : ""}
            break;
          }
        }
        if (!found) return { error: 'Zoom range not found: ${id}' };
        scene.update({ zoomRanges: allData });
        return { success: true };
      `);
    });

    output(result, json);
  });

const zoomSplit = new Command("split")
  .description("Split a zoom range at a source time")
  .argument("<id>", "Zoom range ID")
  .argument("<timeMs>", "Source time in milliseconds to split at")
  .action(async (id, timeMs, _opts, cmd) => {
    const port = parseInt(cmd.parent?.parent?.opts().port || "9222");
    const json = cmd.parent?.parent?.opts().json || false;
    const time = parseInt(timeMs);

    const result = await withClient(port, async (client) => {
      return client.evaluate(`
        var p = window.$project;
        if (!p) return { error: 'No project open' };
        p.history.update();
        var scene = p.scenes[0];
        var allData = ${GET_ALL_ZOOM_DATA};
        var idx = -1;
        for (var i = 0; i < allData.length; i++) {
          if (allData[i].id === ${JSON.stringify(id)}) { idx = i; break; }
        }
        if (idx === -1) return { error: 'Zoom range not found: ${id}' };
        var orig = allData[idx];
        if (${time} <= orig.startTime || ${time} >= orig.endTime) {
          return { error: 'Split time must be within the zoom range (' + Math.round(orig.startTime) + 'ms - ' + Math.round(orig.endTime) + 'ms)' };
        }
        var newId = ${GENERATE_ID};
        var newZoom = JSON.parse(JSON.stringify(orig));
        newZoom.id = newId;
        newZoom.startTime = ${time};
        orig.endTime = ${time};
        allData.splice(idx + 1, 0, newZoom);
        scene.update({ zoomRanges: allData });
        return { success: true, originalId: ${JSON.stringify(id)}, newId: newId, splitAt: ${time} };
      `);
    });

    output(result, json);
  });

const zoomSet = new Command("set")
  .description("Replace all zoom ranges at once (JSON array of zoom data)")
  .argument("<json>", "JSON array of zoom range objects")
  .action(async (jsonStr, _opts, cmd) => {
    const port = parseInt(cmd.parent?.parent?.opts().port || "9222");
    const json = cmd.parent?.parent?.opts().json || false;

    let zoomData: unknown[];
    try {
      zoomData = JSON.parse(jsonStr);
    } catch {
      console.error("Invalid JSON");
      process.exit(1);
    }

    const result = await withClient(port, async (client) => {
      return client.evaluate(`
        var p = window.$project;
        if (!p) return { error: 'No project open' };
        p.history.update();
        var scene = p.scenes[0];
        scene.update({ zoomRanges: ${JSON.stringify(zoomData)} });
        return { success: true, zoomCount: scene.zoomRanges.length };
      `);
    });

    output(result, json);
  });

export const zoomCommand = new Command("zoom")
  .description("Manage zoom ranges")
  .addCommand(zoomList)
  .addCommand(zoomAdd)
  .addCommand(zoomRemove)
  .addCommand(zoomUpdate)
  .addCommand(zoomSplit)
  .addCommand(zoomSet);
