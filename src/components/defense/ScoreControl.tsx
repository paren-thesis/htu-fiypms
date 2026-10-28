"use client";

import * as React from "react";
import { Minus, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

export interface ScoreControlProps {
  criterionId: string;
  criterionTitle: string;
  value: number;
  maxPoints: number;
  onChange: (newValue: number) => void;
  disabled?: boolean;
  step?: number;
}

export function ScoreControl({
  criterionId,
  criterionTitle,
  value,
  maxPoints,
  onChange,
  disabled = false,
  step = 1,
}: ScoreControlProps) {
  // Ensure the value is within [0, maxPoints]
  const clampedValue = Math.min(maxPoints, Math.max(0, Number.isFinite(value) ? value : 0));

  const handleStep = (delta: number) => {
    if (disabled) return;
    const next = Math.min(maxPoints, Math.max(0, Math.round((clampedValue + delta) * 10) / 10));
    onChange(next);
  };

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (disabled) return;
    const raw = e.target.value;
    if (raw === "") {
      onChange(0);
      return;
    }
    const parsed = parseFloat(raw);
    if (!Number.isNaN(parsed)) {
      const clamped = Math.min(maxPoints, Math.max(0, parsed));
      onChange(clamped);
    }
  };

  const handleSliderChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (disabled) return;
    const parsed = parseFloat(e.target.value);
    if (!Number.isNaN(parsed)) {
      const clamped = Math.min(maxPoints, Math.max(0, parsed));
      onChange(clamped);
    }
  };

  return (
    <div className="space-y-3 pt-2">
      {/* Stepper + Direct numeric input */}
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          {/* Minus Button - 44px min touch target */}
          <Button
            type="button"
            variant="outline"
            size="icon"
            className="h-11 w-11 min-w-[44px] min-h-[44px] rounded-lg border-border text-foreground hover:bg-muted active:scale-95 transition-transform"
            onClick={() => handleStep(-step)}
            disabled={disabled || clampedValue <= 0}
            aria-label={`Decrease score for ${criterionTitle}`}
          >
            <Minus className="h-5 w-5" aria-hidden="true" />
          </Button>

          {/* Number Input - 44px height */}
          <div className="relative">
            <Input
              id={`score-input-${criterionId}`}
              type="number"
              inputMode="decimal"
              step={step}
              min={0}
              max={maxPoints}
              value={clampedValue}
              onChange={handleInputChange}
              disabled={disabled}
              className="h-11 w-20 text-center font-mono text-base font-semibold tabular-nums border-border focus-visible:ring-primary"
              aria-label={`Score points for ${criterionTitle}`}
            />
          </div>

          {/* Plus Button - 44px min touch target */}
          <Button
            type="button"
            variant="outline"
            size="icon"
            className="h-11 w-11 min-w-[44px] min-h-[44px] rounded-lg border-border text-foreground hover:bg-muted active:scale-95 transition-transform"
            onClick={() => handleStep(step)}
            disabled={disabled || clampedValue >= maxPoints}
            aria-label={`Increase score for ${criterionTitle}`}
          >
            <Plus className="h-5 w-5" aria-hidden="true" />
          </Button>
        </div>

        {/* Max Points Tag */}
        <div className="text-right">
          <span className="text-xs font-medium text-muted-foreground">
            out of <strong className="text-foreground font-mono">{maxPoints}</strong> pts
          </span>
        </div>
      </div>

      {/* Slider Control - Accessible with 44px touch target wrapper */}
      <div className="relative flex items-center min-h-[44px]">
        <input
          id={`score-slider-${criterionId}`}
          type="range"
          min={0}
          max={maxPoints}
          step={step}
          value={clampedValue}
          onChange={handleSliderChange}
          disabled={disabled}
          className="w-full h-2.5 bg-muted rounded-lg appearance-none cursor-pointer accent-primary disabled:opacity-50 disabled:cursor-not-allowed focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
          aria-label={`Score slider for ${criterionTitle}`}
          aria-valuemin={0}
          aria-valuemax={maxPoints}
          aria-valuenow={clampedValue}
        />
      </div>
    </div>
  );
}
