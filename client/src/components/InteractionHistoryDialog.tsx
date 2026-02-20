import React, { useState, useEffect } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Calendar, Clock } from "lucide-react";
import { trpc } from "@/lib/trpc";

interface InteractionHistoryDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  contactId: number;
  contactName: string;
}

export function InteractionHistoryDialog({
  open,
  onOpenChange,
  contactId,
  contactName,
}: InteractionHistoryDialogProps) {
  const { data: interactions, isLoading } =
    trpc.interactions.getByContact.useQuery(
      { contactId },
      { enabled: open && contactId > 0 }
    );

  const formatDate = (timestamp: number) => {
    const date = new Date(timestamp);
    return date.toLocaleDateString("zh-CN", {
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
    });
  };

  const formatDateOnly = (timestamp: number) => {
    const date = new Date(timestamp);
    return date.toLocaleDateString("zh-CN", {
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    });
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>与 {contactName} 的互动记录</DialogTitle>
        </DialogHeader>

        {isLoading ? (
          <div className="flex items-center justify-center py-8">
            <p className="text-muted-foreground">加载中...</p>
          </div>
        ) : !interactions || interactions.length === 0 ? (
          <div className="flex items-center justify-center py-8">
            <p className="text-muted-foreground">暂无互动记录</p>
          </div>
        ) : (
          <ScrollArea className="h-[400px] pr-4">
            <div className="space-y-4">
              {interactions.map((interaction, index) => (
                <div
                  key={interaction.id}
                  className="flex gap-4 pb-4 border-b last:border-b-0"
                >
                  {/* 时间线指示器 */}
                  <div className="flex flex-col items-center">
                    <div className="w-3 h-3 rounded-full bg-[#1976D2] mt-1.5" />
                    {index < interactions.length - 1 && (
                      <div className="w-0.5 h-12 bg-gray-200 mt-2" />
                    )}
                  </div>

                  {/* 互动内容 */}
                  <div className="flex-1 pb-2">
                    <div className="flex items-center gap-2 mb-1">
                      <Calendar className="w-4 h-4 text-muted-foreground" />
                      <span className="text-sm font-medium">
                        {formatDate(interaction.timestamp)}
                      </span>
                    </div>
                    {interaction.notes && (
                      <p className="text-sm text-muted-foreground mt-2">
                        {interaction.notes}
                      </p>
                    )}
                    {interaction.type && (
                      <div className="mt-2">
                        <span className="inline-block px-2 py-1 text-xs rounded bg-[#F5F5F5] text-[#1976D2]">
                          {interaction.type}
                        </span>
                      </div>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </ScrollArea>
        )}
      </DialogContent>
    </Dialog>
  );
}
