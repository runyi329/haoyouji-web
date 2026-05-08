/**
 * OCR文字识别服务
 * 使用Manus内置的LLM视觉能力进行文字识别
 */

import { invokeLLM } from "./llm";

export interface OCRResult {
  text: string;
  language: "chinese" | "english" | "mixed";
  words: string[];
}

export type ContentType = "character" | "word" | "english";

/**
 * 从图片中识别文字
 * @param imageUrl 图片URL（支持公网URL或base64）
 * @param contentType 内容类型（character=单字, word=词语, english=英文单词）
 * @returns 识别结果
 */
export async function recognizeText(imageUrl: string, contentType?: ContentType): Promise<OCRResult> {
  try {
    // 使用LLM的视觉能力识别图片中的文字
    const response = await invokeLLM({
      featureKey: 'ocr_recognize',
      messages: [
        {
          role: "system",
          content: "你是一个专业的OCR文字识别助手。请识别图片中的所有文字内容，保持原有格式和顺序。",
        },
        {
          role: "user",
          content: [
            {
              type: "text",
              text: "请识别这张图片中的所有文字内容，按原有顺序输出。",
            },
            {
              type: "image_url",
              image_url: {
                url: imageUrl,
                detail: "high",
              },
            },
          ],
        },
      ],
    });

    const recognizedText = response.choices[0]?.message?.content || "";

    // 检测语言类型
    const hasChinese = /[\u4e00-\u9fa5]/.test(recognizedText);
    const hasEnglish = /[a-zA-Z]/.test(recognizedText);
    
    let language: "chinese" | "english" | "mixed" = "chinese";
    if (hasChinese && hasEnglish) {
      language = "mixed";
    } else if (hasEnglish && !hasChinese) {
      language = "english";
    }

    // 提取词汇（简单分词）
    let words = extractWords(recognizedText, language);
    
    // 根据contentType过滤结果
    if (contentType) {
      words = filterWordsByType(words, contentType);
    }

    return {
      text: recognizedText,
      language,
      words,
    };
  } catch (error) {
    console.error("[OCR] Failed to recognize text:", error);
    throw new Error("文字识别失败，请重试");
  }
}

/**
 * 从文本中提取词汇
 * @param text 文本内容
 * @param language 语言类型
 * @returns 词汇列表
 */
export function extractWords(text: string, language: "chinese" | "english" | "mixed"): string[] {
  const words: string[] = [];
  
  if (language === "english") {
    // 英文：按空格和标点分词
    const englishWords = text
      .split(/[\s,，.。!！?？;；:：\n]+/)
      .map(w => w.trim())
      .filter(w => w.length > 0 && /^[a-zA-Z]+$/.test(w));
    words.push(...englishWords);
  } else if (language === "chinese") {
    // 中文：智能提取词汇
    // 步骤1：先按行和标点分割，提取已分隔的词汇
    const segments = text
      .split(/[\s\n,，.。!！?？;；:：、]+/)
      .map(s => s.trim())
      .filter(s => s.length > 0 && /^[\u4e00-\u9fa5]+$/.test(s));
    
    const chineseWords: string[] = [];
    
    // 步骤2：对每个片段进行处理
    for (const segment of segments) {
      if (segment.length === 1) {
        // 单字：直接添加
        chineseWords.push(segment);
      } else if (segment.length >= 2 && segment.length <= 4) {
        // 2-4字：可能是完整词汇，直接添加
        chineseWords.push(segment);
      } else if (segment.length > 4) {
        // 长片段：使用滑动窗口提取2-4字组合
        for (let len = 2; len <= 4; len++) {
          for (let i = 0; i <= segment.length - len; i++) {
            const word = segment.substring(i, i + len);
            chineseWords.push(word);
          }
        }
      }
    }
    
    // 去重
    words.push(...Array.from(new Set(chineseWords)));
  } else {
    // 混合：分别提取中英文
    const englishWords = text
      .split(/[\s,，.。!！?？;；:：\n]+/)
      .map(w => w.trim())
      .filter(w => w.length > 0 && /^[a-zA-Z]+$/.test(w));
    
    // 中文部分也使用智能提取
    const segments = text
      .replace(/[a-zA-Z]/g, ' ') // 移除英文字母
      .split(/[\s\n,，.。!！?？;；:：、]+/)
      .map(s => s.trim())
      .filter(s => s.length > 0 && /^[\u4e00-\u9fa5]+$/.test(s));
    
    const chineseWords: string[] = [];
    
    for (const segment of segments) {
      if (segment.length === 1) {
        chineseWords.push(segment);
      } else if (segment.length >= 2 && segment.length <= 4) {
        chineseWords.push(segment);
      } else if (segment.length > 4) {
        for (let len = 2; len <= 4; len++) {
          for (let i = 0; i <= segment.length - len; i++) {
            const word = segment.substring(i, i + len);
            chineseWords.push(word);
          }
        }
      }
    }
    
    words.push(...englishWords, ...Array.from(new Set(chineseWords)));
  }
  
  // 去重并限制数量
  return Array.from(new Set(words)).slice(0, 50);
}

