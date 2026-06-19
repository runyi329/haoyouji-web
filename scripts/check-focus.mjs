#!/usr/bin/env node
/**
 * 聚焦类型检查（error baseline 基线法）
 *
 * 背景：仓库存在大量历史 TS 报错（类型口径过时、可能为 null 等），
 * 它们不影响 esbuild/vite 打包运行，但会淹没新代码引入的真实类型错误。
 *
 * 做法：以 tsconfig.tsbaseline.txt 记录"已知历史报错"的指纹（错误码+消息，
 * 不含行号，避免行号漂移导致误报）。本脚本跑全量 tsc，只报告"不在基线里"的
 * 新增报错——也就是新代码引入的问题。
 *
 * 用法：
 *   pnpm check            只看新增报错（日常闸口）
 *   pnpm check:all        看全量历史报错
 *   pnpm check:baseline   重新生成基线（修完一批历史报错后执行）
 */
import { execSync } from "node:child_process";
import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const BASELINE = join(ROOT, "tsconfig.tsbaseline.txt");

function runTsc() {
  try {
    execSync("tsc --noEmit", { cwd: ROOT, stdio: "pipe" });
    return "";
  } catch (e) {
    return (e.stdout?.toString() || "") + (e.stderr?.toString() || "");
  }
}

/** 把一行报错归一化为"指纹"：去掉 (行,列)，保留 文件 + 错误码 + 消息 */
function fingerprint(line) {
  const m = line.match(/^(.+?)\((\d+),(\d+)\): (error TS\d+: .+)$/);
  if (!m) return null;
  const [, file, , , rest] = m;
  return `${file} :: ${rest}`;
}

const out = runTsc();
const lines = out.split("\n").filter((l) => /error TS\d+/.test(l));
const fps = lines.map(fingerprint).filter(Boolean);

const mode = process.argv[2];

if (mode === "--generate") {
  // 不去重：保留每条指纹的出现次数，供 check 按计数匹配
  // （同一指纹出现 N 次，基线也写 N 行；新代码再多出来的同类报错才算新增）
  const sorted = [...fps].sort();
  writeFileSync(BASELINE, sorted.join("\n") + "\n", "utf8");
  console.log(`[baseline] 已写入 ${sorted.length} 条历史报错指纹到 ${BASELINE}`);
  process.exit(0);
}

const baselineLines = existsSync(BASELINE)
  ? readFileSync(BASELINE, "utf8").split("\n").filter(Boolean)
  : [];

// 统计基线计数（同一指纹可能多次出现，用计数判断"新增"）
const baseCount = new Map();
for (const fp of baselineLines) baseCount.set(fp, (baseCount.get(fp) || 0) + 1);

const seen = new Map();
const fresh = [];
for (let i = 0; i < lines.length; i++) {
  const fp = fps[i];
  if (!fp) continue;
  const used = seen.get(fp) || 0;
  const allowed = baseCount.get(fp) || 0;
  if (used >= allowed) {
    fresh.push(lines[i]);
  }
  seen.set(fp, used + 1);
}

if (fresh.length === 0) {
  console.log(`[check] 通过：无新增类型错误（历史基线 ${baselineLines.length} 条已忽略）。`);
  process.exit(0);
}

console.error(`[check] 发现 ${fresh.length} 个新增类型错误（不在历史基线中）：\n`);
for (const l of fresh) console.error("  " + l);
console.error(
  `\n如确属历史遗留且已确认安全，可运行 pnpm check:baseline 纳入基线。`
);
process.exit(1);
