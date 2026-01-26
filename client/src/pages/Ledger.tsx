import { useState } from "react";
import { useLocation } from "wouter";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Crown, BookOpen } from "lucide-react";
import BottomNav from "@/components/BottomNav";

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

  // 根据当前标签页过滤账本（这里暂时都显示在"使用中"）
  const filteredLedgers = activeTab === "active" ? mockLedgers : [];

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-50 pb-20">
      {/* 页面标题 */}
      <div className="bg-white shadow-sm">
        <div className="container py-4 px-4">
          <h1 className="text-2xl font-bold text-center text-gray-800">脉动账本</h1>
        </div>
      </div>

      {/* 切换按钮 */}
      <div className="container px-4 py-4">
        <div className="flex gap-2 bg-white rounded-lg p-1 shadow-sm">
          <button
            onClick={() => setActiveTab("active")}
            className={`flex-1 py-2 px-4 rounded-md text-sm font-medium transition-colors ${
              activeTab === "active"
                ? "bg-blue-500 text-white"
                : "text-gray-600 hover:bg-gray-100"
            }`}
          >
            使用中
          </button>
          <button
            onClick={() => setActiveTab("archived")}
            className={`flex-1 py-2 px-4 rounded-md text-sm font-medium transition-colors ${
              activeTab === "archived"
                ? "bg-blue-500 text-white"
                : "text-gray-600 hover:bg-gray-100"
            }`}
          >
            已存档
          </button>
        </div>
      </div>

      {/* 账本列表 */}
      <div className="container px-4 pb-4 space-y-4">
        {filteredLedgers.length === 0 ? (
          <Card className="p-8 text-center">
            <p className="text-gray-500">暂无{activeTab === "active" ? "使用中" : "已存档"}的账本</p>
          </Card>
        ) : (
          filteredLedgers.map((ledger) => (
            <Card
              key={ledger.id}
              className="p-4 cursor-pointer hover:shadow-md transition-shadow"
              onClick={() => setLocation(`/ledger/${ledger.id}`)}
            >
              {/* 账本名称和VIP标识 */}
              <div className="flex items-center gap-2 mb-3">
                <div className="w-10 h-10 bg-blue-100 rounded-lg flex items-center justify-center">
                  <BookOpen className="w-5 h-5 text-blue-600" />
                </div>
                <div className="flex-1">
                  <div className="flex items-center gap-2">
                    <h3 className="font-semibold text-gray-800">{ledger.name}</h3>
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
              <div className="flex items-center gap-2 mb-3">
                <div className="flex -space-x-2">
                  {ledger.members.slice(0, 4).map((member, index) => (
                    <div
                      key={member.id}
                      className="w-8 h-8 rounded-full bg-gradient-to-br from-blue-400 to-purple-500 border-2 border-white flex items-center justify-center text-white text-xs font-medium"
                      style={{ zIndex: ledger.members.length - index }}
                    >
                      {index + 1}
                    </div>
                  ))}
                </div>
                <span className="text-sm text-gray-500">{ledger.memberCount}人共享+</span>
              </div>

              {/* 操作按钮 */}
              <div className="flex gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  className="text-xs px-3 py-1 h-7"
                  onClick={(e) => {
                    e.stopPropagation();
                    // TODO: 打开设置
                  }}
                >
                  设置
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  className="text-xs px-3 py-1 h-7"
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
                  className="text-xs px-3 py-1 h-7"
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
                  className="text-xs px-3 py-1 h-7"
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
                  className="text-xs px-3 py-1 h-7"
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
      <div className="fixed bottom-20 left-0 right-0 px-4 pb-4 bg-gradient-to-t from-white via-white to-transparent pt-4">
        <div className="container flex gap-3">
          <Button
            variant="outline"
            className="flex-1 bg-orange-500 hover:bg-orange-600 text-white border-0 shadow-lg"
            onClick={() => {
              // TODO: 加入他人账本
            }}
          >
            加入他人账本
          </Button>
          <Button
            className="flex-1 bg-blue-500 hover:bg-blue-600 text-white shadow-lg"
            onClick={() => {
              // TODO: 创建新账本
            }}
          >
            创建新的账本
          </Button>
        </div>
      </div>

      {/* 底部导航栏 */}
      <BottomNav />
    </div>
  );
}
