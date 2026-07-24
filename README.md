# screenstudio-agent

Drive [Screen Studio](https://www.screen.studio/) from the command line, so an AI agent can record and edit your screen without you at the keyboard.

A fork of [ShawnPana/screenstudio-cli](https://github.com/ShawnPana/screenstudio-cli), rebuilt around one requirement: **an agent has to be able to tell whether the recording actually worked.**

繁體中文版：[README.zh-TW.md](README.zh-TW.md)

---

## Why this fork exists

I make a lot of screen recordings — product walkthroughs, workshop material, demo footage for client videos. The recording itself is the boring part. Arrange the windows, hit record, talk, stop, wait, find the file.

That is work an agent should do. Screen Studio has no automation surface of its own — no AppleScript, no URL scheme, no CLI — so Shawn Pana's project, which drives it over the Chrome DevTools Protocol, was the way in.

It worked. But it was built for a person watching the screen, and an agent is not watching the screen.

## What changed, and why

Upstream sends each recording command to the app, throws the reply away, and prints success:

```js
bridge.client.mutation("capture.finish").then(function() {}).catch(function() {});
// ...then, unconditionally:
output({ success: true, message: "Recording stopped and saved" });
```

That empty `.catch()` swallows every error. A failed stop still reported "Recording stopped and saved". If you are sitting there, you notice. If an agent is running unattended, it reports a finished video that does not exist.

| | Upstream | Here |
|---|---|---|
| `record stop` | Always prints success | Waits for the app's real reply, then waits for the `.screenstudio` bundle to appear on disk and stop growing. Returns the file path and captured duration. Exits non-zero if nothing saved. |
| `record start` | Returns ~4.2s before the first frame, so `sleep 10` between start and stop captured ~6s of footage | `--wait` returns only once capture is rolling. A 10s ask captures 9.97s. |
| `record pause` / `resume` / `cancel` | Always print success | Surface real failures |
| Closing the debug port | No way to. `launch` opens it; nothing closes it | `quit` closes the app and verifies the port is shut |
| Shell arguments | Double-quoted, so `$(...)` in a filename executes | Single-quoted |

### Verifying by outcome, not by asking

Screen Studio has no "am I recording?" query. Every plausible name comes back empty:

```
capture.state · capture.status · capture.getState · capture.isRecording
capture.info  · capture.current · capture.get     · recording.state
→ "No query-procedure on path"
```

So `record stop` does not ask the app whether it worked. It watches for the artifact the app is supposed to produce — the project bundle appearing on disk and settling — and reports that. Slower, but it cannot lie, and it does not break when the next release renames its internals.

```json
{
  "success": true,
  "project": "/Users/you/Screen Studio Projects/Built-in Retina Display ....screenstudio",
  "capturedSeconds": 9.97
}
```

## Requirements

- macOS
- Screen Studio — verified against **3.7.3-4475** on macOS 26.5.1
- Node.js 21 or later, for the built-in WebSocket
- ffmpeg and ffprobe, for `render` and `analyze` — `brew install ffmpeg`
- Accessibility permission for your terminal, so window and display detection can read the screen

## Install

```bash
git clone https://github.com/HyperfocuSam/screenstudio-agent.git
cd screenstudio-agent
npm install
npx tsc
ln -s "$PWD/bin/screenstudio.js" ~/.local/bin/screenstudio   # or anywhere on your PATH
```

Not published to npm. Clone it, read it, build it — you should own the code that drives an app which can record your screen.

## Quick start

```bash
screenstudio launch                              # opens Screen Studio with the debug port on
screenstudio record displays                     # what can I record?
screenstudio record start --display 0 --wait     # returns when capture is actually rolling
sleep 30
screenstudio record stop                         # returns the saved project path
screenstudio quit                                # closes the app AND the port
```

## Security

This works by launching Screen Studio with `--remote-debugging-port=9222`. Know what that means before you use it.

**Verified on 3.7.3-4475:**

- The port binds to `127.0.0.1` only. Nothing on your network can reach it.
- Screen Studio's window has Node integration disabled — `require`, `process`, `module` and `__dirname` are all undefined. Reaching the port does not give anyone a shell.
- But the `electronTRPC` preload bridge to the app's privileged main process is reachable. Any local process can drive Screen Studio while the port is open, including starting a recording.

So: **always finish with `screenstudio quit`.** It exits non-zero if the port is still open, so a script can depend on it. Open the port for the job, not for the day.

Nothing here phones home. One runtime dependency (`commander`), no install scripts, and every network call goes to localhost.

---

## Commands

### Recording

```bash
screenstudio record displays                                  # list displays with visible apps
screenstudio record windows                                   # list windows with titles
screenstudio record start --display 0 --wait                  # record a display, wait for capture
screenstudio record start --app Terminal                      # record display containing app
screenstudio record start --mode window --title "YouTube"     # record specific window by title
screenstudio record pause                                     # pause
screenstudio record resume                                    # resume
screenstudio record stop                                      # stop, save, verify, return the path
screenstudio record stop --no-verify                          # skip the disk check
screenstudio record cancel                                    # stop and discard
```

`record displays` shows what apps are on each display, so you always record the right one. `--app` auto-detects which display contains the target app. Window mode uses AppleScript to match by window title.

Recordings are found by scanning `~/*Screen Studio Projects*`. If you save elsewhere, set `SCREENSTUDIO_PROJECTS_DIR`.

### Timeline (slices)

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
screenstudio zoom add 0 --level 2 --end 50000 --id my_zoom   # add with custom ID
screenstudio zoom add 0 --level 2 --x 0.3 --y 0.8            # with target point
screenstudio zoom remove <id>                                # remove by ID
screenstudio zoom update <id> --level 3 --x 0.5 --y 0.5      # update properties
screenstudio zoom split <id> 25000                           # split at timestamp
screenstudio zoom set '[{...}, {...}]'                       # replace all at once
```

Zoom operations use `scene.update({ zoomRanges })` internally, which is reliable — unlike Screen Studio's built-in `addZoomRangeAt()`, which can overwrite adjacent ranges.

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
screenstudio config backgroundColor "#FF0000"         # write (updates the UI immediately)
```

### Preview and verification

```bash
screenstudio preview                                  # screenshot the preview canvas
screenstudio preview --at 5000 --open                 # seek to 5s, capture, open it
screenstudio seek 10000                               # move the playhead
screenstudio render --fps 10 --from 3000 --to 6000    # render zoomed frames via ffmpeg
screenstudio analyze --interval 2                     # extract frames + event timeline
```

An agent cannot watch a video. These commands are how it checks its own work — render the range you just edited, look at the frames, confirm the change landed.

### Project

```bash
screenstudio project info        # name, duration, dirty state
screenstudio project save
screenstudio project undo        # undo last CLI mutation
screenstudio project redo
```

### Export

```bash
screenstudio export                  # opens the export dialog (Cmd+Shift+E)
screenstudio export --clipboard      # quick export to clipboard
```

### Raw execution

```bash
screenstudio exec '$project.name'
screenstudio exec --file script.js
echo '$projects.size' | screenstudio exec -
```

### App lifecycle

```bash
screenstudio launch              # start with the debug port open
screenstudio launch --port 9333  # custom port
screenstudio status              # is it connected, and what is open?
screenstudio quit                # quit and confirm the port is closed
screenstudio quit --force        # escalate if it will not go quietly
```

## Global flags

- `--json` — structured JSON output. Put it before the command: `screenstudio --json state`
- `--port <n>` — CDP port, default 9222

## Key internals

**`$project` vs `$projects`** — the CLI uses `window.$project`, the active project, not the first entry of `$projects`. That way the right project is targeted when several are open.

**Finding the record buttons** — recording is triggered by walking React's fiber tree for components labelled "Record display", "Record window" and "Record area", then calling their `onClick`. Confirmed present on 3.7.3-4475. More durable than CSS selectors, which are generated fresh on every app build.

**Knowing when capture starts** — the recording picker spawns extra CDP pages. `--wait` polls until the page count stabilises, then waits a measured settle. It waits for *stability* rather than a specific count, so it survives a different number of displays.

**Undo** — every mutation calls `p.history.update()` first, so `screenstudio project undo` reverses any CLI edit.

**Speed** — Screen Studio stores `timeScale = 1/speed` internally, so 4x is `timeScale: 0.25`. `slice speed` converts for you; pass the speed you want.

**Video file naming** — recordings can be `channel-1-display-0.mp4` or `channel-2-display-0.mp4`. The CLI globs `channel-*-display-*.mp4` to find the right one.

## Agent skill

`skills/screenstudio-cli/SKILL.md` is a skill file for Claude Code and similar agents. Copy the folder into `~/.claude/skills/` and the agent learns the command set, the mandatory `quit`, and the "watch, edit, watch again" method — render the frames before you change something and again after, because the agent cannot see the video.

`references/demo.md` covers recording a terminal and browser side by side, including the zoom grid for framing.

---

## How this was built

This fork is also a record of how I work with an agent. The audit, the fork, the fixes and the tests were one session with Claude Code. What made it work was not asking for code. It was refusing to accept claims.

**Check the supply chain before you install, not after.** Reading a GitHub repo tells you nothing about what npm actually ships — they are two separate artifacts. So clone the source, build it, and diff the result against the published package.

```
npm ci --ignore-scripts && npx tsc
diff -rq rebuilt/dist  published/dist
→ identical
```

Ninety seconds, and the question is settled instead of assumed.

**Test the security boundary, do not reason about it.** "It opens a debug port" could mean anything from harmless to full remote code execution. The answer came from launching the app and reading its internals: port bound to localhost, Node integration off, IPC bridge live. That is a specific finding you can act on, not a vague worry.

**Measure, do not estimate.** The first recording came out short. Rather than guessing at a delay, we timed it — 13 seconds of wall clock produced 8.83 seconds of footage, 6 seconds produced 1.39. A consistent 4.2 seconds of lead-in, which then had a real fix instead of a magic number.

**Distrust the first answer, including your own.** The agent told me recording would probably be broken on this version, and gave a reason. Both the reason and the mechanism were wrong; the code never referenced the thing it claimed was missing. Testing took two minutes and corrected the record. An agent that cannot say "I was wrong about that" is worse than no agent.

**Verify by outcome.** Every fix here comes back to the same idea. Do not ask the system whether it succeeded. Look at what it was supposed to produce, and check whether it is there.

---

## Credit

Built on [ShawnPana/screenstudio-cli](https://github.com/ShawnPana/screenstudio-cli) by Shawn Pana — the CDP approach, the command surface and the editing model are his work. MIT licensed, and this fork stays MIT.

Screen Studio is a commercial app by Adam Pietrasiak. This project is not affiliated with it or endorsed by it, and it drives the app through an unsupported debugging interface that may break on any update.

## License

MIT. See [LICENSE](LICENSE).
