ALTER TABLE public.course_submissions
  ADD COLUMN IF NOT EXISTS screenshot_paths text[] NOT NULL DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS learner_comment text,
  ALTER COLUMN screenshot_path DROP NOT NULL;

-- Backfill: mirror existing single path into the array so old data displays
UPDATE public.course_submissions
   SET screenshot_paths = ARRAY[screenshot_path]
 WHERE screenshot_path IS NOT NULL
   AND (screenshot_paths IS NULL OR array_length(screenshot_paths, 1) IS NULL);