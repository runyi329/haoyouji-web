import type { MibanOfficialMobilePosterPart, MibanOfficialStudyHighlight } from "./miban-official-selection";

export type OfficialPosterLayout = "note" | "study" | "certificate" | "usage" | "product" | "ingredients" | "feature";

export function getOfficialPosterLayout(part: MibanOfficialMobilePosterPart): OfficialPosterLayout {
  if (part.layout) return part.layout;
  if (part.specs?.some(spec => /注册证|批准日期/.test(spec.label))) return "certificate";
  if (part.steps?.length || /使用方法|使用步骤|护肤参考/.test(part.title ?? "")) return "usage";
  if (part.specs?.length) return "product";
  if (/功效测试|研究结果/.test(part.title ?? "") || /测试结果|人体功效测试|消费者使用测试|功效评价/.test(part.eyebrow ?? "") || part.bullets?.some(text => /%受试者/.test(text))) return "study";
  if (part.title === "成分索引说明") return "note";
  if (/成分|核心|植萃|白萃/.test(part.title ?? "")) return "ingredients";
  return "feature";
}

/** Values and captions come from the same verified original bullet or explicit source-backed metric. */
export function getOfficialStudyHighlights(part: MibanOfficialMobilePosterPart): MibanOfficialStudyHighlight[] {
  if (part.studyHighlights) return part.studyHighlights;
  return (part.bullets ?? []).map(text => {
    const percent = text.match(/^(\d+(?:\.\d+)?%)受试者[:：]\s*(.*)$/);
    if (percent) return { value: percent[1], label: "受试者自评", description: percent[2], original: text, kind: "self-report" as const };
    const duration = text.match(/(?:使用|涂抹产品)(\d+(?:分钟|天|周))/);
    return { value: duration?.[1] ?? "", label: "人体功效评价", description: text, original: text, kind: "evaluation" as const };
  });
}

export function getOfficialUsageFacts(part: MibanOfficialMobilePosterPart) {
  if (part.usageFacts) return part.usageFacts;
  const text = [part.eyebrow, ...(part.steps ?? []), ...(part.paragraphs ?? [])].filter(Boolean).join("\n");
  const facts: Array<{ label: string; value: string }> = [];
  if (/每日早晚|每天早晚/.test(text)) facts.push({ label: "使用时段", value: "每日早晚" });
  const pumps = text.match(/\d+[–-]\d+泵/);
  if (pumps) facts.push({ label: "参考用量", value: pumps[0] });
  return facts;
}
