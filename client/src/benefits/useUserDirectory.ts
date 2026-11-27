import { useEffect, useState } from "react";
import { trpc } from "@/lib/trpc";
import { STOREFRONT, type BenefitUser, type UserFilter } from "./types";

export function useUserDirectory(keyword: string, filter: UserFilter) {
  const normalized = keyword.trim().replace(/^@/, "");
  const [search, setSearch] = useState({ keyword: "", filter: "all" as UserFilter, offset: 0 });
  const [collected, setCollected] = useState<{ key: string; items: BenefitUser[] }>({ key: "", items: [] });
  const key = JSON.stringify([search.keyword, search.filter]);
  const changing = normalized !== search.keyword || filter !== search.filter;
  useEffect(() => {
    if (!changing) return;
    const timer = setTimeout(() => setSearch({ keyword: normalized, filter, offset: 0 }), 300);
    return () => clearTimeout(timer);
  }, [normalized, filter, changing]);
  const query = trpc.benefits.users.useQuery({ storefront: STOREFRONT, ...search, limit: 30 }, { retry: false, enabled: !changing, staleTime: 0 });
  useEffect(() => {
    if (!query.data || changing) return;
    setCollected(previous => ({ key, items: Array.from(new Map([
      ...(search.offset === 0 || previous.key !== key ? [] : previous.items), ...query.data.users,
    ].map(user => [user.id, user])).values()) }));
  }, [query.data, key, search.offset, changing]);
  const items = changing || collected.key !== key ? [] : collected.items;
  return {
    items,
    total: changing ? 0 : query.data?.total ?? 0,
    hasMore: !changing && !!query.data && query.data.offset + query.data.users.length < query.data.total,
    loading: changing || query.isFetching,
    error: changing ? "" : query.error?.message ?? "",
    reload: () => { void query.refetch(); },
    loadMore: () => { if (!query.isFetching && !changing && query.data && query.data.offset + query.data.users.length < query.data.total) setSearch(value => ({ ...value, offset: items.length })); },
  };
}
