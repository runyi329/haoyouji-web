import { useState } from "react";
import { Link, useLocation } from "wouter";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Crown, BookOpen, ChevronLeft } from "lucide-react";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import { trpc } from "@/lib/trpc";


// 模拟账本数据
const mockLedgers = [
  {
    id: 1,
    name: "家庭记账",
    isVip: true,
    members: [
      { id: 1, avatar: "" },
      { id: 2, avatar: "" },
      { id: 3, avatar: "" },
    ],
    memberCount: 3,
  },
  {
    id: 2,
    name: "生意账本",
    isVip: true,
    members: [
      { id: 1, avatar: "" },
      { id: 2, avatar: "" },
    ],
    memberCount: 2,
  },
  {
    id: 3,
    name: "澳门润仪投资有限公司",
    isVip: true,
    members: [
      { id: 1, avatar: "" },
      { id: 2, avatar: "" },
      { id: 3, avatar: "" },
      { id: 4, avatar: "" },
    ],
    memberCount: 4,
  },
  {
    id: 4,
    name: "上海润豆仪豆贸易有限公司",
    isVip: true,
    members: [
      { id: 1, avatar: "" },
      { id: 2, avatar: "" },
      { id: 3, avatar: "" },
      { id: 4, avatar: "" },
    ],
    memberCount: 4,
  },
];

