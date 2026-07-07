Fix the marketing-kanban assignee filter 404.

In `src/routes/_authenticated/marketing-kanban.tsx`, change:

```ts
const search = useSearch({ from: "/_authenticated/marketing-kanban" });
const navigate = useNavigate({ from: "/_authenticated/marketing-kanban" });
```

to:

```ts
const search = useSearch({ from: "/_authenticated/marketing-kanban" }) as { assignee?: string };
const navigate = useNavigate({ from: "/marketing-kanban" });
```

`from` on `useNavigate` is the URL pathname (the `_authenticated` layout is pathless, so the URL is `/marketing-kanban`). Using the route-ID form makes the navigator resolve the new URL as `/_authenticated/marketing-kanban`, which has no route and lands on 404. `useSearch`'s `from` stays as the route ID (that's the route-id form), we just type the result to keep TS happy.

No other changes; behavior for filter/My-tasks/Clear is unchanged.