/**
 * 使用LLM智能提取词汇（更准确但较慢）
 * @param text 文本内容
 * @returns 词汇列表
 */
export async function extractWordsWithLLM(text: string): Promise<string[]> {
  try {
    const response = await invokeLLM({
      featureKey: 'ocr_recognize',
      messages: [
        {
          role: "system",
          content: "你是一个词汇提取专家。从给定文本中提取适合儿童学习的词汇，包括名词、动词、形容词等。",
        },
        {
          role: "user",
          content: `请从以下文本中提取适合儿童学习的词汇（中文2-4字，英文单词），以JSON数组格式返回：\n\n${text}`,
        },
      ],
      response_format: {
        type: "json_schema",
        json_schema: {
          name: "vocabulary_list",
          strict: true,
          schema: {
            type: "object",
            properties: {
              words: {
                type: "array",
                items: { type: "string" },
                description: "提取的词汇列表",
              },
            },
            required: ["words"],
            additionalProperties: false,
          },
        },
      },
    });

    const content = response.choices[0]?.message?.content;
    if (!content) return [];

    const result = JSON.parse(content);
    return result.words || [];
  } catch (error) {
    console.error("[OCR] Failed to extract words with LLM:", error);
    // 降级到简单提取
    return extractWords(text, "mixed");
  }
}

/**
 * 根据内容类型过滤词汇
 * @param words 原始词汇列表
 * @param contentType 内容类型
 * @returns 过滤后的词汇列表
 */
function filterWordsByType(words: string[], contentType: ContentType): string[] {
  // 拼音字符正则：包括基本拉丁字母和带声调的拼音字符
  // Unicode范围：
  // - a-z, A-Z: 基本拉丁字母
  // - \u0100-\u017F: 拉丁文扩展-A（包含 ā ē ī ō ū 等）
  // - \u01CD-\u01DC: 拉丁文扩展-B（包含 ǎ ě ǐ ǒ ǔ 等）
  // - \u0300-\u036F: 组合变音符号
  const pinyinRegex = /[a-zA-Z\u0100-\u017F\u01CD-\u01DC\u0300-\u036F]/;
  
  // 先过滤掉所有包含拼音字符的词汇
  const noPinyinWords = words.filter(word => !pinyinRegex.test(word));
  
  if (contentType === "character") {
    // 只保留单个汉字，排除词语和英文
    return noPinyinWords.filter(word => 
      /^[\u4e00-\u9fa5]$/.test(word) // 单个汉字
    );
  } else if (contentType === "word") {
    // 只保留中文词语（2个字以上），排除单字和英文
    return noPinyinWords.filter(word => 
      /^[\u4e00-\u9fa5]{2,}$/.test(word) // 2个或以上汉字
    );
  } else if (contentType === "english") {
    // 英文类型：不过滤拼音，因为英文本身就包含这些字符
    return words.filter(word => 
      /^[a-zA-Z]+$/.test(word) // 纯英文单词
    );
  }
  
  return noPinyinWords;
}
