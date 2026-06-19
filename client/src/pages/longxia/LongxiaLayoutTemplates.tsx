/**
 * LongxiaLayoutTemplates.tsx — 龙虾「页面布局管理」页（骨架模板库）
 *
 * 规则 005 · 项目创建规则 / 项目骨架结构：
 *   提供几种传统手机 App 首页骨架模板，网站管理员登录后选一个保留、
 *   其余去掉，框架即成型；选定后可在模板基础上再修整。
 *
 * 路由：/longxia/layout-templates
 * 入口：/longxia/my →「页面布局管理」
 *
 * 当前 5 种模板（纯骨架占位，按钮一/二/三/我的、内容区占位）：
 *   A 底部 TabBar   B 侧边抽屉(汉堡)   C 宫格九宫格
 *   D 顶部 TabBar   E 信息流单页
 *
 * 设计：移动端优先（居中 maxWidth 480），龙虾深红金配色，
 *   lucide-react 图标，严禁 Emoji。预览用纯 CSS 缩略示意图。
 */
import { useState, useRef, useEffect } from "react";
import { useLocation } from "wouter";
import { ChevronLeft, X, ChevronRight } from "lucide-react";

const C = {
  brand: "#C0392B",
  brandDeep: "#7A1E12",
  brandGrad: "linear-gradient(135deg,#7A1E12 0%,#C0392B 100%)",
  gold: "#E0B97D",
  bg: "#F7F4F2",
  white: "#FFFFFF",
  line: "#EADfd9",
  textWeak: "#B3A89F",
  textSub: "#8A7F78",
  textMain: "#2A2320",
} as const;

type TplKey = "bottomTab" | "drawer" | "grid" | "topTab" | "feed";

interface ExampleShot {
  img: string;
  caption: string;
}

interface Template {
  key: TplKey;
  name: string;
  desc: string;
  example: string;
  shots: ExampleShot[];
}

const TEMPLATES: Template[] = [
  {
    key: "bottomTab",
    name: "底部标签栏",
    desc: "顶部内容区 + 底部按钮切换",
    example: "微信 / 淘宝 / 抖音",
    shots: [
      { img: "https://haoyouji-images-1396946788.cos.ap-shanghai.myqcloud.com/longxia/layout-examples/longxia-ex-bottomtab-social.jpg", caption: "社交聊天类 · 参考微信" },
      { img: "https://haoyouji-images-1396946788.cos.ap-shanghai.myqcloud.com/longxia/layout-examples/longxia-ex-bottomtab-shop.jpg", caption: "电商购物类 · 参考淘宝" },
      { img: "https://haoyouji-images-1396946788.cos.ap-shanghai.myqcloud.com/longxia/layout-examples/longxia-ex-bottomtab-video.jpg", caption: "短视频类 · 参考抖音" },
    ],
  },
  {
    key: "drawer",
    name: "侧边抽屉",
    desc: "左上角汉堡按钮拉出菜单",
    example: "邮箱 / 后台类",
    shots: [
      { img: "https://haoyouji-images-1396946788.cos.ap-shanghai.myqcloud.com/longxia/layout-examples/longxia-ex-drawer-mail.jpg", caption: "邮箱 / 后台管理类 · 侧边抽屉菜单" },
    ],
  },
  {
    key: "grid",
    name: "宫格首页",
    desc: "首页功能图标网格，点进子页",
    example: "支付宝 / 政务",
    shots: [
      { img: "https://haoyouji-images-1396946788.cos.ap-shanghai.myqcloud.com/longxia/layout-examples/longxia-ex-grid-pay.jpg", caption: "生活服务类 · 参考支付宝九宫格" },
    ],
  },
  {
    key: "topTab",
    name: "顶部标签栏",
    desc: "顶部分类切换 + 下方内容",
    example: "新闻 / 微博",
    shots: [
      { img: "https://haoyouji-images-1396946788.cos.ap-shanghai.myqcloud.com/longxia/layout-examples/longxia-ex-toptab-news.jpg", caption: "资讯新闻类 · 参考今日头条顶部分类" },
    ],
  },
  {
    key: "feed",
    name: "信息流单页",
    desc: "单页上下滚动，顶部悬浮栏",
    example: "落地页 / 单功能",
    shots: [
      { img: "https://haoyouji-images-1396946788.cos.ap-shanghai.myqcloud.com/longxia/layout-examples/longxia-ex-feed-rednote.jpg", caption: "内容种草类 · 参考小红书信息流" },
    ],
  },
];

