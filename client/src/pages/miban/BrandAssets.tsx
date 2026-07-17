import { Button } from "@/components/ui/button";
import { Link } from "wouter";
import { Download, Palette, Image, FileText } from "lucide-react";

const BRAND_COLORS = [
  { name: "主色 · 稻香绿", hex: "#4A7C3F", desc: "品牌核心色，源自稻田的自然绿" },
  { name: "辅色 · 米白", hex: "#F5F0E8", desc: "背景主色，温润如米" },
  { name: "辅色 · 糙米棕", hex: "#C8A87A", desc: "暖色调，代表天然谷物" },
  { name: "辅色 · 黑米紫", hex: "#2D1B4E", desc: "深色强调，来自黑米花青素" },
  { name: "辅色 · 红米橙", hex: "#C0392B", desc: "活力色，代表红米的热情" },
  { name: "辅色 · 薏米黄", hex: "#E8C547", desc: "明亮点缀，薏米的温暖色调" },
];

const FONT_SPEC = [
  { name: "标题字体", value: "Noto Serif SC（思源宋体）", usage: "页面大标题、品牌名称" },
  { name: "正文字体", value: "Noto Sans SC（思源黑体）", usage: "正文内容、说明文字" },
  { name: "英文字体", value: "Inter", usage: "数字、英文标注" },
];

const ASSETS = [
  { name: "Logo 主版（横版）", format: "PNG · SVG", size: "2048×512", icon: Image },
  { name: "Logo 图标版（方形）", format: "PNG · SVG", size: "512×512", icon: Image },
  { name: "Logo 白底版", format: "PNG", size: "2048×512", icon: Image },
  { name: "品牌色板", format: "PDF · ASE", size: "A4", icon: Palette },
  { name: "朋友圈海报模板", format: "PNG", size: "1080×1080", icon: FileText },
  { name: "产品宣传海报", format: "PNG", size: "1080×1920", icon: FileText },
  { name: "经销商名片模板", format: "PNG · PDF", size: "90×54mm", icon: FileText },
  { name: "产品价格表", format: "PDF", size: "A4", icon: FileText },
];

export default function BrandAssets() {
  return (
    <main className="page-enter">
      <section className="bg-gradient-to-br from-amber-50/50 to-background border-b border-border/40">
        <div className="container py-10">
          <div className="flex items-center gap-2 text-muted-foreground text-xs mb-3">
            <Link href="/" className="hover:text-foreground transition-colors">首页</Link>
            <span>/</span><span className="text-foreground">品牌素材</span>
          </div>
          <h1 className="font-serif text-3xl font-bold text-foreground mb-2">品牌素材</h1>
          <p className="text-muted-foreground text-sm">米伴品牌视觉识别系统，供经销商与合作伙伴使用</p>
        </div>
      </section>

      <div className="container py-8 space-y-8">
        {/* 品牌色板 */}
        <section>
          <h2 className="font-serif font-semibold text-foreground text-xl mb-4 flex items-center gap-2"><Palette className="w-5 h-5 text-primary" />品牌色板</h2>
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
            {BRAND_COLORS.map((color) => (
              <div key={color.hex} className="washi-card p-4">
                <div className="w-full h-16 rounded-xl mb-3 shadow-sm" style={{ backgroundColor: color.hex }} />
                <p className="font-medium text-foreground text-sm">{color.name}</p>
                <p className="text-muted-foreground text-xs mt-0.5 font-mono">{color.hex}</p>
                <p className="text-muted-foreground text-xs mt-1 leading-relaxed">{color.desc}</p>
              </div>
            ))}
          </div>
        </section>

        {/* 字体规范 */}
        <section>
          <h2 className="font-serif font-semibold text-foreground text-xl mb-4 flex items-center gap-2"><FileText className="w-5 h-5 text-primary" />字体规范</h2>
          <div className="washi-card divide-y divide-border/40">
            {FONT_SPEC.map((font) => (
              <div key={font.name} className="p-4 flex items-center gap-4">
                <div className="w-24 flex-shrink-0">
                  <p className="text-xs text-muted-foreground">{font.name}</p>
                </div>
                <div className="flex-1">
                  <p className="font-medium text-foreground text-sm">{font.value}</p>
                  <p className="text-muted-foreground text-xs mt-0.5">{font.usage}</p>
                </div>
              </div>
            ))}
          </div>
        </section>

        {/* 素材下载 */}
        <section>
          <h2 className="font-serif font-semibold text-foreground text-xl mb-4 flex items-center gap-2"><Download className="w-5 h-5 text-primary" />素材下载</h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {ASSETS.map((asset) => {
              const Icon = asset.icon;
              return (
                <div key={asset.name} className="washi-card p-4 flex items-center gap-4">
                  <div className="w-10 h-10 rounded-xl bg-primary/8 flex items-center justify-center flex-shrink-0">
                    <Icon className="w-5 h-5 text-primary" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="font-medium text-foreground text-sm">{asset.name}</p>
                    <p className="text-muted-foreground text-xs mt-0.5">{asset.format} · {asset.size}</p>
                  </div>
                  <Button size="sm" variant="outline" className="rounded-xl text-xs gap-1.5 flex-shrink-0" onClick={() => alert("素材准备中，敬请期待")}>
                    <Download className="w-3 h-3" />下载
                  </Button>
                </div>
              );
            })}
          </div>
          <p className="text-muted-foreground text-xs mt-4 text-center">素材持续更新中，如需定制版本请联系运营团队</p>
        </section>
      </div>
    </main>
  );
}
