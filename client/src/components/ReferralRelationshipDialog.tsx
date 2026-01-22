import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Badge } from "@/components/ui/badge";
import { trpc } from "@/lib/trpc";
import { Loader2, ChevronRight } from "lucide-react";

interface ReferralRelationshipDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  contactId: number;
  contactName: string;
  type: "direct" | "indirect"; // 直接推荐或间接推荐
}

interface ReferralPerson {
  id: number;
  name: string;
  title?: string;
  level?: number; // 推荐层级（仅用于间接推荐）
  referrerName?: string; // 推荐人名字（仅用于间接推荐）
}

export function ReferralRelationshipDialog({
  open,
  onOpenChange,
  contactId,
  contactName,
  type,
}: ReferralRelationshipDialogProps) {
  // 获取推荐关系数据
  const { data: referrals, isLoading } = trpc.contacts.getReferrals.useQuery(
    { contactId, type },
    { enabled: open }
  );

  const title = type === "direct" ? `${contactName} 直接推荐的人脉` : `${contactName} 间接推荐的人脉`;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[80vh] flex flex-col">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
        </DialogHeader>

        <ScrollArea className="flex-1 pr-4">
          {isLoading ? (
            <div className="flex items-center justify-center py-8">
              <Loader2 className="h-6 w-6 animate-spin text-blue-500" />
              <span className="ml-2 text-muted-foreground">加载中...</span>
            </div>
          ) : !referrals || referrals.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">
              暂无推荐人脉
            </div>
          ) : (
            <div className="space-y-2">
              {referrals.map((person: ReferralPerson, index: number) => (
                <div
                  key={`${person.id}-${index}`}
                  className="flex items-center gap-3 p-3 rounded-lg hover:bg-muted transition-colors"
                >
                  {/* 推荐层级指示（仅间接推荐显示） */}
                  {type === "indirect" && person.level && (
                    <div className="flex items-center gap-1 min-w-fit">
                      <Badge variant="outline" className="text-xs">
                        第{person.level}层
                      </Badge>
                      <ChevronRight className="h-4 w-4 text-muted-foreground" />
                    </div>
                  )}

                  {/* 推荐人信息 */}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="font-medium truncate">{person.name}</span>
                      {person.title && (
                        <span className="text-xs text-muted-foreground">
                          {person.title}
                        </span>
                      )}
                    </div>
                    {/* 推荐链路（仅间接推荐显示） */}
                    {type === "indirect" && person.referrerName && (
                      <div className="text-xs text-muted-foreground mt-1">
                        推荐人：{person.referrerName}
                      </div>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </ScrollArea>

        {/* 统计信息 */}
        {referrals && referrals.length > 0 && (
          <div className="border-t pt-4 text-sm text-muted-foreground">
            共 {referrals.length} 个推荐人脉
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
