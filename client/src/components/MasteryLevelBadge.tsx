import { Badge } from "@/components/ui/badge";

type MasteryLevel = "not_started" | "learning" | "mastered";

interface MasteryLevelBadgeProps {
  masteryLevel: MasteryLevel;
  onToggle: () => void;
}

const MASTERY_CONFIG = {
  not_started: {
    label: "未学习",
    className: "bg-gray-100 text-gray-700 hover:bg-gray-200 cursor-pointer",
  },
  learning: {
    label: "学习中",
    className: "bg-yellow-100 text-yellow-700 hover:bg-[#FFF3E0] cursor-pointer",
  },
  mastered: {
    label: "已掌握",
    className: "bg-[#E8F5E9] text-green-700 hover:bg-green-200 cursor-pointer",
  },
};

export function MasteryLevelBadge({ masteryLevel, onToggle }: MasteryLevelBadgeProps) {
  const config = MASTERY_CONFIG[masteryLevel];

  return (
    <Badge
      onClick={onToggle}
      className={`${config.className} transition-colors`}
      title="点击切换学习状态"
    >
      {config.label}
    </Badge>
  );
}
