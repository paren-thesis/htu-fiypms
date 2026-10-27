"use client";

import * as React from "react";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
  SheetFooter,
} from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Plus,
  Trash2,
  Sparkles,
  CheckCircle2,
  AlertTriangle,
  Loader2,
} from "lucide-react";
import { toast } from "sonner";
import { useAuth } from "@/context/AuthContext";
import { createRubric, updateRubric } from "@/app/actions/manage-rubric";
import {
  validateRubric,
  DEFAULT_RUBRIC_TEMPLATE,
  ALLOWED_CRITERIA_CATEGORIES,
  type CriteriaCategory,
} from "@/lib/rubrics/validate";
import type { RubricDocument } from "@/types/firestore";

interface RubricBuilderSheetProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  editingRubric?: RubricDocument | null;
  onSuccess?: (rubricId: string) => void;
}

const CATEGORY_LABELS: Record<CriteriaCategory, string> = {
  oral_defense: "Oral Defense",
  system_demo: "System Demo",
  technical_architecture: "Technical Architecture",
};

interface FormCriterion {
  id: string;
  title: string;
  description: string;
  max_points: number;
  category: CriteriaCategory;
}

interface RubricBuilderFormProps {
  editingRubric?: RubricDocument | null;
  onClose: () => void;
  onSuccess?: (rubricId: string) => void;
}

