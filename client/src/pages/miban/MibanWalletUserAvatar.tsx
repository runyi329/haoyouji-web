import { UserAvatar } from "@/components/UserAvatar";
import { trpc } from "@/lib/trpc";

/** 共用 auth.me 缓存，只显示当前登录用户，不查询其他人的资料。 */
export function MibanWalletUserAvatar() {
  const { data: user } = trpc.auth.me.useQuery(undefined, {
    retry: false,
    staleTime: 5 * 60 * 1000,
    gcTime: 10 * 60 * 1000,
    refetchOnWindowFocus: false,
  });
  return <UserAvatar
    key={`${user?.id ?? "guest"}:${user?.avatar ?? ""}`}
    avatar={user?.avatar}
    nickname={user?.name}
    username={user?.username}
    size="sm"
    className="shrink-0"
    style={{ width: 28, height: 28, fontSize: 12 }}
  />;
}
