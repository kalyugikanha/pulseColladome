// Shared constants for the 7 onboarding sections.
// Used by both server functions and UI. Keep in sync with the DB enum
// `public.onboarding_section`.

export type OnboardingSection =
  | "personal"
  | "work"
  | "bank"
  | "documents"
  | "follow"
  | "reviews"
  | "linkedin_employment";

export type OnboardingSectionStatus = "draft" | "submitted" | "approved" | "rejected";

export const ONBOARDING_SECTIONS: OnboardingSection[] = [
  "personal",
  "work",
  "bank",
  "documents",
  "follow",
  "reviews",
  "linkedin_employment",
];

export const SECTION_LABELS: Record<OnboardingSection, string> = {
  personal: "Personal details",
  work: "Work preferences",
  bank: "Bank details",
  documents: "Documents",
  follow: "Follow Colladome",
  reviews: "Leave a review",
  linkedin_employment: "LinkedIn employment",
};

export const SECTION_SHORT: Record<OnboardingSection, string> = {
  personal: "Personal",
  work: "Work",
  bank: "Bank",
  documents: "Docs",
  follow: "Follow",
  reviews: "Reviews",
  linkedin_employment: "LinkedIn",
};

export type SectionRow = {
  section: OnboardingSection;
  required: boolean;
  status: OnboardingSectionStatus;
  submitted_at: string | null;
  approved_at: string | null;
  rejected_at: string | null;
  rejection_reason: string | null;
};
