import { Command } from "commander";
import { CDPClient } from "../../cdp/client.js";
import { findRendererPage } from "../../cdp/page-finder.js";

export const exportCommand = new Command("export")
  .description("Trigger Screen Studio export")
  .option("--clipboard", "Quick export to clipboard (Cmd+Alt+C)")
  .action(async (opts, cmd) => {
    const port = parseInt(cmd.parent?.opts().port || "9222");

    const client = new CDPClient(port);
    await client.connect();

    if (opts.clipboard) {
      // Cmd+Alt+C
      await client.dispatchKeyEvent("c", "KeyC", 8 + 2); // meta + alt
      console.log("Triggered quick export to clipboard");
    } else {
      // Cmd+Shift+E
      await client.dispatchKeyEvent("e", "KeyE", 8 + 1); // meta + shift
      console.log("Triggered export dialog");
    }

    client.disconnect();
  });
