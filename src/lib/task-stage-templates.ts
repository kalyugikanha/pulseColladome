import type { StageKind } from "./tasks-stages.functions";

export type StageTemplateRow = {
  name: string;
  kind: StageKind;
  ownerHint?: string; // display hint only; owner picked in UI
};

export type StageTemplate = {
  key: string;
  label: string;
  description: string;
  stages: StageTemplateRow[];
};

/** Kanishka's content-pipeline template (OS0012 style). */
export const STAGE_TEMPLATES: StageTemplate[] = [
  {
    key: "content_pipeline",
    label: "Content pipeline (Script → Design → Review → PDF → Client → Post)",
    description: "One task flows through writer, designer, internal review, PDF prep, client share, feedback, posting, live link.",
    stages: [
      { name: "Scriptwriting", kind: "work", ownerHint: "Writer" },
      { name: "Graphic preparation", kind: "work", ownerHint: "Designer" },
      { name: "Internal review", kind: "internal_review", ownerHint: "Reviewer" },
      { name: "PDF preparation", kind: "work", ownerHint: "PDF prep" },
      { name: "Internal review", kind: "internal_review", ownerHint: "Reviewer" },
      { name: "Client share", kind: "work", ownerHint: "Account lead" },
      { name: "Client feedback", kind: "client_review", ownerHint: "Account lead" },
      { name: "Posting", kind: "work", ownerHint: "Publisher" },
      { name: "Live link sharing", kind: "work", ownerHint: "Account lead" },
    ],
  },
  {
    key: "simple_review",
    label: "Simple: Do → Review",
    description: "Owner does the work, one reviewer approves or sends back.",
    stages: [
      { name: "Do the work", kind: "work" },
      { name: "Review", kind: "internal_review" },
    ],
  },
];
