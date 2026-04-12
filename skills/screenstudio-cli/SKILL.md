# screenstudio-cli

Control Screen Studio from the command line via Chrome DevTools Protocol. No plugins, no extensions — direct WebSocket connection to the Electron app's MobX state.

## Setup

Screen Studio must be launched with the debug port enabled:

```bash
screenstudio launch              # kills existing instance, relaunches with CDP on port 9222
screenstudio launch --port 9333  # custom port
```

Then open a project — either from Screen Studio's UI or:

```bash
open "/path/to/recording.screenstudio"
```

Verify with `screenstudio status`.

## Editing Method: Watch → Edit → Watch

Every edit follows the same loop: **watch the section first, make the change, then watch it again to confirm it worked.** Don't edit blind — you need visual context before and after every mutation.

1. **Watch** — Render or preview the time range you're about to edit. Use `screenstudio render --from <start> --to <end> --fps 10` to extract frames with zoom crop applied, or `screenstudio preview --at <ms>` for a quick single-frame check. Look at the frames to understand what's currently happening in that section.

2. **Edit** — Make the mutation (slice, zoom, mask, config change, etc.).

3. **Watch again** — Re-render the same time range and verify the edit looks correct. Compare before and after. If something is off, adjust and re-verify.

This loop applies to every type of edit:
- **Cutting a section**: render frames around the cut point before and after to confirm the right content was removed
- **Adjusting zoom**: render the zoomed section to verify the subject is in frame and the framing looks natural
- **Adding masks**: preview at multiple timestamps within the mask's time range to confirm coverage
- **Changing config**: preview to see the visual effect

The key insight is that you cannot see the video — you can only see extracted frames. Render at high enough FPS (10-15) to catch issues that sparse sampling would miss, especially for motion-heavy content or precise framing.

**Use subagents for frame analysis.** Rendered frames can number in the dozens or hundreds. Rather than reading them all in your main context (which burns context window fast), spawn a subagent to read and analyze the frames. Give it specific questions: "Is the character in frame?", "At what frame does the scene change?", "Are there any frames where the subject is cut off?" The subagent reports back a concise summary, keeping your main context clean for decision-making and edits.

## Core Workflow

The CLI has three layers:

1. **Read** — understand what you're working with
2. **Mutate** — change the project
3. **Verify** — check the result visually

### 1. Read State

Always start by reading the full project state:

```bash
screenstudio state --json    # full structured dump — project, config, slices, zooms, recording
screenstudio state           # human-readable summary
```

For specific sections:

```bash
screenstudio state --slices      # timeline segments with timing and speed
screenstudio state --zooms       # zoom ranges with positions
screenstudio state --config      # all 68 visual settings
screenstudio state --recording   # recording metadata, keystroke/mouse event counts
```

### 2. Mutate

#### Timeline Slices

Slices are segments of the recording timeline. Each has a source time range, playback speed, and volume.

```bash
screenstudio slice list                              # show all slices
screenstudio slice split 15000                       # split at 15s (source time in ms)
screenstudio slice remove 2                          # remove slice by index
screenstudio slice remove --from 6000 --to 8000      # remove a time range (auto-splits boundaries)
screenstudio slice speed 0 2.0                       # set slice 0 to 2x speed
screenstudio slice merge 1                           # merge slice 1 with next
screenstudio slice trim 0 --start 2000               # move slice 0's start to 2s
screenstudio slice trim 0 --end 10000                # move slice 0's end to 10s
screenstudio slice trim 0 --start 2000 --end 10000   # adjust both boundaries
```

The `remove --from --to` command is the most powerful — it handles splitting at both boundaries and removing everything in between. Use source time in milliseconds.

#### Zoom Ranges

Zoom ranges control camera position and magnification. Each has an ID, time range, zoom level, and target point (x, y normalized 0-1).

```bash
screenstudio zoom list                                       # show all zoom ranges
screenstudio zoom add 0 --level 2.5 --end 50000              # full-video zoom
screenstudio zoom add 0 --level 2 --end 50000 --id my_zoom  # with custom ID
screenstudio zoom add 0 --level 2 --x 0.3 --y 0.8           # with target point
screenstudio zoom remove <id>                                # remove by ID
screenstudio zoom update <id> --level 3                      # change magnification
screenstudio zoom update <id> --x 0.45 --y 0.82              # move camera target
screenstudio zoom update <id> --y 0.78                       # adjust just vertical (preserves x)
screenstudio zoom update <id> --start 0 --end 50000          # change time range
screenstudio zoom update <id> --speed 1.5                    # change glide speed
screenstudio zoom update <id> --disable                      # disable zoom range
screenstudio zoom update <id> --enable                       # enable zoom range
screenstudio zoom split <id> 25000                           # split zoom at 25s (inherits properties)
screenstudio zoom set '[{...}, {...}]'                       # replace all zooms at once (JSON array)
```

