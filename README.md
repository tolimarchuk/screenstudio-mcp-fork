# screenstudio-cli

Control [Screen Studio](https://www.screen.studio/) from the command line. No plugins, no extensions — direct WebSocket connection to the Electron app's MobX state via Chrome DevTools Protocol.

Record, edit, and export Screen Studio projects entirely from the terminal. Built for AI agents (Claude Code, Codex, etc.) to automate screen recording workflows end-to-end.

## How It Works

Screen Studio is an Electron app. Launching it with `--remote-debugging-port=9222` exposes Chrome DevTools Protocol, giving direct access to its React/MobX internals. This CLI connects via WebSocket and can:

- Read full project state (slices, zooms, config, recording metadata)
- Mutate the timeline (split, trim, remove, speed up, merge)
- Control zoom ranges (add, remove, split, update position/level)
- Manage masks for blurring sensitive content
- Start/stop/pause recordings programmatically
- Seek, preview, and render frames for verification
- Export the final video

All mutations push to Screen Studio's undo history, so every change is reversible with `screenstudio project undo`.

## Requirements

- **Node.js** >= 21 (for built-in WebSocket)
- **Screen Studio** (macOS)
- **ffmpeg** (for `render` and `analyze` commands) — `brew install ffmpeg`

## Install

```bash
npm install -g screenstudio-cli
```

Or from source:

```bash
git clone https://github.com/ShawnPana/screenstudio-cli.git
cd screenstudio-cli
npm install
npm run build
npm link
```

## Quick Start

```bash
# Launch Screen Studio with CDP enabled
screenstudio launch

# Open a project
open ~/Screen\ Studio\ Projects/MyRecording.screenstudio

# Check connection
screenstudio status
# → Connected to Screen Studio 3.6.0 | Project: MyRecording | Duration: 29.3s | 5 slices

# Read project state
screenstudio state
screenstudio state --json    # full structured dump

# Edit the timeline
screenstudio slice list
screenstudio slice split 15000           # split at 15s
screenstudio slice speed 0 2             # 2x speed on slice 0
screenstudio slice remove --from 6000 --to 8000   # cut a section

# Add a zoom
screenstudio zoom add 0 --end 30000 --level 2 --x 0.5 --y 0.5 --id my_zoom

# Preview
screenstudio preview --at 5000 -o /tmp/check.png --open

# Export
screenstudio export
```

## Commands

### Recording

```bash
screenstudio record displays                                 # list displays with visible apps
screenstudio record windows                                  # list windows with titles
screenstudio record start --app Terminal                      # record display containing app
screenstudio record start --mode window --title "YouTube"     # record specific window by title
screenstudio record pause                                    # pause recording
screenstudio record resume                                   # resume
screenstudio record stop                                     # stop and save
screenstudio record cancel                                   # stop and discard
```

`record displays` shows what apps are on each display, so you always record the right one. `--app` auto-detects which display contains the target app. Window mode uses AppleScript to match by window title.

### Timeline (Slices)

```bash
screenstudio slice list                              # show all slices
screenstudio slice split 15000                       # split at 15s (source ms)
screenstudio slice remove 2                          # remove slice by index
screenstudio slice remove --from 6000 --to 8000      # remove a time range
screenstudio slice speed 0 2.0                       # set slice 0 to 2x speed
screenstudio slice merge 1                           # merge slice 1 with next
screenstudio slice trim 0 --start 2000 --end 10000   # adjust boundaries directly
```

### Zooms

```bash
screenstudio zoom list                                       # show all zoom ranges
screenstudio zoom add 0 --level 2 --end 50000 --id my_zoom  # add with custom ID
screenstudio zoom add 0 --level 2 --x 0.3 --y 0.8           # with target point
screenstudio zoom remove <id>                                # remove by ID
screenstudio zoom update <id> --level 3 --x 0.5 --y 0.5     # update properties
screenstudio zoom split <id> 25000                           # split at timestamp
screenstudio zoom set '[{...}, {...}]'                       # replace all at once
```

Zoom operations use `scene.update({ zoomRanges })` internally, which is reliable — unlike Screen Studio's built-in `addZoomRangeAt()` which can overwrite adjacent ranges.

### Masks

```bash
screenstudio mask list
screenstudio mask add 0 10000 --x 100 --y 200 --width 400 --height 50 --blur 20
screenstudio mask update <id> --x 150 --width 500
screenstudio mask remove <id>
screenstudio mask clear
```

### Config

```bash
screenstudio config --list                            # all 68 config keys
screenstudio config backgroundColor                   # read a value
screenstudio config backgroundColor "#FF0000"          # write (updates UI immediately)
```

### Preview & Verification

```bash
screenstudio preview                         # screenshot the preview canvas
screenstudio preview --at 5000 --open        # seek to 5s, capture, open in Preview.app
screenstudio seek 10000                      # move playhead
screenstudio render --fps 10 --from 3000 --to 6000   # render zoomed frames via ffmpeg
screenstudio analyze --interval 2            # extract frames + event timeline
```

### Project

```bash
screenstudio project info        # name, duration, dirty state
screenstudio project save
screenstudio project undo        # undo last CLI mutation
screenstudio project redo
```

### Export

```bash
screenstudio export                  # opens export dialog (Cmd+Shift+E)
screenstudio export --clipboard      # quick export to clipboard
```

### Raw Execution

```bash
screenstudio exec '$project.name'
screenstudio exec --file script.js
echo '$projects.size' | screenstudio exec -
```

## Global Flags

All commands support:
- `--json` — structured JSON output (put before the command: `screenstudio --json state`)
- `--port <n>` — CDP port (default 9222)

## Key Internals

**`$project` vs `$projects`**: The CLI uses `window.$project` (the active/focused project), not `Array.from($projects.values())[0]`. This ensures the correct project is targeted when multiple are open.

**Undo support**: Every mutation calls `p.history.update()` before making changes, so `screenstudio project undo` reliably reverses any CLI edit.

**Speed**: Screen Studio uses `timeScale` internally where `timeScale = 1/speed`. So 4x speed = `timeScale: 0.25`. The `slice speed` command handles this conversion — just pass the speed you want.

**Zoom operations**: All zoom add/remove/split/update operations serialize the full zoom array and call `scene.update({ zoomRanges })`. This avoids `addZoomRangeAt()` which can overwrite adjacent ranges and cause ID collisions.

**Video file naming**: Recording video files can be `channel-1-display-0.mp4` or `channel-2-display-0.mp4`. The CLI dynamically finds the correct file by globbing `channel-*-display-*.mp4`.

## AI Agent Skill

The `skills/screenstudio-cli/` directory contains a SKILL.md that AI agents (Claude Code, Codex, etc.) can load to learn how to use the CLI. It includes:

- Full command reference
- The "Watch → Edit → Watch" methodology
- Coordinate system documentation
- Crash prevention rules

The `skills/screenstudio-cli/references/demo.md` guide covers end-to-end demo recording and editing with a terminal + browser side-by-side layout, including the 2x zoom grid system for framing content.

## License

MIT

---

## Sam's fork (branch `sam-fork`)

Forked 2026-07-24 from upstream `f34aacc`. Verified against Screen Studio
3.7.3-4475 on macOS 26.5.1. Installed via symlink at `~/.local/bin/screenstudio`
— NOT from npm. Edit `src/`, run `npx tsc`, done.

Upstream's recording commands fire their tRPC mutation and print success
unconditionally, so a failed stop still reported "Recording stopped and saved".
Changes here:

- **`quit`** (new) — quits Screen Studio and confirms the debug port is closed.
  Upstream can only open the port, never close it. Exits non-zero if it is still
  open. `--force` escalates to `pkill`.
- **`record stop`** — awaits the mutation, then waits for the `.screenstudio`
  bundle to appear on disk and stop growing. Returns the real `project` path and
  `capturedSeconds`; exits non-zero if nothing saved. `--no-verify` opts out.
- **`record start --wait`** — returns only once capture is actually rolling.
  Upstream returns ~4s early, so `sleep 10` between start and stop captured only
  ~6s. With `--wait`, a 10s ask captures 9.97s.
- **`record pause` / `resume` / `cancel`** — surface real errors.
- **`CDPClient.evaluateAwait()`** — evaluates with CDP `awaitPromise`, so bridge
  rejections propagate instead of being swallowed.
- **Shell quoting** (`src/util/shell.ts`) — every interpolated path passed to
  ffmpeg/ffprobe/open is single-quoted. Upstream used double quotes, which still
  let `$(...)` execute.

### Security

The debug port is bound to localhost and Screen Studio's renderer has Node
integration disabled (verified: `require`, `process`, `module` are all
undefined), so reaching the port is not a shell. But the `electronTRPC` preload
bridge to the privileged main process is reachable, which means any local
process can drive the app — including starting a recording — for as long as the
port is open. Always finish with `screenstudio quit`.
