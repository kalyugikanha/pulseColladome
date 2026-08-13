import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useCurrentUser } from "@/hooks/use-current-user";
import { format } from "date-fns";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ScrollArea } from "@/components/ui/scroll-area";

export const Route = createFileRoute("/_authenticated/ai-chats")({
  component: AIChatsAdminPage,
});

function AIChatsAdminPage() {
  const { user } = useCurrentUser();
  
  const { data: messages, isLoading } = useQuery({
    queryKey: ["admin-ai-chats"],
    queryFn: async () => {
      // NOTE: Using raw SQL RPC or a view might be needed if standard join fails on `users`, 
      // but typical Lovable Supabase setup maps `user_id` to `profiles` or `users`. 
      // Assuming `users` or `profiles` exists. We'll try to fetch raw messages first.
      const { data, error } = await supabase
        .from("assistant_messages")
        .select(`*`)
        .order("created_at", { ascending: false })
        .limit(200);
        
      if (error) throw error;
      return data;
    },
    enabled: !!user?.isSuperAdmin || !!user?.isAdmin,
  });

  // Fetch profiles separately if we need names and the join is tricky
  const { data: profiles } = useQuery({
    queryKey: ["admin-all-profiles-for-chats"],
    queryFn: async () => {
      const { data } = await supabase.from("profiles").select("id, full_name, email");
      return data || [];
    },
    enabled: !!user?.isSuperAdmin || !!user?.isAdmin,
  });

  if (!user?.isSuperAdmin && !user?.isAdmin) {
    return <div className="p-8 text-center text-red-500 font-bold">Access Denied. You must be an Admin.</div>;
  }

  const getProfileName = (id: string) => {
    const p = profiles?.find(p => p.id === id);
    return p ? p.full_name || p.email : "Unknown User";
  };

  return (
    <div className="flex flex-col gap-6 p-4 md:p-8 w-full max-w-6xl mx-auto animate-in fade-in zoom-in-95 duration-300">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-display font-bold text-foreground">AI Assistant Chats</h1>
          <p className="text-muted-foreground mt-1">View history of what users are asking the AI</p>
        </div>
      </div>
      
      <Card className="flex-1 shadow-md border-border/50">
        <CardHeader className="bg-muted/30 border-b border-border/50">
          <CardTitle>Recent Conversations</CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          <ScrollArea className="h-[70vh] w-full">
            <div className="p-6">
              {isLoading ? (
                <div className="flex justify-center items-center h-40">
                  <div className="animate-pulse flex gap-2">
                    <div className="w-2 h-2 bg-primary rounded-full animate-bounce" />
                    <div className="w-2 h-2 bg-primary rounded-full animate-bounce delay-150" />
                    <div className="w-2 h-2 bg-primary rounded-full animate-bounce delay-300" />
                  </div>
                </div>
              ) : messages?.length === 0 ? (
                <div className="text-center p-12 border border-dashed rounded-lg bg-muted/20">
                  <h3 className="text-lg font-medium text-foreground">No chats found</h3>
                  <p className="text-sm text-muted-foreground">The AI Assistant hasn't had any conversations yet.</p>
                </div>
              ) : (
                <div className="flex flex-col gap-4">
                  {messages?.map(msg => (
                    <div 
                      key={msg.id} 
                      className={`p-4 rounded-xl border shadow-sm transition-all hover:shadow-md ${
                        msg.role === 'user' 
                          ? 'bg-primary/5 ml-8 border-primary/20' 
                          : 'bg-card mr-8 border-border'
                      }`}
                    >
                      <div className="flex justify-between items-start mb-2">
                        <span className={`font-semibold text-sm flex items-center gap-2 ${msg.role === 'user' ? 'text-primary' : 'text-foreground'}`}>
                          {msg.role === 'user' ? getProfileName(msg.user_id) : '✨ AI Assistant'}
                        </span>
                        <span className="text-xs text-muted-foreground bg-background/50 px-2 py-1 rounded-md">
                          {format(new Date(msg.created_at), "PP p")}
                        </span>
                      </div>
                      <div className="text-sm whitespace-pre-wrap leading-relaxed">{msg.content}</div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </ScrollArea>
        </CardContent>
      </Card>
    </div>
  );
}
