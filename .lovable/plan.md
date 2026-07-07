Add `isHrAdmin` (and `isSuperAdmin`) to the Attendance sidebar link gate in `src/routes/_authenticated/route.tsx` line 88, so HR admins like Shraddha see the Attendance nav item alongside admins and reporting managers.

```tsx
{(isAdmin || isSuperAdmin || isHrAdmin || isDepartmentHead || isReportingManager) && (
  <SidebarMenuButton ...>
    <Link to="/attendance">...</Link>
  </SidebarMenuButton>
)}
```

No other changes.