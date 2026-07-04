## June 2026 hours — clean rebuild

Wipe every `attendance_logs` row in `2026-06-01 … 2026-06-30`, then insert one row per user dated `2026-06-01` containing a `tasks` JSON array with `{project_code, project_name, hours}` entries. Project name derived from the code using our standard master.

### Final data

| User (id) | Row tasks |
|---|---|
| Kanishka (`e0ce11c3…`) | 00527 Growinsight (Phase 2):40, 00563 Outfitq (Phase 2):5, 00102 Colladome Website:30, 00000 Colladome Social Media:40, 00522 Oswal:60, 00529 Brikson:25 |
| Deepak (`…0002`) | 00000:15, 00102:40, 00527:60, 00522:40, 00481 Briskon Technologies:45 |
| Sandeep (`38290b50…`) | 00103 Outfitq:15, 00000:45, 00102:100, 00522:20, 00527:20 |
| Sharaddha (`…0003`) | 00565:50, 00101:50, 00104:50, 00568:50 |
| Arti (`9869d739…`) | 00568:50, 00104:25, 00565:25, 00566:50, 00101:50 |
| Akash (`02cf3091…`) | 00524:30, 00418:20, 00514:40, 00481:20, 00523:8, 00503:20, 00414:4, 00504:10, 00392:5, 00547:50, 00527:3, 00102:50, 00101:50 |
| Sweksha (`…0005`) | 00104:150, 00567:50 |
| Jagjeet (`58c14ca5…`) | 00567:100, 00104:100 |
| Chirag (`…0006`) | 00522:200 |
| Juhi (`…0007`) | 00527:200 |
| Anjali (`…0008`) | 00000:148, 00522:20 |
| Neetu (`…0009`) | 00000:200 |
| Sridhar Hemanth (`…0010`) | 00000:120 |
| Manvi (`…0011`) | 00000:42 |
| Trisha (`…0012`) | 00000:75 |

Users with no June entries in your list (no rows inserted): Sandhya, Shubham. Shaleen already removed.

### Impact on Project Burn (June)

- Salary pool for June = ₹4,63,000 (already backdated).
- Each user's total June hours are divided across their projects proportionally to salary → Project Burn will populate immediately per project (Growinsight P2, Oswal, Colladome Social Media etc. become the biggest burners).

### Technical

Single insert-tool run:
```sql
DELETE FROM public.attendance_logs
  WHERE date >= '2026-06-01' AND date < '2026-07-01';

INSERT INTO public.attendance_logs (user_id, date, tasks) VALUES
  ('<uuid>', '2026-06-01', '[{"project_code":"…","project_name":"…","hours":…}, …]'::jsonb),
  … (15 rows) …;
```

- Only touching `attendance_logs`. No schema change.
- Uses code→name lookup: 00000 Colladome Social Media · 00101 Colladome Internal Coordination & Management · 00102 Colladome Website · 00103 Outfitq · 00104 Colladome RA · 00392 Drone Karaan · 00414 Pawgin · 00418 Bus Arabia · 00481 Briskon Technologies · 00503 Nikunj · 00504 Freegi · 00514 Stay Master · 00522 Oswal · 00523 Idhyam · 00524 Selfup · 00527 Growinsight (Phase 2) · 00529 Brikson · 00547 Softlogic · 00563 Outfitq (Phase 2) · 00565 Colladome Documentation · 00566 Colladome Finance · 00567 Colladome Business Development · 00568 Colladome Hiring.
