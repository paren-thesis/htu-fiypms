"use client";

import * as React from "react";
import { useForm, useWatch } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Plus, X, Loader2, Sparkles, Send, FileEdit } from "lucide-react";
import { toast } from "sonner";
import { useAuth } from "@/context/AuthContext";
import {
  createTopicDraft,
  updateTopicDraft,
  resubmitTopic,
} from "@/app/actions/submit-topic";
import type { TopicDocument } from "@/types/firestore";
import type { SimilarTopicWarning } from "@/lib/topics/similar";
import { normaliseTags } from "@/lib/matching/jaccard";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  Form,
  FormControl,
  FormDescription,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";

const formSchema = z.object({
  title: z
    .string()
    .trim()
    .min(5, "Title must be at least 5 characters")
    .max(150, "Title cannot exceed 150 characters"),
  preference_rank: z.union([z.literal(1), z.literal(2), z.literal(3)], {
    error: "Preference rank must be 1, 2, or 3",
  }),
  abstract: z
    .string()
    .trim()
    .min(20, "Abstract must be at least 20 characters")
    .max(2000, "Abstract cannot exceed 2000 characters"),
  problem_statement: z
    .string()
    .trim()
    .min(20, "Problem statement must be at least 20 characters")
    .max(1500, "Problem statement cannot exceed 1500 characters"),
  proposed_solution: z
    .string()
    .trim()
    .min(20, "Proposed solution must be at least 20 characters")
    .max(1500, "Proposed solution cannot exceed 1500 characters"),
  tech_stack: z
    .array(z.string())
    .min(1, "Please add at least one technology keyword")
    .max(12, "Maximum 12 technologies allowed"),
});

type FormValues = z.infer<typeof formSchema>;

export type ProposalFormMode = "create" | "edit" | "resubmit";

interface ProposalFormSheetProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  teamId: string;
  mode: ProposalFormMode;
  initialRank?: 1 | 2 | 3;
  existingTopic?: TopicDocument | null;
  onSuccess?: (topicId: string, warnings?: SimilarTopicWarning[]) => void;
}