export default function Ledger() {
  const [, setLocation] = useLocation();
  const [activeTab, setActiveTab] = useState<"active" | "archived">("active");
  const [showCreateDialog, setShowCreateDialog] = useState(false);

  // 从后端API获取账本列表
  const { data: ledgers, isLoading } = trpc.ledger.list.useQuery({
    isArchived: activeTab === "archived",
  });

  const filteredLedgers = ledgers || [];

  return (
    <div className="min-h-screen bg-[#e0fcff] pb-20">
      {/* 顶部导航栏 */}
      <div className="bg-white shadow-sm">
        <div className="container py-3 px-4 flex items-center">
          <Link href="/contacts">
            <button
              className="p-2 -ml-2 hover:bg-gray-100 rounded-lg transition-colors"
            >
              <ChevronLeft className="w-6 h-6 text-gray-800" />
            </button>
          </Link>
          <h1 className="flex-1 text-lg font-medium text-center text-gray-800 -ml-6">我的账本</h1>
        </div>
      </div>

      {/* 切换按钮 */}
      <div className="container px-4 py-4">
        <div className="flex gap-2 bg-white rounded-lg p-1 shadow-sm">
          <button
            onClick={() => setActiveTab("active")}
            className={`flex-1 py-2 px-4 rounded-md text-sm font-medium transition-colors ${
              activeTab === "active"
                ? "bg-[#ff7f50] text-white"
                : "text-gray-600 hover:bg-gray-100"
            }`}
          >
            使用中
          </button>
          <button
            onClick={() => setActiveTab("archived")}
            className={`flex-1 py-2 px-4 rounded-md text-sm font-medium transition-colors ${
              activeTab === "archived"
                ? "bg-[#ff7f50] text-white"
                : "text-gray-600 hover:bg-gray-100"
            }`}
          >
            已存档
          </button>
        </div>
      </div>

      {/* 账本列表 */}
      <div className="container px-4 pb-4 space-y-4">
        {isLoading ? (
          <Card className="p-8 text-center">
            <p className="text-gray-500">加载中...</p>
          </Card>
        ) : filteredLedgers.length === 0 ? (
          <Card className="p-8 text-center">
            <p className="text-gray-500">暂无{activeTab === "active" ? "使用中" : "已存档"}的账本</p>
          </Card>
        ) : (
          filteredLedgers.map((ledger) => (
            <Card
              key={ledger.id}
              className="p-1.5 h-[100px] cursor-pointer hover:shadow-md transition-shadow overflow-hidden"
              onClick={() => setLocation(`/ledger/${ledger.id}`)}
            >
              {/* 账本名称和VIP标识 */}
              <div className="flex items-center gap-2 mb-1.5 h-6">
                <BookOpen className="w-6 h-6 text-blue-500" strokeWidth={1.5} />
                <div className="flex-1">
                  <div className="flex items-center gap-2">
                    <h3 className="font-semibold text-base leading-tight text-gray-800">{ledger.name}</h3>
                    {ledger.isVip && (
                      <Badge variant="secondary" className="bg-amber-100 text-amber-700 text-xs">
                        <Crown className="w-3 h-3 mr-1" />
                        VIP
                      </Badge>
                    )}
                  </div>
                </div>
              </div>

              {/* 成员头像 */}
              <div className="flex items-center gap-2 mb-1.5 h-8">
                <div className="flex -space-x-2">
                  {ledger.members.slice(0, 4).map((member, index) => (
                    <div
                      key={member.id}
                      className="w-8 h-8 rounded-full bg-[#bde4f4] border-2 border-white flex items-center justify-center text-[#404969] text-xs font-medium"
                      style={{ zIndex: ledger.members.length - index }}
                    >
                      {index + 1}
                    </div>
                  ))}
                </div>
                <span className="text-sm leading-tight text-gray-500">{ledger.memberCount}人共享+</span>
              </div>

              {/* 操作按钮 */}
              <div className="flex gap-0.5">
                <Button
                  variant="outline"
                  size="sm"
                  className="text-xs leading-tight px-2 py-0.5 h-6"
                  onClick={(e) => {
                    e.stopPropagation();
                    setLocation(`/ledger/${ledger.id}/settings`);
                  }}
                >
                  设置
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  className="text-xs leading-tight px-2 py-0.5 h-6"
                  onClick={(e) => {
                    e.stopPropagation();
                    // TODO: 导出
                  }}
                >
                  导出
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  className="text-xs leading-tight px-2 py-0.5 h-6"
                  onClick={(e) => {
                    e.stopPropagation();
                    // TODO: 查看明细
                  }}
                >
                  明细
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  className="text-xs leading-tight px-2 py-0.5 h-6"
                  onClick={(e) => {
                    e.stopPropagation();
                    // TODO: 查看报表
                  }}
                >
                  报表
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  className="text-xs leading-tight px-2 py-0.5 h-6"
                  onClick={(e) => {
                    e.stopPropagation();
                    // TODO: 邀请成员
                  }}
                >
                  邀请
                </Button>
              </div>
            </Card>
          ))
        )}
      </div>

      {/* 底部按钮 */}
      <div className="fixed bottom-0 left-0 right-0 px-4 pb-4 bg-white pt-4">
        <div className="container flex gap-3">
          <Button
            variant="outline"
            className="flex-1 bg-[#bde4f4] hover:bg-[#e0fcff] text-[#404969] border-0 shadow-lg"
            onClick={() => {
              // TODO: 加入他人账本
            }}
          >
            加入他人账本
          </Button>
          <Button
            className="flex-1 bg-[#ff7f50] hover:bg-[#bde4f4] text-white hover:text-[#404969] shadow-lg"
            onClick={() => setShowCreateDialog(true)}
          >
            创建新的账本
          </Button>
        </div>
      </div>



      {/* 创建账本对话框 */}
      <Dialog open={showCreateDialog} onOpenChange={setShowCreateDialog}>
        <DialogContent className="w-[85%] rounded-lg p-0 gap-0" showCloseButton={false}>
          <DialogTitle className="sr-only">创建账本</DialogTitle>
          <button
            onClick={() => {
              setShowCreateDialog(false);
              setLocation("/ledger/create-type");
            }}
            className="w-full text-center py-3.5 text-blue-500 font-medium border-b border-gray-200 hover:bg-gray-50 transition-colors"
          >
            新建全新账本
          </button>
          <button
            onClick={() => {
              setShowCreateDialog(false);
              // TODO: 实现复制已有账本功能
            }}
            className="w-full text-center py-3.5 text-blue-500 font-medium border-b border-gray-200 hover:bg-gray-50 transition-colors"
          >
            复制已有账本
          </button>
          <button
            onClick={() => setShowCreateDialog(false)}
            className="w-full text-center py-3.5 text-gray-600 font-medium hover:bg-gray-50 transition-colors"
          >
            取消
          </button>
        </DialogContent>
      </Dialog>


    </div>
  );
}
