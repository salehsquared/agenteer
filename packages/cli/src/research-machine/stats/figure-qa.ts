import { createHash } from "node:crypto";
import { existsSync, statSync } from "node:fs";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { inflateSync } from "node:zlib";

export type FigureQaStatus = "pass" | "warning" | "fail";

export interface FigureQaCheck {
  id: string;
  status: FigureQaStatus;
  detail: string;
}

export interface FigureQaItem {
  figureId: string;
  path: string;
  title: string | null;
  caption: string | null;
  altText: string | null;
  xLabel: string | null;
  yLabel: string | null;
  sourceColumns: string[];
  byteSize: number;
  sha256: string | null;
  width: number | null;
  height: number | null;
  nonBlankRatio: number | null;
  sampledColorBuckets: number | null;
  status: FigureQaStatus;
  checks: FigureQaCheck[];
}

export interface FigureQaResult {
  schemaVersion: 1;
  manifestPath: string;
  status: FigureQaStatus;
  summary: string;
  figures: FigureQaItem[];
  checks: FigureQaCheck[];
}

interface RawFigureManifest {
  figures?: Array<Record<string, unknown>>;
}

interface PngAnalysis {
  width: number;
  height: number;
  nonBlankRatio: number | null;
  sampledColorBuckets: number | null;
}

const pngSignature = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);

function byte(buffer: Buffer, index: number): number {
  return buffer[index] ?? 0;
}

function combineStatus(statuses: FigureQaStatus[]): FigureQaStatus {
  if (statuses.includes("fail")) return "fail";
  if (statuses.includes("warning")) return "warning";
  return "pass";
}

function check(id: string, status: FigureQaStatus, detail: string): FigureQaCheck {
  return { id, status, detail };
}

function asString(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value : null;
}

function asStringArray(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === "string" && item.trim().length > 0) : [];
}

function figurePath(rawPath: string, manifestDir: string): string {
  return path.isAbsolute(rawPath) ? rawPath : path.resolve(manifestDir, rawPath);
}

function parsePng(buffer: Buffer): PngAnalysis {
  if (buffer.length < 33 || !buffer.subarray(0, 8).equals(pngSignature)) {
    throw new Error("Not a PNG file.");
  }
  let offset = 8;
  let width: number | null = null;
  let height: number | null = null;
  let bitDepth: number | null = null;
  let colorType: number | null = null;
  const idatChunks: Buffer[] = [];
  while (offset + 12 <= buffer.length) {
    const length = buffer.readUInt32BE(offset);
    const type = buffer.subarray(offset + 4, offset + 8).toString("ascii");
    const dataStart = offset + 8;
    const dataEnd = dataStart + length;
    if (dataEnd + 4 > buffer.length) break;
    const data = buffer.subarray(dataStart, dataEnd);
    if (type === "IHDR") {
      width = data.readUInt32BE(0);
      height = data.readUInt32BE(4);
      bitDepth = data.readUInt8(8);
      colorType = data.readUInt8(9);
    } else if (type === "IDAT") {
      idatChunks.push(Buffer.from(data));
    } else if (type === "IEND") {
      break;
    }
    offset = dataEnd + 4;
  }
  if (!width || !height || bitDepth == null || colorType == null) {
    throw new Error("PNG is missing IHDR metadata.");
  }
  if (bitDepth !== 8) {
    return { width, height, nonBlankRatio: null, sampledColorBuckets: null };
  }
  const channelsByColorType: Record<number, number> = { 0: 1, 2: 3, 4: 2, 6: 4 };
  const channels = channelsByColorType[colorType];
  if (!channels || idatChunks.length === 0) {
    return { width, height, nonBlankRatio: null, sampledColorBuckets: null };
  }
  const bytesPerPixel = channels;
  const rowBytes = width * bytesPerPixel;
  const inflated = inflateSync(Buffer.concat(idatChunks));
  const pixels = Buffer.alloc(rowBytes * height);
  let sourceOffset = 0;
  for (let row = 0; row < height; row += 1) {
    const filter = inflated.readUInt8(sourceOffset);
    sourceOffset += 1;
    const rowStart = row * rowBytes;
    const prevRowStart = rowStart - rowBytes;
    for (let col = 0; col < rowBytes; col += 1) {
      const raw = inflated.readUInt8(sourceOffset + col);
      const left = col >= bytesPerPixel ? byte(pixels, rowStart + col - bytesPerPixel) : 0;
      const up = row > 0 ? byte(pixels, prevRowStart + col) : 0;
      const upLeft = row > 0 && col >= bytesPerPixel ? byte(pixels, prevRowStart + col - bytesPerPixel) : 0;
      let value: number;
      if (filter === 0) value = raw;
      else if (filter === 1) value = raw + left;
      else if (filter === 2) value = raw + up;
      else if (filter === 3) value = raw + Math.floor((left + up) / 2);
      else if (filter === 4) {
        const p = left + up - upLeft;
        const pa = Math.abs(p - left);
        const pb = Math.abs(p - up);
        const pc = Math.abs(p - upLeft);
        value = raw + (pa <= pb && pa <= pc ? left : pb <= pc ? up : upLeft);
      } else {
        throw new Error(`Unsupported PNG row filter ${filter}.`);
      }
      pixels[rowStart + col] = value & 0xff;
    }
    sourceOffset += rowBytes;
  }
  const stride = Math.max(1, Math.floor((width * height) / 50_000));
  let sampled = 0;
  let nonBlank = 0;
  const colorBuckets = new Set<string>();
  for (let pixel = 0; pixel < width * height; pixel += stride) {
    const offset = pixel * bytesPerPixel;
    const gray = byte(pixels, offset);
    const r = channels === 1 || channels === 2 ? gray : byte(pixels, offset);
    const g = channels === 1 || channels === 2 ? gray : byte(pixels, offset + 1);
    const b = channels === 1 || channels === 2 ? gray : byte(pixels, offset + 2);
    const alpha = channels === 4 ? byte(pixels, offset + 3) : channels === 2 ? byte(pixels, offset + 1) : 255;
    sampled += 1;
    if (alpha > 20 && !(r > 248 && g > 248 && b > 248)) nonBlank += 1;
    colorBuckets.add(`${Math.floor(r / 16)}:${Math.floor(g / 16)}:${Math.floor(b / 16)}:${Math.floor(alpha / 32)}`);
  }
  return {
    width,
    height,
    nonBlankRatio: sampled > 0 ? nonBlank / sampled : null,
    sampledColorBuckets: colorBuckets.size,
  };
}

