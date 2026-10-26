"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { toast } from "sonner";
import {
  GraduationCap,
  Building2,
  Clock,
  Users,
  Phone,
  Tag,
  Plus,
  X,
  Loader2,
  ArrowRight,
  LogOut,
} from "lucide-react";

import { useAuth } from "@/context/AuthContext";
import { updateProfile } from "@/app/actions/update-profile";
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";

const facultyProfileFormSchema = z.object({
  office_location: z.string().min(1, "Office location is required").trim(),
  consultation_hours: z.string().min(1, "Consultation hours are required").trim(),
  max_team_capacity: z.coerce
    .number()
    .int()
    .min(1, "Must be at least 1 team")
    .default(5),
  phone: z.string().trim().optional(),
});

type FacultyProfileFormData = z.infer<typeof facultyProfileFormSchema>;

const SUGGESTED_INTERESTS = [
  "ai/ml",
  "cybersecurity",
  "cloud computing",
  "web engineering",
  "iot",
  "mobile computing",
  "data science",
  "computer networks",
];

export default function CompleteProfilePage() {
  const router = useRouter();
  const { user, signOut, refreshToken } = useAuth();
  const [researchInterests, setResearchInterests] = React.useState<string[]>([
    "web engineering",
  ]);
  const [tagInput, setTagInput] = React.useState("");
  const [isSubmitting, setIsSubmitting] = React.useState(false);

  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<FacultyProfileFormData>({
    resolver: zodResolver(facultyProfileFormSchema),
    defaultValues: {
      office_location: "",
      consultation_hours: "",
      max_team_capacity: 5,
      phone: "",
    },
  });

  const handleAddTag = (rawTag: string) => {
    const trimmed = rawTag.trim().toLowerCase();
    if (!trimmed) return;
    if (researchInterests.includes(trimmed)) {
      setTagInput("");
      return;
    }
    setResearchInterests((prev) => [...prev, trimmed]);
    setTagInput("");
  };

  const handleRemoveTag = (tagToRemove: string) => {
    setResearchInterests((prev) => prev.filter((t) => t !== tagToRemove));
  };

  const handleTagKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter" || e.key === ",") {
      e.preventDefault();
      handleAddTag(tagInput);
    }
  };

  const onSubmit = async (data: FacultyProfileFormData) => {
    if (!user) {
      toast.error("You must be signed in to complete your profile.");
      return;
    }

    setIsSubmitting(true);
    try {
      const idToken = await user.getIdToken();
      const res = await updateProfile({
        idToken,
        office_location: data.office_location,
        consultation_hours: data.consultation_hours,
        max_team_capacity: data.max_team_capacity,
        research_interests: researchInterests,
        phone: data.phone || undefined,
      });

      if (!res.ok) {
        throw new Error("Profile completion returned an error.");
      }

      // Obtain fresh token with updated custom claims (profileComplete: true)
      const freshToken = await user.getIdToken(true);

      // Re-sync session cookie
      await fetch("/api/session", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ idToken: freshToken }),
      });

      // Update AuthContext state
      await refreshToken();

      toast.success("Faculty profile completed successfully!");

      // Refresh server components and navigate to dashboard
      router.refresh();
      router.push("/");
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Failed to update profile.";
      toast.error(msg);
      setIsSubmitting(false);
    }
  };

  const handleSignOut = async () => {
    try {
      await signOut();
      router.push("/login");
    } catch {
      router.push("/login");
    }
  };

  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-background p-4 sm:p-6 lg:p-8">
      <div className="w-full max-w-xl space-y-6">
        {/* Brand Header */}
        <div className="flex flex-col items-center text-center space-y-2">
          <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-primary text-primary-foreground shadow-sm">
            <GraduationCap className="h-7 w-7" aria-hidden="true" />
          </div>
          <div>
            <h1 className="text-2xl font-bold tracking-tight text-foreground">
              HTU · FYPMS
            </h1>
            <p className="text-xs text-muted-foreground">
              Ho Technical University — Department of Computer Science
            </p>
          </div>
        </div>

        {/* Form Card */}
        <Card className="border-border shadow-sm">
          <CardHeader className="space-y-1">
            <CardTitle className="text-lg font-semibold text-foreground">
              Faculty Profile Setup
            </CardTitle>
            <CardDescription className="text-xs">
              Please provide your consultation hours, office location, and research specializations to activate supervisor matching and complete your onboarding.
            </CardDescription>
          </CardHeader>

          <form onSubmit={handleSubmit(onSubmit)}>
            <CardContent className="space-y-4">
              {/* Office Location */}
              <div className="space-y-1.5">
                <Label htmlFor="office_location" className="text-xs font-semibold flex items-center gap-1.5">
                  <Building2 className="h-3.5 w-3.5 text-primary" aria-hidden="true" />
                  Office Location <span className="text-destructive">*</span>
                </Label>
                <Input
                  id="office_location"
                  placeholder="e.g. Room 204, CS Department Block B"
                  disabled={isSubmitting}
                  className="h-9 text-xs"
                  {...register("office_location")}
                />
                {errors.office_location && (
                  <p className="text-[11px] text-destructive font-medium">
                    {errors.office_location.message}
                  </p>
                )}
                <p className="text-[11px] text-muted-foreground">
                  Gated detail: Students only view this after project proposal acceptance.
                </p>
              </div>

              {/* Consultation Hours */}
              <div className="space-y-1.5">
                <Label htmlFor="consultation_hours" className="text-xs font-semibold flex items-center gap-1.5">
                  <Clock className="h-3.5 w-3.5 text-primary" aria-hidden="true" />
                  Consultation Hours <span className="text-destructive">*</span>
                </Label>
                <Input
                  id="consultation_hours"
                  placeholder="e.g. Tuesdays & Thursdays 10:00 AM - 12:00 PM"
                  disabled={isSubmitting}
                  className="h-9 text-xs"
                  {...register("consultation_hours")}
                />
                {errors.consultation_hours && (
                  <p className="text-[11px] text-destructive font-medium">
                    {errors.consultation_hours.message}
                  </p>
                )}
              </div>

              {/* Phone (Optional) */}
              <div className="space-y-1.5">
                <Label htmlFor="phone" className="text-xs font-semibold flex items-center gap-1.5">
                  <Phone className="h-3.5 w-3.5 text-muted-foreground" aria-hidden="true" />
                  Direct Contact Number <span className="text-muted-foreground font-normal">(Optional)</span>
                </Label>
                <Input
                  id="phone"
                  placeholder="e.g. +233 24 123 4567"
                  disabled={isSubmitting}
                  className="h-9 text-xs"
                  {...register("phone")}
                />
                <p className="text-[11px] text-muted-foreground">
                  Protected in supervisor contacts. Never published publicly.
                </p>
              </div>

              {/* Max Team Capacity */}
              <div className="space-y-1.5">
                <Label htmlFor="max_team_capacity" className="text-xs font-semibold flex items-center gap-1.5">
                  <Users className="h-3.5 w-3.5 text-primary" aria-hidden="true" />
                  Maximum Supervised Teams <span className="text-destructive">*</span>
                </Label>
                <Input
                  id="max_team_capacity"
                  type="number"
                  min={1}
                  max={20}
                  disabled={isSubmitting}
                  className="h-9 text-xs"
                  {...register("max_team_capacity")}
                />
                {errors.max_team_capacity && (
                  <p className="text-[11px] text-destructive font-medium">
                    {errors.max_team_capacity.message}
                  </p>
                )}
                <p className="text-[11px] text-muted-foreground">
                  Default: 5 teams. Used by the matching algorithm to balance supervision workload.
                </p>
              </div>

              {/* Research Interests as Chips */}
              <div className="space-y-2">
                <Label className="text-xs font-semibold flex items-center gap-1.5">
                  <Tag className="h-3.5 w-3.5 text-primary" aria-hidden="true" />
                  Research Specializations & Interests
                </Label>
                <div className="flex gap-2">
                  <Input
                    placeholder="Add a specialization tag (press Enter)"
                    value={tagInput}
                    onChange={(e) => setTagInput(e.target.value)}
                    onKeyDown={handleTagKeyDown}
                    disabled={isSubmitting}
                    className="h-9 text-xs"
                  />
                  <Button
                    type="button"
                    variant="secondary"
                    size="sm"
                    onClick={() => handleAddTag(tagInput)}
                    disabled={isSubmitting || !tagInput.trim()}
                    className="h-9 gap-1 text-xs px-3"
                  >
                    <Plus className="h-3.5 w-3.5" aria-hidden="true" />
                    <span>Add</span>
                  </Button>
                </div>

                {/* Selected Chips */}
                <div className="flex flex-wrap gap-1.5 min-h-[32px] p-2 rounded-md bg-muted/30 border border-border">
                  {researchInterests.length === 0 ? (
                    <span className="text-[11px] text-muted-foreground italic">
                      No tags added yet. Choose from suggestions below or type your own.
                    </span>
                  ) : (
                    researchInterests.map((tag) => (
                      <Badge
                        key={tag}
                        variant="secondary"
                        className="gap-1 pl-2.5 pr-1.5 py-0.5 text-xs bg-primary/10 text-primary hover:bg-primary/15 border-primary/20"
                      >
                        <span>{tag}</span>
                        <button
                          type="button"
                          onClick={() => handleRemoveTag(tag)}
                          disabled={isSubmitting}
                          className="rounded-full p-0.5 hover:bg-primary/20 focus:outline-none"
                          aria-label={`Remove ${tag}`}
                        >
                          <X className="h-3 w-3" aria-hidden="true" />
                        </button>
                      </Badge>
                    ))
                  )}
                </div>

                {/* Suggestions */}
                <div className="space-y-1">
                  <span className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">
                    Suggested domains:
                  </span>
                  <div className="flex flex-wrap gap-1">
                    {SUGGESTED_INTERESTS.filter((t) => !researchInterests.includes(t)).map((tag) => (
                      <button
                        key={tag}
                        type="button"
                        onClick={() => handleAddTag(tag)}
                        disabled={isSubmitting}
                        className="rounded border border-border bg-card px-2 py-0.5 text-[11px] text-muted-foreground hover:bg-muted hover:text-foreground transition-colors"
                      >
                        + {tag}
                      </button>
                    ))}
                  </div>
                </div>
              </div>
            </CardContent>

            <CardFooter className="flex justify-between border-t border-border pt-4">
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={handleSignOut}
                disabled={isSubmitting}
                className="gap-1.5 text-xs text-muted-foreground hover:text-foreground"
              >
                <LogOut className="h-3.5 w-3.5" aria-hidden="true" />
                <span>Sign Out</span>
              </Button>

              <Button
                type="submit"
                size="sm"
                disabled={isSubmitting}
                className="gap-1.5 text-xs font-semibold px-4"
              >
                {isSubmitting ? (
                  <>
                    <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden="true" />
                    <span>Saving Profile...</span>
                  </>
                ) : (
                  <>
                    <span>Complete Profile</span>
                    <ArrowRight className="h-3.5 w-3.5" aria-hidden="true" />
                  </>
                )}
              </Button>
            </CardFooter>
          </form>
        </Card>
      </div>
    </div>
  );
}
