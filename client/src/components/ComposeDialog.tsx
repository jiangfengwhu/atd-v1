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
      <DialogContent className="max-w-xl">
        <DialogHeader>
          <DialogTitle className="text-lg">发布动态</DialogTitle>
          <DialogDescription>
            输入正文即可发布，通过 #话题 自动标记主题，支持拖拽或粘贴图片。
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
