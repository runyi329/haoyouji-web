import { trpc } from "@/lib/trpc";
import { useMemo } from "react";

/**
 * 获取当前用户家庭的功能权限
 * 返回一个helper函数来检查某个子功能是否已启用
 */
export function useFamilyFeatures() {
  const { data: features, isLoading } = trpc.admin.getMyFamilyFeatures.useQuery();

  const isFeatureEnabled = useMemo(() => {
    return (featureName: string, subFeatureName: string) => {
      if (!features) return false;
      return features.some(
        f => f.featureName === featureName && 
             f.subFeatureName === subFeatureName && 
             f.enabled
      );
    };
  }, [features]);

  const getEnabledSubFeatures = useMemo(() => {
    return (featureName: string) => {
      if (!features) return [];
      return features
        .filter(f => f.featureName === featureName && f.enabled)
        .map(f => f.subFeatureName);
    };
  }, [features]);

  return {
    features,
    isLoading,
    isFeatureEnabled,
    getEnabledSubFeatures,
  };
}
