import { Command } from "commander";
import { withClient } from "../../cdp/client.js";
import { output, table } from "../format.js";

const sliceList = new Command("list")
  .description("List all slices on the timeline")
  .action(async (_opts, cmd) => {
    const port = parseInt(cmd.parent?.parent?.opts().port || "9222");
    const json = cmd.parent?.parent?.opts().json || false;

    const slices = await withClient(port, async (client) => {
      return client.evaluate(`
        var p = window.$project;
        if (!p) return { error: 'No project open' };
        var scene = p.scenes[0];
        if (!scene) return { error: 'No scene' };
        return scene.slices.map(function(s) {
          return {
            id: s.id, index: s.index,
            sourceStartMs: Math.round(s.sourceStartMs), sourceEndMs: Math.round(s.sourceEndMs),
            playbackStartMs: Math.round(s.playbackStartMs), playbackEndMs: Math.round(s.playbackEndMs),
            speed: s.speed, volume: s.volume, hideCursor: s.hideCursor,
          };
        });
      `);
    });

    if (json) {
      output(slices, true);
    } else {
      const rows = (slices as Array<Record<string, unknown>>).map((s) => [
        String(s.index),
        `${s.sourceStartMs}ms - ${s.sourceEndMs}ms`,
        `${s.playbackStartMs}ms - ${s.playbackEndMs}ms`,
        `${s.speed}x`,
        String(s.volume),
      ]);
      table(["Slice", "Source Range", "Playback Range", "Speed", "Volume"], rows);
    }
  });

const sliceSplit = new Command("split")
  .description("Split a slice at a source time (in ms)")
  .argument("<timeMs>", "Source time in milliseconds")
  .action(async (timeMs, _opts, cmd) => {
    const port = parseInt(cmd.parent?.parent?.opts().port || "9222");
    const json = cmd.parent?.parent?.opts().json || false;
    const time = parseInt(timeMs);

    const result = await withClient(port, async (client) => {
      return client.evaluate(`
        var p = window.$project;
        if (!p) return { error: 'No project open' };
        var scene = p.scenes[0];
        var slice = scene.findSliceAtTime(${time});
        if (!slice) return { error: 'No slice found at ${time}ms' };
        if (!slice.canSplitAt(${time})) return { error: 'Cannot split at ${time}ms' };
        p.history.update();
        slice.splitAt(${time});
        return { success: true, sliceCount: scene.slices.length };
      `);
    });

    output(result, json);
  });

const sliceRemove = new Command("remove")
  .description("Remove a slice by index, or a time range with --from/--to")
  .argument("[index]", "Slice index to remove")
  .option("--from <ms>", "Start of time range to remove (source ms)")
  .option("--to <ms>", "End of time range to remove (source ms)")
  .action(async (index, opts, cmd) => {
    const port = parseInt(cmd.parent?.parent?.opts().port || "9222");
    const json = cmd.parent?.parent?.opts().json || false;

    if (opts.from !== undefined && opts.to !== undefined) {
      const fromMs = parseInt(opts.from);
      const toMs = parseInt(opts.to);

      const result = await withClient(port, async (client) => {
        return client.evaluate(`
          var p = window.$project;
          if (!p) return { error: 'No project open' };
          p.history.update();
          var scene = p.scenes[0];
          var fromMs = ${fromMs};
          var toMs = ${toMs};

          // Split at the start boundary
          var sliceAtFrom = scene.findSliceAtTime(fromMs);
          if (sliceAtFrom && sliceAtFrom.canSplitAt(fromMs)) {
            sliceAtFrom.splitAt(fromMs);
          }

          // Split at the end boundary
          var sliceAtTo = scene.findSliceAtTime(toMs);
          if (sliceAtTo && sliceAtTo.canSplitAt(toMs)) {
            sliceAtTo.splitAt(toMs);
          }

          // Remove all slices fully within the range (iterate backwards)
          var toRemove = [];
          for (var i = 0; i < scene.slices.length; i++) {
            var s = scene.slices[i];
            if (s.sourceStartMs >= fromMs && s.sourceEndMs <= toMs) {
              toRemove.push(i);
            }
          }
          for (var j = toRemove.length - 1; j >= 0; j--) {
            scene.slices[toRemove[j]].remove();
          }

          return {
            success: true,
            removed: toRemove.length,
            remainingSlices: scene.slices.length,
            newDurationMs: Math.round(p.playbackDurationMs),
          };
        `);
      });

      output(result, json);
    } else if (index !== undefined) {
      const idx = parseInt(index);

      const result = await withClient(port, async (client) => {
        return client.evaluate(`
          var p = window.$project;
          if (!p) return { error: 'No project open' };
          p.history.update();
          var scene = p.scenes[0];
          if (${idx} < 0 || ${idx} >= scene.slices.length) {
            return { error: 'Slice index ${idx} out of range (0-' + (scene.slices.length - 1) + ')' };
          }
          scene.slices[${idx}].remove();
          return { success: true, remainingSlices: scene.slices.length };
        `);
      });

      output(result, json);
    } else {
      console.error("Provide a slice index or --from/--to range");
      process.exit(1);
    }
  });

