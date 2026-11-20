function skipWhitespace(text: string, index: number): number {
  while (index < text.length && /\s/.test(text[index])) index++;
  return index;
}

function skipString(text: string, index: number): number {
  index++;
  while (index < text.length) {
    const ch = text[index++];
    if (ch === '\\') index++;
    else if (ch === '"') return index;
  }
  throw new Error('成员初始设置JSON损坏，请先修复原始数据');
}

function skipValue(text: string, index: number): number {
  const start = index;
  const first = text[index];
  if (first === '"') return skipString(text, index);
  if (first === '{' || first === '[') {
    const stack = [first === '{' ? '}' : ']'];
    index++;
    let inString = false;
    while (index < text.length && stack.length) {
      const ch = text[index];
      if (inString) { index = ch === '\\' ? index + 2 : ch === '"' ? (inString = false, index + 1) : index + 1; continue; }
      if (ch === '"') { inString = true; index++; continue; }
      if (ch === '{') stack.push('}'); else if (ch === '[') stack.push(']');
      else if (ch === '}' || ch === ']') { if (stack[stack.length - 1] !== ch) throw new Error('成员初始设置JSON损坏，请先修复原始数据'); stack.pop(); }
      index++;
    }
    if (stack.length) throw new Error('成员初始设置JSON损坏，请先修复原始数据');
    return index;
  }
  const match = text.slice(index).match(/^(?:true|false|null|-?(?:0|[1-9]\d*)(?:\.\d+)?(?:[eE][+-]?\d+)?)/);
  if (!match) throw new Error('成员初始设置JSON损坏，请先修复原始数据');
  return start + match[0].length;
}

/** Replace or append exactly one top-level JSON member without reserializing any original bytes. */
export function replaceTopLevelJsonValue(raw: unknown, key: string, value: 0 | 1): string {
  const text = raw === null || raw === '' ? '{}' : raw;
  if (typeof text !== 'string') throw new Error('成员初始设置必须是JSON对象文本');
  let parsed: unknown;
  try { parsed = JSON.parse(text); } catch { throw new Error('成员初始设置JSON损坏，请先修复原始数据'); }
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) throw new Error('成员初始设置必须是JSON对象');
  const open = text.search(/\{/), close = text.lastIndexOf('}');
  if (open < 0 || close < open) throw new Error('成员初始设置JSON损坏，请先修复原始数据');
  let cursor = skipWhitespace(text, open + 1);
  const hasMembers = cursor < close;
  let foundStart = -1, foundEnd = -1;
  while (cursor < close) {
    if (text[cursor] !== '"') throw new Error('成员初始设置JSON损坏，请先修复原始数据');
    const keyEnd = skipString(text, cursor);
    let decoded: unknown;
    try { decoded = JSON.parse(text.slice(cursor, keyEnd)); } catch { throw new Error('成员初始设置JSON损坏，请先修复原始数据'); }
    cursor = skipWhitespace(text, keyEnd);
    if (text[cursor++] !== ':') throw new Error('成员初始设置JSON损坏，请先修复原始数据');
    const valueStart = skipWhitespace(text, cursor);
    const valueEnd = skipValue(text, valueStart);
    if (decoded === key) {
      if (foundStart >= 0) throw new Error('AI展示设置键重复，拒绝写入');
      foundStart = valueStart; foundEnd = valueEnd;
    }
    cursor = skipWhitespace(text, valueEnd);
    if (cursor === close) break;
    if (text[cursor++] !== ',') throw new Error('成员初始设置JSON损坏，请先修复原始数据');
    cursor = skipWhitespace(text, cursor);
  }
  if (foundStart >= 0) {
    const replacement = String(value);
    if (text.slice(foundStart, foundEnd) === replacement) return text;
    return text.slice(0, foundStart) + replacement + text.slice(foundEnd);
  }
  const insertion = `${hasMembers ? ',' : ''}${JSON.stringify(key)}:${value}`;
  return text.slice(0, close) + insertion + text.slice(close);
}
