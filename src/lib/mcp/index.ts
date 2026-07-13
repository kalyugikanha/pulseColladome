import { auth, defineMcp } from "@lovable.dev/mcp-js";
import listProjects from "./tools/list-projects";
import listMyTasks from "./tools/list-my-tasks";
import getMyAttendance from "./tools/get-my-attendance";
import getPunchStatus from "./tools/get-punch-status";
import getLeaveBalance from "./tools/get-leave-balance";
import requestLeave from "./tools/request-leave";
import createTask from "./tools/create-task";

// The OAuth issuer must be the direct Supabase host, not the .lovable.cloud proxy.
// Vite inlines `import.meta.env.VITE_SUPABASE_PROJECT_ID` as a literal at build time.
const projectRef = import.meta.env.VITE_SUPABASE_PROJECT_ID ?? "project-ref-unset";

export default defineMcp({
  name: "colladome-pulse-mcp",
  title: "Colladome Pulse",
  version: "0.1.0",
  instructions:
    "Colladome Pulse is the internal team operations portal. Tools let a signed-in employee read their tasks, attendance, punch status, and leave balances, and take common actions like requesting leave or creating a task. Use list_projects to resolve project IDs before create_task. All actions run as the authenticated user and are subject to app RLS.",
  auth: auth.oauth.issuer({
    issuer: `https://${projectRef}.supabase.co/auth/v1`,
    acceptedAudiences: "authenticated",
  }),
  tools: [
    listProjects,
    listMyTasks,
    getMyAttendance,
    getPunchStatus,
    getLeaveBalance,
    requestLeave,
    createTask,
  ],
});