export async function buildFigureQa(opts: { manifestPath: string }): Promise<FigureQaResult> {
  const manifestPath = path.resolve(opts.manifestPath);
  const manifestDir = path.dirname(manifestPath);
  const raw = JSON.parse(await readFile(manifestPath, "utf-8")) as RawFigureManifest;
  const rawFigures = Array.isArray(raw.figures) ? raw.figures : [];
  const figures: FigureQaItem[] = [];
  for (const [index, figure] of rawFigures.entries()) {
    const title = asString(figure.title);
    const caption = asString(figure.caption);
    const altText = asString(figure.altText);
    const xLabel = asString(figure.xLabel);
    const yLabel = asString(figure.yLabel);
    const sourceColumns = asStringArray(figure.sourceColumns);
    const rawPath = asString(figure.path);
    const resolvedPath = rawPath ? figurePath(rawPath, manifestDir) : "";
    const checks: FigureQaCheck[] = [];
    let byteSize = 0;
    let sha256: string | null = null;
    let width: number | null = null;
    let height: number | null = null;
    let nonBlankRatio: number | null = null;
    let sampledColorBuckets: number | null = null;
    checks.push(check("path-recorded", rawPath ? "pass" : "fail", rawPath ? resolvedPath : "Figure record did not include a path."));
    if (rawPath && existsSync(resolvedPath)) {
      const stat = statSync(resolvedPath);
      byteSize = stat.size;
      const buffer = await readFile(resolvedPath);
      sha256 = createHash("sha256").update(buffer).digest("hex");
      checks.push(check("file-exists", "pass", `Found figure file (${byteSize} bytes).`));
      checks.push(check("file-size", byteSize >= 8_000 ? "pass" : "fail", `Figure byte size is ${byteSize}; expected at least 8000 bytes for a readable plot.`));
      try {
        const analysis = parsePng(buffer);
        width = analysis.width;
        height = analysis.height;
        nonBlankRatio = analysis.nonBlankRatio;
        sampledColorBuckets = analysis.sampledColorBuckets;
        checks.push(check("png-decodable", "pass", `PNG decoded at ${width}x${height}.`));
        checks.push(check("dimensions", width >= 900 && height >= 600 ? "pass" : "fail", `Figure dimensions are ${width}x${height}; expected at least 900x600.`));
        checks.push(check("nonblank-pixels", nonBlankRatio == null ? "warning" : nonBlankRatio >= 0.006 ? "pass" : "fail", nonBlankRatio == null ? "Pixel QA unavailable for this PNG color mode." : `Non-white sampled pixel ratio is ${nonBlankRatio.toFixed(4)}.`));
        checks.push(check("color-detail", sampledColorBuckets == null ? "warning" : sampledColorBuckets >= 8 ? "pass" : "warning", sampledColorBuckets == null ? "Color-detail QA unavailable for this PNG color mode." : `Sampled color buckets: ${sampledColorBuckets}.`));
      } catch (error) {
        checks.push(check("png-decodable", "fail", error instanceof Error ? error.message : String(error)));
      }
    } else if (rawPath) {
      checks.push(check("file-exists", "fail", `Missing figure file: ${resolvedPath}`));
    }
    checks.push(check("title-present", title ? "pass" : "fail", title ? `Title: ${title}` : "Figure is missing a title."));
    checks.push(check("caption-present", caption ? "pass" : "fail", caption ? `Caption: ${caption}` : "Figure is missing a caption."));
    checks.push(check("alt-text-present", altText ? "pass" : "warning", altText ? "Alt text is present." : "Alt text is missing; accessibility/reviewer context is weaker."));
    checks.push(check("x-axis-label-present", xLabel ? "pass" : "warning", xLabel ? `X axis: ${xLabel}` : "Figure metadata is missing an x-axis label."));
    checks.push(check("y-axis-label-present", yLabel ? "pass" : "warning", yLabel ? `Y axis: ${yLabel}` : "Figure metadata is missing a y-axis label."));
    checks.push(check("source-columns-recorded", sourceColumns.length > 0 ? "pass" : "warning", sourceColumns.length > 0 ? `Source columns: ${sourceColumns.join(", ")}` : "No source columns were recorded."));
    const status = combineStatus(checks.map(item => item.status));
    figures.push({
      figureId: asString(figure.id) ?? path.basename(resolvedPath || `figure-${index + 1}`),
      path: resolvedPath,
      title,
      caption,
      altText,
      xLabel,
      yLabel,
      sourceColumns,
      byteSize,
      sha256,
      width,
      height,
      nonBlankRatio,
      sampledColorBuckets,
      status,
      checks,
    });
  }
  const checks = [
    check("manifest-readable", "pass", `Read figure manifest: ${manifestPath}`),
    check("figures-present", figures.length > 0 ? "pass" : "warning", `${figures.length} figure(s) were listed.`),
    check("all-figures-pass", figures.length === 0 ? "warning" : figures.every(figure => figure.status === "pass") ? "pass" : figures.some(figure => figure.status === "fail") ? "fail" : "warning", `${figures.filter(figure => figure.status === "pass").length}/${figures.length} figure(s) passed all QA checks.`),
  ];
  const status = combineStatus([...checks.map(item => item.status), ...figures.map(figure => figure.status)]);
  return {
    schemaVersion: 1,
    manifestPath,
    status,
    summary: `${figures.filter(figure => figure.status === "pass").length}/${figures.length} figure(s) passed; status=${status}.`,
    figures,
    checks,
  };
}

