# Agent workflow

The three accompanying skills teach recording, editing and delivery. Use the returned capabilities and schemas as the operational contract.

## Visible native interaction

Inspect an actual source window, screenshot it, focus it with a fresh observation, then inspect again. Every action consumes its token. Coordinates are local points including the title bar, not desktop coordinates or screenshot pixels.

Example: a 2400-pixel-wide screenshot represents a 1200-point-wide window. A button at pixel (1800,1000) is point (900,500). The helper adds the window's desktop origin. A moved window invalidates the previous observation.

## Source editing

Read a copied project and its revision. This edit retains two source intervals:

```json
{
  "projectPath": "/your/projects/Edited.screenstudio",
  "expectedRevision": "<revision from project read>",
  "edit": {
    "type": "slices",
    "sceneId": "<scene from project read>",
    "slices": [
      {"startMs": 1000, "endMs": 5000, "speed": 1},
      {"startMs": 8000, "endMs": 12000, "speed": 2}
    ]
  }
}
```

Final duration is six seconds. A zoom's interval is still source time; a preview uses final playback time. Config changes use supported dotted nested keys, for example `cursor.size`, `output.aspectRatio`, `styles.background.color`. This is an allowlist, not an arbitrary object path writer.

## Recovery and delivery

After a timeout, inspect state before repeating a change. On recording failure, finish normally to preserve footage. Keep the returned project and duplicate it before editing. On stale revisions, reread and reconsider. Checkpoints restore editing data using the current revision.

Poll an export until completed. Completion includes a real output file and encoded properties. Inspect start, middle, end and transitions through preview. If the intended action, zoom or privacy is wrong, fix the project and render to a new destination.
