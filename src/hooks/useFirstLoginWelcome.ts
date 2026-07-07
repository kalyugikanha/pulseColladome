import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";

export function useFirstLoginWelcome(userId: string | null | undefined) {
  const [show, setShow] = useState(false);
  const [checked, setChecked] = useState(false);

  useEffect(() => {
    if (!userId || checked) return;
    let cancelled = false;
    (async () => {
      const { data } = await supabase
        .from("profiles")
        .select("welcomed_at")
        .eq("id", userId)
        .maybeSingle();
      if (cancelled) return;
      setChecked(true);
      if (data && data.welcomed_at == null) setShow(true);
    })();
    return () => { cancelled = true; };
  }, [userId, checked]);

  async function dismiss() {
    setShow(false);
    if (!userId) return;
    await supabase.from("profiles").update({ welcomed_at: new Date().toISOString() }).eq("id", userId);
  }

  return { show, dismiss };
}