export async function writeFigureQa(opts: { manifestPath: string; outPath?: string; reportPath?: string }): Promise<FigureQaResult & { outPath: string | null; reportPath: string | null }> {
  const result = await buildFigureQa({ manifestPath: opts.manifestPath });
  const outPath = opts.outPath ? path.resolve(opts.outPath) : null;
  const reportPath = opts.reportPath ? path.resolve(opts.reportPath) : null;
  if (outPath) {
    await mkdir(path.dirname(outPath), { recursive: true });
    await writeFile(outPath, `${JSON.stringify(result, null, 2)}\n`, "utf-8");
  }
  if (reportPath) {
    await mkdir(path.dirname(reportPath), { recursive: true });
    await writeFile(reportPath, renderFigureQa(result), "utf-8");
  }
  return { ...result, outPath, reportPath };
}

export function renderFigureQa(result: FigureQaResult): string {
  const lines = [
    `# Figure QA`,
    "",
    `Status: ${result.status}`,
    "",
    result.summary,
    "",
    `Manifest: ${result.manifestPath}`,
    "",
  ];
  for (const figure of result.figures) {
    lines.push(`## ${figure.title ?? figure.figureId}`);
    lines.push("");
    lines.push(`Status: ${figure.status}`);
    lines.push(`Path: ${figure.path}`);
    lines.push(`Dimensions: ${figure.width ?? "unknown"} x ${figure.height ?? "unknown"}`);
    lines.push(`Nonblank ratio: ${figure.nonBlankRatio == null ? "unknown" : figure.nonBlankRatio.toFixed(4)}`);
    lines.push(`Caption: ${figure.caption ?? "(missing)"}`);
    lines.push(`Alt text: ${figure.altText ?? "(missing)"}`);
    lines.push(`X axis: ${figure.xLabel ?? "(missing)"}`);
    lines.push(`Y axis: ${figure.yLabel ?? "(missing)"}`);
    lines.push("");
    for (const item of figure.checks) {
      lines.push(`- ${item.status.toUpperCase()} ${item.id}: ${item.detail}`);
    }
    lines.push("");
  }
  return `${lines.join("\n").trimEnd()}\n`;
}

export function renderFigureQaCli(result: FigureQaResult & { outPath?: string | null; reportPath?: string | null }): string {
  return [
    `research figure QA: ${result.status}`,
    `  figures: ${result.figures.length}`,
    `  summary: ${result.summary}`,
    `  manifest: ${result.manifestPath}`,
    `  out: ${result.outPath ?? "(not written)"}`,
    `  report: ${result.reportPath ?? "(not written)"}`,
  ].join("\n");
}

export function renderFigureQaJson(result: FigureQaResult & { outPath?: string | null; reportPath?: string | null }): string {
  return `${JSON.stringify({ schemaVersion: 1, figureQa: result }, null, 2)}\n`;
}
