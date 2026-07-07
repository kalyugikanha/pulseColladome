import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";

export function useFirstLoginWelcome(_userId: string | null | undefined) {
  const [show, setShow] = useState(false);

  useEffect(() => {
    const host = typeof window !== "undefined" ? window.location.hostname : "";
    if (host !== "colladome-pulse.lovable.app") return;
    const { data: sub } = supabase.auth.onAuthStateChange((event) => {
      if (event === "SIGNED_IN") setShow(true);
    });
    return () => { sub.subscription.unsubscribe(); };
  }, []);

  function dismiss() { setShow(false); }

  return { show, dismiss };
}
