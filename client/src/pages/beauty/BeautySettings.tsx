/**
 * 奢贝美容院 - 商家设置页
 * 路由：/beauty/settings
 * 使用通用 MerchantSettingsPage 组件（§10.1 通用商家设置规范）
 */
import MerchantSettingsPage from "@/components/MerchantSettingsPage";

export default function BeautySettings() {
  return (
    <MerchantSettingsPage
      merchantCode="liulifan"
      adminUsername="liulifan"
      accentColor="#E91E8C"
      bgColor="#1a0a12"
      cardBgColor="#240d1a"
      borderColor="#E91E8C"
      backPath="/beauty/profile"
    />
  );
}