/* ── 缩略示意图（纯 CSS 骨架）────────────────────────────── */
function Thumb({ kind }: { kind: TplKey }) {
  const block = (h: number, w = "100%", mb = 3) => (
    <div style={{ height: h, width: w, marginBottom: mb, borderRadius: 2, backgroundColor: "#E4D9D2" }} />
  );
  const inner = (
    <div style={{ flex: 1, padding: 6, display: "flex", flexDirection: "column" }}>
      {block(8, "60%")}
      {block(20)}
      {block(20)}
      {block(20)}
    </div>
  );
  const frame = (children: React.ReactNode) => (
    <div
      style={{
        width: 84,
        height: 120,
        borderRadius: 8,
        border: `1px solid ${C.line}`,
        backgroundColor: "#FBF8F6",
        overflow: "hidden",
        display: "flex",
        flexDirection: "column",
      }}
    >
      {children}
    </div>
  );

  switch (kind) {
    case "bottomTab":
      return frame(
        <>
          {inner}
          <div style={{ display: "flex", gap: 4, padding: "5px 6px", background: C.brandGrad }}>
            {[0, 1, 2, 3].map((i) => (
              <div key={i} style={{ flex: 1, height: 8, borderRadius: 2, backgroundColor: i === 3 ? C.gold : "rgba(255,255,255,.5)" }} />
            ))}
          </div>
        </>,
      );
    case "drawer":
      return frame(
        <div style={{ flex: 1, display: "flex" }}>
          <div style={{ width: 26, background: C.brandGrad, padding: 5 }}>
            {[0, 1, 2, 3].map((i) => (
              <div key={i} style={{ height: 6, borderRadius: 2, marginBottom: 5, backgroundColor: "rgba(255,255,255,.55)" }} />
            ))}
          </div>
          {inner}
        </div>,
      );
    case "grid":
      return frame(
        <div style={{ flex: 1, padding: 6 }}>
          <div style={{ height: 14, borderRadius: 2, marginBottom: 6, background: C.brandGrad }} />
          <div style={{ display: "grid", gridTemplateColumns: "repeat(3,1fr)", gap: 5 }}>
            {Array.from({ length: 9 }).map((_, i) => (
              <div key={i} style={{ paddingTop: "100%", borderRadius: 3, backgroundColor: "#E4D9D2" }} />
            ))}
          </div>
        </div>,
      );
    case "topTab":
      return frame(
        <>
          <div style={{ display: "flex", gap: 4, padding: "5px 6px", background: C.brandGrad }}>
            {[0, 1, 2].map((i) => (
              <div key={i} style={{ flex: 1, height: 7, borderRadius: 2, backgroundColor: i === 0 ? C.gold : "rgba(255,255,255,.5)" }} />
            ))}
          </div>
          {inner}
        </>,
      );
    case "feed":
      return frame(
        <>
          <div style={{ height: 14, background: C.brandGrad }} />
          <div style={{ flex: 1, padding: 6 }}>
            {block(28)}
            {block(28)}
            {block(28)}
          </div>
        </>,
      );
  }
}

export default function LongxiaLayoutTemplates() {
  const [, navigate] = useLocation();
  const [preview, setPreview] = useState<Template | null>(null);

  return (
    <div
      className="min-h-screen"
      style={{
        maxWidth: 480,
        margin: "0 auto",
        backgroundColor: C.bg,
        fontFamily: "'Noto Sans SC', -apple-system, 'PingFang SC', 'Microsoft YaHei', sans-serif",
      }}
    >
      {/* 顶栏 */}
      <div style={{ background: C.brandGrad }} className="flex items-center justify-between px-4 py-3">
        <button onClick={() => navigate("/longxia/my")} className="p-1 -ml-1" aria-label="返回">
          <ChevronLeft size={22} strokeWidth={2} style={{ color: "#fff" }} />
        </button>
        <span className="text-[18px] font-extrabold text-white">页面布局管理</span>
        <div className="w-8" />
      </div>

      <p className="px-4 pt-4 pb-1 text-[12px]" style={{ color: C.textSub }}>
        选择一种首页框架作为本项目骨架，选定后可在其基础上继续修整。
      </p>

      {/* 模板列表 */}
      <div className="px-4 py-3 flex flex-col gap-3">
        {TEMPLATES.map((t) => {
          return (
            <div
              key={t.key}
              className="rounded-2xl p-3 flex gap-3 items-center"
              style={{
                backgroundColor: C.white,
                boxShadow: "0 1px 3px rgba(40,20,10,.06)",
                border: "1.5px solid transparent",
              }}
            >
              <Thumb kind={t.key} />
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <span className="text-[15px] font-extrabold" style={{ color: C.textMain }}>{t.name}</span>
                </div>
                <div className="text-[12px] mt-1" style={{ color: C.textSub }}>{t.desc}</div>
                <div className="text-[11px] mt-0.5" style={{ color: C.textWeak }}>类似：{t.example}</div>

                <div className="flex gap-2 mt-2.5">
                  <button
                    onClick={() => setPreview(t)}
                    className="text-[12px] font-bold px-3 py-1.5 rounded-lg transition-transform active:scale-[0.97]"
                    style={{ backgroundColor: "#F3EDE9", color: C.textMain }}
                  >
                    点击放大
                  </button>
                </div>
              </div>
            </div>
          );
        })}

        <p className="text-[11px] text-center mt-1" style={{ color: C.textWeak }}>
          更多模板（子页面、列表页、详情页等）陆续开放
        </p>
      </div>

      {/* 预览全屏弹层：可左右滑动图集（线框骨架 + 实例图） */}
      {preview && (
        <PreviewCarousel
          tpl={preview}
          onClose={() => setPreview(null)}
        />
      )}
    </div>
  );
}

