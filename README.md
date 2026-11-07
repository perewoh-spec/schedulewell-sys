# Harmony Health Hub (schedulewell)

Hospital appointment and medical records management. Patients request appointments, staff approve and schedule them with a doctor, doctors and patients chat about the visit, and doctors keep electronic medical records.

Built with React, TypeScript, Vite, Tailwind/shadcn-ui and Supabase (Postgres, Auth, Realtime).

## Roles

| Role | Can do |
|---|---|
| **Patient** | Request, withdraw and cancel appointments; chat with their doctor; view their own medical records; edit their profile |
| **Doctor** | See today's schedule; approve/decline requests; complete, cancel or mark no-show on their appointments; chat with patients; create medical records; manage patients |
| **Nurse** | Approve/decline requests; manage appointments and patients (no access to medical records) |
| **Admin** | Everything above plus user and role management, audit logs and reports |

Everyone signs up as a patient. An admin gives staff their roles in **User Management**.

## Running locally

Requires Node.js 18+.

```sh
npm install
cp .env.example .env   # then fill in your Supabase values
npm run dev            # http://localhost:8080
```

Other scripts: `npm run build`, `npm run preview`, `npm run lint`, `npm test`.

## Environment variables

| Variable | Where to find it |
|---|---|
| `VITE_SUPABASE_URL` | Supabase dashboard → Project Settings → API → Project URL |
| `VITE_SUPABASE_PUBLISHABLE_KEY` | Same page → the `anon` / publishable key (safe to expose in the browser; data is protected by row-level security) |
| `VITE_SUPABASE_PROJECT_ID` | The project ref (the subdomain in the URL) |

Never put the `service_role` key in this app.

## Setting up Supabase

1. Create a project at [supabase.com](https://supabase.com).
2. Apply the database schema in `supabase/migrations/` with the [Supabase CLI](https://supabase.com/docs/guides/cli):
   ```sh
   supabase link --project-ref <your-project-ref>
   supabase db push
   ```
3. **Authentication → URL Configuration:** set the Site URL to where the app is hosted and add `https://<your-domain>/reset-password` (and `http://localhost:8080/reset-password` for local development) to the Redirect URLs.
4. **Authentication → Providers → Email:** keep "Confirm email" turned on. Staff-registered patient records are only linked to an account after its email is confirmed.
5. Create the first administrator. Sign up in the app, then run this in the SQL editor:
   ```sql
   INSERT INTO public.user_roles (user_id, role)
   SELECT id, 'admin' FROM auth.users WHERE email = 'you@example.com';
   ```
   After that, manage all roles from **User Management**.

## Demo mode

For showing the project to others, the sign-in page can show **Try the demo** buttons that sign in as a sample **Admin**, **Doctor** or **Patient**.

1. Create or reset the demo accounts and their made-up data (safe to re-run at any time; it only touches `@example.com` people):
   ```sh
   SUPABASE_URL=https://<ref>.supabase.co SUPABASE_SECRET_KEY=<secret key> npm run seed:demo
   ```
   The secret key is in Supabase → Project Settings → API Keys. Never put it in `.env` or commit it.
2. Set `VITE_DEMO_MODE=true` in `.env` (or in your host's settings) and restart or redeploy.

The demo passwords are public by design, so visitors share these accounts and can see each other's changes. Demo accounts are walled off at the database level: they only see and change placeholder data (`is_demo` rows), and real accounts never see the placeholder data. Anything a visitor creates in the demo stays in the demo. Re-run the seed script to put the demo back to its starting state.

## Deploying

`npm run build` produces a static site in `dist/` that can be hosted on any static host (Vercel, Netlify, Cloudflare Pages, etc.). Configure the host to serve `index.html` for unknown paths (single-page app routing), and set the three environment variables in the host's build settings.
