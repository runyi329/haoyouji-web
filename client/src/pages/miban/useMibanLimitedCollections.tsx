import { useMemo, type ReactNode } from "react";
import { Link } from "wouter";
import { Loader2 } from "lucide-react";
import { useAuth } from "@/_core/hooks/useAuth";
import { mtrpc } from "./mibanTrpc";

export function LimitedOffShelfBadge({ className = "" }: { className?: string }) {
  return <span data-testid="limited-off-shelf-badge" className={`pointer-events-none inline-flex shrink-0 items-center whitespace-nowrap rounded-[4px] border border-gray-300 bg-gray-100 px-2 py-1 text-[11px] font-semibold leading-none text-gray-600 ${className}`}>已下架</span>;
}

export function LimitedCollectionCard({ slug, isInactive, children }: { slug: string; isInactive: boolean; children: ReactNode }) {
  return <div className="relative min-w-0" data-collection-slug={slug}>
    {children}
    {isInactive && <LimitedOffShelfBadge className="absolute right-3 top-3 z-30 shadow-sm" />}
  </div>;
}

export function useMibanLimitedCollections(enabled = true) {
  const { user, loading: authLoading } = useAuth();
  const viewerUserId = user?.id ?? null;
  const query = mtrpc.limitedProduct.publicCollections.useQuery({ viewerUserId }, {
    enabled: enabled && !authLoading,
    staleTime: 0,
    refetchOnMount: "always",
    refetchOnWindowFocus: true,
    refetchInterval: 15_000,
    retry: 1,
  });
  // 输入只隔离查询缓存；预览权限由服务端真实身份决定，前端再核对响应身份。
  const identityMatches = query.data?.viewerUserId === viewerUserId;
  const canPreviewInactive = !authLoading && !query.isError && identityMatches && user?.role === "super_admin" && query.data?.canPreviewInactive === true;
  const collections = useMemo(() =>
    authLoading || query.isError || query.isFetchedAfterMount === false || !identityMatches
      ? [] : (query.data?.collections ?? []),
    [authLoading, query.data, query.isError, query.isFetchedAfterMount, identityMatches]);
  const activeSlugs = useMemo(() => new Set<string>(collections.filter((c: { isActive: boolean }) => c.isActive).map((c: { slug: string }) => c.slug)), [collections]);
  const inactiveSlugs = useMemo(() => new Set<string>(canPreviewInactive ? collections.filter((c: { isActive: boolean }) => !c.isActive).map((c: { slug: string }) => c.slug) : []), [collections, canPreviewInactive]);
  const visibleSlugs = useMemo(() => new Set<string>(Array.from(activeSlugs).concat(Array.from(inactiveSlugs))), [activeSlugs, inactiveSlugs]);
  return { ...query, isLoading: authLoading || query.isLoading, viewerUserId, canPreviewInactive, activeSlugs, inactiveSlugs, visibleSlugs };
}

export function LimitedCategoryGate({ slug, children }: { slug?: string; children: ReactNode }) {
  const query = useMibanLimitedCollections(Boolean(slug));
  if (!slug) return <>{children}</>;
  if (query.isLoading || query.isFetchedAfterMount === false) {
    return <div role="status" className="flex min-h-screen items-center justify-center gap-2 bg-[#F8F6F3] text-sm text-gray-400">
      <Loader2 className="h-4 w-4 animate-spin" />页面加载中…
    </div>;
  }
  if (query.isError || !query.visibleSlugs.has(slug)) {
    return <div data-testid="limited-category-unavailable" className="flex min-h-screen flex-col items-center justify-center gap-4 bg-[#F8F6F3] px-6 text-center text-sm text-gray-500">
      <p>{query.isError ? "精选暂时无法读取，请稍后重试" : "该精选暂不可用"}</p>
      {query.isError && <button type="button" onClick={() => query.refetch()} className="rounded-lg bg-white px-4 py-2 text-[#FF6900]">重新加载</button>}
      <Link href="/p/proj_hzxm2t/limited" className="rounded-lg bg-[#FF6900] px-4 py-2 text-white">返回精选列表</Link>
    </div>;
  }
  return <>
    {query.inactiveSlugs.has(slug) && <div data-testid="limited-category-off-shelf" className="sticky top-[52px] z-40 mx-auto flex max-w-[1040px] items-center gap-2 border-b border-gray-200 bg-gray-100 px-4 py-2 text-[12px] text-gray-500">
      <LimitedOffShelfBadge />管理员可见，仅供查看
    </div>}
    {children}
  </>;
}
