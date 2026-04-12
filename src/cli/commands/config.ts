import { Command } from "commander";
import { withClient } from "../../cdp/client.js";
import { output } from "../format.js";

export const configCommand = new Command("config")
  .description("Read or write Screen Studio config values")
  .argument("[key]", "Config key to read or write")
  .argument("[value]", "Value to set")
  .option("--list", "List all config keys and values")
  .action(async (key, value, opts, cmd) => {
    const port = parseInt(cmd.parent?.opts().port || "9222");
    const json = cmd.parent?.opts().json || false;

    if (opts.list || !key) {
      // List all config
      const config = await withClient(port, async (client) => {
        return client.evaluate(`
          var p = window.$project;
          if (!p) return { error: 'No project open' };
          var config = p.config;
          var result = {};
          Object.keys(config).forEach(function(k) {
            var v = config[k];
            var t = typeof v;
            if (t === 'string' || t === 'number' || t === 'boolean' || v === null) result[k] = v;
            else if (Array.isArray(v)) result[k] = v;
            else if (t === 'object' && v) {
              try { result[k] = JSON.parse(JSON.stringify(v)); } catch(e) { result[k] = '[object]'; }
            }
          });
          return result;
        `);
      });
      output(config, json);
      return;
    }

    if (value !== undefined) {
      // Write config
      // Auto-parse the value
      let parsed: unknown = value;
      if (value === "true") parsed = true;
      else if (value === "false") parsed = false;
      else if (value === "null") parsed = null;
      else if (!isNaN(Number(value)) && value !== "") parsed = Number(value);
      else {
        try {
          parsed = JSON.parse(value);
        } catch {
          // Keep as string
        }
      }

      const result = await withClient(port, async (client) => {
        return client.evaluate(`
          var p = window.$project;
          if (!p) return { error: 'No project open' };
          p.history.update();
          p.updateConfig(JSON.parse(${JSON.stringify(JSON.stringify({ [key]: parsed }))}));
          return { key: ${JSON.stringify(key)}, value: p.config[${JSON.stringify(key)}] };
        `);
      });
      output(result, json);
    } else {
      // Read single config value
      const result = await withClient(port, async (client) => {
        return client.evaluate(`
          var p = window.$project;
          if (!p) return { error: 'No project open' };
          var v = p.config[${JSON.stringify(key)}];
          if (v === undefined) return { error: 'Unknown config key: ${key}' };
          return v;
        `);
      });
      output(result, json);
    }
  });
