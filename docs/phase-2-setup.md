# Phase 2 setup: switching on visitor video reports

Everything is built and tested; these steps connect it to your accounts. Allow about an hour.
Nothing here changes the live site until the last step.

Your project: `https://szhspqlvgiuqgbavfuhz.supabase.co`
Site: `https://railclub.github.io/rail-club-station-access/`

**Never paste a secret key into chat, the code or GitHub.** Secrets go only into the Supabase and
Google dashboards, as described below.

---

## 1. Check the region (1 min)

Supabase → your project → ⚙️ **Project Settings → General**. Region should be **South Asia (Mumbai)**.
(Anything else still works, but the privacy notice says Mumbai; tell Claude to update it.)

## 2. Create the database (5 min)

**Done (via the Supabase connector):** the migration is applied and the reviewer account is added.
Repeat step 3 to add more reviewers.

1. Supabase → **SQL Editor → New query**.
2. Paste the whole of [`supabase/migrations/20261022000000_phase2_visitor_reports.sql`](../supabase/migrations/20261022000000_phase2_visitor_reports.sql) and click **Run**. It should say "Success. No rows returned".
3. New query, add yourself as the reviewer (your admin Google account, lowercase):
   ```sql
   insert into public.admins (email) values ('your.admin.account@gmail.com');
   ```
4. Check: **Table Editor** shows `admins`, `contributors`, `facts`, `reports`, `settings`;
   **Storage** shows a private bucket `report-videos`.

## 3. Google sign-in (15 min)

