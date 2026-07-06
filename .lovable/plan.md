## Action

Delete all 4 existing `leave_requests` rows for Hemanth Sridhar (`hemanth@colladome.in`) and reset his `leave_balances.used` for every leave type back to 0, so you can start the validation flow from a clean slate.

## SQL

```sql
DELETE FROM leave_requests
WHERE user_id = (SELECT id FROM profiles WHERE email = 'hemanth@colladome.in');

UPDATE leave_balances
SET used = 0
WHERE user_id = (SELECT id FROM profiles WHERE email = 'hemanth@colladome.in');
```

After this runs, the trigger fix + Day-view/Attendance changes from the previous turns are already in place, so:

- HR/Super Admin "Log leave" will insert as `approved` and deduct balance immediately.
- Attendance → Today will show Sridhar with an amber "On leave" badge and list him in the "On leave today" banner.
- HR → Leave management → Day view will list him for the picked date.

No code changes in this step — just data cleanup.
