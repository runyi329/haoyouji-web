import { getLoginUrl } from "@/const";
import { trpc } from "@/lib/trpc";
import { clearToken } from "@/lib/tokenStorage";
import { TRPCClientError } from "@trpc/client";
import { useQueryClient } from "@tanstack/react-query";
import { useCallback, useEffect, useMemo } from "react";
import { useLocation } from "wouter";

type UseAuthOptions = {
  redirectOnUnauthenticated?: boolean;
  redirectPath?: string;
};

export function useAuth(options?: UseAuthOptions) {
  const { redirectOnUnauthenticated = false, redirectPath = getLoginUrl() } =
    options ?? {};
  const [, setLocation] = useLocation();
  const utils = trpc.useUtils();
  const queryClient = useQueryClient();

  const meQuery = trpc.auth.me.useQuery(undefined, {
    retry: false,
    refetchOnWindowFocus: false,
    // 微信环境下增加重试机制
    retryDelay: 1000,
  });

  const logoutMutation = trpc.auth.logout.useMutation({
    onSuccess: () => {
      utils.auth.me.setData(undefined, null);
    },
  });

  const logout = useCallback(async () => {
    try {
      await logoutMutation.mutateAsync();
    } catch (error: unknown) {
      if (
        error instanceof TRPCClientError &&
        error.data?.code === "UNAUTHORIZED"
      ) {
        return;
      }
      throw error;
    } finally {
      // 清除三层存储中的 token（localStorage + Cookie + IndexedDB）
      await clearToken();
      console.log('[Logout] Token cleared from all storage layers');
      // 清空所有 tRPC/React Query 缓存，防止旧用户数据残留给下一个登录用户
      queryClient.clear();
    }
  }, [logoutMutation, utils, queryClient]);

  const state = useMemo(() => {
    // 安全地存储用户信息到localStorage，只存储必要的字段
    try {
      if (meQuery.data) {
        // 只存储必要的用户信息，避免存储大量数据导致localStorage超限
        const minimalUserInfo = {
          id: meQuery.data.id,
          username: meQuery.data.username,
          name: meQuery.data.name,
          avatar: meQuery.data.avatar,
        };
        localStorage.setItem(
          "manus-runtime-user-info",
          JSON.stringify(minimalUserInfo)
        );
      } else {
        localStorage.removeItem("manus-runtime-user-info");
      }
    } catch (e) {
      // 忽略localStorage错误，不影响主流程
      console.warn('[useAuth] localStorage操作失败:', e);
    }
    return {
      user: meQuery.data ?? null,
      loading: meQuery.isLoading || logoutMutation.isPending,
      error: meQuery.error ?? logoutMutation.error ?? null,
      isAuthenticated: Boolean(meQuery.data),
    };
  }, [
    meQuery.data,
    meQuery.error,
    meQuery.isLoading,
    logoutMutation.error,
    logoutMutation.isPending,
  ]);

  useEffect(() => {
    if (!redirectOnUnauthenticated) return;
    if (meQuery.isLoading || logoutMutation.isPending) return;
    if (state.user) return;
    if (typeof window === "undefined") return;
    if (window.location.pathname === redirectPath) return;

    // 使用 SPA 导航而不是 window.location.href，避免 Safari PWA 创建新视图层
    setLocation(redirectPath);
  }, [
    redirectOnUnauthenticated,
    redirectPath,
    logoutMutation.isPending,
    meQuery.isLoading,
    state.user,
    setLocation,
  ]);

  return {
    ...state,
    refresh: () => meQuery.refetch(),
    logout,
  };
}
