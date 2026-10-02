// Failure cases: stale changes, invalid intervals, reversed speed semantics,
// prototype pollution, unsupported fields, and mutation of the original.
import { test } from "node:test";
import assert from "node:assert/strict";
import { applyEdit, revision } from "../dist/studio/project.js";
const project = () => ({
  version: "4.0.0",
  id: "p",
  config: {
    cursor: { size: 48, hide: false },
    output: { aspectRatio: "auto", paddingRatio01: 0.1 },
    camera: { grain: 0 },
  },
  scenes: [
    {
      id: "scene",
      slices: [{ id: "s", sourceStartMs: 0, sourceEndMs: 10000, timeScale: 1 }],
      zooms: [],
      masks: [],
      layouts: [],
      voiceOvers: [],
    },
  ],
  data: { recordingFlags: [] },
});
test("trim and speed use source intervals and inverse timeScale", () => {
  const p = project();
  const n = applyEdit(p, {
    type: "slices",
    sceneId: "scene",
    slices: [{ startMs: 1000, endMs: 9000, speed: 2 }],
  });
  assert.equal(n.scenes[0].slices[0].timeScale, 0.5);
  assert.equal(p.scenes[0].slices[0].sourceStartMs, 0);
  assert.equal(n.scenes[0].slices[0].sourceEndMs, 9000);
});
test("invalid and overlapping source intervals fail before writing", () => {
  for (const slices of [
    [{ startMs: 9000, endMs: 8000, speed: 1 }],
    [{ startMs: 0, endMs: 20000, speed: 1 }],
    [
      { startMs: 0, endMs: 5000, speed: 1 },
      { startMs: 4000, endMs: 6000, speed: 1 },
    ],
  ])
    assert.throws(() =>
      applyEdit(project(), { type: "slices", sceneId: "scene", slices }),
    );
});
test("config preserves unknown fields and rejects unknown keys", () => {
  const p = project();
  const n = applyEdit(p, { type: "config", changes: { "cursor.size": 64 } });
  assert.equal(n.config.cursor.size, 64);
  assert.equal(n.config.camera.grain, 0);
  assert.throws(() =>
    applyEdit(p, { type: "config", changes: { "__proto__.polluted": true } }),
  );
  assert.throws(() =>
    applyEdit(p, { type: "config", changes: { "cursor.size": -1 } }),
  );
});
test("source zoom validates and preserves untouched collections", () => {
  const n = applyEdit(project(), {
    type: "zoom",
    sceneId: "scene",
    startMs: 1000,
    endMs: 5000,
    zoom: 2,
    presentation: "loupe",
  });
  assert.equal(n.scenes[0].zooms[0].presentation, "loupe");
  assert.equal(n.scenes[0].slices.length, 1);
  assert.throws(() =>
    applyEdit(project(), {
      type: "zoom",
      sceneId: "missing",
      startMs: 1,
      endMs: 2,
      zoom: 2,
      presentation: "screen",
    }),
  );
});
test("revision is content based and changes with edits", () => {
  const p = project();
  assert.equal(revision(p), revision(structuredClone(p)));
  assert.notEqual(
    revision(p),
    revision(applyEdit(p, { type: "config", changes: { "cursor.size": 64 } })),
  );
});
test("config inherited names are rejected without prototype changes", () => {
  for (const key of ["toString", "constructor", "__proto__"])
    assert.throws(() =>
      applyEdit(project(), {
        type: "config",
        changes: { [key]: { polluted: true } },
      }),
    );
  assert.equal({}.polluted, undefined);
});
