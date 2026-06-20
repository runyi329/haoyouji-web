import { appRouter } from "../server/routers";
import { createContext } from "../server/_core/trpc";
import { TRPCError } from "@trpc/server";

async function testBankRecognition() {
  console.log("开始测试银行账号识别功能...");

  const ctx = await createContext({ req: {} as any, res: {} as any });
  // 模拟一个管理员用户，因为 recognizeBank 是 protectedProcedure
  ctx.user = { id: 1, role: 'admin', username: 'test_admin', email: 'admin@example.com' };

  const caller = appRouter.createCaller(ctx);

  const testCases = [
    {
      name: "图片中的示例",
      text: "户名:北京越甲广告有限公司 账号:11001009000053005912",
      expectedAccountName: "北京越甲广告有限公司",
      expectedAccountNumber: "11001009000053005912",
      expectedBankName: "",
    },
    {
      name: "包含开户行信息",
      text: "户名:张三 账号:6222021000001234567 开户行:中国工商银行北京分行",
      expectedAccountName: "张三",
      expectedAccountNumber: "6222021000001234567",
      expectedBankName: "中国工商银行北京分行",
    },
    {
      name: "开户行中包含账号",
      text: "户名:李四 账号:98765432109876543 开户行:中国建设银行98765432109876543",
      expectedAccountName: "李四",
      expectedAccountNumber: "98765432109876543",
      expectedBankName: "中国建设银行",
    },
    {
      name: "只有账号和户名",
      text: "户名:王五 账号:1234567890123456789",
      expectedAccountName: "王五",
      expectedAccountNumber: "1234567890123456789",
      expectedBankName: "",
    },
    {
      name: "乱序信息",
      text: "中国银行 户名:赵六 账号:65432109876543210",
      expectedAccountName: "赵六",
      expectedAccountNumber: "65432109876543210",
      expectedBankName: "中国银行",
    },
    {
      name: "带空格和特殊字符的账号",
      text: "户名:钱七 账号:6222 0210 0000 1234 567 开户行:招商银行",
      expectedAccountName: "钱七",
      expectedAccountNumber: "6222021000001234567",
      expectedBankName: "招商银行",
    },
  ];

  for (const testCase of testCases) {
    console.log(`\n--- 测试用例: ${testCase.name} ---`);
    try {
      const result = await caller.aiAssistant.recognizeBank({ text: testCase.text });
      console.log("原始文本:", testCase.text);
      console.log("识别结果:", result);

      let passed = true;
      if (result.accountName !== testCase.expectedAccountName) {
        console.error(`❌ accountName 不匹配: 预期 ${testCase.expectedAccountName}, 实际 ${result.accountName}`);
        passed = false;
      }
      if (result.accountNumber !== testCase.expectedAccountNumber) {
        console.error(`❌ accountNumber 不匹配: 预期 ${testCase.expectedAccountNumber}, 实际 ${result.accountNumber}`);
        passed = false;
      }
      if (result.bankName !== testCase.expectedBankName) {
        console.error(`❌ bankName 不匹配: 预期 ${testCase.expectedBankName}, 实际 ${result.bankName}`);
        passed = false;
      }

      if (passed) {
        console.log("✅ 测试通过");
      } else {
        console.log("❌ 测试失败");
      }

    } catch (error) {
      console.error("测试失败，发生错误:", error);
      if (error instanceof TRPCError) {
        console.error("TRPCError code:", error.code);
        console.error("TRPCError message:", error.message);
      }
    }
  }

  console.log("银行账号识别功能测试结束。");
}

testBankRecognition();
