"use client";

import * as React from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { Users, Loader2, ArrowRight } from "lucide-react";
import { toast } from "sonner";
import { useAuth } from "@/context/AuthContext";
import { createTeamInputSchema, type CreateTeamInput } from "@/lib/models/team/schema";
import { createTeam } from "@/app/actions/create-team";
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

interface CreateTeamCardProps {
  onSuccess?: (teamId: string) => void;
}

export function CreateTeamCard({ onSuccess }: CreateTeamCardProps) {
  const { user } = useAuth();
  const [serverError, setServerError] = React.useState<string | null>(null);

  const form = useForm<CreateTeamInput>({
    resolver: zodResolver(createTeamInputSchema),
    defaultValues: {
      name: "",
    },
  });

  const isSubmitting = form.formState.isSubmitting;

  async function onSubmit(data: CreateTeamInput) {
    if (!user) {
      toast.error("You must be signed in to create a team");
      return;
    }

    setServerError(null);

    try {
      const idToken = await user.getIdToken();
      const res = await createTeam(idToken, data);

      if (!res.ok) {
        const errorMsg = res.error || "Failed to create project team";
        setServerError(errorMsg);
        toast.error(errorMsg);
        return;
      }

      toast.success(`Project team "${data.name}" created! Group number: ${res.groupNumber}`);
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
        <div className="flex h-11 w-11 items-center justify-center rounded-lg bg-primary/10 text-primary">
          <Users className="h-5 w-5" aria-hidden="true" />
        </div>
        <CardTitle className="text-lg font-semibold tracking-tight">Create a New Team</CardTitle>
        <CardDescription className="text-sm text-muted-foreground">
          Form a project group as the designated Team Leader. Group number and programme track are derived automatically.
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
              name="name"
              render={({ field }) => (
                <FormItem>
                  <FormLabel className="text-xs font-semibold">Team Name</FormLabel>
                  <FormControl>
                    <Input
                      placeholder="e.g. Smart Campus IoT Group"
                      disabled={isSubmitting}
                      className="h-10 text-sm"
                      {...field}
                    />
                  </FormControl>
                  <FormDescription className="text-xs text-muted-foreground">
                    Must be between 3 and 50 characters. You can rename your team later.
                  </FormDescription>
                  <FormMessage className="text-xs" />
                </FormItem>
              )}
            />

            <Button
              type="submit"
              disabled={isSubmitting}
              className="w-full h-10 gap-2 font-medium"
            >
              {isSubmitting ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
                  <span>Creating Team...</span>
                </>
              ) : (
                <>
                  <span>Create Team</span>
                  <ArrowRight className="h-4 w-4" aria-hidden="true" />
                </>
              )}
            </Button>
          </form>
        </Form>
      </CardContent>
    </Card>
  );
}
