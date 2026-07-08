import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";

const FLAG_KEY = "pulse:welcome";

export function useFirstLoginWelcome(_userId: string | null | undefined) {
  const [show, setShow] = useState(false);

  useEffect(() => {
    if (typeof window === "undefined") return;
    // If sign-in just happened (flag set on /auth), show overlay now.
    if (sessionStorage.getItem(FLAG_KEY) === "1") {
      sessionStorage.removeItem(FLAG_KEY);
      setShow(true);
    }
    // Also listen for SIGNED_IN in case the layout is already mounted.
    const { data: sub } = supabase.auth.onAuthStateChange((event) => {
      if (event === "SIGNED_IN") setShow(true);
    });
    return () => { sub.subscription.unsubscribe(); };
  }, []);

  function dismiss() { setShow(false); }

  return { show, dismiss };
}
