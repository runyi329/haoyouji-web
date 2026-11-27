import { Link } from "wouter";
import { LayoutGrid, ShoppingBag } from "lucide-react";
import {
  CHONGBAN_SERVICES_PATH,
  CHONGBAN_SHOP_PATH,
} from "@/lib/chongban-navigation";

type ChongbanSection = "shop" | "services";

const sections = [
  { key: "shop", label: "口粮精选", href: CHONGBAN_SHOP_PATH, Icon: ShoppingBag },
  { key: "services", label: "功能区", href: CHONGBAN_SERVICES_PATH, Icon: LayoutGrid },
] as const;

/** 仅切换现有路由；商城与健康舱不会同时挂载，也不改变各自权限。 */
export default function ChongbanSectionTabs({ active }: { active: ChongbanSection }) {
  return (
    <nav aria-label="宠伴专区切换" className="border-b border-[#E8D9C8] bg-[#FBF6F0] px-4 py-2">
      <div className="mx-auto grid w-full max-w-[480px] grid-cols-2 gap-1 rounded-xl bg-[#EFE5D9] p-1">
        {sections.map(({ key, label, href, Icon }) => (
          <Link
            key={key}
            href={href}
            aria-current={active === key ? "page" : undefined}
            className={`flex min-h-10 min-w-0 items-center justify-center gap-2 rounded-lg px-3 text-[13px] font-semibold transition-colors active:opacity-70 ${
              active === key
                ? "bg-white text-[#A84F32] shadow-sm"
                : "text-[#92745D] hover:text-[#5C3D1E]"
            }`}
          >
            <Icon className="h-4 w-4 shrink-0" strokeWidth={1.8} aria-hidden="true" />
            <span>{label}</span>
          </Link>
        ))}
      </div>
    </nav>
  );
}
