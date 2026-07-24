import { shq } from "../../util/shell.js";
import { Command } from "commander";
import { execSync } from "child_process";
import { existsSync, mkdirSync, readFileSync } from "fs";
import { withClient } from "../../cdp/client.js";
import { output } from "../format.js";

export const analyzeCommand = new Command("analyze")
  .description("Extract frames and event timeline from recording")
  .option("--interval <seconds>", "Seconds between frames", "5")
  .option("--from <ms>", "Start time in source ms")
  .option("--to <ms>", "End time in source ms")
  .option("-o, --output <dir>", "Output directory", "/tmp/screenstudio-analyze")
  .action(async (opts, cmd) => {
    const port = parseInt(cmd.parent?.opts().port || "9222");
    const json = cmd.parent?.opts().json || false;
    const interval = parseInt(opts.interval);
    const outputDir = opts.output;

    // Check ffmpeg
    try {
      execSync("which ffmpeg", { stdio: "ignore" });
    } catch {
      console.error("ffmpeg is required for analyze. Install: brew install ffmpeg");
      process.exit(1);
    }

    // Get recording info from Screen Studio
    const info = await withClient(port, async (client) => {
      return client.evaluate<{
        recordingPath: string;
        durationMs: number;
      }>(`
        var p = window.$project;
        if (!p) return { error: 'No project open' };
        return {
          recordingPath: p.recording.recordingPath,
          durationMs: Math.round(p.recording.durationMs),
        };
      `);
    });

    // Find the video file — channel number varies per recording
    const { readdirSync } = await import("fs");
    const recordingFiles = readdirSync(info.recordingPath);
    const videoFile = recordingFiles.find(
      (f: string) => /^channel-\d+-display-\d+\.mp4$/.test(f),
    );
    if (!videoFile) {
      console.error(`No video file found in: ${info.recordingPath}`);
      process.exit(1);
    }
    const videoPath = `${info.recordingPath}/${videoFile}`;

    // Create output directory
    if (!existsSync(outputDir)) mkdirSync(outputDir, { recursive: true });

    // Build ffmpeg command
    const fromSec = opts.from ? parseInt(opts.from) / 1000 : 0;
    const toSec = opts.to ? parseInt(opts.to) / 1000 : info.durationMs / 1000;

    const ffmpegArgs = [
      "-i",
      `${shq(videoPath)}`,
      "-ss",
      String(fromSec),
      "-to",
      String(toSec),
      "-vf",
      `fps=1/${interval},scale=640:-1`,
      "-q:v",
      "3",
      `${shq(`${outputDir}/frame_%03d.jpg`)}`,
      "-y",
    ];

    console.log("Extracting frames...");
    execSync(`ffmpeg ${ffmpegArgs.join(" ")} 2>/dev/null`, { stdio: "ignore" });

    // Read event data
    const keystrokesPath = `${info.recordingPath}/keystrokes-0.json`;
    const mouseclicksPath = `${info.recordingPath}/mouseclicks-0.json`;

    let keystrokes: Array<{ processTimeMs: number; character: string; type: string }> = [];
    let mouseclicks: Array<{ processTimeMs: number; button: string; x: number; y: number }> = [];

    if (existsSync(keystrokesPath)) {
      keystrokes = JSON.parse(readFileSync(keystrokesPath, "utf-8"));
    }
    if (existsSync(mouseclicksPath)) {
      mouseclicks = JSON.parse(readFileSync(mouseclicksPath, "utf-8"));
    }

    // Build timeline
    const frames: Array<{
      frame: number;
      timeMs: number;
      file: string;
      keystrokes: Array<{ timeMs: number; character: string; type: string }>;
      mouseclicks: Array<{ timeMs: number; button: string; x: number; y: number }>;
    }> = [];

    const startMs = opts.from ? parseInt(opts.from) : 0;
    let frameNum = 1;

    while (true) {
      const timeMs = startMs + (frameNum - 1) * interval * 1000;
      if (timeMs > (opts.to ? parseInt(opts.to) : info.durationMs)) break;

      const file = `${outputDir}/frame_${String(frameNum).padStart(3, "0")}.jpg`;
      if (!existsSync(file)) break;

      const windowStart = timeMs;
      const windowEnd = timeMs + interval * 1000;

      frames.push({
        frame: frameNum,
        timeMs,
        file,
        keystrokes: keystrokes
          .filter((k) => k.processTimeMs >= windowStart && k.processTimeMs < windowEnd)
          .map((k) => ({ timeMs: Math.round(k.processTimeMs), character: k.character, type: k.type })),
        mouseclicks: mouseclicks
          .filter((m) => m.processTimeMs >= windowStart && m.processTimeMs < windowEnd)
          .map((m) => ({ timeMs: Math.round(m.processTimeMs), button: m.button, x: Math.round(m.x), y: Math.round(m.y) })),
      });

      frameNum++;
    }

    if (json) {
      output({ frames, totalKeystrokes: keystrokes.length, totalMouseclicks: mouseclicks.length }, true);
    } else {
      console.log(`Extracted ${frames.length} frames to ${outputDir}/`);
      console.log(`Recording: ${keystrokes.length} keystrokes, ${mouseclicks.length} mouse clicks`);
      console.log();

      for (const f of frames) {
        const events: string[] = [];
        for (const k of f.keystrokes) {
          events.push(`key:${k.character || k.type}@${k.timeMs}ms`);
        }
        for (const m of f.mouseclicks) {
          events.push(`click:${m.button}@${m.timeMs}ms(${m.x},${m.y})`);
        }

        console.log(
          `Frame ${f.frame} (${(f.timeMs / 1000).toFixed(1)}s): ${f.file}` +
            (events.length > 0 ? `\n  Events: ${events.join(", ")}` : ""),
        );
      }
    }
  });
