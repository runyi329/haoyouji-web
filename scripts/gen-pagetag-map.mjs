// 从 App.tsx 提取所有 <Route path="..."> 的路径，按出现顺序分配编号 A001、A002…
// 规则：字母+三位数字，A999 后进 B001，… Z999 后升四位（A0001…）
import fs from "node:fs";

const appSrc = fs.readFileSync("client/src/App.tsx", "utf8");

// 匹配 <Route path="xxx" ...>，保留顺序，忽略没有 path 的兜底 <Route component=.../>
const re = /<Route\s+path=("([^"]*)"|\{`([^`]*)`\})/g;
const paths = [];
let m;
while ((m = re.exec(appSrc)) !== null) {
  const p = m[2] !== undefined ? m[2] : m[3];
  if (p && !paths.includes(p)) paths.push(p);
}

// 编号生成器
function makeCoder() {
  let n = 0; // 0-based
  return () => {
    // 三位阶段：26 字母 * 1000 (000-999)?? 用 001-999 => 每字母 999 个
    // 简化：三位阶段 letterIndex from 0..25, num from 1..999
    const perLetter3 = 999;
    const total3 = 26 * perLetter3;
    let code;
    if (n < total3) {
      const letterIdx = Math.floor(n / perLetter3);
      const num = (n % perLetter3) + 1;
      code = String.fromCharCode(65 + letterIdx) + String(num).padStart(3, "0");
    } else {
      // 四位阶段
      const k = n - total3;
      const perLetter4 = 9999;
      const letterIdx = Math.floor(k / perLetter4);
      const num = (k % perLetter4) + 1;
      code = String.fromCharCode(65 + letterIdx) + String(num).padStart(4, "0");
    }
    n++;
    return code;
  };
}

const next = makeCoder();
const map = {};
for (const p of paths) {
  map[p] = next();
}

const header = `// 自动生成：路由路径 -> 管理员角标编号映射表
// 规则：字母+三位数字（A001..A999），A满进B001…Z满后升四位（A0001…）。无字母后缀。
// 由 scripts/gen-pagetag-map.mjs 生成。新增路由会被 AutoPageTag 自动分配运行时编号，
// 如需固定编号，请将该路由路径补登到此表并重新提交。
// 共 ${paths.length} 条路由。

export const PAGE_TAG_MAP: Record<string, string> = ${JSON.stringify(map, null, 2)};
`;

fs.mkdirSync("client/src/lib", { recursive: true });
fs.writeFileSync("client/src/lib/pageTagMap.ts", header, "utf8");
console.log(`已生成 ${paths.length} 条路由编号，范围 ${map[paths[0]]} ~ ${map[paths[paths.length - 1]]}`);
console.log("前 5 条：", paths.slice(0, 5).map((p) => `${map[p]}=${p}`).join("  |  "));
console.log("后 5 条：", paths.slice(-5).map((p) => `${map[p]}=${p}`).join("  |  "));
