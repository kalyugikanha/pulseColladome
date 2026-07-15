
ALTER TABLE public.standup_flags
  ADD CONSTRAINT standup_flags_flagger_profile_fkey
  FOREIGN KEY (flagged_by) REFERENCES public.profiles(id) ON DELETE CASCADE;
