import { createFileRoute } from "@tanstack/react-router";
import { authorizeRequest } from "@/lib/assistant/auth.server";

export const Route = createFileRoute("/api/assistant/chat")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        let ctx;
        try { 
          ctx = await authorizeRequest(request); 
        } catch { 
          return new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401, headers: { "content-type": "application/json" } }); 
        }

        const body = await request.json().catch(() => ({}));
        
        // Forward the request to our new Supabase Edge Function
        // Using the new project ref provided: scpiidbcuzirhbroduvl
        const edgeFunctionUrl = "https://scpiidbcuzirhbroduvl.supabase.co/functions/v1/ai-assistant";
        
        const authHeader = request.headers.get("authorization") ?? "";
        
        try {
          const response = await fetch(edgeFunctionUrl, {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              "Authorization": authHeader,
              "x-view-as-user": request.headers.get("x-view-as-user") || ""
            },
            body: JSON.stringify(body)
          });
          
          const data = await response.json();
          
          return new Response(JSON.stringify(data), {
            status: response.status,
            headers: { "content-type": "application/json" },
          });
        } catch (error: any) {
          return new Response(JSON.stringify({ error: "Failed to connect to AI Assistant API", details: error.message }), { 
            status: 500, 
            headers: { "content-type": "application/json" } 
          });
        }
      },
    },
  },
});
