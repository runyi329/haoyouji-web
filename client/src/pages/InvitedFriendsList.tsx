import { useState, useMemo } from "react";
import { useLocation } from "wouter";
import { Card, CardContent } from "@/components/ui/card";
import { ArrowLeft, Users, UserPlus, Share, Search, ArrowUpDown } from "lucide-react";
import { trpc } from "@/lib/trpc";

type SortType = "time_desc" | "time_asc" | "own_desc" | "shared_desc" | "total_desc";

export default function InvitedFriendsList() {
  const [, setLocation] = useLocation();
  const [searchQuery, setSearchQuery] = useState("");
  const [sortType, setSortType] = useState<SortType>("time_desc");
  const [showSortMenu, setShowSortMenu] = useState(false);

  // 获取邀请好友列表
  const { data: friends, isLoading, error } = trpc.invite.getMyInvitedFriends.useQuery();

  // 排序选项
  const sortOptions = [
    { value: "time_desc" as SortType, label: "最新邀请" },
    { value: "time_asc" as SortType, label: "最早邀请" },
    { value: "own_desc" as SortType, label: "我的人脉↓" },
    { value: "shared_desc" as SortType, label: "共享人脉↓" },
    { value: "total_desc" as SortType, label: "全部人脉↓" },
  ];

  // 搜索和排序后的好友列表
  const filteredAndSortedFriends = useMemo(() => {
    if (!friends) return [];

    // 1. 搜索过滤
    let result = friends.filter((friend) => {
      const searchLower = searchQuery.toLowerCase();
      const username = (friend.username || "").toLowerCase();
      const name = (friend.name || "").toLowerCase();
      return username.includes(searchLower) || name.includes(searchLower);
    });

    // 2. 排序
    result.sort((a, b) => {
      switch (sortType) {
        case "time_desc":
          return new Date(b.invitedAt || b.createdAt).getTime() - new Date(a.invitedAt || a.createdAt).getTime();
        case "time_asc":
          return new Date(a.invitedAt || a.createdAt).getTime() - new Date(b.invitedAt || b.createdAt).getTime();
        case "own_desc":
          return b.ownContactsCount - a.ownContactsCount;
        case "shared_desc":
          return b.sharedContactsCount - a.sharedContactsCount;
        case "total_desc":
          return b.totalContactsCount - a.totalContactsCount;
        default:
          return 0;
      }
    });

    return result;
  }, [friends, searchQuery, sortType]);

  if (isLoading) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-red-50 to-rose-50 dark:from-gray-900 dark:to-gray-800">
        <div className="p-4">
          <div className="flex items-center gap-3 mb-4">
            <button
              onClick={() => setLocation("/parent/profile/invite")}
              className="p-2 hover:bg-white/50 dark:hover:bg-gray-800/50 rounded-lg transition-colors"
            >
              <ArrowLeft className="w-5 h-5" />
            </button>
            <h1 className="text-xl font-bold">我邀请的好友</h1>
          </div>
          <div className="text-center py-8 text-gray-500">加载中...</div>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-red-50 to-rose-50 dark:from-gray-900 dark:to-gray-800">
        <div className="p-4">
          <div className="flex items-center gap-3 mb-4">
            <button
              onClick={() => setLocation("/parent/profile/invite")}
              className="p-2 hover:bg-white/50 dark:hover:bg-gray-800/50 rounded-lg transition-colors"
            >
              <ArrowLeft className="w-5 h-5" />
            </button>
            <h1 className="text-xl font-bold">我邀请的好友</h1>
          </div>
          <Card className="bg-white/80 dark:bg-gray-800/80 backdrop-blur-sm">
            <CardContent className="p-8 text-center">
              <p className="text-red-500">加载失败: {error.message}</p>
              <button
                onClick={() => window.location.reload()}
                className="mt-3 px-4 py-2 bg-[#A80000] text-white rounded-lg text-sm"
              >
                重试
              </button>
            </CardContent>
          </Card>
        </div>
      </div>
    );
  }

  const currentSortLabel = sortOptions.find(opt => opt.value === sortType)?.label || "排序";

  return (
    <div className="min-h-screen bg-gradient-to-br from-red-50 to-rose-50 dark:from-gray-900 dark:to-gray-800">
      <div className="p-3 space-y-3">
        {/* 头部 */}
        <div className="flex items-center gap-3">
          <button
            onClick={() => setLocation("/parent/profile/invite")}
            className="p-2 hover:bg-white/50 dark:hover:bg-gray-800/50 rounded-lg transition-colors"
          >
            <ArrowLeft className="w-5 h-5" />
          </button>
          <h1 className="text-lg font-bold">我邀请的好友</h1>
        </div>

        {/* 统计卡片 - 压缩高度 */}
        <Card className="bg-white/80 dark:bg-gray-800/80 backdrop-blur-sm">
          <CardContent className="p-3">
            <div className="flex items-center gap-2">
              <div className="inline-flex items-center justify-center w-8 h-8 rounded-full bg-red-100 dark:bg-red-900/50">
                <UserPlus className="w-4 h-4 text-[#A80000] dark:text-red-400" />
              </div>
              <div>
                <p className="text-xs text-stable-gray dark:text-gray-400">已邀请好友</p>
                <p className="text-xl font-bold text-[#A80000] dark:text-red-400">
                  {friends?.length || 0}<span className="text-xs font-normal ml-1">人</span>
                </p>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* 搜索和排序栏 */}
        <div className="flex gap-2">
          {/* 搜索框 */}
          <div className="flex-1 relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
            <input
              type="text"
              placeholder="搜索用户名或昵称..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full pl-9 pr-3 py-2 bg-white/80 dark:bg-gray-800/80 backdrop-blur-sm rounded-lg border border-divider dark:border-gray-700 text-sm focus:outline-none focus:ring-2 focus:ring-[#A80000]"
            />
          </div>

          {/* 排序按钮 */}
          <div className="relative">
            <button
              onClick={() => setShowSortMenu(!showSortMenu)}
              className="flex items-center gap-1 px-3 py-2 bg-white/80 dark:bg-gray-800/80 backdrop-blur-sm rounded-lg border border-divider dark:border-gray-700 text-sm hover:bg-white-pure dark:hover:bg-gray-800 transition-colors whitespace-nowrap"
            >
              <ArrowUpDown className="w-4 h-4" />
              <span>{currentSortLabel}</span>
            </button>

            {/* 排序菜单 */}
            {showSortMenu && (
              <>
                {/* 遮罩层 */}
                <div
                  className="fixed inset-0 z-10"
                  onClick={() => setShowSortMenu(false)}
                />
                {/* 菜单 */}
                <div className="absolute right-0 top-full mt-1 w-36 bg-white-pure dark:bg-gray-800 rounded-lg shadow-lg border border-divider dark:border-gray-700 overflow-hidden z-20">
                  {sortOptions.map((option) => (
                    <button
                      key={option.value}
                      onClick={() => {
                        setSortType(option.value);
                        setShowSortMenu(false);
                      }}
                      className={`w-full px-3 py-2 text-left text-sm hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors ${
                        sortType === option.value
                          ? "bg-brand-red-light dark:bg-red-900/20 text-[#A80000] dark:text-red-400 font-medium"
                          : ""
                      }`}
                    >
                      {option.label}
                    </button>
                  ))}
                </div>
              </>
            )}
          </div>
        </div>

        {/* 好友列表 */}
        {!friends || friends.length === 0 ? (
          <Card className="bg-white/80 dark:bg-gray-800/80 backdrop-blur-sm">
            <CardContent className="p-6 text-center">
              <Users className="w-10 h-10 mx-auto mb-2 text-gray-400" />
              <p className="text-gray-500 text-sm">还没有邀请好友</p>
              <p className="text-xs text-gray-400 mt-1">分享你的邀请码给好友吧</p>
            </CardContent>
          </Card>
        ) : filteredAndSortedFriends.length === 0 ? (
          <Card className="bg-white/80 dark:bg-gray-800/80 backdrop-blur-sm">
            <CardContent className="p-6 text-center">
              <Search className="w-10 h-10 mx-auto mb-2 text-gray-400" />
              <p className="text-gray-500 text-sm">未找到匹配的好友</p>
              <p className="text-xs text-gray-400 mt-1">试试其他关键词</p>
            </CardContent>
          </Card>
        ) : (
          <div className="space-y-2">
            {filteredAndSortedFriends.map((friend) => (
              <Card key={friend.id} className="bg-white/80 dark:bg-gray-800/80 backdrop-blur-sm">
                <CardContent className="p-4 space-y-3">
                  {/* 第一排：头像 + 名字 + 注册时间 */}
                  <div className="flex items-center gap-3">
                    {/* 头像 */}
                    <div className="flex-shrink-0">
                      {friend.avatar ? (
                        <img
                          src={friend.avatar}
                          alt={friend.name || friend.username || "用户"}
                          className="w-12 h-12 rounded-full object-cover"
                        />
                      ) : (
                        <div className="w-12 h-12 rounded-full bg-gradient-to-br from-[#A80000] to-[#d44] flex items-center justify-center text-white font-bold text-base">
                          {(friend.name || friend.username || "?").charAt(0).toUpperCase()}
                        </div>
                      )}
                    </div>

                    {/* 名字和注册时间 */}
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <h3 className="font-semibold text-base text-core-black dark:text-gray-100 truncate">
                          {friend.name || friend.username || "未命名用户"}
                        </h3>
                        {friend.username && friend.name && (
                          <span className="text-sm text-gray-400 truncate">@{friend.username}</span>
                        )}
                      </div>
                      {(friend.invitedAt || friend.createdAt) && (
                        <p className="text-xs text-gray-400 mt-0.5">
                          注册于 {new Date(friend.invitedAt || friend.createdAt).toLocaleDateString('zh-CN', {
                            year: 'numeric',
                            month: 'numeric',
                            day: 'numeric'
                          })}
                        </p>
                      )}
                    </div>
                  </div>

                  {/* 第二排：人脉统计 */}
                  <div className="flex gap-2 flex-wrap">
                    {/* 我的 */}
                    <div className="flex items-center gap-1 px-3 py-1.5 rounded bg-blue-50 dark:bg-blue-900/20">
                      <Users className="w-4 h-4 text-blue-600 dark:text-blue-400" />
                      <span className="text-xs text-stable-gray dark:text-gray-400">我的</span>
                      <span className="text-sm text-blue-600 dark:text-blue-400 font-semibold">
                        {friend.ownContactsCount}
                      </span>
                    </div>

                    {/* 共享 */}
                    <div className="flex items-center gap-1 px-3 py-1.5 rounded bg-green-50 dark:bg-green-900/20">
                      <Share className="w-4 h-4 text-green-600 dark:text-green-400" />
                      <span className="text-xs text-stable-gray dark:text-gray-400">共享</span>
                      <span className="text-sm text-green-600 dark:text-green-400 font-semibold">
                        {friend.sharedContactsCount}
                      </span>
                    </div>

                    {/* 全部 */}
                    <div className="flex items-center gap-1 px-3 py-1.5 rounded bg-brand-red-light dark:bg-red-900/20">
                      <Users className="w-4 h-4 text-[#A80000] dark:text-red-400" />
                      <span className="text-xs text-stable-gray dark:text-gray-400">全部</span>
                      <span className="text-sm text-[#A80000] dark:text-red-400 font-semibold">
                        {friend.totalContactsCount}
                      </span>
                    </div>
                    
                    {/* 标签数 */}
                    <div className="flex items-center gap-1 px-3 py-1.5 rounded bg-purple-50 dark:bg-purple-900/20">
                      <svg className="w-4 h-4 text-purple-600 dark:text-purple-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 7h.01M7 3h5c.512 0 1.024.195 1.414.586l7 7a2 2 0 010 2.828l-7 7a2 2 0 01-2.828 0l-7-7A1.994 1.994 0 013 12V7a4 4 0 014-4z" />
                      </svg>
                      <span className="text-xs text-stable-gray dark:text-gray-400">标签</span>
                      <span className="text-sm text-purple-600 dark:text-purple-400 font-semibold">
                        {friend.tagsCount || 0}
                      </span>
                    </div>
                    
                    {/* 联络数 */}
                    <div className="flex items-center gap-1 px-3 py-1.5 rounded bg-orange-50 dark:bg-orange-900/20">
                      <svg className="w-4 h-4 text-orange-600 dark:text-orange-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
                      </svg>
                      <span className="text-xs text-stable-gray dark:text-gray-400">联络</span>
                      <span className="text-sm text-orange-600 dark:text-orange-400 font-semibold">
                        {friend.interactionsCount || 0}
                      </span>
                    </div>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
