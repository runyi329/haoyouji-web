import { useLocation } from "wouter";
import { Card, CardContent } from "@/components/ui/card";
import { ArrowLeft, Users, UserPlus, Share } from "lucide-react";
import { trpc } from "@/lib/trpc";

export default function InvitedFriendsList() {
  const [, setLocation] = useLocation();

  // 获取邀请好友列表
  const { data: friends, isLoading, error } = trpc.invite.getMyInvitedFriends.useQuery();
  
  // 调试日志
  console.log('[InvitedFriendsList] isLoading:', isLoading);
  console.log('[InvitedFriendsList] friends:', friends);
  console.log('[InvitedFriendsList] error:', error);

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

  return (
    <div className="min-h-screen bg-gradient-to-br from-purple-50 to-pink-50 dark:from-gray-900 dark:to-gray-800">
      <div className="p-4 space-y-4">
        {/* 头部 */}
        <div className="flex items-center gap-3 mb-4">
          <button
            onClick={() => setLocation("/parent/profile/invite")}
            className="p-2 hover:bg-white/50 dark:hover:bg-gray-800/50 rounded-lg transition-colors"
          >
            <ArrowLeft className="w-5 h-5" />
          </button>
          <h1 className="text-xl font-bold">我邀请的好友</h1>
        </div>

        {/* 统计卡片 */}
        <Card className="bg-white/80 dark:bg-gray-800/80 backdrop-blur-sm">
          <CardContent className="p-4">
            <div className="flex items-center gap-3">
              <div className="inline-flex items-center justify-center w-10 h-10 rounded-full bg-purple-100 dark:bg-purple-900/50">
                <UserPlus className="w-5 h-5 text-purple-600 dark:text-purple-400" />
              </div>
              <div>
                <p className="text-xs text-gray-600 dark:text-gray-400">已邀请好友</p>
                <p className="text-2xl font-bold text-purple-600 dark:text-purple-400">
                  {friends?.length || 0}<span className="text-sm font-normal ml-1">人</span>
                </p>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* 好友列表 */}
        {!friends || friends.length === 0 ? (
          <Card className="bg-white/80 dark:bg-gray-800/80 backdrop-blur-sm">
            <CardContent className="p-8 text-center">
              <Users className="w-12 h-12 mx-auto mb-3 text-gray-400" />
              <p className="text-gray-500">还没有邀请好友</p>
              <p className="text-sm text-gray-400 mt-1">分享你的邀请码给好友吧</p>
            </CardContent>
          </Card>
        ) : (
          <div className="space-y-3">
            {friends.map((friend) => (
              <Card key={friend.id} className="bg-white/80 dark:bg-gray-800/80 backdrop-blur-sm">
                <CardContent className="p-4">
                  <div className="flex items-start gap-3">
                    {/* 头像 */}
                    <div className="flex-shrink-0">
                      {friend.avatarUrl ? (
                        <img
                          src={friend.avatarUrl}
                          alt={friend.name || friend.username || "用户"}
                          className="w-12 h-12 rounded-full object-cover"
                        />
                      ) : (
                        <div className="w-12 h-12 rounded-full bg-gradient-to-br from-purple-400 to-pink-400 flex items-center justify-center text-white font-bold">
                          {(friend.name || friend.username || "?").charAt(0).toUpperCase()}
                        </div>
                      )}
                    </div>

                    {/* 用户信息和统计 */}
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-2">
                        <h3 className="font-semibold text-gray-900 dark:text-gray-100 truncate">
                          {friend.name || friend.username || "未命名用户"}
                        </h3>
                        {friend.username && friend.name && (
                          <span className="text-xs text-gray-500">@{friend.username}</span>
                        )}
                      </div>

                      {/* 人脉统计 */}
                      <div className="grid grid-cols-3 gap-2 mt-3">
                        {/* 自己的人脉 */}
                        <div className="text-center p-2 rounded-lg bg-blue-50 dark:bg-blue-900/20">
                          <div className="flex items-center justify-center gap-1 mb-1">
                            <Users className="w-3 h-3 text-blue-600 dark:text-blue-400" />
                            <span className="text-xs text-gray-600 dark:text-gray-400">我的</span>
                          </div>
                          <p className="text-lg font-bold text-blue-600 dark:text-blue-400">
                            {friend.ownContactsCount}
                          </p>
                        </div>

                        {/* 共享的人脉 */}
                        <div className="text-center p-2 rounded-lg bg-green-50 dark:bg-green-900/20">
                          <div className="flex items-center justify-center gap-1 mb-1">
                            <Share className="w-3 h-3 text-green-600 dark:text-green-400" />
                            <span className="text-xs text-gray-600 dark:text-gray-400">共享</span>
                          </div>
                          <p className="text-lg font-bold text-green-600 dark:text-green-400">
                            {friend.sharedContactsCount}
                          </p>
                        </div>

                        {/* 全部人脉 */}
                        <div className="text-center p-2 rounded-lg bg-purple-50 dark:bg-purple-900/20">
                          <div className="flex items-center justify-center gap-1 mb-1">
                            <Users className="w-3 h-3 text-purple-600 dark:text-purple-400" />
                            <span className="text-xs text-gray-600 dark:text-gray-400">全部</span>
                          </div>
                          <p className="text-lg font-bold text-purple-600 dark:text-purple-400">
                            {friend.totalContactsCount}
                          </p>
                        </div>
                      </div>

                      {/* 注册时间 */}
                      {friend.invitedAt && (
                        <p className="text-xs text-gray-500 mt-2">
                          注册于 {new Date(friend.invitedAt).toLocaleDateString('zh-CN')}
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
