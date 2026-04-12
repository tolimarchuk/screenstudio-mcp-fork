import { Command } from "commander";
import { withClient } from "../../cdp/client.js";
import { output, formatMs } from "../format.js";
import { resolve } from "path";

const projectInfo = new Command("info")
  .description("Show project information")
  .action(async (_opts, cmd) => {
    const port = parseInt(cmd.parent?.parent?.opts().port || "9222");
    const json = cmd.parent?.parent?.opts().json || false;

    const info = await withClient(port, async (client) => {
      return client.evaluate(`
        var p = window.$project;
        if (!p) return { error: 'No project open' };
        return {
          name: p.name, id: p.id, path: p.path,
          durationMs: Math.round(p.playbackDurationMs),
          isDirty: p.isDirty, canUndo: p.canUndo, canRedo: p.canRedo,
          sceneCount: p.scenes.length,
          sliceCount: p.scenes[0] ? p.scenes[0].slices.length : 0,
          zoomCount: p.scenes[0] ? p.scenes[0].zoomRanges.length : 0,
          hasAudio: p.hasAudio,
          lastSavedAt: p.lastSavedAt,
        };
      `);
    });

    if (json) {
      output(info, true);
    } else {
      const i = info as Record<string, unknown>;
      console.log(`Name: ${i.name}`);
      console.log(`Path: ${i.path}`);
      console.log(`Duration: ${formatMs(i.durationMs as number)}`);
      console.log(`Slices: ${i.sliceCount} | Zoom Ranges: ${i.zoomCount}`);
      console.log(`Dirty: ${i.isDirty} | Undo: ${i.canUndo} | Redo: ${i.canRedo}`);
      if (i.lastSavedAt) console.log(`Last Saved: ${i.lastSavedAt}`);
    }
  });

const projectOpen = new Command("open")
  .description("Open a .screenstudio project file")
  .argument("<path>", "Path to .screenstudio file")
  .action(async (filePath, _opts, cmd) => {
    const port = parseInt(cmd.parent?.parent?.opts().port || "9222");
    const json = cmd.parent?.parent?.opts().json || false;
    const absPath = resolve(filePath);

    const result = await withClient(port, async (client) => {
      return client.evaluate(`
        var result = bridge.client.query('project.readProject', { projectPath: ${JSON.stringify(absPath)} });
        return { success: true, path: ${JSON.stringify(absPath)} };
      `);
    });

    output(result, json);
  });

const projectSave = new Command("save")
  .description("Save the current project")
  .action(async (_opts, cmd) => {
    const port = parseInt(cmd.parent?.parent?.opts().port || "9222");
    const json = cmd.parent?.parent?.opts().json || false;

    const result = await withClient(port, async (client) => {
      return client.evaluate(`
        var p = window.$project;
        if (!p) return { error: 'No project open' };
        var serialized = p.serialize();
        bridge.client.mutation('project.updateProject', {
          projectPath: p.path,
          data: serialized,
        });
        return { success: true, path: p.path };
      `);
    });

    output(result, json);
  });

const projectUndo = new Command("undo")
  .description("Undo the last change")
  .action(async (_opts, cmd) => {
    const port = parseInt(cmd.parent?.parent?.opts().port || "9222");
    const json = cmd.parent?.parent?.opts().json || false;

    const result = await withClient(port, async (client) => {
      return client.evaluate(`
        var p = window.$project;
        if (!p) return { error: 'No project open' };
        if (!p.canUndo) return { error: 'Nothing to undo' };
        p.history.undo();
        return { success: true, canUndo: p.canUndo, canRedo: p.canRedo };
      `);
    });

    output(result, json);
  });

const projectRedo = new Command("redo")
  .description("Redo the last undone change")
  .action(async (_opts, cmd) => {
    const port = parseInt(cmd.parent?.parent?.opts().port || "9222");
    const json = cmd.parent?.parent?.opts().json || false;

    const result = await withClient(port, async (client) => {
      return client.evaluate(`
        var p = window.$project;
        if (!p) return { error: 'No project open' };
        if (!p.canRedo) return { error: 'Nothing to redo' };
        p.history.redo();
        return { success: true, canUndo: p.canUndo, canRedo: p.canRedo };
      `);
    });

    output(result, json);
  });

export const projectCommand = new Command("project")
  .description("Project operations")
  .addCommand(projectInfo)
  .addCommand(projectOpen)
  .addCommand(projectSave)
  .addCommand(projectUndo)
  .addCommand(projectRedo);