**In Google Cloud** (https://console.cloud.google.com), signed in as `railclub.support@gmail.com`:

1. Create a project called **Rail Club**.
2. **Google Auth Platform → Branding** (older consoles: *OAuth consent screen*):
   - App name: `Station Access Guide (Rail Club)`
   - User support email: `railclub.support@gmail.com`
   - App home page: `https://railclub.github.io/rail-club-station-access/`
   - Privacy policy: `https://railclub.github.io/rail-club-station-access/privacy.html`
   - Authorised domain: `railclub.github.io` and `supabase.co`
   - Developer contact: your own email
3. **Audience:** External. Click **Publish app**, otherwise only test users can sign in.
   The app only asks for name and email, so Google normally doesn't require a review.
4. **Clients → Create client → Web application**, name `Rail Club web`:
   - Authorised JavaScript origins: `https://railclub.github.io`
   - Authorised redirect URIs: `https://szhspqlvgiuqgbavfuhz.supabase.co/auth/v1/callback`
5. Copy the **Client ID** and **Client secret** (keep the secret to yourself).

**In Supabase:**

6. **Authentication → Sign In / Providers → Google** → enable, paste Client ID and Client secret, Save.
7. **Authentication → URL Configuration:**
   - Site URL: `https://railclub.github.io/rail-club-station-access/`
   - Redirect URLs (add all three):
     - `https://railclub.github.io/rail-club-station-access/`
     - `https://railclub.github.io/rail-club-station-access/admin.html`
     - `http://localhost:8000/**` (for testing on your computer)

## 4. Gemini key (5 min)

**Rail Club uses Gemini's free tier** (decided 15 November 2026). On the free tier Google may keep
the videos it checks and use them to improve its products; the privacy notice, the consent box
before filming (`site/report.js`, consent version `2026-11-15`) and the "How it works" page say so.

1. Go to https://aistudio.google.com and sign in. Any Google account works; prefer the one that
   owns the Rail Club Google Cloud project.
2. **Get API key → Create API key**, and pick an existing project you own (not a temporary
   "qwiklabs" training project, which gets deleted).
3. Copy the key (starts with `AIza`). Don't paste it into chat, code or GitHub.
4. Supabase → **Edge Functions → Secrets** → add:
   | Name | Value |
   |---|---|
   | `GEMINI_API_KEY` | the key from step 3 |
   | `GEMINI_MODEL` | optional, default `gemini-2.5-flash`; set this if Google has renamed or retired it |
5. Send one test video; Edge Functions → `submit-report` → Logs should show no Gemini error.

Free-tier rate limits are shown in AI Studio next to the key. If a call is refused, the video
simply waits for a reviewer. Rail Club also stops calling Gemini after 300 videos a month
(`monthly_gemini_calls` in the `settings` table).

**Switching to the paid tier later** (so Google doesn't use the videos): turn on billing for the
key's project (AI Studio → Billing), set a budget alert in Google Cloud → Billing → Budgets &
alerts, then change the privacy notice, the consent text in `site/report.js` (and bump
`CONSENT_VERSION`) and the "How it works" steps in `web/src/components/Contribute.jsx` back to
"Google does not use the videos to improve its products".

## 5. Deploy the server functions (10 min)

**Done (22 Oct 2026, via the Supabase connector):** all three functions are deployed. Redeploy
with the commands below after changing any file in `supabase/functions/`.

On any computer with Node.js installed, in a copy of this repository:

```bash
npx supabase login
npx supabase functions deploy submit-report review-report --project-ref szhspqlvgiuqgbavfuhz
npx supabase functions deploy cleanup --no-verify-jwt --project-ref szhspqlvgiuqgbavfuhz
```

Check: Supabase → **Edge Functions** lists `submit-report`, `review-report` and `cleanup`.

(No computer handy? Supabase → Edge Functions → **Deploy a new function → Via editor** also works:
create each function and paste its `index.ts`, plus the files from `supabase/functions/_shared/`.
For `cleanup`, turn off **Verify JWT** in its settings.)

## 6. Daily clean-up

**Done, nothing to set up.** The migration
[`20261105000000_cleanup_secret_in_vault.sql`](../supabase/migrations/20261105000000_cleanup_secret_in_vault.sql)
creates a random secret in Supabase Vault and schedules the `cleanup-videos` job (`30 21 * * *`,
03:00 India time) to call the `cleanup` function with it. Nobody needs to copy the secret anywhere.
Check it under **Integrations → Cron → Jobs**. A `CRON_SECRET` in Edge Functions → Secrets is no
longer used and can be deleted.

## 7. Switch it on and test

1. Tell Claude "Phase 2 is set up", or change `visitorReports: false` to `true` in
   [`site/config.js`](../site/config.js) and push.
2. At a station (your own first report always goes to review):
   open the station page → **Add a video of this station** → sign in → record → send.
3. Open `https://railclub.github.io/rail-club-station-access/admin.html`, sign in with the admin
   account, watch the video and **Approve**. The station page now shows "Seen by a visitor".

## If something doesn't work

| Symptom | Likely cause |
|---|---|
| Google says "redirect_uri_mismatch" | Step 3.4 redirect URI must be exactly `https://szhspqlvgiuqgbavfuhz.supabase.co/auth/v1/callback` |
| Back on the site but not signed in | Step 3.7: the page URL isn't in Supabase's Redirect URLs |
| "Only reviewers can do this" on admin.html | Step 2.3: email in `admins` must match the Google account, in lowercase |
| Every report goes to review with "Waiting for a reviewer" | `GEMINI_API_KEY` missing, Gemini error, or the monthly cap reached; see Edge Functions → submit-report → Logs |
| Function logs say `SUPABASE_SECRET_KEYS not set` | Project Settings → API Keys: create the publishable and secret keys (the functions use the `default` secret key, or the legacy `service_role` key until Supabase retires it) |
| Uploads fail | Video over 12 MB, or the migration's storage policy didn't run (step 2) |

## Changing the rules later

All limits live in one row: Supabase → Table Editor → `settings` → `limits`. For example
`per_user_per_day`, `radius_m`, `trust_after_approved`, `monthly_gemini_calls`. Changes apply
immediately; no redeploy needed.
