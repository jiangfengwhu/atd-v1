import * as React from 'react';
import type { PostItem, UserProfile } from '@/lib/api';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { PostComposer } from '@/components/PostComposer';

interface ComposeDialogProps {
  open: boolean;
  currentUser?: UserProfile | null;
  onOpenChange: (open: boolean) => void;
  onCreated: (post: PostItem) => void;
}

export function ComposeDialog({
  open,
  currentUser,
  onOpenChange,
  onCreated,
}: ComposeDialogProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="w-[calc(100vw-2rem)] max-w-xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="text-lg">发布动态</DialogTitle>
          <DialogDescription>
            输入正文即可发布，通过 #话题 自动标记主题，支持直接拖拽/粘贴图片，粘贴外链自动识别。
          </DialogDescription>
        </DialogHeader>

        <div className="mt-3">
          <PostComposer
            currentUser={currentUser}
            autoFocus
            submitLabel="立即发布"
            onCancel={() => onOpenChange(false)}
            onCreated={(post) => {
              onCreated(post);
              onOpenChange(false);
            }}
          />
        </div>
      </DialogContent>
    </Dialog>
  );
}
