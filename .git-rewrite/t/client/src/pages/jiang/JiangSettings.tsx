/**
 * 润仪算力研发中心 - 商家设置页
 * 路由：/jiang/settings
 * 使用通用 MerchantSettingsPage 组件（§10.1 通用商家设置规范）
 */
import MerchantSettingsPage from "@/components/MerchantSettingsPage";

export default function JiangSettings() {
  return (
    <MerchantSettingsPage
      merchantCode="jiang"
      adminUsername="jiang"
      accentColor="#D32F2F"
      bgColor="#0A0A0F"
      cardBgColor="#0d0d14"
      borderColor="#D32F2F"
      backPath="/jiang/profile"
    />
  );
}
