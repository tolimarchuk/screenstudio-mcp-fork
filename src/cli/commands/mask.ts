import { Command } from "commander";
import { withClient } from "../../cdp/client.js";
import { output, table } from "../format.js";

const maskList = new Command("list")
  .description("List all masks")
  .action(async (_opts, cmd) => {
    const port = parseInt(cmd.parent?.parent?.opts().port || "9222");
    const json = cmd.parent?.parent?.opts().json || false;

    const masks = await withClient(port, async (client) => {
      return client.evaluate(`
        var p = window.$project;
        if (!p) return { error: 'No project open' };
        var scene = p.scenes[0];
        if (!scene) return { error: 'No scene' };
        return (scene.masks || []).map(function(m) {
          return {
            id: m.id,
            type: m.type,
            sourceStartTime: Math.round(m.sourceStartTime),
            sourceEndTime: Math.round(m.sourceEndTime),
            bounds: m.bounds,
            blur: m.blur,
          };
        });
      `);
    });

    if (json) {
      output(masks, true);
    } else {
      const items = masks as Array<Record<string, unknown>>;
      if (items.length === 0) {
        console.log("No masks.");
        return;
      }
      const rows = items.map((m) => {
        const bounds = (m.bounds as Array<Record<string, number>>) || [];
        const b = bounds[0] || {};
        return [
          String(m.id),
          String(m.type || ""),
          `${m.sourceStartTime}ms`,
          `${m.sourceEndTime}ms`,
          bounds.length > 0
            ? `${Math.round(b.x)},${Math.round(b.y)} ${Math.round(b.width)}x${Math.round(b.height)}`
            : "-",
          String(m.blur ?? "-"),
        ];
      });
      table(["ID", "Type", "Start", "End", "Bounds (x,y WxH)", "Blur"], rows);
    }
  });

const maskAdd = new Command("add")
  .description("Add a mask at a time range")
  .argument("<startMs>", "Start time in milliseconds")
  .argument("<endMs>", "End time in milliseconds")
  .option("--x <n>", "Bounds X (recording coords)", "0")
  .option("--y <n>", "Bounds Y (recording coords)", "0")
  .option("--width <n>", "Bounds width (recording coords)", "200")
  .option("--height <n>", "Bounds height (recording coords)", "100")
  .option("--blur <n>", "Blur amount", "20")
  .action(async (startMs, endMs, opts, cmd) => {
    const port = parseInt(cmd.parent?.parent?.opts().port || "9222");
    const json = cmd.parent?.parent?.opts().json || false;
    const start = parseInt(startMs);
    const end = parseInt(endMs);
    const x = parseFloat(opts.x);
    const y = parseFloat(opts.y);
    const width = parseFloat(opts.width);
    const height = parseFloat(opts.height);
    const blur = parseFloat(opts.blur);

    const result = await withClient(port, async (client) => {
      return client.evaluate(`
        var p = window.$project;
        if (!p) return { error: 'No project open' };
        p.history.update();
        var scene = p.scenes[0];
        if (!scene) return { error: 'No scene' };
        scene.addMaskAt(${start});
        var latest = scene.masks[scene.masks.length - 1];
        if (!latest) return { error: 'Failed to create mask' };
        scene.updateMask(latest.id, {
          startTime: ${start},
          endTime: ${end},
          bounds: [{ x: ${x}, y: ${y}, width: ${width}, height: ${height} }],
          blur: ${blur},
          type: 'sensitive-data',
        });
        return {
          success: true,
          id: latest.id,
          maskCount: scene.masks.length,
          start: Math.round(latest.sourceStartTime),
          end: Math.round(latest.sourceEndTime),
        };
      `);
    });

    output(result, json);
  });

