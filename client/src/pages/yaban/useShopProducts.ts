/**
 * 牙伴齿科商城 - 统一商品数据来源（第三步第二批）
 *
 * 策略：优先读数据库（trpc.yabanProduct.*），接口异常或暂无数据时回退到本地写死数据，
 * 保证前台在任何情况下都能正常展示商城，绝不白屏。
 * 商品对外 id 沿用 legacy_code（如 p1001/s2001），与购物车、订单明细一致。
 */
import { useMemo } from "react";
import { trpc } from "@/lib/trpc";
import {
  SHOP_CATEGORIES,
  SHOP_PRODUCTS,
  type ShopProduct,
  type ShopCategory,
} from "./shopData";

// 后端返回的商品结构（mapProductRow）转成前端 ShopProduct
type ApiProduct = {
  id: string;
  categoryId: string;
  kind: "product" | "service";
  name: string;
  subtitle: string;
  price: number;
  originalPrice?: number;
  image: string;
  sales: number;
  tags: string[];
  description: string[];
  isActive?: boolean;
  sortOrder?: number;
};

function toShopProduct(p: ApiProduct): ShopProduct {
  return {
    id: p.id,
    categoryId: p.categoryId,
    kind: p.kind,
    name: p.name,
    subtitle: p.subtitle || "",
    price: p.price,
    originalPrice: p.originalPrice,
    image: p.image || "",
    sales: p.sales || 0,
    tags: p.tags || [],
    description: p.description || [],
  };
}

/** 全量商品 + 分类（前台列表/搜索用），自动回退本地 */
export function useShopProducts() {
  const productsQuery = trpc.yabanProduct.listProducts.useQuery(undefined, {
    staleTime: 60_000,
    retry: 1,
  });
  const categoriesQuery = trpc.yabanProduct.listCategories.useQuery(undefined, {
    staleTime: 60_000,
    retry: 1,
  });

  const products: ShopProduct[] = useMemo(() => {
    const data = productsQuery.data;
    if (data && data.length > 0) return data.map(toShopProduct);
    return SHOP_PRODUCTS; // 回退本地
  }, [productsQuery.data]);

  const categories: ShopCategory[] = useMemo(() => {
    const data = categoriesQuery.data;
    if (data && data.length > 0) {
      // 头部补一个"全部"
      return [{ id: "all", name: "全部", icon: "" }, ...data];
    }
    return SHOP_CATEGORIES; // 回退本地（已含"全部"）
  }, [categoriesQuery.data]);

  return {
    products,
    categories,
    isLoading: productsQuery.isLoading || categoriesQuery.isLoading,
  };
}

/**
 * 按一组 id 取商品（购物车/结算/详情用）。
 * 先用已加载的全量列表匹配；匹配不到时回退本地 getProductById。
 */
export function useProductsByIds(ids: string[]) {
  const { products } = useShopProducts();
  return useMemo(() => {
    const map = new Map(products.map((p) => [p.id, p]));
    const localMap = new Map(SHOP_PRODUCTS.map((p) => [p.id, p]));
    return ids
      .map((id) => map.get(id) || localMap.get(id))
      .filter((p): p is ShopProduct => !!p);
  }, [products, ids]);
}

/** 取单个商品（详情页用），优先列表命中，再本地回退 */
export function useShopProduct(id: string): { product: ShopProduct | undefined; isLoading: boolean } {
  const { products, isLoading } = useShopProducts();
  const product = useMemo(() => {
    return (
      products.find((p) => p.id === id) ||
      SHOP_PRODUCTS.find((p) => p.id === id)
    );
  }, [products, id]);
  return { product, isLoading };
}
