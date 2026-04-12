import { Command } from "commander";
import { withClient } from "../../cdp/client.js";
import { output, formatMs } from "../format.js";

interface StatusResult {
  version: string;
  projectCount: number;
  project?: {
    name: string;
    path: string;
    durationMs: number;
    sliceCount: number;
    sceneCount: number;
    isDirty: boolean;
  };
}

export const statusCommand = new Command("status")
  .description("Check connection to Screen Studio")
  .action(async (_opts, cmd) => {
    const port = parseInt(cmd.parent?.opts().port || "9222");
    const json = cmd.parent?.opts().json || false;

    const result = await withClient<StatusResult>(port, async (client) => {
      return client.evaluate<StatusResult>(`
        var version = electronEnv.APP_VERSION;
        var size = window.$projects.size;
        var result = { version: version, projectCount: size };
        if (size > 0) {
          var p = window.$project;
          result.project = {
            name: p.name,
            path: p.path,
            durationMs: p.playbackDurationMs,
            sliceCount: p.scenes[0] ? p.scenes[0].slices.length : 0,
            sceneCount: p.scenes.length,
            isDirty: p.isDirty
          };
        }
        return result;
      `);
    });

    if (json) {
      output(result, true);
    } else if (result.project) {
      console.log(
        `Connected to Screen Studio ${result.version} | ` +
          `Project: ${result.project.name} | ` +
          `Duration: ${formatMs(result.project.durationMs)} | ` +
          `${result.project.sliceCount} slices` +
          (result.project.isDirty ? " (unsaved)" : ""),
      );
    } else {
      console.log(
        `Connected to Screen Studio ${result.version} | No project open`,
      );
    }
  });
