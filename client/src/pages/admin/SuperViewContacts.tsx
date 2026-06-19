import { useState } from "react";
import { useLocation } from "wouter";
import { trpc } from "@/lib/trpc";
import { ArrowLeft, Search, User, Users } from "lucide-react";
import { Input } from "@/components/ui/input";

export default function SuperViewContacts() {
  const [, navigate] = useLocation();
  const [searchQuery, setSearchQuery] = useState("");
  const [page, setPage] = useState(1);

  // 从 URL 参数获取 targetUserId
  const params = new URLSearchParams(window.location.search);
  const targetUserId = parseInt(params.get("userId") || "0", 10);

  const { data, isLoading } = trpc.admin.getUserContacts.useQuery(
    { targetUserId, page, pageSize: 50, searchQuery: searchQuery || undefined },
    { enabled: targetUserId > 0 }
  );

  if (!targetUserId) {
    return (
      <div className="flex flex-col items-center justify-center min-h-screen bg-[#F5F5F5]">
        <p className="text-gray-500">参数错误</p>
        <button onClick={() => navigate("/")} className="mt-4 text-[#D32F2F]">返回首页</button>
      </div>
    );
  }

  const targetUser = data?.targetUser;
  const contacts = data?.contacts || [];

  return (
    <div className="flex flex-col min-h-screen bg-[#F5F5F5]">
      {/* 顶部导航 */}
      <div className="bg-[#D32F2F] text-white px-4 pt-12 pb-4 flex items-center gap-3">
        <button onClick={() => navigate("/")} className="p-1">
          <ArrowLeft className="w-5 h-5" />
        </button>
        <div className="flex-1">
          <div className="text-base font-bold">
            {targetUser ? `${targetUser.name || targetUser.username} 的人脉` : "人脉视图"}
          </div>
          <div className="text-xs text-red-200">超级视角 · 共 {data?.total ?? 0} 人</div>
        </div>
        <Users className="w-5 h-5 text-red-200" />
      </div>

      {/* 搜索框 */}
      <div className="px-4 py-3 bg-white shadow-sm">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
          <Input
            value={searchQuery}
            onChange={(e) => { setSearchQuery(e.target.value); setPage(1); }}
            placeholder="搜索姓名、公司..."
            className="pl-9 bg-[#F5F5F5] border-0 rounded-full text-sm"
          />
        </div>
      </div>

      {/* 人脉列表 */}
      <div className="flex-1 px-4 py-3 space-y-2">
        {isLoading ? (
          <div className="flex justify-center py-12">
            <div className="w-6 h-6 border-2 border-[#D32F2F] border-t-transparent rounded-full animate-spin" />
          </div>
        ) : contacts.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16 text-gray-400">
            <Users className="w-12 h-12 mb-3 opacity-30" />
            <p className="text-sm">暂无人脉数据</p>
          </div>
        ) : (
          contacts.map((contact: any) => (
            <div key={contact.id} className="bg-white rounded-xl px-4 py-3 flex items-center gap-3 shadow-sm">
              <div className="w-10 h-10 rounded-full bg-gradient-to-br from-[#A80000] to-[#d44] flex items-center justify-center overflow-hidden flex-shrink-0">
                {contact.avatar ? (
                  <img src={contact.avatar} alt="" className="w-full h-full object-cover" />
                ) : (
                  <User className="w-5 h-5 text-white" />
                )}
              </div>
              <div className="flex-1 min-w-0">
                <div className="font-medium text-sm text-gray-900 truncate">
                  {contact.name || contact.nickname || "未命名"}
                </div>
                {contact.company && (
                  <div className="text-xs text-gray-500 truncate">{contact.company}</div>
                )}
              </div>
              {contact.phone && (
                <div className="text-xs text-gray-400 flex-shrink-0">{contact.phone}</div>
              )}
            </div>
          ))
        )}

        {/* 分页 */}
        {data && data.hasMore && (
          <div className="flex justify-center py-4">
            <button
              onClick={() => setPage(p => p + 1)}
              className="px-6 py-2 bg-[#D32F2F] text-white rounded-full text-sm"
            >
              加载更多
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