const maskUpdate = new Command("update")
  .description("Update mask properties")
  .argument("<id>", "Mask ID")
  .option("--x <n>", "Bounds X (recording coords)")
  .option("--y <n>", "Bounds Y (recording coords)")
  .option("--width <n>", "Bounds width (recording coords)")
  .option("--height <n>", "Bounds height (recording coords)")
  .option("--blur <n>", "Blur amount")
  .option("--start <ms>", "Start time in ms")
  .option("--end <ms>", "End time in ms")
  .action(async (id, opts, cmd) => {
    const port = parseInt(cmd.parent?.parent?.opts().port || "9222");
    const json = cmd.parent?.parent?.opts().json || false;

    const changes: Record<string, unknown> = {};
    if (opts.start) changes.startTime = parseInt(opts.start);
    if (opts.end) changes.endTime = parseInt(opts.end);
    if (opts.blur) changes.blur = parseFloat(opts.blur);

    const hasBoundsChange =
      opts.x !== undefined ||
      opts.y !== undefined ||
      opts.width !== undefined ||
      opts.height !== undefined;

    const result = await withClient(port, async (client) => {
      if (hasBoundsChange) {
        // Merge with existing bounds
        return client.evaluate(`
          var p = window.$project;
          if (!p) return { error: 'No project open' };
          p.history.update();
          var scene = p.scenes[0];
          if (!scene) return { error: 'No scene' };
          var mask = scene.masks.find(function(m) { return m.id === ${JSON.stringify(id)}; });
          if (!mask) return { error: 'Mask not found: ${id}' };
          var currentBounds = (mask.bounds && mask.bounds[0]) || { x: 0, y: 0, width: 200, height: 100 };
          var changes = ${JSON.stringify(changes)};
          changes.bounds = [{
            x: ${opts.x !== undefined ? parseFloat(opts.x) : "currentBounds.x"},
            y: ${opts.y !== undefined ? parseFloat(opts.y) : "currentBounds.y"},
            width: ${opts.width !== undefined ? parseFloat(opts.width) : "currentBounds.width"},
            height: ${opts.height !== undefined ? parseFloat(opts.height) : "currentBounds.height"},
          }];
          scene.updateMask(${JSON.stringify(id)}, changes);
          return { success: true };
        `);
      }

      return client.evaluate(`
        var p = window.$project;
        if (!p) return { error: 'No project open' };
        p.history.update();
        var scene = p.scenes[0];
        if (!scene) return { error: 'No scene' };
        scene.updateMask(${JSON.stringify(id)}, ${JSON.stringify(changes)});
        return { success: true };
      `);
    });

    output(result, json);
  });

const maskRemove = new Command("remove")
  .description("Remove a mask by ID")
  .argument("<id>", "Mask ID")
  .action(async (id, _opts, cmd) => {
    const port = parseInt(cmd.parent?.parent?.opts().port || "9222");
    const json = cmd.parent?.parent?.opts().json || false;

    const result = await withClient(port, async (client) => {
      return client.evaluate(`
        var p = window.$project;
        if (!p) return { error: 'No project open' };
        p.history.update();
        var scene = p.scenes[0];
        if (!scene) return { error: 'No scene' };
        scene.removeMask(${JSON.stringify(id)});
        return { success: true, maskCount: scene.masks.length };
      `);
    });

    output(result, json);
  });

const maskClear = new Command("clear")
  .description("Remove all masks")
  .action(async (_opts, cmd) => {
    const port = parseInt(cmd.parent?.parent?.opts().port || "9222");
    const json = cmd.parent?.parent?.opts().json || false;

    const result = await withClient(port, async (client) => {
      return client.evaluate(`
        var p = window.$project;
        if (!p) return { error: 'No project open' };
        p.history.update();
        var scene = p.scenes[0];
        if (!scene) return { error: 'No scene' };
        scene.update({ masks: [] });
        return { success: true, maskCount: 0 };
      `);
    });

    output(result, json);
  });

export const maskCommand = new Command("mask")
  .description("Manage masks (sensitive data blurring)")
  .addCommand(maskList)
  .addCommand(maskAdd)
  .addCommand(maskRemove)
  .addCommand(maskUpdate)
  .addCommand(maskClear);
