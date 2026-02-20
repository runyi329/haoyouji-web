import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { UserAvatar } from "@/components/UserAvatar";

interface Member {
  userId: number;
  username: string;
  nickname?: string | null;
  avatar?: string | null;
  role: string;
}

interface MembersDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  members: Member[];
}

export default function MembersDialog({
  open,
  onOpenChange,
  members,
}: MembersDialogProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>账本成员 ({members.length})</DialogTitle>
        </DialogHeader>
        <div className="space-y-3 max-h-[60vh] overflow-y-auto">
          {members.map((member) => (
            <div
              key={member.userId}
              className="flex items-center gap-3 p-3 rounded-lg hover:bg-gray-50"
            >
              {/* 成员头像 */}
              <UserAvatar
                username={member.username}
                avatar={member.avatar}
                nickname={member.nickname}
                size="md"
              />
              
              {/* 成员信息 */}
              <div className="flex-1 min-w-0">
                <div className="font-medium text-[#424242] truncate">
                  {member.nickname || member.username}
                </div>
                <div className="text-sm text-[#757575]">
                  @{member.username} · {member.role === "owner" ? "账本所有者" : "成员"}
                </div>
              </div>
            </div>
          ))}
        </div>
      </DialogContent>
    </Dialog>
  );
}
