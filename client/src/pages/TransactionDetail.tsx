import { useState } from "react";
import { Link, useLocation, useRoute } from "wouter";
import { ChevronLeft, ChevronRight, Edit, Image, PenTool } from "lucide-react";

export default function TransactionDetail() {
  const [, params] = useRoute("/ledger/:ledgerId/transaction/:transactionId");
  const [, setLocation] = useLocation();

  const ledgerId = params?.ledgerId ? parseInt(params.ledgerId) : 1;
  const transactionId = params?.transactionId ? parseInt(params.transactionId) : 1;



  // 模拟数据
  const transaction = {
    id: transactionId,
    category: "交通",
    subcategory: "停车费",
    amount: -38,
    type: "expense",
    account: "银行转账",
    payer: {
      name: "Yunting",
      avatar: "",
    },
    date: "2026-01-11",
    note: "",
    hasImage: false,
    creator: {
      name: "Yunting",
      avatar: "",
    },
    createdAt: "2026-01-11 10:44:03",
    source: "手动记账",
    status: "计入收支",
  };

  return (
    <div className="min-h-screen bg-gray-50 flex flex-col">
      {/* 顶部导航栏 */}
      <div className="bg-[#bde4f4] text-[#404969]">
        <div className="flex items-center justify-between px-4 py-3">
          <button
            onClick={() => setLocation(`/ledger/${ledgerId}`)}
            className="p-1"
          >
            <ChevronLeft className="w-6 h-6" />
          </button>
          <h1 className="text-lg font-medium">账目详细</h1>
          <div className="w-6"></div>
        </div>
      </div>

      {/* 第一行信息 */}
      <div className="bg-white px-4 py-3 flex items-center justify-between border-b border-gray-200">
        <div className="flex items-center gap-2 text-sm text-gray-600">
          <span>日志</span>
          <span>成员 {transaction.payer.name}</span>
          <span>添加</span>
          <span>账目</span>
        </div>
        <ChevronRight className="w-5 h-5 text-gray-400" />
      </div>

      {/* 分类信息卡片 */}
      <div className="bg-white px-4 py-6 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className="w-3 h-3 rounded-full bg-red-500"></span>
          <span className="text-lg text-gray-900">
            {transaction.category}–{transaction.subcategory}
          </span>
        </div>
        <div className="text-right">
          <div className="text-xs text-gray-500 mb-1">
            {transaction.type === "expense" ? "支出" : "收入"}
          </div>
          <div className="text-3xl font-medium text-gray-900">
            {Math.abs(transaction.amount)}
          </div>
        </div>
      </div>

      {/* 详细信息列表 */}
      <div className="bg-white mt-3">
        <DetailItem label="账户" value={transaction.account} />
        <DetailItem
          label="支出人"
          rightContent={
            <div className="flex items-center gap-2">
              <div className="w-8 h-8 rounded-full bg-blue-400 flex items-center justify-center text-white text-sm">
                Y
              </div>
              <span className="text-gray-900">{transaction.payer.name}</span>
            </div>
          }
        />
        <DetailItem label="日期" value={transaction.date} />
        <DetailItem label="备注" value={transaction.note || "未填写"} />
        <DetailItem label="凭证图片" value={transaction.hasImage ? "" : "未上传"} />
      </div>

      {/* 添加信息 */}
      <div className="bg-white mt-3">
        <DetailItem
          label="添加人"
          rightContent={
            <div className="flex items-center gap-2">
              <div className="w-8 h-8 rounded-full bg-blue-400 flex items-center justify-center text-white text-sm">
                Y
              </div>
              <span className="text-gray-900">{transaction.creator.name}</span>
            </div>
          }
        />
        <DetailItem label="添加时间" value={transaction.createdAt} />
        <DetailItem label="添加来源" value={transaction.source} />
        <DetailItem label="入账状态" value={transaction.status} />
      </div>

      {/* 底部按钮区域 */}
      <div className="flex-1"></div>
      <div className="bg-white px-4 py-3 space-y-3">
        <button className="w-full py-3 bg-white border border-gray-300 rounded-lg text-gray-900 font-medium text-base">
          修改账目
        </button>
        <button className="w-full py-3 bg-[#ff7f50] hover:bg-[#bde4f4] text-white hover:text-[#404969] rounded-lg font-medium text-base">
          删除账目
        </button>
      </div>

      {/* 底部工具栏 */}
      <div className="bg-white border-t border-gray-200 px-4 py-3 flex items-center gap-4">
        <div className="flex items-center gap-2 flex-1">
          <Edit className="w-5 h-5 text-gray-600" />
          <span className="text-sm text-gray-600">给账目写文字评论</span>
          <span className="text-xs text-orange-500 bg-orange-50 px-1.5 py-0.5 rounded ml-auto">
            VIP
          </span>
        </div>
        <button className="p-2">
          <Image className="w-5 h-5 text-gray-600" />
        </button>
        <button className="flex items-center gap-1 text-sm text-gray-900">
          <PenTool className="w-4 h-4" />
          <span>手写签字</span>
        </button>
      </div>
    </div>
  );
}

// 详细信息项组件
interface DetailItemProps {
  label: string;
  value?: string;
  rightContent?: React.ReactNode;
}

function DetailItem({ label, value, rightContent }: DetailItemProps) {
  return (
    <div className="flex items-center justify-between px-4 py-3 border-b border-gray-100 last:border-b-0">
      <span className="text-sm text-gray-600">{label}</span>
      {rightContent ? (
        rightContent
      ) : (
        <span className="text-sm text-gray-900">{value}</span>
      )}
    </div>
  );
}