function RubricBuilderForm({
  editingRubric,
  onClose,
  onSuccess,
}: RubricBuilderFormProps) {
  const { user } = useAuth();
  const [submitting, setSubmitting] = React.useState(false);

  // Initialize directly from props without an effect
  const [title, setTitle] = React.useState(
    editingRubric ? editingRubric.title : "Capstone Defense Rubric"
  );
  const [maxScore, setMaxScore] = React.useState<number>(
    editingRubric ? editingRubric.max_score : 100
  );
  const [supWeight, setSupWeight] = React.useState<number>(
    editingRubric ? editingRubric.supervisor_weight_pct : 40
  );
  const [panelWeight, setPanelWeight] = React.useState<number>(
    editingRubric ? editingRubric.panel_weight_pct : 60
  );
  const [criteria, setCriteria] = React.useState<FormCriterion[]>(
    editingRubric
      ? editingRubric.criteria.map((c) => ({
          id: c.id,
          title: c.title,
          description: c.description || "",
          max_points: c.max_points,
          category: c.category as CriteriaCategory,
        }))
      : [
          {
            id: "oral_defense",
            title: "Oral Defense & Presentation",
            description: "Clarity of research defense and oral Q&A answers.",
            max_points: 30,
            category: "oral_defense",
          },
          {
            id: "system_demo",
            title: "System Demonstration",
            description: "Live functional execution and requirements verification.",
            max_points: 40,
            category: "system_demo",
          },
          {
            id: "technical_architecture",
            title: "Technical Architecture",
            description: "Design patterns, schema normalization, and engineering quality.",
            max_points: 30,
            category: "technical_architecture",
          },
        ]
  );

  // Load standard template
  const handleLoadTemplate = () => {
    setTitle(DEFAULT_RUBRIC_TEMPLATE.title);
    setMaxScore(DEFAULT_RUBRIC_TEMPLATE.max_score);
    setSupWeight(DEFAULT_RUBRIC_TEMPLATE.supervisor_weight_pct);
    setPanelWeight(DEFAULT_RUBRIC_TEMPLATE.panel_weight_pct);
    setCriteria(
      DEFAULT_RUBRIC_TEMPLATE.criteria.map((c) => ({
        id: c.id,
        title: c.title,
        description: c.description,
        max_points: c.max_points,
        category: c.category,
      }))
    );
    toast.info("Standard rubric template loaded (Oral 30, Demo 40, Tech Arch 30, Weights 40/60).");
  };

  const handleAddCriterion = () => {
    const nextNum = criteria.length + 1;
    setCriteria((prev) => [
      ...prev,
      {
        id: `criterion_${nextNum}`,
        title: "",
        description: "",
        max_points: 10,
        category: "oral_defense",
      },
    ]);
  };

  const handleRemoveCriterion = (index: number) => {
    if (criteria.length <= 1) {
      toast.error("Rubric must contain at least one criterion.");
      return;
    }
    setCriteria((prev) => prev.filter((_, i) => i !== index));
  };

  const handleCriterionChange = (
    index: number,
    field: "id" | "title" | "description" | "max_points" | "category",
    value: string | number
  ) => {
    setCriteria((prev) => {
      const copy = [...prev];
      const item = copy[index];
      if (!item) return prev;
      copy[index] = { ...item, [field]: value };
      return copy;
    });
  };

  // Real-time calculation and validation
  const currentPointsTotal = criteria.reduce(
    (sum, c) => sum + (Number(c.max_points) || 0),
    0
  );
  const currentWeightsSum = (Number(supWeight) || 0) + (Number(panelWeight) || 0);

  const validation = validateRubric({
    title,
    max_score: maxScore,
    supervisor_weight_pct: supWeight,
    panel_weight_pct: panelWeight,
    criteria,
  });

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!validation.valid) {
      toast.error(validation.errors[0] || "Invalid rubric configuration.");
      return;
    }
    if (!user) {
      toast.error("Authentication required.");
      return;
    }

    try {
      setSubmitting(true);
      const idToken = await user.getIdToken();

      if (editingRubric) {
        const res = await updateRubric(idToken, {
          rubric_id: editingRubric.id,
          title,
          max_score: maxScore,
          supervisor_weight_pct: supWeight,
          panel_weight_pct: panelWeight,
          criteria: criteria.map((c) => ({
            id: c.id,
            title: c.title,
            description: c.description,
            max_points: Number(c.max_points),
            category: c.category,
          })),
        });

        if (!res.ok) {
          toast.error(res.error || "Failed to update rubric.");
          return;
        }

        toast.success(`Rubric '${title}' updated successfully.`);
        onSuccess?.(editingRubric.id);
        onClose();
      } else {
        const res = await createRubric(idToken, {
          title,
          max_score: maxScore,
          supervisor_weight_pct: supWeight,
          panel_weight_pct: panelWeight,
          criteria: criteria.map((c) => ({
            id: c.id,
            title: c.title,
            description: c.description,
            max_points: Number(c.max_points),
            category: c.category,
          })),
        });

        if (!res.ok) {
          toast.error(res.error || "Failed to create rubric.");
          return;
        }

        toast.success(`Rubric '${title}' created successfully.`);
        onSuccess?.(res.rubricId!);
        onClose();
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "An unexpected error occurred.";
      toast.error(msg);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <>
      <SheetHeader className="p-6 border-b border-border bg-card">
        <div className="flex items-center justify-between gap-4">
          <div>
            <SheetTitle className="text-xl font-bold text-foreground">
              {editingRubric ? "Edit Defense Rubric" : "Rubric Builder"}
            </SheetTitle>
            <SheetDescription className="text-sm text-muted-foreground mt-1">
              Configure evaluation domains, percentage weighting splits, and line-item criteria.
            </SheetDescription>
          </div>
          {!editingRubric && (
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={handleLoadTemplate}
              className="gap-1.5 shrink-0"
            >
              <Sparkles className="h-4 w-4 text-primary" aria-hidden="true" />
              <span>Start from template</span>
            </Button>
          )}
        </div>
      </SheetHeader>

      <form onSubmit={handleSubmit} className="flex-1 flex flex-col justify-between p-6 space-y-6">
        <div className="space-y-6">
          {/* Top metadata */}
          <div className="space-y-4 rounded-xl border border-border bg-card p-4">
            <div className="space-y-2">
              <Label htmlFor="rubric-title">Rubric Title</Label>
              <Input
                id="rubric-title"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="e.g. Standard Capstone Defense Rubric"
                required
              />
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              <div className="space-y-2">
                <Label htmlFor="rubric-max-score">Max Score (Total)</Label>
                <Input
                  id="rubric-max-score"
                  type="number"
                  min={1}
                  value={maxScore}
                  onChange={(e) => setMaxScore(Number(e.target.value) || 0)}
                  required
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="rubric-sup-weight">Supervisor Weight (%)</Label>
                <Input
                  id="rubric-sup-weight"
                  type="number"
                  min={0}
                  max={100}
                  value={supWeight}
                  onChange={(e) => setSupWeight(Number(e.target.value) || 0)}
                  required
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="rubric-panel-weight">Panel Weight (%)</Label>
                <Input
                  id="rubric-panel-weight"
                  type="number"
                  min={0}
                  max={100}
                  value={panelWeight}
                  onChange={(e) => setPanelWeight(Number(e.target.value) || 0)}
                  required
                />
              </div>
            </div>

            {/* Weight Split Status */}
            <div
              className={`flex items-center gap-2 text-xs font-medium px-3 py-2 rounded-lg border ${
                currentWeightsSum === 100
                  ? "bg-emerald-50 text-emerald-800 border-emerald-200"
                  : "bg-amber-50 text-amber-800 border-amber-200"
              }`}
              aria-live="polite"
            >
              {currentWeightsSum === 100 ? (
                <CheckCircle2 className="h-4 w-4 shrink-0 text-emerald-600" aria-hidden="true" />
              ) : (
                <AlertTriangle className="h-4 w-4 shrink-0 text-amber-600" aria-hidden="true" />
              )}
              <span>
                Weight Distribution: Supervisor {supWeight}% + Panel {panelWeight}% ={" "}
                <strong>{currentWeightsSum}%</strong>{" "}
                {currentWeightsSum === 100 ? "(Valid)" : "(Must sum to exactly 100%)"}
              </span>
            </div>
          </div>

          {/* Criteria section */}
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <div>
                <h3 className="text-base font-semibold text-foreground">Scoring Criteria</h3>
                <p className="text-xs text-muted-foreground">
                  Define criteria lines for oral defense, system demonstration, and code architecture.
                </p>
              </div>
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={handleAddCriterion}
                className="gap-1.5"
              >
                <Plus className="h-4 w-4" aria-hidden="true" />
                <span>Add Criterion</span>
              </Button>
            </div>

            {/* Live Points Indicator */}
            <div
              className={`flex items-center gap-2 text-xs font-medium px-3 py-2 rounded-lg border ${
                currentPointsTotal === maxScore
                  ? "bg-emerald-50 text-emerald-800 border-emerald-200"
                  : "bg-amber-50 text-amber-800 border-amber-200"
              }`}
              aria-live="polite"
            >
              {currentPointsTotal === maxScore ? (
                <CheckCircle2 className="h-4 w-4 shrink-0 text-emerald-600" aria-hidden="true" />
              ) : (
                <AlertTriangle className="h-4 w-4 shrink-0 text-amber-600" aria-hidden="true" />
              )}
              <span>
                Criteria Points: <strong>{currentPointsTotal}</strong> / {maxScore} pts{" "}
                {currentPointsTotal === maxScore
                  ? "(Fully balanced)"
                  : currentPointsTotal < maxScore
                  ? `(${maxScore - currentPointsTotal} pts remaining)`
                  : `(${currentPointsTotal - maxScore} pts over limit)`}
              </span>
            </div>

            {/* Criteria List */}
            <div className="space-y-4">
              {criteria.map((criterion, idx) => (
                <div
                  key={`crit-${idx}`}
                  className="p-4 rounded-xl border border-border bg-card shadow-xs space-y-3"
                >
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-xs font-semibold text-primary uppercase tracking-wider">
                      Criterion #{idx + 1}
                    </span>
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon-sm"
                      onClick={() => handleRemoveCriterion(idx)}
                      disabled={criteria.length <= 1}
                      className="text-muted-foreground hover:text-destructive"
                      aria-label={`Remove criterion ${idx + 1}`}
                    >
                      <Trash2 className="h-4 w-4" aria-hidden="true" />
                    </Button>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-12 gap-3">
                    <div className="sm:col-span-4 space-y-1">
                      <Label htmlFor={`crit-id-${idx}`} className="text-xs">
                        Identifier / Code
                      </Label>
                      <Input
                        id={`crit-id-${idx}`}
                        value={criterion.id}
                        onChange={(e) =>
                          handleCriterionChange(idx, "id", e.target.value.toLowerCase().replace(/\s+/g, "_"))
                        }
                        placeholder="e.g. system_demo"
                        required
                        className="font-mono text-xs"
                      />
                    </div>

                    <div className="sm:col-span-8 space-y-1">
                      <Label htmlFor={`crit-title-${idx}`} className="text-xs">
                        Title
                      </Label>
                      <Input
                        id={`crit-title-${idx}`}
                        value={criterion.title}
                        onChange={(e) => handleCriterionChange(idx, "title", e.target.value)}
                        placeholder="e.g. System Demonstration"
                        required
                      />
                    </div>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-12 gap-3">
                    <div className="sm:col-span-7 space-y-1">
                      <Label htmlFor={`crit-category-${idx}`} className="text-xs">
                        Category Domain
                      </Label>
                      <Select
                        value={criterion.category}
                        onValueChange={(val) =>
                          handleCriterionChange(idx, "category", val as CriteriaCategory)
                        }
                      >
                        <SelectTrigger id={`crit-category-${idx}`}>
                          <SelectValue placeholder="Select category" />
                        </SelectTrigger>
                        <SelectContent>
                          {ALLOWED_CRITERIA_CATEGORIES.map((cat) => (
                            <SelectItem key={cat} value={cat}>
                              {CATEGORY_LABELS[cat]}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>

                    <div className="sm:col-span-5 space-y-1">
                      <Label htmlFor={`crit-points-${idx}`} className="text-xs">
                        Max Points
                      </Label>
                      <Input
                        id={`crit-points-${idx}`}
                        type="number"
                        min={1}
                        value={criterion.max_points}
                        onChange={(e) =>
                          handleCriterionChange(idx, "max_points", Number(e.target.value) || 0)
                        }
                        required
                      />
                    </div>
                  </div>

                  <div className="space-y-1">
                    <Label htmlFor={`crit-desc-${idx}`} className="text-xs">
                      Description / Grading Guidelines
                    </Label>
                    <Textarea
                      id={`crit-desc-${idx}`}
                      value={criterion.description}
                      onChange={(e) =>
                        handleCriterionChange(idx, "description", e.target.value)
                      }
                      placeholder="Guidance for examiners on scoring this criterion..."
                      rows={2}
                      className="text-xs resize-none"
                    />
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>

        <SheetFooter className="p-0 pt-4 border-t border-border flex flex-row items-center justify-end gap-3">
          <Button
            type="button"
            variant="outline"
            onClick={onClose}
            disabled={submitting}
          >
            Cancel
          </Button>
          <Button
            type="submit"
            disabled={!validation.valid || submitting}
            className="gap-2"
          >
            {submitting && <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />}
            <span>{editingRubric ? "Save Changes" : "Create Rubric"}</span>
          </Button>
        </SheetFooter>
      </form>
    </>
  );
}

export function RubricBuilderSheet({
  open,
  onOpenChange,
  editingRubric,
  onSuccess,
}: RubricBuilderSheetProps) {
  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent
        side="right"
        className="w-full sm:max-w-2xl overflow-y-auto p-0 flex flex-col"
      >
        <RubricBuilderForm
          key={editingRubric ? editingRubric.id : (open ? "open_new" : "closed")}
          editingRubric={editingRubric}
          onClose={() => onOpenChange(false)}
          onSuccess={onSuccess}
        />
      </SheetContent>
    </Sheet>
  );
}
