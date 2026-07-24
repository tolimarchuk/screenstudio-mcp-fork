import { Command } from "commander";
import { execSync } from "child_process";
import { output } from "../format.js";

/** The port is closed when the fetch is refused, not when it returns an error body. */
async function portOpen(port: number): Promise<boolean> {
  try {
    await fetch(`http://localhost:${port}/json`);
    return true;
  } catch {
    return false;
  }
}

async function waitForClose(port: number, timeoutMs: number): Promise<boolean> {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    if (!(await portOpen(port))) return true;
    await new Promise((r) => setTimeout(r, 300));
  }
  return !(await portOpen(port));
}

/**
 * Counterpart to `launch`. Upstream has no way to shut the debug port again,
 * so it stays open for as long as the app is running — any local process can
 * drive Screen Studio while it is. Always close it when the job is done.
 */
export const quitCommand = new Command("quit")
  .description("Quit Screen Studio and close the debug port")
  .option("--port <port>", "CDP port", "9222")
  .option("--force", "Escalate to pkill if the app ignores the quit request")
  .action(async (opts, cmd) => {
    const port = parseInt(opts.port);
    const json = cmd.parent?.opts().json || false;

    try {
      execSync('osascript -e \'quit app "Screen Studio"\'', {
        stdio: "ignore",
        timeout: 8000,
      });
    } catch {
      // Not running, or refused to quit — the port check below is the truth.
    }

    if (await waitForClose(port, 8000)) {
      output({ success: true, port, message: "Screen Studio quit, debug port closed" }, json);
      return;
    }

    if (opts.force) {
      try {
        execSync('pkill -x "Screen Studio"', { stdio: "ignore" });
      } catch {
        // pkill exits non-zero when nothing matched
      }
      await new Promise((r) => setTimeout(r, 1000));
      if (await waitForClose(port, 3000)) {
        output(
          { success: true, port, forced: true, message: "Screen Studio force-quit, debug port closed" },
          json,
        );
        return;
      }
    }

    output(
      {
        success: false,
        port,
        error: `Debug port ${port} is still open. Screen Studio may have an unsaved recording. Retry with --force.`,
      },
      json,
    );
    process.exit(1);
  });