**Coordinate system:** `manualTargetPoint` is normalized (0-1) relative to the full recording frame (e.g., 2560x1353). x=0 is left edge, x=1 is right edge, y=0 is top, y=1 is bottom. If the recording has letterbox bars, account for them — the content area is a subset of the full frame.

#### Masks

Masks blur sensitive data in the recording. Bounds use recording coordinate space (2560x1353).

```bash
screenstudio mask list                                                              # list all masks
screenstudio mask add 0 10000 --x 100 --y 200 --width 400 --height 50 --blur 20    # add a mask
screenstudio mask update <id> --x 150 --width 500                                   # update bounds (preserves others)
screenstudio mask update <id> --start 0 --end 15000 --blur 30                       # update time range and blur
screenstudio mask remove <id>                                                       # remove by ID
screenstudio mask clear                                                             # remove all masks
```

#### Config

Read or write any of Screen Studio's 68 config keys. Changes apply immediately to the UI.

```bash
screenstudio config backgroundColor                  # read
screenstudio config backgroundColor "#FF0000"         # write
screenstudio config cursorSize 2.0
screenstudio config hideCursor true
screenstudio config --list                            # show all keys and values
```

Values are auto-parsed: numbers, booleans, null, and JSON objects.

#### Project

```bash
screenstudio project info        # name, path, duration, dirty state, undo/redo availability
screenstudio project save        # save to disk
screenstudio project undo        # undo last change
screenstudio project redo
```

### 3. Verify

#### Preview Screenshot

Capture the video preview canvas (just the rendered frame, not the full UI):

```bash
screenstudio preview                         # saves to /tmp/screenstudio-preview.png
screenstudio preview -o ./check.png          # custom output path
screenstudio preview --at 5000               # seek to 5s before capturing
screenstudio preview --at start              # seek to beginning
screenstudio preview --at end                # seek to end
screenstudio preview --open                  # open the image in Preview.app after saving
```

Use this to visually verify zoom positioning, config changes, or any mutation. The screenshot captures just the canvas element from Screen Studio's preview renderer at 2x resolution.

#### Seek

Move the playhead to see different parts of the video:

```bash
screenstudio seek 10000       # jump to 10s
screenstudio seek start       # beginning
screenstudio seek end         # end
```

Combine with preview for a verify loop:

```bash
screenstudio seek 5000 && screenstudio preview -o /tmp/at-5s.png
screenstudio seek 25000 && screenstudio preview -o /tmp/at-25s.png
```

### 4. Rendered Preview Frames

Render frames from the raw video with zoom crop applied, simulating what the viewer sees (without masks/effects but with zoom framing):

```bash
screenstudio render                          # render all frames at 5fps to /tmp/screenstudio-render/
screenstudio render --fps 15                 # higher framerate
screenstudio render --from 3000 --to 6000    # specific time range (source ms)
screenstudio render -o ./frames/             # custom output
```

This uses ffmpeg to extract frames with the active zoom's crop applied. At zoom level Z, the viewport is `(videoWidth/Z, videoHeight/Z)` centered at `(targetX * videoWidth, targetY * videoHeight)`.

### 5. Video Analysis

Extract frames from the raw recording for visual inspection:

```bash
screenstudio analyze                             # frames every 5s + event timeline
screenstudio analyze --interval 2                # denser sampling
screenstudio analyze --from 5000 --to 15000      # specific range
screenstudio analyze -o ./frames/                # custom output directory
```

This extracts frames via ffmpeg and correlates them with keystroke/mouse events from the recording metadata. Use this to understand what's happening in the video before making edits.

The `--json` output pairs each frame with its events — useful for programmatic analysis.

### 6. Raw Execution

For anything the CLI doesn't cover, evaluate arbitrary JavaScript inside Screen Studio:

```bash
screenstudio exec '$project.name'
screenstudio exec --file script.js
echo '$projects.size' | screenstudio exec -
```

Key globals available:
- `$project` — the active/focused project (always use this, not `$projects`)
- `$projects` — MobX ObservableMap of all open projects
- `bridge.client` — tRPC client for IPC (query, mutation, subscription)
- `electronEnv` — app version, flags

