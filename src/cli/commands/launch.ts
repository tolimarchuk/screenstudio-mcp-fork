import { Command } from "commander";
import { execSync } from "child_process";

export const launchCommand = new Command("launch")
  .description("Launch Screen Studio with remote debugging enabled")
  .option("--port <port>", "CDP port", "9222")
  .action(async (opts) => {
    const port = parseInt(opts.port);

    // Quit existing instance
    try {
      execSync('osascript -e \'quit app "Screen Studio"\'', { stdio: "ignore" });
      // Brief wait for quit
      await new Promise((r) => setTimeout(r, 1500));
    } catch {
      // Not running, that's fine
    }

    // Launch with debug port
    execSync(
      `open -a "Screen Studio" --args --remote-debugging-port=${port}`,
      { stdio: "ignore" },
    );

    // Poll until ready
    const start = Date.now();
    while (Date.now() - start < 10_000) {
      try {
        const res = await fetch(`http://localhost:${port}/json`);
        if (res.ok) {
          console.log(`Screen Studio ready on port ${port}`);
          return;
        }
      } catch {
        // Not ready yet
      }
      await new Promise((r) => setTimeout(r, 500));
    }

    console.error(
      "Screen Studio launched but CDP endpoint not responding. Try again.",
    );
    process.exit(1);
  });
