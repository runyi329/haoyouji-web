import fs from "node:fs/promises";
import path from "node:path";
import crypto from "node:crypto";
import COS from "cos-nodejs-sdk-v5";
import sharp from "sharp";
import { mibanLimitedProducts } from "../shared/miban-limited-products";
import { midaniangSelectionAssets } from "../shared/midaniang-selection-assets";
import { mibanImageAssets } from "../shared/miban-image-assets";

/**
 * Public marketing assets only. No DB, private photos, prices or stock writes.
 * pnpm exec tsx scripts/miban-optimize-images.ts --credentials-file /private/cos.json
 * --extra-input /path/to/public-image-urls.json --out-dir /path/to/output
 * Existing verified variants are reused; --refresh explicitly regenerates them.
 * Run from the repository root. A source file is never overwritten/deleted.
 */
const args = process.argv.slice(2);
const argument = (name: string) => {
  const index = args.indexOf(name);
  return index === -1 ? undefined : args[index + 1];
};
const bucket = "haoyouji-images-1396946788";
const region = "ap-shanghai";
const cosBase = `https://${bucket}.cos.${region}.myqcloud.com`;
const root = process.cwd();
const outDir = path.resolve(argument("--out-dir") ?? ".cache/miban-image-optimization");
const credentialFile = argument("--credentials-file");
const credential = credentialFile
  ? JSON.parse(await fs.readFile(credentialFile, "utf8"))
  : { SecretId: process.env.COS_SECRET_ID, SecretKey: process.env.COS_SECRET_KEY };
