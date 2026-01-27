import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

interface Member {
  userId: number;
  nickname: string;
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
              <div className="w-12 h-12 rounded-full bg-gradient-to-br from-blue-400 to-blue-600 flex items-center justify-center text-white font-medium text-lg flex-shrink-0">
                {member.nickname.charAt(0)}
              </div>
              
              {/* 成员信息 */}
              <div className="flex-1 min-w-0">
                <div className="font-medium text-gray-900 truncate">
                  {member.nickname}
                </div>
                <div className="text-sm text-gray-500">
                  {member.role === "owner" ? "账本所有者" : "成员"}
                </div>
              </div>
            </div>
          ))}
        </div>
      </DialogContent>
    </Dialog>
  );
}