Key object methods:
- `project.updateConfig({...})` — update visual config
- `project.serialize()` — get project JSON
- `project.history.update()` — snapshot state for undo (call before any mutation)
- `scene.update({ zoomRanges: [...] })` — replace all zoom ranges at once (preferred over `addZoomRangeAt`)
- `scene.update({ masks: [] })` — clear all masks
- `scene.addMaskAt(timeMs)` — add mask (creates default range)
- `scene.updateMask(id, { startTime, endTime, bounds, blur, type })` — update mask
- `scene.removeMask(id)` — remove mask
- `slice.splitAt(timeMs)` / `slice.remove()` / `slice.mergeWithNext()` — timeline editing
- `slice.update({ sourceStartMs, sourceEndMs, timeScale, volume, hideCursor, ... })` — update slice properties

**Speed note:** Screen Studio uses `timeScale` internally where `timeScale = 1/speed`. So 4x speed = `timeScale: 0.25`, 0.5x speed = `timeScale: 2`. The CLI's `slice speed` command handles this conversion automatically.

### 7. Recording

Start, stop, pause, and cancel recordings from the CLI:

```bash
screenstudio record windows                                  # list windows with titles
screenstudio record displays                                 # list available displays
screenstudio record start                                    # record the default display
screenstudio record start --display 1                        # record display at index 1
screenstudio record start --mode window --title "YouTube"    # record window matching title
screenstudio record start --mode area                        # record an area
screenstudio record pause                                    # pause recording
screenstudio record resume                                   # resume recording
screenstudio record stop                                     # stop and save
screenstudio record cancel                                   # stop and discard
```

`record start` opens Screen Studio's picker overlay, finds the target, and auto-clicks record. For window mode, use `--title` to match by window title substring (uses AppleScript to get actual window titles, then matches to the picker overlay). Use `record windows` to see available windows with their titles.

### 8. Export

```bash
screenstudio export                  # opens export dialog (Cmd+Shift+E)
screenstudio export --clipboard      # quick export to clipboard (Cmd+Alt+C)
```

## Important Notes

### Crash Prevention

Screen Studio can crash if MobX state becomes inconsistent. Follow these rules:

- **Never set properties to null** that should have values (speed, volume, zoom, type). This corrupts the project file.
- **Avoid `resetSlices()`** — it can leave the project in an unrecoverable state.
- **Don't batch too many mutations** in a single eval. Do one operation, verify, then continue.
- **Project auto-saves.** If you corrupt state, it persists to disk. You may need to manually edit `project.json` inside the `.screenstudio` bundle to fix it.

### Coordinate Spaces

There are two coordinate spaces to be aware of:

1. **Recording coordinate space** (2560x1353) — this is what the recording metadata reports as the frame size. Mask `bounds` use this coordinate space.
2. **Video file pixel space** (4096x2164) — the actual dimensions of the raw `.mp4` file. This is larger because of the `recordingScale` factor of 0.625.

The conversion formula:

```
video_pixels = recording_pixels * (1 / recordingScale)
video_pixels = recording_pixels * (1 / 0.625) = recording_pixels * 1.6
```

So 2560 * 1.6 = 4096 and 1353 * 1.6 ≈ 2164.

**Zoom `manualTargetPoint`** uses normalized coordinates (0-1) relative to the full recording frame. x=0 is left edge, x=1 is right edge, y=0 is top, y=1 is bottom. These normalized coordinates work the same regardless of which coordinate space you think in, since they are relative.

**Mask `bounds`** use recording coordinate space (2560x1353), NOT video file pixels. Each mask has a `bounds` array of `{x, y, width, height}` objects in recording pixels.

If the recording has black letterbox bars (e.g., for a square game in a wide recording):
- The content area might only span x=0.22 to x=0.78
- Target x=0.5 centers on the content
- You need to account for the bars when positioning

### Zoom Range Creation

`addZoomRangeAt(time)` creates a small default range (~3 seconds). To create a full-duration zoom, either:
1. Add then update: `screenstudio zoom add 0 --level 2.5 --end 50000`
2. Use `scene.update({ zoomRanges: [...] })` via exec for full control over all properties

### Timeline vs Source Time

- **Source time**: position in the original recording (always in ms)
- **Playback time**: position in the edited output (affected by speed changes and cuts)
- Slice operations (`split`, `remove --from/--to`) use **source time**
- `seek` uses **playback time**

### Global Flags

All commands support:
- `--json` — structured JSON output (put before the command: `screenstudio --json status`)
- `--port <n>` — CDP port (default 9222)

## References

- **[references/demo.md](references/demo.md)** — End-to-end guide for recording and editing a terminal + browser demo. Covers display detection, zoom positions for side-by-side layouts, speed changes, and common issues. Read this when recording a demo with Chrome and a terminal visible.
