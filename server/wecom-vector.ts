/**
 * 向量服务模块（语义检索基础设施）
 * =====================================================================
 * 职责：
 *  1. 文本 → 向量（embedding）：当前使用腾讯混元 hunyuan-embedding（1024维，OpenAI兼容接口）
 *  2. 向量相似度计算：余弦相似度
 *  3. 语义检索：在候选集合内按相似度排序取 TopK
 *  4. 查重检测：判断新内容与现有内容的语义重复程度
 *
 * 【可演进架构】
 *  - 业务层只依赖本模块导出的函数（embedText / embedTexts / cosineSim / semanticSearch / dedupCheck）
 *  - 当前底层实现为「混元 embedding + MySQL JSON 字段存向量 + 应用层内存计算」
 *  - 未来单租户数据量暴增（单库 > 10万条）时，只需替换 semanticSearch 的底层实现
 *    （改为 pgvector / 腾讯云 VectorDB 等原生向量索引），业务代码一行不用动。
 * =====================================================================
 */

// 混元 embedding 配置（OpenAI 兼容接口）
const HUNYUAN_API_KEY = process.env.HUNYUAN_API_KEY || "";
const HUNYUAN_API_BASE =
  process.env.HUNYUAN_API_BASE || "https://api.hunyuan.cloud.tencent.com/v1";
export const EMBEDDING_MODEL = "hunyuan-embedding";
export const EMBEDDING_DIM = 1024;

if (!HUNYUAN_API_KEY) {
  console.warn(
    "[Vector] ⚠️  HUNYUAN_API_KEY 未配置！向量检索/查重将降级为不可用（写入仍会成功，只是无向量）。"
  );
}

/** 向量服务是否可用（Key 是否已配置） */
export function isVectorEnabled(): boolean {
  return !!HUNYUAN_API_KEY;
}

/**
 * 单条文本转向量
 * @returns number[] 长度 1024；失败抛错由调用方决定是否吞掉
 */
export async function embedText(text: string): Promise<number[]> {
  const arr = await embedTexts([text]);
  return arr[0];
}

/**
 * 批量文本转向量（混元单次最多支持若干条，这里分批，每批 ≤ 20 条，串行避免限流 5次/秒）
 * @param texts 文本数组
 * @returns number[][] 与输入等长，每个元素为 1024 维向量
 */
export async function embedTexts(texts: string[]): Promise<number[][]> {
  if (!HUNYUAN_API_KEY) {
    throw new Error("HUNYUAN_API_KEY 未配置，无法生成向量");
  }
  const cleaned = texts.map((t) => (t || "").trim() || " ");
  const BATCH = 20;
  const result: number[][] = [];
  for (let i = 0; i < cleaned.length; i += BATCH) {
    const batch = cleaned.slice(i, i + BATCH);
    const vecs = await callHunyuanEmbedding(batch);
    result.push(...vecs);
    // 限流保护：混元 5次/秒，批间稍作停顿
    if (i + BATCH < cleaned.length) {
      await sleep(250);
    }
  }
  return result;
}

/** 实际调用混元 embedding 接口 */
async function callHunyuanEmbedding(inputs: string[]): Promise<number[][]> {
  const maxRetry = 3;
  let lastErr: any = null;
  for (let attempt = 1; attempt <= maxRetry; attempt++) {
    try {
      const resp = await fetch(`${HUNYUAN_API_BASE}/embeddings`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${HUNYUAN_API_KEY}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ model: EMBEDDING_MODEL, input: inputs }),
      });
      if (!resp.ok) {
        const txt = await resp.text();
        // 429 限流则退避重试
        if (resp.status === 429 && attempt < maxRetry) {
          await sleep(500 * attempt);
          continue;
        }
        throw new Error(`混元embedding HTTP ${resp.status}: ${txt.slice(0, 200)}`);
      }
      const data: any = await resp.json();
      // OpenAI 兼容格式：data.data[].embedding，按 index 排序保证顺序
      const items = (data.data || []).slice().sort((a: any, b: any) => a.index - b.index);
      return items.map((it: any) => it.embedding as number[]);
    } catch (e: any) {
      lastErr = e;
      if (attempt < maxRetry) {
        await sleep(400 * attempt);
        continue;
      }
    }
  }
  throw lastErr || new Error("混元embedding调用失败");
}

