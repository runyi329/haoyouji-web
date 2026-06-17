/**
 * 牙伴齿科商城 - 购物车本地状态（localStorage 持久化）
 * 多医院隔离：购物车按当前医院 tenant 分桶存储（key = yaban_shop_cart_<tenant>），
 * 切换医院时自动切换到对应医院的购物车，互不串单。
 */
import { useCallback, useEffect, useState } from "react";

const STORAGE_PREFIX = "yaban_shop_cart";
const TENANT_KEY = "yaban_current_tenant";
const TENANT_CHANGE_EVENT = "yaban-tenant-change";

export type CartItem = {
  id: string; // 商品 id
  qty: number;
};

// 简单的跨组件同步：用自定义事件广播变更
const EVENT = "yaban_cart_change";

// 当前医院的购物车存储 key（无医院时回退到不带后缀的默认桶，兼容历史数据）
function cartKey(): string {
  const t = (() => {
    try {
      return localStorage.getItem(TENANT_KEY) || "";
    } catch {
      return "";
    }
  })();
  return t ? `${STORAGE_PREFIX}_${t}` : STORAGE_PREFIX;
}

function readCart(): CartItem[] {
  try {
    const raw = localStorage.getItem(cartKey());
    if (!raw) return [];
    const arr = JSON.parse(raw);
    if (Array.isArray(arr)) return arr;
    return [];
  } catch {
    return [];
  }
}

function writeCart(items: CartItem[]) {
  localStorage.setItem(cartKey(), JSON.stringify(items));
  window.dispatchEvent(new Event(EVENT));
}

export function useCart() {
  const [items, setItems] = useState<CartItem[]>(readCart);

  useEffect(() => {
    const handler = () => setItems(readCart());
    window.addEventListener(EVENT, handler);
    window.addEventListener("storage", handler);
    // 切换医院时切换到对应医院的购物车
    window.addEventListener(TENANT_CHANGE_EVENT, handler as EventListener);
    return () => {
      window.removeEventListener(EVENT, handler);
      window.removeEventListener("storage", handler);
      window.removeEventListener(TENANT_CHANGE_EVENT, handler as EventListener);
    };
  }, []);

  const add = useCallback((id: string, qty = 1) => {
    const cur = readCart();
    const found = cur.find((x) => x.id === id);
    if (found) {
      found.qty += qty;
    } else {
      cur.push({ id, qty });
    }
    writeCart([...cur]);
  }, []);

  const setQty = useCallback((id: string, qty: number) => {
    let cur = readCart();
    if (qty <= 0) {
      cur = cur.filter((x) => x.id !== id);
    } else {
      const found = cur.find((x) => x.id === id);
      if (found) found.qty = qty;
      else cur.push({ id, qty });
    }
    writeCart([...cur]);
  }, []);

  const remove = useCallback((id: string) => {
    const cur = readCart().filter((x) => x.id !== id);
    writeCart(cur);
  }, []);

  const clear = useCallback(() => {
    writeCart([]);
  }, []);

  const count = items.reduce((s, x) => s + x.qty, 0);

  return { items, add, setQty, remove, clear, count };
}
