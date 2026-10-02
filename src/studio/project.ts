import { createHash, randomUUID } from "node:crypto";
import { z } from "zod";
const n = z.number().finite();
const unit = n.min(0).max(1);
export const configFields: Record<string, z.ZodType> = {
  "cursor.size": n.min(8).max(256),
  "cursor.hide": z.boolean(),
  "cursor.rotationMode": z.enum(["velocity", "none"]),
  "cursor.hideNotMovingAfterMs": n.min(0).nullable(),
  "cursor.clickEffect": z.union([
    z.null(),
    z.object({ type: z.literal("circle") }).strict(),
    z
      .object({ type: z.literal("ripple"), pullSize01: unit.optional() })
      .strict(),
  ]),
  "captions.enableTranscript": z.boolean(),
  "captions.enableShortcuts": z.boolean(),
  "captions.showSoundLabels": z.boolean(),
  "captions.sizeRatio": n.min(0.01).max(0.25),
  "captions.color": z.string().regex(/^#[0-9a-fA-F]{6,8}$/),
  "audio.volume": n.min(0).max(2),
  "audio.muteMicrophone": z.boolean(),
  "audio.muteSystemAudio": z.boolean(),
  "audio.backgroundAudioVolume": unit,
  "audio.muteBackgroundAudio": z.boolean(),
  "camera.hide": z.boolean(),
  "camera.mirror": z.boolean(),
  "camera.enableFaceTracking": z.boolean(),
  "camera.grain": unit,
  "camera.sharpen01": unit,
  "camera.lutIntensity": unit,
  "camera.background.blurAmount01": unit,
  "processing.improveRecordingQuality01": unit,
  "zooms.startAnimationEarly": z.boolean(),
  "animations.motionBlurAmount": n.min(0).max(2),
  "defaultLayout.type": z.enum([
    "camera-overlay",
    "split-screen",
    "cutout-camera",
  ]),
  "styles.screenBorderRadius": n.min(0).max(200),
  "styles.cameraBorderRadiusRatio01": unit,
  "styles.background.type": z.enum(["color", "gradient", "system"]),
  "styles.background.color": z.string().regex(/^#[0-9a-fA-F]{6,8}$/),
  "styles.background.blur": n.min(0).max(100),
  "styles.shadow.intensity": unit,
  "output.paddingRatio01": n.min(0).max(0.4),
  "output.aspectRatio": z.union([z.literal("auto"), n.min(0.2).max(5)]),
  "output.avoidEmptyZoomArea": z.boolean(),
};
export const editSchema = z.discriminatedUnion("type", [
  z
    .object({
      type: z.literal("config"),
      changes: z
        .record(z.string(), z.unknown())
        .refine(
          (v) => Object.keys(v).length > 0 && Object.keys(v).length <= 50,
        ),
    })
    .strict(),
  z
    .object({
      type: z.literal("slices"),
      sceneId: z.string(),
      slices: z
        .array(
          z
            .object({
              startMs: n.min(0),
              endMs: n.min(0),
              speed: n.min(0.1).max(16),
            })
            .strict(),
        )
        .min(1)
        .max(500),
    })
    .strict(),
  z
    .object({
      type: z.literal("zoom"),
      sceneId: z.string(),
      startMs: n.min(0),
      endMs: n.min(0),
      zoom: n.min(1).max(8),
      presentation: z.enum(["screen", "loupe"]),
      target: z.object({ x: unit, y: unit }).strict().optional(),
    })
    .strict(),
  z
    .object({
      type: z.literal("removeZoom"),
      sceneId: z.string(),
      zoomId: z.string(),
    })
    .strict(),
]);
export type Edit = z.infer<typeof editSchema>;
export function revision(data: unknown): string {
  return createHash("sha256").update(JSON.stringify(data)).digest("hex");
}
export function applyEdit(project: any, input: unknown): any {
  const edit = editSchema.parse(input);
  if (project.version !== "4.0.0")
    throw new Error(
      "Project schema is unsupported; this adapter supports 4.0.0.",
    );
  const p = structuredClone(project);
  if (edit.type === "config") {
    for (const [key, value] of Object.entries(edit.changes)) {
      if (!Object.hasOwn(configFields, key))
        throw new Error(`Unsupported config key: ${key}`);
      const validated = configFields[key].parse(value);
      const parts = key.split(".");
      let target = p.config;
      for (const part of parts.slice(0, -1)) {
        if (!target || !Object.hasOwn(target, part))
          throw new Error(`Missing config group: ${key}`);
        target = target[part];
      }
      const last = parts.at(-1)!;
      if (!target || !Object.hasOwn(target, last))
        throw new Error(`Missing config field: ${key}`);
      target[last] = validated;
    }
    return p;
  }
  const scene = p.scenes.find((s: any) => s.id === edit.sceneId);
  if (!scene) throw new Error("Scene does not exist.");
  const duration = Math.max(...scene.slices.map((s: any) => s.sourceEndMs));
  const interval = (start: number, end: number) => {
    if (end <= start || end > duration)
      throw new Error(
        "Source interval must be positive and inside the current scene source range.",
      );
  };
  if (edit.type === "slices") {
    let previous = 0;
    scene.slices = edit.slices.map((s, i) => {
      interval(s.startMs, s.endMs);
      if (s.startMs < previous)
        throw new Error("Slices must be ordered and non-overlapping.");
      previous = s.endMs;
      return {
        ...scene.slices[Math.min(i, scene.slices.length - 1)],
        id: randomUUID(),
        sourceStartMs: s.startMs,
        sourceEndMs: s.endMs,
        timeScale: 1 / s.speed,
      };
    });
  } else if (edit.type === "zoom") {
    interval(edit.startMs, edit.endMs);
    scene.zooms.push({
      id: randomUUID(),
      zoom: edit.zoom,
      type: edit.target ? "manual" : "follow-click-groups",
      manualTargetPoint: edit.target ?? { x: 0.5, y: 0.5 },
      isDisabled: false,
      sourceStartMs: edit.startMs,
      sourceEndMs: edit.endMs,
      hasInstantAnimation: false,
      presentation: edit.presentation,
      loupeOptions: {
        radius01: 0.2,
        bevelRatio: 0.1,
        chromaticAberration: 0,
        hasGlassOptics: true,
      },
    });
  } else {
    if (!scene.zooms.some((v: any) => v.id === edit.zoomId))
      throw new Error("Zoom does not exist.");
    scene.zooms = scene.zooms.filter((v: any) => v.id !== edit.zoomId);
  }
  return p;
}