export function ProposalFormSheet({
  open,
  onOpenChange,
  teamId,
  mode,
  initialRank = 1,
  existingTopic,
  onSuccess,
}: ProposalFormSheetProps) {
  const { user } = useAuth();
  const [serverError, setServerError] = React.useState<string | null>(null);
  const [tagInput, setTagInput] = React.useState("");

  const form = useForm<FormValues>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      title: "",
      preference_rank: initialRank,
      abstract: "",
      problem_statement: "",
      proposed_solution: "",
      tech_stack: [],
    },
  });

  // Reset form state when sheet opens or existingTopic/initialRank changes
  React.useEffect(() => {
    if (open) {
      if (existingTopic && (mode === "edit" || mode === "resubmit")) {
        form.reset({
          title: existingTopic.title || "",
          preference_rank: existingTopic.preference_rank || initialRank,
          abstract: existingTopic.abstract || "",
          problem_statement: existingTopic.problem_statement || "",
          proposed_solution: existingTopic.proposed_solution || "",
          tech_stack: existingTopic.tech_stack || [],
        });
      } else {
        form.reset({
          title: "",
          preference_rank: initialRank,
          abstract: "",
          problem_statement: "",
          proposed_solution: "",
          tech_stack: [],
        });
      }
    }
  }, [open, existingTopic, initialRank, mode, form]);

  const watchedTags = useWatch({ control: form.control, name: "tech_stack" });
  const currentTags = watchedTags || [];

  const handleAddTag = () => {
    const raw = tagInput.trim();
    if (!raw) return;

    const normalised = normaliseTags([...currentTags, raw]);
    if (normalised.length > 12) {
      toast.error("Maximum 12 technology tags allowed");
      return;
    }
    form.setValue("tech_stack", normalised, { shouldValidate: true });
    setTagInput("");
  };

  const handleRemoveTag = (tagToRemove: string) => {
    const nextTags = currentTags.filter((t) => t !== tagToRemove);
    form.setValue("tech_stack", nextTags, { shouldValidate: true });
  };

  const isSubmitting = form.formState.isSubmitting;

  const onSubmit = async (values: FormValues) => {
    if (!user) {
      toast.error("You must be signed in to submit proposals");
      return;
    }

    setServerError(null);

    try {
      const idToken = await user.getIdToken();

      if (mode === "create") {
        const res = await createTopicDraft(idToken, {
          teamId,
          title: values.title,
          preference_rank: values.preference_rank,
          abstract: values.abstract,
          problem_statement: values.problem_statement,
          proposed_solution: values.proposed_solution,
          tech_stack: values.tech_stack,
        });

        if (!res.ok) {
          setServerError(res.error || "Failed to create proposal draft");
          return;
        }

        toast.success(`Draft proposal (Rank ${values.preference_rank}) created!`);
        onOpenChange(false);
        if (res.topicId && onSuccess) {
          onSuccess(res.topicId);
        }
      } else if (mode === "edit" && existingTopic) {
        const res = await updateTopicDraft(idToken, {
          topicId: existingTopic.id,
          title: values.title,
          preference_rank: values.preference_rank,
          abstract: values.abstract,
          problem_statement: values.problem_statement,
          proposed_solution: values.proposed_solution,
          tech_stack: values.tech_stack,
        });

        if (!res.ok) {
          setServerError(res.error || "Failed to update proposal draft");
          return;
        }

        toast.success("Draft proposal updated!");
        onOpenChange(false);
        if (onSuccess) {
          onSuccess(existingTopic.id);
        }
      } else if (mode === "resubmit" && existingTopic) {
        const res = await resubmitTopic(idToken, {
          topicId: existingTopic.id,
          title: values.title,
          abstract: values.abstract,
          problem_statement: values.problem_statement,
          proposed_solution: values.proposed_solution,
          tech_stack: values.tech_stack,
        });

        if (!res.ok) {
          setServerError(res.error || "Failed to resubmit proposal");
          return;
        }

        toast.success(`Proposal resubmitted to Version ${res.version}!`);
        onOpenChange(false);
        if (onSuccess) {
          onSuccess(existingTopic.id, res.warnings);
        }
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : "An unexpected error occurred";
      setServerError(msg);
      toast.error(msg);
    }
  };

  const titleText =
    mode === "create"
      ? `Draft Proposal (Rank ${initialRank})`
      : mode === "edit"
      ? `Edit Draft Proposal (Rank ${existingTopic?.preference_rank})`
      : `Resubmit Proposal (v${(existingTopic?.version || 1) + 1})`;

  const descriptionText =
    mode === "create"
      ? "Enter project proposal details. Any teammate can draft; Team Leader performs final submission."
      : mode === "edit"
      ? "Modify proposal details prior to faculty submission."
      : "Revise proposal in response to supervisor feedback. A history snapshot of the previous version will be preserved.";

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="sm:max-w-xl w-full flex flex-col p-0">
        <SheetHeader className="p-6 pb-4 border-b border-border">
          <SheetTitle className="text-lg font-bold">{titleText}</SheetTitle>
          <SheetDescription className="text-xs text-muted-foreground">
            {descriptionText}
          </SheetDescription>
        </SheetHeader>

        <ScrollArea className="flex-1 p-6">
          <Form {...form}>
            <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-5">
              {serverError && (
                <Alert variant="destructive" className="py-2.5 text-xs">
                  <AlertDescription>{serverError}</AlertDescription>
                </Alert>
              )}

              {/* Title */}
              <FormField
                control={form.control}
                name="title"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel className="text-xs font-semibold">Project Title</FormLabel>
                    <FormControl>
                      <Input
                        placeholder="e.g. Smart Campus IoT Waste Management Telemetry System"
                        disabled={isSubmitting}
                        className="text-sm"
                        {...field}
                      />
                    </FormControl>
                    <FormDescription className="text-[11px] text-muted-foreground">
                      Between 5 and 150 characters. Clear, descriptive capstone title.
                    </FormDescription>
                    <FormMessage className="text-xs" />
                  </FormItem>
                )}
              />

              {/* Preference Rank (only editable on create) */}
              {mode === "create" && (
                <FormField
                  control={form.control}
                  name="preference_rank"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel className="text-xs font-semibold">Preference Rank</FormLabel>
                      <FormControl>
                        <div className="flex gap-3">
                          {([1, 2, 3] as const).map((r) => (
                            <button
                              key={r}
                              type="button"
                              onClick={() => field.onChange(r)}
                              className={`flex-1 rounded-lg border p-2 text-xs font-semibold transition-all ${
                                field.value === r
                                  ? "border-primary bg-primary/10 text-primary shadow-xs"
                                  : "border-border bg-card text-muted-foreground hover:bg-muted/50"
                              }`}
                            >
                              Rank {r} {r === 1 ? "(Primary)" : r === 2 ? "(Secondary)" : "(Tertiary)"}
                            </button>
                          ))}
                        </div>
                      </FormControl>
                      <FormDescription className="text-[11px] text-muted-foreground">
                        Each team must have unique ranks 1, 2, and 3.
                      </FormDescription>
                      <FormMessage className="text-xs" />
                    </FormItem>
                  )}
                />
              )}

              {/* Abstract */}
              <FormField
                control={form.control}
                name="abstract"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel className="text-xs font-semibold">Project Abstract</FormLabel>
                    <FormControl>
                      <Textarea
                        placeholder="Comprehensive summary of project background, objectives, methodologies, and expected outcomes..."
                        rows={4}
                        disabled={isSubmitting}
                        className="text-sm"
                        {...field}
                      />
                    </FormControl>
                    <FormDescription className="text-[11px] text-muted-foreground">
                      20 to 2000 characters.
                    </FormDescription>
                    <FormMessage className="text-xs" />
                  </FormItem>
                )}
              />

              {/* Problem Statement */}
              <FormField
                control={form.control}
                name="problem_statement"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel className="text-xs font-semibold">Problem Statement</FormLabel>
                    <FormControl>
                      <Textarea
                        placeholder="What specific institutional, societal, or technical gap does this project solve?"
                        rows={3}
                        disabled={isSubmitting}
                        className="text-sm"
                        {...field}
                      />
                    </FormControl>
                    <FormDescription className="text-[11px] text-muted-foreground">
                      20 to 1500 characters.
                    </FormDescription>
                    <FormMessage className="text-xs" />
                  </FormItem>
                )}
              />

              {/* Proposed Solution */}
              <FormField
                control={form.control}
                name="proposed_solution"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel className="text-xs font-semibold">Proposed Solution</FormLabel>
                    <FormControl>
                      <Textarea
                        placeholder="How will your system architecture and implementation address the problem?"
                        rows={3}
                        disabled={isSubmitting}
                        className="text-sm"
                        {...field}
                      />
                    </FormControl>
                    <FormDescription className="text-[11px] text-muted-foreground">
                      20 to 1500 characters.
                    </FormDescription>
                    <FormMessage className="text-xs" />
                  </FormItem>
                )}
              />

              {/* Tech Stack Chip Input */}
              <FormField
                control={form.control}
                name="tech_stack"
                render={() => (
                  <FormItem>
                    <div className="flex items-center justify-between">
                      <FormLabel className="text-xs font-semibold">Technology Stack</FormLabel>
                      <span className="text-[11px] text-muted-foreground">
                        {currentTags.length}/12 tags
                      </span>
                    </div>

                    <div className="flex gap-2">
                      <Input
                        placeholder="e.g. Next.js, Firebase, PyTorch"
                        value={tagInput}
                        onChange={(e) => setTagInput(e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key === "Enter" || e.key === ",") {
                            e.preventDefault();
                            handleAddTag();
                          }
                        }}
                        disabled={isSubmitting || currentTags.length >= 12}
                        className="text-sm"
                      />
                      <Button
                        type="button"
                        variant="secondary"
                        onClick={handleAddTag}
                        disabled={!tagInput.trim() || isSubmitting || currentTags.length >= 12}
                        className="shrink-0 text-xs"
                      >
                        <Plus className="h-3.5 w-3.5 mr-1" />
                        <span>Add</span>
                      </Button>
                    </div>

                    <div className="flex flex-wrap gap-1.5 pt-1.5">
                      {currentTags.map((tag) => (
                        <Badge
                          key={tag}
                          variant="secondary"
                          className="font-mono text-xs gap-1 pl-2.5 pr-1 py-1"
                        >
                          <span>{tag}</span>
                          <button
                            type="button"
                            onClick={() => handleRemoveTag(tag)}
                            className="rounded-full hover:bg-muted p-0.5 text-muted-foreground hover:text-foreground"
                          >
                            <X className="h-3 w-3" />
                            <span className="sr-only">Remove {tag}</span>
                          </button>
                        </Badge>
                      ))}
                    </div>

                    <FormDescription className="text-[11px] text-muted-foreground">
                      Press Enter or click Add. Used for matching supervisors and duplicate checks.
                    </FormDescription>
                    <FormMessage className="text-xs" />
                  </FormItem>
                )}
              />

              {/* Submit Buttons */}
              <div className="pt-4 border-t border-border flex items-center justify-end gap-3">
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => onOpenChange(false)}
                  disabled={isSubmitting}
                  className="text-xs"
                >
                  Cancel
                </Button>
                <Button
                  type="submit"
                  disabled={isSubmitting}
                  className="gap-2 text-xs font-medium"
                >
                  {isSubmitting ? (
                    <>
                      <Loader2 className="h-3.5 w-3.5 animate-spin" />
                      <span>Saving...</span>
                    </>
                  ) : mode === "create" ? (
                    <>
                      <Sparkles className="h-3.5 w-3.5" />
                      <span>Save Draft</span>
                    </>
                  ) : mode === "edit" ? (
                    <>
                      <FileEdit className="h-3.5 w-3.5" />
                      <span>Update Draft</span>
                    </>
                  ) : (
                    <>
                      <Send className="h-3.5 w-3.5" />
                      <span>Resubmit Revision</span>
                    </>
                  )}
                </Button>
              </div>
            </form>
          </Form>
        </ScrollArea>
      </SheetContent>
    </Sheet>
  );
}
