import { createContext, useCallback, useContext, type ReactNode } from "react";
import { trpc } from "@/lib/trpc";
import { STOREFRONT, type CatalogProduct } from "./types";

type CatalogContext = {
  products: CatalogProduct[];
  loading: boolean;
  error: string;
  revision: string;
  limited: boolean;
  refresh: () => Promise<void>;
};
const Context = createContext<CatalogContext | null>(null);
export function BenefitCatalogProvider({ children }: { children: ReactNode }) {
  const query = trpc.benefits.catalog.useQuery({ storefront: STOREFRONT }, { retry: false, staleTime: 0, refetchOnWindowFocus: true });
  const refresh = useCallback(async () => { await query.refetch(); }, [query.refetch]);
  return <Context.Provider value={{
    products: query.error ? [] : query.data ?? [],
    loading: query.isFetching,
    error: query.error?.message ?? "",
    revision: query.error ? "" : query.data ? JSON.stringify(query.data) : "",
    limited: true,
    refresh,
  }}>{children}</Context.Provider>;
}
export function useBenefitCatalog() {
  const context = useContext(Context);
  if (!context) throw new Error("优惠页面必须在真实商品目录容器内使用");
  return context;
}
