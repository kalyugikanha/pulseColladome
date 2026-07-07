## Clean up all earned leave data

18 `leave_balances` rows and 1 `leave_requests` row use `leave_type='earned'`.

### Changes (insert tool — data only)

1. Delete the 1 `leave_requests` row where `leave_type='earned'`.
2. Delete all 18 `leave_balances` rows where `leave_type='earned'`.

### Not changed

- The `handle_new_user` trigger still seeds `('earned', 0)` for new users. Leave as-is unless you want me to stop seeding earned balances for future signups too — say the word and I'll patch the trigger in a follow-up migration.
- Enum value `earned` on `leave_type` stays (removing it would touch the whole app; not required to zero out data).
