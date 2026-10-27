"use client";

import * as React from "react";
import { Loader2, UploadCloud, Link as LinkIcon, AlertCircle } from "lucide-react";
import { toast } from "sonner";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { validateChapterUrl } from "@/lib/chapters/url";
import { submitChapter } from "@/app/actions/submit-chapter";
import { useAuth } from "@/context/AuthContext";

interface ChapterSubmitDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  teamId: string;
  chapterNumber: 1 | 2 | 3 | 4 | 5;
  chapterTitle: string;
  isResubmission?: boolean;
  currentVersion?: number;
  isLocked?: boolean;
  onSuccess?: () => void;
}

export function ChapterSubmitDialog({
  open,
  onOpenChange,
  teamId,
  chapterNumber,
  chapterTitle,
  isResubmission = false,
  currentVersion = 1,
  isLocked = false,
  onSuccess,
}: ChapterSubmitDialogProps) {
  const { user } = useAuth();
  const [url, setUrl] = React.useState("");
  const [error, setError] = React.useState<string | null>(null);
  const [submitting, setSubmitting] = React.useState(false);

  const handleOpenChange = (newOpen: boolean) => {
    if (newOpen && isLocked) {
      toast.error(`Chapter ${chapterNumber} is locked. You must have prior chapters approved first.`);
      return;
    }
    if (!newOpen) {
      setUrl("");
      setError(null);
      setSubmitting(false);
    }
    onOpenChange(newOpen);
  };

  const handleUrlChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = e.target.value;
    setUrl(val);
    if (error) {
      const validation = validateChapterUrl(val);
      if (validation.valid) {
        setError(null);
      }
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user) {
      toast.error("You must be logged in to submit a chapter.");
      return;
    }

    if (isLocked) {
      toast.error(`Chapter ${chapterNumber} is locked.`);
      onOpenChange(false);
      return;
    }

    const validation = validateChapterUrl(url);
    if (!validation.valid) {
      setError(validation.error || "Please enter a valid document link.");
      return;
    }

    setSubmitting(true);
    setError(null);

    try {
      const idToken = await user.getIdToken();
      const res = await submitChapter(idToken, {
        team_id: teamId,
        chapter_number: chapterNumber,
        document_url: url.trim(),
      });

      if (!res.ok) {
        setError(res.error || "Failed to submit chapter.");
        toast.error(res.error || "Failed to submit chapter.");
        return;
      }

      toast.success(
        isResubmission
          ? `Chapter ${chapterNumber} (v${res.version}) resubmitted successfully!`
          : `Chapter ${chapterNumber} submitted for supervisor review!`
      );
      onOpenChange(false);
      onSuccess?.();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Unexpected error during submission.";
      setError(msg);
      toast.error(msg);
    } finally {
      setSubmitting(false);
    }
  };

  if (isLocked) {
    return null;
  }

  const nextVersion = isResubmission ? currentVersion + 1 : 1;

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="max-w-lg">
        <form onSubmit={handleSubmit}>
          <DialogHeader>
            <div className="flex items-center gap-2">
              <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-primary/10 text-primary">
                <UploadCloud className="h-5 w-5" aria-hidden="true" />
              </div>
              <div>
                <DialogTitle className="text-base font-semibold">
                  {isResubmission
                    ? `Resubmit Chapter ${chapterNumber} (v${nextVersion})`
                    : `Submit Chapter ${chapterNumber} Draft`}
                </DialogTitle>
                <DialogDescription className="text-xs text-muted-foreground">
                  {chapterTitle} · Provide an accessible link to your manuscript
                </DialogDescription>
              </div>
            </div>
          </DialogHeader>

          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label htmlFor="chapter-doc-url" className="text-sm font-medium">
                Document URL <span className="text-destructive">*</span>
              </Label>
              <div className="relative">
                <LinkIcon
                  className="absolute left-3 top-2.5 h-4 w-4 text-muted-foreground"
                  aria-hidden="true"
                />
                <Input
                  id="chapter-doc-url"
                  placeholder="https://docs.google.com/document/d/... or 1drv.ms/..."
                  className="pl-9 text-sm"
                  value={url}
                  onChange={handleUrlChange}
                  disabled={submitting}
                  autoFocus
                />
              </div>

              {error && (
                <div className="flex items-start gap-1.5 text-xs text-destructive pt-1" role="alert">
                  <AlertCircle className="h-3.5 w-3.5 shrink-0 mt-0.5" aria-hidden="true" />
                  <span>{error}</span>
                </div>
              )}

              <p className="text-xs text-muted-foreground leading-relaxed pt-1">
                Must be an <strong>HTTPS</strong> share link on <strong>Google Drive</strong>,{" "}
                <strong>Google Docs</strong>, <strong>OneDrive</strong> (<code>1drv.ms</code>), or{" "}
                <strong>SharePoint</strong>. Please verify viewer permissions so your supervisor can read it.
              </p>
            </div>
          </div>

          <DialogFooter className="gap-2 sm:gap-0">
            <Button
              type="button"
              variant="outline"
              onClick={() => onOpenChange(false)}
              disabled={submitting}
            >
              Cancel
            </Button>
            <Button type="submit" disabled={submitting || !url.trim()} className="gap-2">
              {submitting && <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />}
              {isResubmission ? `Submit Revision v${nextVersion}` : "Submit Chapter Draft"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
