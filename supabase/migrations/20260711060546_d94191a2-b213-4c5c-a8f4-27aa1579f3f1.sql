ALTER TABLE public.expenses
  ADD COLUMN IF NOT EXISTS paid_by uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS payment_method text CHECK (payment_method IS NULL OR payment_method IN ('upi','card','cash','bank_transfer','other')),
  ADD COLUMN IF NOT EXISTS reimbursement_status text NOT NULL DEFAULT 'pending' CHECK (reimbursement_status IN ('pending','paid','na')),
  ADD COLUMN IF NOT EXISTS recurring_frequency text CHECK (recurring_frequency IS NULL OR recurring_frequency IN ('weekly','monthly','quarterly','yearly')),
  ADD COLUMN IF NOT EXISTS recurrence_end_date date;

-- Company-paid expenses aren't reimbursable to anyone.
UPDATE public.expenses SET reimbursement_status = 'na' WHERE paid_by IS NULL;

CREATE INDEX IF NOT EXISTS expenses_reimbursement_idx ON public.expenses(reimbursement_status) WHERE paid_by IS NOT NULL;
CREATE INDEX IF NOT EXISTS expenses_recurring_idx ON public.expenses(recurring) WHERE recurring = true;
