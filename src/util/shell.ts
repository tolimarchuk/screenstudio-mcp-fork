/**
 * Wrap a value in single quotes for safe use inside a /bin/sh command string.
 *
 * Several commands build shell strings by interpolation (ffmpeg, ffprobe,
 * open). Any path containing a space, quote or $(...) would otherwise be
 * re-interpreted by the shell.
 */
export function shq(value: string): string {
  return `'${String(value).replace(/'/g, `'\\''`)}'`;
}