/** 余弦相似度，输入两个等长向量，返回 [-1, 1]（实际文本向量基本落在 [0,1]） */
export function cosineSim(a: number[], b: number[]): number {
  if (!a || !b || a.length !== b.length) return 0;
  let dot = 0,
    na = 0,
    nb = 0;
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i];
    na += a[i] * a[i];
    nb += b[i] * b[i];
  }
  if (na === 0 || nb === 0) return 0;
  return dot / (Math.sqrt(na) * Math.sqrt(nb));
}

/** 解析数据库里存的向量字符串为 number[]，失败返回 null */
export function parseEmbedding(raw: any): number[] | null {
  if (!raw) return null;
  try {
    const arr = typeof raw === "string" ? JSON.parse(raw) : raw;
    if (Array.isArray(arr) && arr.length > 0 && typeof arr[0] === "number") {
      return arr as number[];
    }
  } catch {
    /* ignore */
  }
  return null;
}

/** 向量序列化为存储字符串 */
export function serializeEmbedding(vec: number[]): string {
  return JSON.stringify(vec);
}

export interface ScoredCandidate<T> {
  item: T;
  score: number; // 余弦相似度 0~1
}

/**
 * 语义检索：在候选集合内，按与 query 向量的余弦相似度排序，返回 TopK
 * @param queryVec 查询向量
 * @param candidates 候选项（需含已解析的向量）
 * @param getVec 从候选项取出向量的函数
 * @param topK 返回条数
 * @param minScore 最低相似度阈值（低于此分数的丢弃），默认 0 不过滤
 */
export function semanticSearch<T>(
  queryVec: number[],
  candidates: T[],
  getVec: (item: T) => number[] | null,
  topK: number,
  minScore = 0
): ScoredCandidate<T>[] {
  const scored: ScoredCandidate<T>[] = [];
  for (const item of candidates) {
    const v = getVec(item);
    if (!v) continue;
    const score = cosineSim(queryVec, v);
    if (score >= minScore) scored.push({ item, score });
  }
  scored.sort((a, b) => b.score - a.score);
  return scored.slice(0, topK);
}

// 查重等级阈值（基于实测：同义高度相似≈0.75+，相关≈0.5~0.75，无关<0.5）
export const DEDUP_THRESHOLD_DUPLICATE = 0.9; // 高度重复（几乎相同）
export const DEDUP_THRESHOLD_SIMILAR = 0.75; // 相似（语义接近）

export type DedupLevel = "duplicate" | "similar" | "new";

export interface DedupResult {
  level: DedupLevel;
  score: number; // 与最相似现有内容的相似度
  matchedText?: string; // 最相似的现有内容片段
}

/**
 * 查重检测：判断新内容向量与现有内容向量集合的重复程度
 * @param newVec 新内容向量
 * @param existing 现有内容（含向量和文本）
 */
export function dedupCheck(
  newVec: number[],
  existing: { vec: number[] | null; text: string }[]
): DedupResult {
  let best = -1;
  let bestText = "";
  for (const e of existing) {
    if (!e.vec) continue;
    const s = cosineSim(newVec, e.vec);
    if (s > best) {
      best = s;
      bestText = e.text;
    }
  }
  if (best < 0) return { level: "new", score: 0 };
  let level: DedupLevel = "new";
  if (best >= DEDUP_THRESHOLD_DUPLICATE) level = "duplicate";
  else if (best >= DEDUP_THRESHOLD_SIMILAR) level = "similar";
  return { level, score: best, matchedText: level === "new" ? undefined : bestText };
}

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

// =====================================================================
// 数据库辅助函数（与 wecom_knowledge_items / wecom_prompt_rules 两张表绑定）
// =====================================================================
//
// 约定：
//  - 两张表均含 embedding(JSON/LONGTEXT)、embedding_model(VARCHAR)、embedding_updated_at(DATETIME) 三列
//  - 知识库条目用于 embedding 的文本 = question + "\n" + answer（去空）
//  - 规则用于 embedding 的文本 = content
//  - 所有回填均「尽力而为」：失败只记日志，绝不抛错影响主流程

/** 拼接知识库条目用于 embedding 的文本 */
export function buildItemEmbedText(question: any, answer: any): string {
  const q = (question || "").toString().trim();
  const a = (answer || "").toString().trim();
  return [q, a].filter(Boolean).join("\n").trim();
}

/**
 * 给指定表的单条记录回填 embedding（已知文本，直接 embed 并 UPDATE）
 * @param conn  数据库连接（mysql2）
 * @param table 表名，仅允许 wecom_knowledge_items / wecom_prompt_rules
 * @param id    记录主键
 * @param text  用于生成向量的文本
 * @returns 成功 true，失败/跳过 false（不抛错）
 */
