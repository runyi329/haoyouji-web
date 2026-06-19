// 批量移除手动 PageTag：导入语句 + JSX 使用（含单行/多行/三元写法）
// 由全局 AutoPageTag 接管，无需各页面手动写。
import fs from "node:fs";
import { execSync } from "node:child_process";

const files = execSync(
  `grep -rl "PageTag" client/src --include=*.tsx`,
  { encoding: "utf8" }
)
  .split("\n")
  .map((s) => s.trim())
  .filter(Boolean)
  // 排除组件本身与自动组件
  .filter((f) => !f.endsWith("components/PageTag.tsx") && !f.endsWith("components/AutoPageTag.tsx"));

let changed = 0;
let removedImports = 0;
let removedTags = 0;

for (const file of files) {
  let src = fs.readFileSync(file, "utf8");
  const before = src;

  // 1) 删除 import { PageTag } from "@/components/PageTag";（允许前后空白、分号、单双引号）
  src = src.replace(
    /^[ \t]*import\s*\{\s*PageTag\s*\}\s*from\s*["']@\/components\/PageTag["'];?[ \t]*\r?\n/gm,
    () => {
      removedImports++;
      return "";
    }
  );

  // 2) 删除 <PageTag ... />（非贪婪，匹配到第一个 />；覆盖 code="Pxxx" 与 code={`...`} 两种）
  src = src.replace(/[ \t]*<PageTag\b[\s\S]*?\/>[ \t]*\r?\n?/g, () => {
    removedTags++;
    return "";
  });

  if (src !== before) {
    fs.writeFileSync(file, src, "utf8");
    changed++;
  }
}

console.log(`处理文件：${files.length}，实际修改：${changed}`);
console.log(`删除 import：${removedImports} 行，删除 <PageTag/>：${removedTags} 处`);

// 校验残留
const leftover = execSync(
  `grep -rn "PageTag" client/src --include=*.tsx | grep -v "components/PageTag.tsx" | grep -v "components/AutoPageTag.tsx" || true`,
  { encoding: "utf8" }
).trim();
console.log("=== 残留 PageTag 引用（应为空）===");
console.log(leftover || "(无)");