if (!credential.SecretId || !credential.SecretKey) throw new Error("COS credentials are required outside the repository");
const cos = new COS({ SecretId: credential.SecretId, SecretKey: credential.SecretKey, Timeout: 180000 });
const extraFile = argument("--extra-input");
const extra: Array<string | { src: string; variants?: Variant[] }> = extraFile ? JSON.parse(await fs.readFile(extraFile, "utf8")) : [];
const sources = new Set<string>();
function isPublicMarketingSource(value: string): boolean {
  if (!/\.(?:webp|png|jpe?g)$/i.test(value) || /[?#\\]/.test(value)) return false;
  // Private/dynamic user directories are never public marketing inputs.
  if (/payment-proofs|recharge-proofs|reimbursement-vouchers|ledger-photos|avatars|miban-reviews/i.test(value)) return false;
  try {
    const url = new URL(value, cosBase);
    const segments = decodeURIComponent(url.pathname).split("/");
    if (segments.some(segment => segment === "." || segment === "..") || /%2e|%2f|%5c/i.test(value) || value.split("/").includes("..")) return false;
    if (value.startsWith("/miban-")) {
      const publicRoot = path.resolve(root, "client/public");
      return !value.startsWith("//") && path.resolve(publicRoot, `.${value}`).startsWith(publicRoot + path.sep);
    }
    return value.startsWith(cosBase + "/") && url.origin === cosBase && !url.username && !url.password
      && /^\/(?:miban-[^/]+|assets\/miban)(?:\/|$)/.test(url.pathname);
  } catch { return false; }
}
function collect(value: unknown): void {
  if (typeof value === "string" && isPublicMarketingSource(value)) sources.add(value);
  else if (Array.isArray(value)) value.forEach(collect);
  else if (value && typeof value === "object") Object.values(value).forEach(collect);
}
collect(mibanLimitedProducts);
collect(midaniangSelectionAssets);
collect(extra);

// Generate only variants that pages actually consume; do not thumbnail every poster.
const usage = new Map<string, Set<Variant>>();
function tag(value: unknown, variant: Variant): void {
  if (Array.isArray(value)) { value.forEach(item => tag(item, variant)); return; }
  if (typeof value !== "string") return;
  const variants = usage.get(value) ?? new Set<Variant>();
  variants.add(variant); usage.set(value, variants);
}
for (const input of extra) {
  if (typeof input === "object" && input && isPublicMarketingSource(input.src) && Array.isArray(input.variants)) {
    for (const variant of input.variants) if (["icon", "thumbnail", "card", "hero", "poster"].includes(variant)) tag(input.src, variant);
  }
}
for (const product of mibanLimitedProducts) {
  tag(product.card.image, "thumbnail");
  tag(product.detail.productImage, "thumbnail");
  tag(product.detail.heroImages, "hero");
  tag(product.detail.heroBackgroundImage, "hero");
  for (const image of [product.detail.detailImage, product.detail.detailImages, product.detail.introImage, product.detail.consumerNoticeImage]) tag(image, "poster");
  for (const story of product.detail.storySections ?? []) tag(story.image, "poster");
  for (const sku of product.skus) {
    tag(sku.image, "thumbnail"); tag(sku.image, "hero");
    tag(sku.heroImages, "hero"); tag(sku.detailImage, "poster"); tag(sku.detailImages, "poster");
  }
}
for (const image of Object.values(midaniangSelectionAssets.grid)) { tag(image, "thumbnail"); tag(image, "hero"); }
for (const image of Object.values(midaniangSelectionAssets.posters)) tag(image, "poster");
tag(midaniangSelectionAssets.logo, "icon");
tag(midaniangSelectionAssets.organicMark, "icon");

type Variant = "icon" | "thumbnail" | "card" | "hero" | "poster";
type ImagePart = { src: string; width: number; height: number; bytes: number };
type ImageVersion = ImagePart & { parts?: ImagePart[] };
type Asset = { original: string; width: number; height: number; bytes: number; variants: Partial<Record<Variant, ImageVersion>> };
const assets: Record<string, Asset> = args.includes("--refresh")
  ? {}
  : structuredClone(mibanImageAssets) as Record<string, Asset>;
const reports: unknown[] = [];
let checkpoint = Promise.resolve();
const uploaded = new Map<string, ImageVersion>();
await fs.mkdir(outDir, { recursive: true });
try {
  const completed: Asset[] = args.includes("--refresh") ? [] : JSON.parse(await fs.readFile(path.join(outDir, "progress.json"), "utf8"));
  for (const item of completed) if (item.original && item.variants) { assets[item.original] = item; reports.push(item); }
} catch { /* First run: no checkpoint. */ }
const policies: Record<Variant, { width: number; quality: number }> = {
  icon: { width: 192, quality: 90 },
  thumbnail: { width: 400, quality: 86 },
  card: { width: 960, quality: 86 },
  hero: { width: 1280, quality: 90 },
  poster: { width: 1280, quality: 90 },
};
function requiredVariants(source: string): Variant[] {
  const knownUsage = usage.get(source);
  return knownUsage ? [...knownUsage]
    : /brand-card|card-stage/.test(source) ? ["card"]
    : /logo|organicMark/.test(source) ? ["icon"]
    : /poster|pear-img/.test(source) ? ["poster"]
    : ["thumbnail", "hero"];
}
function sha(buffer: Buffer) { return crypto.createHash("sha256").update(buffer).digest("hex"); }
async function retry<T>(operation: () => Promise<T>): Promise<T> {
  let failure: unknown;
  for (let attempt = 0; attempt < 3; attempt++) {
    try { return await operation(); } catch (error) { failure = error; await new Promise(resolve => setTimeout(resolve, 750 * (attempt + 1))); }
  }
  throw failure;
}
async function sourceBuffer(source: string): Promise<Buffer> {
  if (!isPublicMarketingSource(source)) throw new Error("Unsupported public marketing source");
  if (source.startsWith("/")) {
    const publicRoot = await fs.realpath(path.join(root, "client/public"));
    const file = await fs.realpath(path.resolve(publicRoot, `.${source}`));
    if (!file.startsWith(publicRoot + path.sep)) throw new Error("Local marketing source escaped public directory");
    return fs.readFile(file);
  }
  const cached = path.join(outDir, "source-" + crypto.createHash("sha256").update(source).digest("hex").slice(0, 20));
  try { return await fs.readFile(cached); } catch { /* Download once. */ }
  return retry(async () => {
    const response = await fetch(source, { signal: AbortSignal.timeout(120000), redirect: "error" });
    if (!response.ok) throw new Error(`Source HTTP ${response.status}`);
    const body = Buffer.from(await response.arrayBuffer());
    await fs.writeFile(cached, body);
    return body;
  });
}
async function upload(buffer: Buffer, width: number, height: number): Promise<ImageVersion> {
  const digest = sha(buffer);
  const previous = uploaded.get(digest);
  if (previous) return previous;
  const key = `miban-shebei/optimized-images/v1/${digest.slice(0, 20)}-${width}w.webp`;
  await fs.writeFile(path.join(outDir, digest.slice(0, 20) + ".webp"), buffer);
  await retry(() => new Promise<void>((resolve, reject) => {
    const metadata = {
      Bucket: bucket, Region: region, Key: key,
      ContentType: "image/webp", CacheControl: "public, max-age=31536000, immutable",
    };
    const callback = (error: unknown) => error ? reject(new Error("COS upload failed")) : resolve();
    if (buffer.length > 1024 * 1024) {
      cos.sliceUploadFile({ ...metadata, FilePath: path.join(outDir, digest.slice(0, 20) + ".webp"), SliceSize: 1024 * 1024, ChunkSize: 1024 * 1024 }, callback);
    } else {
      cos.putObject({ ...metadata, Body: buffer }, callback);
    }
  }));
  const url = `${cosBase}/${key}`;
  // Verify actual publicly served bytes and immutable cache metadata.
  await retry(async () => {
    const response = await fetch(url, { signal: AbortSignal.timeout(120000), redirect: "error" });
    if (!response.ok || !response.headers.get("cache-control")?.includes("31536000")) throw new Error("Public image/cache verification failed");
    const received = Buffer.from(await response.arrayBuffer());
    if (sha(received) !== digest) throw new Error("Public image byte verification failed");
  });
  const image = { src: url, width, height, bytes: buffer.length };
  uploaded.set(digest, image);
  return image;
}
async function optimize(source: string) {
  const input = await sourceBuffer(source);
  const metadata = await sharp(input, { animated: true }).metadata();
  if (!metadata.width || !metadata.height || (metadata.pages ?? 1) > 1) {
    reports.push({ source, skipped: "Animated or unsupported image; preserved" }); return;
  }
  const item: Asset = { original: source, width: metadata.width, height: metadata.height, bytes: input.length, variants: { ...assets[source]?.variants } };
  const variants = requiredVariants(source);
  // Short, narrow posters already have suitable size; keep their original bytes.

  for (const variant of variants) {
    const policy = policies[variant];
    if (variant === "poster" && metadata.height / metadata.width > 12) {
      const parts: ImagePart[] = [];
      for (let top = 0; top < metadata.height; top += 1800) {
        const height = Math.min(1800, metadata.height - top);
        const { data, info } = await sharp(input)
          .extract({ left: 0, top, width: metadata.width, height })
          .resize({ width: policy.width, withoutEnlargement: true })
          .webp({ quality: policy.quality, alphaQuality: 100, effort: 6 })
          .toBuffer({ resolveWithObject: true });
        parts.push(await upload(data, info.width, info.height));
        console.log(`Verified poster part ${parts.length}/${Math.ceil(metadata.height / 1800)}: ${info.width}x${info.height}, ${data.length} bytes`);
      }
      // Keep the complete original as the fallback; parts cover every source row.
      item.variants[variant] = { src: source, width: metadata.width, height: metadata.height, bytes: input.length, parts };
      continue;
    }
    if ((variant === "hero" || variant === "poster") && metadata.width <= policy.width && input.length < 260000 && metadata.format === "webp" && !source.startsWith("/")) {
      item.variants[variant] = { src: source, width: metadata.width, height: metadata.height, bytes: input.length }; continue;
    }
    const maxHeight = variant === "poster" && metadata.height / metadata.width > 12 ? 12000 : 16000;
    const { data, info } = await sharp(input)
      .rotate()
      // WebP sides must be <= 16383px; long posters fit inside without cropping.
      .resize({ width: policy.width, height: maxHeight, fit: "inside", withoutEnlargement: true })
      .webp({ quality: policy.quality, alphaQuality: 100, effort: 6 })
      .toBuffer({ resolveWithObject: true });
    if (data.length >= input.length && metadata.width <= policy.width && metadata.format === "webp" && !source.startsWith("/")) {
      item.variants[variant] = { src: source, width: metadata.width, height: metadata.height, bytes: input.length }; continue;
    }
    item.variants[variant] = await upload(data, info.width, info.height);
  }
  assets[source] = item;
  reports.push(item);
  console.log(`Processed ${Object.keys(assets).length}/${sources.size}: ${source.split("/").pop()} (${input.length} bytes)`);
  checkpoint = checkpoint.then(async () => {
    await fs.writeFile(path.join(outDir, "progress-next.json"), JSON.stringify(reports, null, 2) + "\n");
    await fs.rename(path.join(outDir, "progress-next.json"), path.join(outDir, "progress.json"));
  });
  await checkpoint;
}
await fs.mkdir(outDir, { recursive: true });
console.log(`Optimizing ${sources.size} existing public marketing assets with 8 workers; originals preserved`);
const queue = [...sources].sort((a, b) => Number(/midaniang|brand-card|rice_logo/.test(b)) - Number(/midaniang|brand-card|rice_logo/.test(a)));
const failures: string[] = [];
await Promise.all(Array.from({ length: 8 }, async () => {
  for (;;) {
    const source = queue.shift(); if (!source) return;
    if (assets[source] && requiredVariants(source).every(variant => assets[source].variants[variant])) continue;
    try { await optimize(source); } catch { failures.push(source); console.log(`Preserved original after failed optimization: ${source}`); }
  }
}));
const sorted = Object.fromEntries(Object.entries(assets).sort(([a], [b]) => a.localeCompare(b)));
const typeHeader = `/** Generated by scripts/miban-optimize-images.ts. Public immutable COS objects; original source retained. */\nexport type MibanImageVariant = "icon" | "thumbnail" | "card" | "hero" | "poster" | "original";\nexport type MibanImagePart = { src: string; width: number; height: number; bytes: number };\nexport type MibanImageAsset = { original: string; width: number; height: number; bytes: number; variants: Partial<Record<Exclude<MibanImageVariant, "original">, MibanImagePart & { parts?: MibanImagePart[] }>> };\nexport const mibanImageAssets: Record<string, MibanImageAsset> = `;
await fs.writeFile(path.join(root, "shared/miban-image-assets.ts"), typeHeader + JSON.stringify(sorted, null, 2) + ";\n");
await fs.writeFile(path.join(outDir, "report.json"), JSON.stringify({ assets: sorted, failures, sources: sources.size, originalsPreserved: true }, null, 2) + "\n");
console.log(`COMPLETE: ${Object.keys(assets).length} sources mapped; ${failures.length} originals retained without mapping. No DB/stock/order writes.`);
