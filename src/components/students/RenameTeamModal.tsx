"use client";

import * as React from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { Loader2, Edit3 } from "lucide-react";
import { toast } from "sonner";
import { useAuth } from "@/context/AuthContext";
import { renameTeamInputSchema, type RenameTeamInput } from "@/lib/models/team/schema";
import { renameTeam } from "@/app/actions/rename-team";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Form,
  FormControl,
  FormDescription,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Alert, AlertDescription } from "@/components/ui/alert";

interface RenameTeamModalProps {
  teamId: string;
  currentName: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSuccess?: (newName: string) => void;
}

export function RenameTeamModal({
  teamId,
  currentName,
  open,
  onOpenChange,
  onSuccess,
}: RenameTeamModalProps) {
  const { user } = useAuth();
  const [serverError, setServerError] = React.useState<string | null>(null);

  const form = useForm<RenameTeamInput>({
    resolver: zodResolver(renameTeamInputSchema),
    defaultValues: {
      teamId,
      name: currentName,
    },
  });

  const handleOpenChange = (nextOpen: boolean) => {
    if (nextOpen) {
      form.reset({
        teamId,
        name: currentName,
      });
      setServerError(null);
    }
    onOpenChange(nextOpen);
  };

  const isSubmitting = form.formState.isSubmitting;

  async function onSubmit(data: RenameTeamInput) {
    if (!user) {
      toast.error("You must be signed in to rename the team");
      return;
    }

    setServerError(null);

    try {
      const idToken = await user.getIdToken();
      const res = await renameTeam(idToken, data);

      if (!res.ok) {
        const errorMsg = res.error || "Failed to rename project team";
        setServerError(errorMsg);
        toast.error(errorMsg);
        return;
      }

      toast.success(`Team successfully renamed to "${data.name}"`);
      onOpenChange(false);
      if (onSuccess) {
        onSuccess(data.name);
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : "An unexpected error occurred";
      setServerError(msg);
      toast.error(msg);
    }
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-base font-semibold">
            <Edit3 className="h-4 w-4 text-primary" aria-hidden="true" />
            <span>Rename Project Team</span>
          </DialogTitle>
          <DialogDescription className="text-xs text-muted-foreground">
            Update the official display name of your capstone team. Only the designated Team Leader can perform this action.
          </DialogDescription>
        </DialogHeader>

        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
            {serverError && (
              <Alert variant="destructive" className="py-2.5 text-xs">
                <AlertDescription>{serverError}</AlertDescription>
              </Alert>
            )}

            <FormField
              control={form.control}
              name="name"
              render={({ field }) => (
                <FormItem>
                  <FormLabel className="text-xs font-semibold">New Team Name</FormLabel>
                  <FormControl>
                    <Input
                      placeholder="e.g. NextGen Distributed Systems"
                      disabled={isSubmitting}
                      className="h-10 text-sm"
                      {...field}
                    />
                  </FormControl>
                  <FormDescription className="text-xs text-muted-foreground">
                    Must be between 3 and 50 characters.
                  </FormDescription>
                  <FormMessage className="text-xs" />
                </FormItem>
              )}
            />

            <DialogFooter className="gap-2 sm:gap-0 pt-2">
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => onOpenChange(false)}
                disabled={isSubmitting}
              >
                Cancel
              </Button>
              <Button type="submit" size="sm" disabled={isSubmitting} className="gap-1.5">
                {isSubmitting && <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden="true" />}
                <span>Save Changes</span>
              </Button>
            </DialogFooter>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}