/* ───────── 预览图集弹层 ───────── */
function PreviewCarousel({
  tpl,
  onClose,
  onSelect,
}: {
  tpl: Template;
  onClose: () => void;
  onSelect: () => void;
}) {
  const slides = [
    { type: "wire" as const, caption: "纯线框模板（无文字无图）", img: "" },
    ...tpl.shots.map((s) => ({ type: "img" as const, caption: s.caption, img: s.img })),
  ];
  const [idx, setIdx] = useState(0);
  const total = slides.length;
  const startX = useRef<number | null>(null);

  useEffect(() => { setIdx(0); }, [tpl.key]);

  const go = (n: number) => setIdx((p) => Math.max(0, Math.min(total - 1, p + n)));

  const onTouchStart = (e: React.TouchEvent) => { startX.current = e.touches[0].clientX; };
  const onTouchEnd = (e: React.TouchEvent) => {
    if (startX.current == null) return;
    const dx = e.changedTouches[0].clientX - startX.current;
    if (dx < -40) go(1);
    else if (dx > 40) go(-1);
    startX.current = null;
  };

  return (
    <div className="fixed inset-0 z-50 flex flex-col" style={{ backgroundColor: "rgba(20,10,8,.6)" }} onClick={onClose}>
      <div
        className="mt-auto rounded-t-3xl flex flex-col"
        style={{ backgroundColor: C.bg, height: "88vh", maxWidth: 480, marginInline: "auto", width: "100%" }}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between px-4 py-3" style={{ borderBottom: `1px solid ${C.line}` }}>
          <div className="flex flex-col">
            <span className="text-[15px] font-extrabold" style={{ color: C.textMain }}>{tpl.name} · 预览</span>
            <span className="text-[11px] mt-0.5" style={{ color: C.textWeak }}>左右滑动查看线框与实例 · 类似 {tpl.example}</span>
          </div>
          <button onClick={onClose} className="p-1" aria-label="关闭">
            <X size={20} style={{ color: C.textSub }} />
          </button>
        </div>

        <div className="relative flex-1 overflow-hidden" onTouchStart={onTouchStart} onTouchEnd={onTouchEnd}>
          <div
            className="flex h-full"
            style={{ transform: `translateX(-${idx * 100}%)`, transition: "transform 280ms cubic-bezier(0.23,1,0.32,1)" }}
          >
            {slides.map((s, i) => (
              <div key={i} className="shrink-0 w-full h-full flex items-center justify-center px-6 py-4">
                {s.type === "wire" ? (
                  <div style={{ transform: "scale(2.4)", transformOrigin: "center" }}>
                    <Thumb kind={tpl.key} />
                  </div>
                ) : (
                  <img
                    src={s.img}
                    alt={s.caption}
                    loading="lazy"
                    className="max-h-full w-auto rounded-2xl"
                    style={{ objectFit: "contain", boxShadow: "0 8px 30px rgba(40,20,10,.18)", border: `1px solid ${C.line}` }}
                  />
                )}
              </div>
            ))}
          </div>

          {idx > 0 && (
            <button
              onClick={() => go(-1)}
              aria-label="上一张"
              className="absolute left-2 top-1/2 -translate-y-1/2 rounded-full p-1.5 transition-transform active:scale-[0.92]"
              style={{ backgroundColor: "rgba(255,255,255,.92)", boxShadow: "0 2px 8px rgba(40,20,10,.18)" }}
            >
              <ChevronLeft size={20} style={{ color: C.textMain }} />
            </button>
          )}
          {idx < total - 1 && (
            <button
              onClick={() => go(1)}
              aria-label="下一张"
              className="absolute right-2 top-1/2 -translate-y-1/2 rounded-full p-1.5 transition-transform active:scale-[0.92]"
              style={{ backgroundColor: "rgba(255,255,255,.92)", boxShadow: "0 2px 8px rgba(40,20,10,.18)" }}
            >
              <ChevronRight size={20} style={{ color: C.textMain }} />
            </button>
          )}
        </div>

        <div className="text-center text-[13px] font-bold pb-1" style={{ color: C.textMain }}>{slides[idx].caption}</div>

        <div className="flex items-center justify-center gap-1.5 py-2">
          {slides.map((_, i) => (
            <button
              key={i}
              onClick={() => setIdx(i)}
              aria-label={`第${i + 1}张`}
              className="transition-all"
              style={{ width: i === idx ? 18 : 7, height: 7, borderRadius: 4, backgroundColor: i === idx ? C.brand : "#D8CCC5" }}
            />
          ))}
        </div>

      </div>
    </div>
  );
}
