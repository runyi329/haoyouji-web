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
      <div className="min-h-screen bg-gradient-to-br from-purple-50 to-pink-50 dark:from-gray-900 dark:to-gray-800">
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
      <div className="min-h-screen bg-gradient-to-br from-purple-50 to-pink-50 dark:from-gray-900 dark:to-gray-800">
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
                className="mt-3 px-4 py-2 bg-purple-500 text-white rounded-lg text-sm"
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
    <div className="min-h-screen bg-gradient-to-br from-purple-50 to-pink-50 dark:from-gray-900 dark:to-gray-800">
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
              <div className="inline-flex items-center justify-center w-8 h-8 rounded-full bg-purple-100 dark:bg-purple-900/50">
                <UserPlus className="w-4 h-4 text-purple-600 dark:text-purple-400" />
              </div>
              <div>
                <p className="text-xs text-gray-600 dark:text-gray-400">已邀请好友</p>
                <p className="text-xl font-bold text-purple-600 dark:text-purple-400">
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
              className="w-full pl-9 pr-3 py-2 bg-white/80 dark:bg-gray-800/80 backdrop-blur-sm rounded-lg border border-gray-200 dark:border-gray-700 text-sm focus:outline-none focus:ring-2 focus:ring-purple-500"
            />
          </div>

          {/* 排序按钮 */}
          <div className="relative">
            <button
              onClick={() => setShowSortMenu(!showSortMenu)}
              className="flex items-center gap-1 px-3 py-2 bg-white/80 dark:bg-gray-800/80 backdrop-blur-sm rounded-lg border border-gray-200 dark:border-gray-700 text-sm hover:bg-white dark:hover:bg-gray-800 transition-colors whitespace-nowrap"
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
                <div className="absolute right-0 top-full mt-1 w-36 bg-white dark:bg-gray-800 rounded-lg shadow-lg border border-gray-200 dark:border-gray-700 overflow-hidden z-20">
                  {sortOptions.map((option) => (
                    <button
                      key={option.value}
                      onClick={() => {
                        setSortType(option.value);
                        setShowSortMenu(false);
                      }}
                      className={`w-full px-3 py-2 text-left text-sm hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors ${
                        sortType === option.value
                          ? "bg-purple-50 dark:bg-purple-900/20 text-purple-600 dark:text-purple-400 font-medium"
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
                <CardContent className="p-3">
                  <div className="flex items-center gap-2">
                    {/* 头像 - 缩小 */}
                    <div className="flex-shrink-0">
                      {friend.avatar ? (
                        <img
                          src={friend.avatar}
                          alt={friend.name || friend.username || "用户"}
                          className="w-10 h-10 rounded-full object-cover"
                        />
                      ) : (
                        <div className="w-10 h-10 rounded-full bg-gradient-to-br from-purple-400 to-pink-400 flex items-center justify-center text-white font-bold text-sm">
                          {(friend.name || friend.username || "?").charAt(0).toUpperCase()}
                        </div>
                      )}
                    </div>

                    {/* 用户信息和统计 - 紧凑布局 */}
                    <div className="flex-1 min-w-0">
                      {/* 用户名 */}
                      <div className="flex items-center gap-1 mb-1">
                        <h3 className="font-semibold text-sm text-gray-900 dark:text-gray-100 truncate">
                          {friend.name || friend.username || "未命名用户"}
                        </h3>
                        {friend.username && friend.name && (
                          <span className="text-xs text-gray-400 truncate">@{friend.username}</span>
                        )}
                      </div>

                      {/* 人脉统计 - 横向紧凑布局 */}
                      <div className="flex gap-2">
                        {/* 我的 */}
                        <div className="flex items-center gap-1 px-2 py-1 rounded bg-blue-50 dark:bg-blue-900/20">
                          <Users className="w-3 h-3 text-blue-600 dark:text-blue-400" />
                          <span className="text-xs text-blue-600 dark:text-blue-400 font-semibold">
                            {friend.ownContactsCount}
                          </span>
                        </div>

                        {/* 共享 */}
                        <div className="flex items-center gap-1 px-2 py-1 rounded bg-green-50 dark:bg-green-900/20">
                          <Share className="w-3 h-3 text-green-600 dark:text-green-400" />
                          <span className="text-xs text-green-600 dark:text-green-400 font-semibold">
                            {friend.sharedContactsCount}
                          </span>
                        </div>

                        {/* 全部 */}
                        <div className="flex items-center gap-1 px-2 py-1 rounded bg-purple-50 dark:bg-purple-900/20">
                          <Users className="w-3 h-3 text-purple-600 dark:text-purple-400" />
                          <span className="text-xs text-purple-600 dark:text-purple-400 font-semibold">
                            {friend.totalContactsCount}
                          </span>
                        </div>
                      </div>

                      {/* 注册时间 - 更小字号 */}
                      {(friend.invitedAt || friend.createdAt) && (
                        <p className="text-xs text-gray-400 mt-1">
                          {new Date(friend.invitedAt || friend.createdAt).toLocaleDateString('zh-CN', {
                            year: 'numeric',
                            month: 'numeric',
                            day: 'numeric'
                          })}
                        </p>
                      )}
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
