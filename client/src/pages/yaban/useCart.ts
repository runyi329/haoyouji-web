/**
 * 牙伴齿科商城 - 购物车本地状态（localStorage 持久化）
 * 第一版前端实现，后续接后端订单接口时可平滑替换
 */
import { useCallback, useEffect, useState } from "react";

const STORAGE_KEY = "yaban_shop_cart";

export type CartItem = {
  id: string; // 商品 id
  qty: number;
};

// 简单的跨组件同步：用自定义事件广播变更
const EVENT = "yaban_cart_change";

function readCart(): CartItem[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const arr = JSON.parse(raw);
    if (Array.isArray(arr)) return arr;
    return [];
  } catch {
    return [];
  }
}

function writeCart(items: CartItem[]) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(items));
  window.dispatchEvent(new Event(EVENT));
}

export function useCart() {
  const [items, setItems] = useState<CartItem[]>(readCart);

  useEffect(() => {
    const handler = () => setItems(readCart());
    window.addEventListener(EVENT, handler);
    window.addEventListener("storage", handler);
    return () => {
      window.removeEventListener(EVENT, handler);
      window.removeEventListener("storage", handler);
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
