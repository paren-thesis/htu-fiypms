"use client";

import * as React from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { KeyRound, Loader2, UserCheck } from "lucide-react";
import { toast } from "sonner";
import { useAuth } from "@/context/AuthContext";
import { joinTeamInputSchema, type JoinTeamInput } from "@/lib/models/team/schema";
import { joinTeam } from "@/app/actions/join-team";
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
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Alert, AlertDescription } from "@/components/ui/alert";

interface JoinTeamCardProps {
  onSuccess?: (teamId: string) => void;
}

export function JoinTeamCard({ onSuccess }: JoinTeamCardProps) {
  const { user } = useAuth();
  const [serverError, setServerError] = React.useState<string | null>(null);

  const form = useForm<JoinTeamInput>({
    resolver: zodResolver(joinTeamInputSchema),
    defaultValues: {
      inviteCode: "",
    },
  });

  const isSubmitting = form.formState.isSubmitting;

  async function onSubmit(data: JoinTeamInput) {
    if (!user) {
      toast.error("You must be signed in to join a team");
      return;
    }

    setServerError(null);

    try {
      const idToken = await user.getIdToken();
      const res = await joinTeam(idToken, data);

      if (!res.ok) {
        let errorMsg = res.error || "Failed to join team";

        // Map friendly error descriptions for spec compliance
        if (res.code === "COURSE_MISMATCH") {
          errorMsg = "This team belongs to a different programme. You can only join teams in your own course track.";
        } else if (res.code === "TEAM_FULL") {
          errorMsg = "This team is already full (maximum 5 members).";
        } else if (res.code === "ALREADY_IN_TEAM") {
          errorMsg = "You already belong to an active project team for this academic year.";
        } else if (res.code === "INVITE_CODE_NOT_FOUND") {
          errorMsg = "Invalid invite code. Team not found.";
        }

        setServerError(errorMsg);
        toast.error(errorMsg);
        return;
      }

      toast.success(`Successfully joined team! Group number: ${res.groupNumber}`);
      form.reset();
      if (res.teamId && onSuccess) {
        onSuccess(res.teamId);
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : "An unexpected error occurred";
      setServerError(msg);
      toast.error(msg);
    }
  }

  return (
    <Card className="rounded-xl border bg-card shadow-sm transition-all hover:shadow-md">
      <CardHeader className="space-y-2">
        <div className="flex h-11 w-11 items-center justify-center rounded-lg bg-accent text-accent-foreground">
          <KeyRound className="h-5 w-5" aria-hidden="true" />
        </div>
        <CardTitle className="text-lg font-semibold tracking-tight">Join with Code</CardTitle>
        <CardDescription className="text-sm text-muted-foreground">
          Enter the 6-character alphanumeric code provided by your Team Leader to join their group.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
            {serverError && (
              <Alert variant="destructive" className="py-2.5 text-xs">
                <AlertDescription>{serverError}</AlertDescription>
              </Alert>
            )}

            <FormField
              control={form.control}
              name="inviteCode"
              render={({ field }) => (
                <FormItem>
                  <FormLabel className="text-xs font-semibold">6-Character Invite Code</FormLabel>
                  <FormControl>
                    <Input
                      placeholder="e.g. 7K4X9B"
                      disabled={isSubmitting}
                      maxLength={6}
                      className="h-10 text-center font-mono text-base font-semibold tracking-widest uppercase"
                      {...field}
                      onChange={(e) => {
                        field.onChange(e.target.value.toUpperCase().trim());
                      }}
                    />
                  </FormControl>
                  <FormDescription className="text-xs text-muted-foreground">
                    Excludes visually ambiguous characters (0, O, 1, I). Case-insensitive.
                  </FormDescription>
                  <FormMessage className="text-xs" />
                </FormItem>
              )}
            />

            <Button
              type="submit"
              variant="outline"
              disabled={isSubmitting}
              className="w-full h-10 gap-2 font-medium hover:bg-accent/10"
            >
              {isSubmitting ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
                  <span>Joining Group...</span>
                </>
              ) : (
                <>
                  <UserCheck className="h-4 w-4" aria-hidden="true" />
                  <span>Join Team</span>
                </>
              )}
            </Button>
          </form>
        </Form>
      </CardContent>
    </Card>
  );
}
