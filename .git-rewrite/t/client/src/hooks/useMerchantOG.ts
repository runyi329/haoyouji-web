/**
 * useMerchantOG - 通用商家 OG 元标签注入 Hook
 *
 * 功能：
 * - 根据商家编码（merchantCode）读取商家设置（标题/描述/Logo/封面图）
 * - 动态注入 og:title / og:description / og:image 等 Meta 标签
 * - 微信、Safari 等分享时自动读取这些标签，显示商家自定义信息
 * - 组件卸载时恢复默认标题「脉动」
 *
 * 使用方式：
 *   useMerchantOG('cx8618');          // 红酒商城
 *   useMerchantOG('liulifan');        // 美容院
 *   useMerchantOG('cx8618', { title: '商品名', desc: '商品描述' }); // 覆盖标题/描述
 */
import { useEffect } from "react";
import { trpc } from "@/lib/trpc";

interface OGOverride {
  /** 覆盖标题（不填则用商家设置的 shareTitle） */
  title?: string;
  /** 覆盖描述（不填则用商家设置的 shareDescription） */
  desc?: string;
  /** 覆盖图片（不填则用商家设置的封面图或 Logo） */
  image?: string;
  /** 当前页面的规范 URL（不填则用 window.location.href） */
  url?: string;
}

export function useMerchantOG(merchantCode: string, override?: OGOverride) {
  const { data: settings } = trpc.merchant.getMerchantShareInfo.useQuery(
    { merchantCode },
    { retry: false, refetchOnWindowFocus: false }
  );

  useEffect(() => {
    // 优先用 override，其次用商家设置，最后用兜底值
    const title =
      override?.title ||
      settings?.shareTitle ||
      (merchantCode === "cx8618" ? "红品会" : "奢贝美容院");
    const desc =
      override?.desc ||
      settings?.shareDescription ||
      "";
    const image =
      override?.image ||
      settings?.shareCoverImage ||
      settings?.shareLogo ||
      settings?.shopLogoUrl ||
      "";
    const url = override?.url || window.location.href;

    const prevTitle = document.title;
    document.title = title;

    const setMeta = (property: string, content: string) => {
      if (!content) return;
      let el = document.querySelector(
        `meta[property="${property}"]`
      ) as HTMLMetaElement | null;
      if (!el) {
        el = document.createElement("meta");
        el.setAttribute("property", property);
        document.head.appendChild(el);
      }
      el.setAttribute("content", content);
    };

    const setMetaName = (name: string, content: string) => {
      if (!content) return;
      let el = document.querySelector(
        `meta[name="${name}"]`
      ) as HTMLMetaElement | null;
      if (!el) {
        el = document.createElement("meta");
        el.setAttribute("name", name);
        document.head.appendChild(el);
      }
      el.setAttribute("content", content);
    };

    setMeta("og:title", title);
    setMeta("og:description", desc);
    setMeta("og:type", "website");
    setMeta("og:url", url);
    setMeta("og:image", image);
    setMetaName("description", desc);
    setMetaName("twitter:card", "summary_large_image");
    setMetaName("twitter:title", title);
    setMetaName("twitter:description", desc);
    setMetaName("twitter:image", image);

    return () => {
      document.title = prevTitle || "脉动";
    };
  }, [settings, override?.title, override?.desc, override?.image, override?.url, merchantCode]);
}