export async function backfillEmbeddingById(
  conn: any,
  table: "wecom_knowledge_items" | "wecom_prompt_rules",
  id: number,
  text: string
): Promise<boolean> {
  if (!isVectorEnabled()) return false;
  const t = (text || "").trim();
  if (!t) return false;
  if (table !== "wecom_knowledge_items" && table !== "wecom_prompt_rules") return false;
  try {
    const vec = await embedText(t);
    await conn.execute(
      `UPDATE ${table} SET embedding=?, embedding_model=?, embedding_updated_at=NOW() WHERE id=?`,
      [serializeEmbedding(vec), EMBEDDING_MODEL, id]
    );
    return true;
  } catch (e: any) {
    console.error(`[Vector] 回填 ${table}#${id} 失败:`, e?.message || e);
    return false;
  }
}

/**
 * 异步「即发即忘」回填：写入接口调用，不阻塞 HTTP 响应。
 * 注意：调用方需保证 conn 在回填完成前不被关闭（建议使用连接池或不主动 end）。
 */
export function backfillEmbeddingAsync(
  conn: any,
  table: "wecom_knowledge_items" | "wecom_prompt_rules",
  id: number,
  text: string
): void {
  // 不 await，错误已在内部吞掉
  backfillEmbeddingById(conn, table, id, text).catch(() => {});
}

/**
 * 批量补全所有缺失 embedding 的记录（存量数据回填 / 定时兜底）
 * @param conn 数据库连接
 * @param opts.limit 单次最多处理多少条（默认 200，防止一次性拉爆）
 * @returns 各表补全数量
 */
export async function backfillAllMissing(
  conn: any,
  opts: { limit?: number } = {}
): Promise<{ knowledge: number; rules: number }> {
  const limit = opts.limit ?? 200;
  let knowledge = 0;
  let rules = 0;
  if (!isVectorEnabled()) {
    console.warn("[Vector] backfillAllMissing 跳过：HUNYUAN_API_KEY 未配置");
    return { knowledge, rules };
  }

  // ---- 知识库条目 ----
  try {
    const [rows]: any = await conn.execute(
      `SELECT id, question, answer FROM wecom_knowledge_items
       WHERE embedding IS NULL OR embedding = '' LIMIT ${limit}`
    );
    const list = rows as any[];
    if (list.length > 0) {
      const texts = list.map((r) => buildItemEmbedText(r.question, r.answer) || " ");
      const vecs = await embedTexts(texts);
      for (let i = 0; i < list.length; i++) {
        try {
          await conn.execute(
            `UPDATE wecom_knowledge_items SET embedding=?, embedding_model=?, embedding_updated_at=NOW() WHERE id=?`,
            [serializeEmbedding(vecs[i]), EMBEDDING_MODEL, list[i].id]
          );
          knowledge++;
        } catch (e: any) {
          console.error(`[Vector] 回填知识#${list[i].id}失败:`, e?.message || e);
        }
      }
    }
  } catch (e: any) {
    console.error("[Vector] 批量补全知识库失败:", e?.message || e);
  }

  // ---- 规则 ----
  try {
    const [rows]: any = await conn.execute(
      `SELECT id, content FROM wecom_prompt_rules
       WHERE embedding IS NULL OR embedding = '' LIMIT ${limit}`
    );
    const list = rows as any[];
    if (list.length > 0) {
      const texts = list.map((r) => (r.content || "").toString().trim() || " ");
      const vecs = await embedTexts(texts);
      for (let i = 0; i < list.length; i++) {
        try {
          await conn.execute(
            `UPDATE wecom_prompt_rules SET embedding=?, embedding_model=?, embedding_updated_at=NOW() WHERE id=?`,
            [serializeEmbedding(vecs[i]), EMBEDDING_MODEL, list[i].id]
          );
          rules++;
        } catch (e: any) {
          console.error(`[Vector] 回填规则#${list[i].id}失败:`, e?.message || e);
        }
      }
    }
  } catch (e: any) {
    console.error("[Vector] 批量补全规则失败:", e?.message || e);
  }

  console.log(`[Vector] 批量补全完成：知识库 ${knowledge} 条，规则 ${rules} 条`);
  return { knowledge, rules };
}

// =====================================================================
// 高层业务封装：知识库语义检索 / 查重（业务层一行调用）
// =====================================================================

export interface KbHit {
  id: number;
  question: string;
  answer: string;
  source_file?: string;
  score: number;
}

