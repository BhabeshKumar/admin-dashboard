# Admin Dashboard (Supabase)

Standalone admin-only web app (separate from the Flutter app) to view clock-in / clock-out data stored in Supabase `public.timesheets`.

## Setup

1. Create `.env.local`:

```bash
NEXT_PUBLIC_SUPABASE_URL=...
NEXT_PUBLIC_SUPABASE_ANON_KEY=...
```

2. Install and run:

```bash
npm install
npm run dev
```

## Auth / Security

- Uses Supabase Auth (email/password).
- Uses **anon key** in the browser.
- Access is enforced by **RLS**:
  - Only users with **project creation/admin access** can read all `timesheets`.

# admin-dashboard