const sliceSpeed = new Command("speed")
  .description("Set playback speed of a slice")
  .argument("<index>", "Slice index")
  .argument("<speed>", "Speed multiplier (e.g. 2.0)")
  .action(async (index, speed, _opts, cmd) => {
    const port = parseInt(cmd.parent?.parent?.opts().port || "9222");
    const json = cmd.parent?.parent?.opts().json || false;
    const idx = parseInt(index);
    const spd = parseFloat(speed);

    const result = await withClient(port, async (client) => {
      return client.evaluate(`
        var p = window.$project;
        if (!p) return { error: 'No project open' };
        p.history.update();
        var scene = p.scenes[0];
        if (${idx} < 0 || ${idx} >= scene.slices.length) {
          return { error: 'Slice index ${idx} out of range (0-' + (scene.slices.length - 1) + ')' };
        }
        scene.slices[${idx}].update({ timeScale: 1 / ${spd} });
        return { success: true, index: ${idx}, speed: scene.slices[${idx}].speed };
      `);
    });

    output(result, json);
  });

const sliceMerge = new Command("merge")
  .description("Merge a slice with the next one")
  .argument("<index>", "Slice index to merge with next")
  .action(async (index, _opts, cmd) => {
    const port = parseInt(cmd.parent?.parent?.opts().port || "9222");
    const json = cmd.parent?.parent?.opts().json || false;
    const idx = parseInt(index);

    const result = await withClient(port, async (client) => {
      return client.evaluate(`
        var p = window.$project;
        if (!p) return { error: 'No project open' };
        p.history.update();
        var scene = p.scenes[0];
        if (${idx} < 0 || ${idx} >= scene.slices.length) {
          return { error: 'Slice index ${idx} out of range' };
        }
        scene.slices[${idx}].mergeWithNext();
        return { success: true, remainingSlices: scene.slices.length };
      `);
    });

    output(result, json);
  });

const sliceTrim = new Command("trim")
  .description("Adjust the start or end boundary of a slice")
  .argument("<index>", "Slice index")
  .option("--start <ms>", "New source start time in ms")
  .option("--end <ms>", "New source end time in ms")
  .action(async (index, opts, cmd) => {
    const port = parseInt(cmd.parent?.parent?.opts().port || "9222");
    const json = cmd.parent?.parent?.opts().json || false;
    const idx = parseInt(index);

    if (opts.start === undefined && opts.end === undefined) {
      console.error("Provide --start and/or --end");
      process.exit(1);
    }

    const updates: Record<string, number> = {};
    if (opts.start !== undefined) updates.sourceStartMs = parseInt(opts.start);
    if (opts.end !== undefined) updates.sourceEndMs = parseInt(opts.end);

    const result = await withClient(port, async (client) => {
      return client.evaluate(`
        var p = window.$project;
        if (!p) return { error: 'No project open' };
        p.history.update();
        var scene = p.scenes[0];
        if (${idx} < 0 || ${idx} >= scene.slices.length) {
          return { error: 'Slice index ${idx} out of range (0-' + (scene.slices.length - 1) + ')' };
        }
        var s = scene.slices[${idx}];
        var before = { sourceStartMs: Math.round(s.sourceStartMs), sourceEndMs: Math.round(s.sourceEndMs) };
        s.update(${JSON.stringify(updates)});
        var after = { sourceStartMs: Math.round(s.sourceStartMs), sourceEndMs: Math.round(s.sourceEndMs) };
        return { success: true, before: before, after: after };
      `);
    });

    output(result, json);
  });

export const sliceCommand = new Command("slice")
  .description("Manage timeline slices")
  .addCommand(sliceList)
  .addCommand(sliceSplit)
  .addCommand(sliceRemove)
  .addCommand(sliceSpeed)
  .addCommand(sliceMerge)
  .addCommand(sliceTrim);
