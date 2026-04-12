import { Command } from "commander";
import { readFileSync } from "fs";
import { withClient } from "../../cdp/client.js";

export const execCommand = new Command("exec")
  .description("Execute arbitrary JavaScript inside Screen Studio")
  .argument("[expression]", "JavaScript expression to evaluate")
  .option("-f, --file <path>", "Read script from file")
  .action(async (expression, opts, cmd) => {
    const port = parseInt(cmd.parent?.opts().port || "9222");

    let script: string;

    if (opts.file) {
      script = readFileSync(opts.file, "utf-8");
    } else if (expression === "-" || (!expression && !opts.file)) {
      // Read from stdin
      const chunks: Buffer[] = [];
      for await (const chunk of process.stdin) {
        chunks.push(chunk);
      }
      script = Buffer.concat(chunks).toString("utf-8").trim();
    } else if (expression) {
      script = expression;
    } else {
      console.error("Provide an expression, --file, or pipe to stdin");
      process.exit(1);
    }

    const result = await withClient(port, async (client) => {
      return client.evaluateRaw(script);
    });

    // Try to pretty-print JSON, otherwise print raw
    try {
      const parsed = JSON.parse(result);
      console.log(JSON.stringify(parsed, null, 2));
    } catch {
      console.log(result);
    }
  });
