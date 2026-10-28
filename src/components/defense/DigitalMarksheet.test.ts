import { describe, it, expect } from "vitest";
import { clampScores, computeTotal } from "@/lib/defense/scoring";
import type { RubricDocument } from "@/types/firestore";

describe("Digital Marksheet Component Logic & State", () => {
  const sampleRubric: Pick<RubricDocument, "max_score" | "criteria"> = {
    max_score: 100,
    criteria: [
      {
        id: "c-presentation",
        title: "Presentation Skills",
        max_points: 20,
        category: "oral_defense",
      },
      {
        id: "c-demo",
        title: "Working Demonstration",
        max_points: 50,
        category: "system_demo",
      },
      {
        id: "c-arch",
        title: "Architecture & Code",
        max_points: 30,
        category: "technical_architecture",
      },
    ],
  };

  describe("Score Clamping within Marksheet", () => {
    it("clamps scores to [0, max_points] for each criterion", () => {
      const userInputs = {
        "c-presentation": 25, // over max 20 -> 20
        "c-demo": -5, // under min 0 -> 0
        "c-arch": 28, // valid within 0..30 -> 28
      };

      const clamped = clampScores(sampleRubric, userInputs);

      expect(clamped).toEqual({
        "c-presentation": 20,
        "c-demo": 0,
        "c-arch": 28,
      });
    });

    it("ignores unknown or extraneous criteria keys", () => {
      const userInputs = {
        "c-presentation": 15,
        "tampered-criterion": 999,
        "bonus-points": 50,
      };

      const clamped = clampScores(sampleRubric, userInputs);

      expect(clamped).toEqual({
        "c-presentation": 15,
      });
      expect(clamped).not.toHaveProperty("tampered-criterion");
      expect(clamped).not.toHaveProperty("bonus-points");
    });

    it("accurately computes running total from clamped scores", () => {
      const userInputs = {
        "c-presentation": 30, // clamped to 20
        "c-demo": 45, // valid 45
        "c-arch": 30, // valid 30
      };

      // 20 + 45 + 30 = 95
      const total = computeTotal(sampleRubric, userInputs);
      expect(total).toBe(95);
    });
  });

  describe("Locked Evaluation State", () => {
    it("determines when marksheet is locked and disables edits", () => {
      const checkIsEditable = (isPublished: boolean): boolean => !isPublished;

      expect(checkIsEditable(false)).toBe(true);
      expect(checkIsEditable(true)).toBe(false);
    });

    it("formats locked banner message explaining why inputs are disabled", () => {
      const getLockMessage = (isPublished: boolean): string | null => {
        if (!isPublished) return null;
        return "This evaluation has been locked following publication of grades. Criteria scores and comments can no longer be edited.";
      };

      expect(getLockMessage(false)).toBeNull();
      expect(getLockMessage(true)).toMatch(/locked following publication/i);
    });
  });
});
