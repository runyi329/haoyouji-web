import { invokeLLM } from "./llm";
import { z } from "zod";

// 定义银行账户解析结果的 Zod Schema
export const bankAccountSchema = z.object({
  accountName: z.string().optional().describe("银行账户的户名，例如：北京越甲广告有限公司"),
  accountNumber: z.string().optional().describe("银行账号，纯数字，例如：11001009000053005912"),
  bankName: z.string().optional().describe("开户银行名称，例如：中国工商银行北京分行"),
});

export type BankAccountInfo = z.infer<typeof bankAccountSchema>;

/**
 * 使用LLM智能解析文本中的银行账户信息
 * @param text 待解析的文本内容
 * @returns 解析出的银行账户信息对象
 */
export async function parseBankAccountInfo(text: string): Promise<BankAccountInfo> {
  try {
    const response = await invokeLLM({
      messages: [
        {
          role: "system",
          content: `你是一个专业的银行账户信息提取助手。请从用户提供的文本中准确提取出户名、银行账号和开户银行名称。如果信息缺失，请不要臆造，返回空字符串。银行账号必须是纯数字。`,
        },
        {
          role: "user",
          content: `请从以下文本中提取银行账户信息，并以 JSON 格式返回：\n\n${text}`,
        },
      ],
      response_format: {
        type: "json_schema",
        json_schema: {
          name: "bank_account_info",
          strict: true,
          schema: {
            type: "object",
            properties: {
              accountName: { type: "string", description: "银行账户的户名" },
              accountNumber: { type: "string", description: "银行账号，纯数字" },
              bankName: { type: "string", description: "开户银行名称" },
            },
            required: [], // 允许部分字段缺失
            additionalProperties: false,
          },
        },
      },
    });

    const content = response.choices[0]?.message?.content;
    if (!content) {
      console.warn("[parseBankAccountInfo] LLM返回空内容");
      return {};
    }

    const parsedResult = JSON.parse(content);
    
    // 使用 Zod 进行验证和类型推断
    const validatedResult = bankAccountSchema.parse(parsedResult);

    // 后置处理：确保 accountNumber 是纯数字，并清理 bankName
    if (validatedResult.accountNumber) {
      validatedResult.accountNumber = validatedResult.accountNumber.replace(/\D/g, ""); // 移除所有非数字字符
    }
    
    // 简单的清理，防止 bankName 包含账号信息
    if (validatedResult.bankName && validatedResult.accountNumber && validatedResult.bankName.includes(validatedResult.accountNumber)) {
        validatedResult.bankName = validatedResult.bankName.replace(validatedResult.accountNumber, "").trim();
    }

    return validatedResult;
  } catch (error) {
    console.error("[parseBankAccountInfo] LLM解析银行账户信息失败:", error);
    return {}; // 解析失败返回空对象
  }
}
