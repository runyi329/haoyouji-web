/**
 * 企业微信应用菜单创建脚本
 * 运行方式: npx tsx scripts/create-wecom-menu.ts
 * 
 * 菜单结构: 3个一级菜单，每个5个子菜单（共15个按钮位）
 */

const CORP_ID = "wwbbaccf1da5f886d9";
const CORP_SECRET = "3-XQAnU8_8iKPA74O6_Gw3YQPdOIA2nIv4ILXpxcZ2g";
const AGENT_ID = "1000002";

async function getAccessToken(): Promise<string> {
  const url = `https://qyapi.weixin.qq.com/cgi-bin/gettoken?corpid=${CORP_ID}&corpsecret=${CORP_SECRET}`;
  const res = await fetch(url);
  const data = await res.json() as any;
  if (data.errcode !== 0) {
    throw new Error(`获取access_token失败: ${JSON.stringify(data)}`);
  }
  console.log("access_token 获取成功");
  return data.access_token;
}

async function createMenu(accessToken: string) {
  const menu = {
    button: [
      {
        name: "切换模型",
        sub_button: [
          { type: "click", name: "Max 模式", key: "MODEL_MAX" },
          { type: "click", name: "标准模式", key: "MODEL_NORMAL" },
          { type: "click", name: "轻量模式", key: "MODEL_LITE" },
          { type: "click", name: "当前模型", key: "MODEL_STATUS" },
          { type: "click", name: "预留", key: "RESERVED_1_5" },
        ],
      },
      {
        name: "工具箱",
        sub_button: [
          { type: "click", name: "查积分", key: "CREDITS_QUERY" },
          { type: "click", name: "新对话", key: "NEW_CONVERSATION" },
          { type: "click", name: "任务状态", key: "TASK_STATUS" },
          { type: "click", name: "预留", key: "RESERVED_2_4" },
          { type: "click", name: "预留", key: "RESERVED_2_5" },
        ],
      },
      {
        name: "更多",
        sub_button: [
          { type: "click", name: "使用帮助", key: "HELP" },
          { type: "click", name: "意见反馈", key: "FEEDBACK" },
          { type: "click", name: "预留", key: "RESERVED_3_3" },
          { type: "click", name: "预留", key: "RESERVED_3_4" },
          { type: "click", name: "预留", key: "RESERVED_3_5" },
        ],
      },
    ],
  };

  const url = `https://qyapi.weixin.qq.com/cgi-bin/menu/create?access_token=${accessToken}&agentid=${AGENT_ID}`;
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(menu),
  });
  const data = await res.json() as any;
  if (data.errcode !== 0) {
    throw new Error(`创建菜单失败: ${JSON.stringify(data)}`);
  }
  console.log("菜单创建成功:", JSON.stringify(data));
}

async function main() {
  try {
    const token = await getAccessToken();
    await createMenu(token);
    console.log("\n菜单结构:");
    console.log("├── 切换模型");
    console.log("│   ├── Max 模式 (MODEL_MAX)");
    console.log("│   ├── 标准模式 (MODEL_NORMAL)");
    console.log("│   ├── 轻量模式 (MODEL_LITE)");
    console.log("│   ├── 当前模型 (MODEL_STATUS)");
    console.log("│   └── 预留 (RESERVED_1_5)");
    console.log("├── 工具箱");
    console.log("│   ├── 查积分 (CREDITS_QUERY)");
    console.log("│   ├── 新对话 (NEW_CONVERSATION)");
    console.log("│   ├── 任务状态 (TASK_STATUS)");
    console.log("│   ├── 预留 (RESERVED_2_4)");
    console.log("│   └── 预留 (RESERVED_2_5)");
    console.log("├── 更多");
    console.log("│   ├── 使用帮助 (HELP)");
    console.log("│   ├── 意见反馈 (FEEDBACK)");
    console.log("│   ├── 预留 (RESERVED_3_3)");
    console.log("│   ├── 预留 (RESERVED_3_4)");
    console.log("│   └── 预留 (RESERVED_3_5)");
  } catch (e) {
    console.error("错误:", e);
    process.exit(1);
  }
}

main();