/**
 * 知识库语义检索：在指定 kbId 集合内，按与 query 的语义相似度返回 TopK。
 * 自动降级：若向量服务不可用或 query 无法 embed，返回 null（调用方走关键词兜底）。
 * 仅对「有 embedding 的条目」参与语义打分；无向量的条目交由调用方关键词兜底。
 *
 * @param conn 数据库连接
 * @param kbIds 该渠道对应的知识库 id 列表（按渠道分库检索，避免全表扫描）
 * @param query 用户消息文本
 * @param topK 返回条数
 * @param minScore 最低相似度（默认 0.5，过滤明显无关项）
 */
export async function searchKnowledgeSemantic(
  conn: any,
  kbIds: number[],
  query: string,
  topK = 5,
  minScore = 0.5
): Promise<KbHit[] | null> {
  if (!isVectorEnabled()) return null;
  const q = (query || "").trim();
  if (!q || !kbIds || kbIds.length === 0) return null;
  let queryVec: number[];
  try {
    queryVec = await embedText(q);
  } catch (e: any) {
    console.error("[Vector] query embed 失败，降级关键词:", e?.message || e);
    return null;
  }
  try {
    const placeholders = kbIds.map(() => "?").join(",");
    const [rows]: any = await conn.execute(
      `SELECT id, question, answer, source_file, embedding
       FROM wecom_knowledge_items
       WHERE kb_id IN (${placeholders}) AND enabled=1
         AND embedding IS NOT NULL AND embedding <> ''`,
      kbIds
    );
    const candidates = (rows as any[]).map((r) => ({
      id: r.id,
      question: r.question || "",
      answer: r.answer || "",
      source_file: r.source_file || "",
      vec: parseEmbedding(r.embedding),
    }));
    const top = semanticSearch(queryVec, candidates, (c) => c.vec, topK, minScore);
    return top.map((t) => ({
      id: t.item.id,
      question: t.item.question,
      answer: t.item.answer,
      source_file: t.item.source_file,
      score: t.score,
    }));
  } catch (e: any) {
    console.error("[Vector] 知识库语义检索失败:", e?.message || e);
    return null;
  }
}

/**
 * 语义查重：判断 newText 与「同一作用域内现有记录」的语义重复程度。
 * @param conn 数据库连接
 * @param table 表名
 * @param scope 作用域过滤（知识库：{kb_id:[...]}；规则：{channel_id, layer?}）
 * @param newText 待写入文本
 * @param excludeId 排除自身 id（编辑场景）
 * @returns DedupResult（向量不可用时返回 null，调用方走字面兜底）
 */
export async function dedupCheckDb(
  conn: any,
  table: "wecom_knowledge_items" | "wecom_prompt_rules",
  scope: { kbIds?: number[]; channelId?: string | number; layer?: string },
  newText: string,
  excludeId?: number
): Promise<DedupResult | null> {
  if (!isVectorEnabled()) return null;
  const t = (newText || "").trim();
  if (!t) return null;
  let newVec: number[];
  try {
    newVec = await embedText(t);
  } catch {
    return null;
  }
  try {
    let sql = "";
    let params: any[] = [];
    if (table === "wecom_knowledge_items") {
      const ids = scope.kbIds || [];
      if (ids.length === 0) return { level: "new", score: 0 };
      const ph = ids.map(() => "?").join(",");
      sql = `SELECT id, question, answer, embedding FROM wecom_knowledge_items
             WHERE kb_id IN (${ph}) AND embedding IS NOT NULL AND embedding <> ''`;
      params = [...ids];
    } else {
      sql = `SELECT id, content, embedding FROM wecom_prompt_rules
             WHERE channel_id=? AND embedding IS NOT NULL AND embedding <> ''`;
      params = [scope.channelId];
      if (scope.layer) {
        sql += ` AND layer=?`;
        params.push(scope.layer);
      }
    }
    if (excludeId != null) {
      sql += ` AND id <> ?`;
      params.push(excludeId);
    }
    const [rows]: any = await conn.execute(sql, params);
    const existing = (rows as any[]).map((r) => ({
      vec: parseEmbedding(r.embedding),
      text:
        table === "wecom_knowledge_items"
          ? buildItemEmbedText(r.question, r.answer)
          : (r.content || "").toString(),
    }));
    return dedupCheck(newVec, existing);
  } catch (e: any) {
    console.error("[Vector] dedupCheckDb 失败:", e?.message || e);
    return null;
  }
}
