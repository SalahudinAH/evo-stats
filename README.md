# EVO Stats: personal gym tracker (web app + iPhone Shortcuts)

Tracks gym visits (last 30 days / 6 months / 12 months, weekly chart, week streak),
strength progression (estimated 1-rep max per lift, with PRs), body weight, and
your saved EVO clubs (distance, favourite, and when you usually train there).

- **Nothing to install and nothing to renew.** It's a web app you add to your home screen.
- **Automatic check-ins** come from iPhone Shortcuts automations: arriving at the gym, tapping an NFC sticker, or the daily Apple Health weight sync.
- **Free:** GitHub Pages (hosting) and Supabase (database, free tier).
- **Doesn't connect to EVO's systems.**

Try it first with demo data: open `https://<you>.github.io/evo-stats/?demo` once it's deployed.

---

## Setup (≈20 minutes, all from Windows + your iPhone)

### 1. Create the database (Supabase)
1. Sign up at **supabase.com** → **New project**.
   - Region: **Stockholm** (eu-north-1) is closest to Oslo.
   - Save the database password somewhere. The app doesn't use it.
2. **SQL Editor** → **New query** → paste all of `supabase/schema.sql` → **Run**.
3. **Authentication** → **Users** → **Add user** → **Create new user**:
   - Enter your email and a password.
   - Tick **Auto Confirm User**.
4. **Authentication** → **Sign In / Providers** → turn **off** "Allow new users to sign up", so nobody else can create an account.
5. **Project Settings** → **API Keys**: copy the **Project URL** (`https://xxxx.supabase.co`) and the **Publishable key** (`sb_publishable_…`). Both are meant to be public.

### 2. Publish the app (GitHub Pages)
1. Create a **public** GitHub repo named `evo-stats`.
2. Push this folder:
   ```powershell
   cd evo-stats
   git init -b main
   git add .
   git commit -m "EVO Stats web app"
   git remote add origin https://github.com/<you>/evo-stats.git
   git push -u origin main
   ```
3. Repo **Settings** → **Pages** → Source: **GitHub Actions**.
4. Repo **Settings** → **Secrets and variables** → **Actions** → **Variables** tab → add:
   - `SUPABASE_URL` = your Project URL
   - `SUPABASE_PUBLISHABLE_KEY` = your publishable key
5. **Actions** tab → **Deploy to GitHub Pages** → **Run workflow**. When it finishes, your app is at `https://<you>.github.io/evo-stats/`.

### 3. Put it on your iPhone
1. Open the URL in **Safari** → **Share** → **Add to Home Screen**.
2. Open **EVO Stats** from the home screen and sign in.
3. Allow location when asked. The Clubs tab uses it.
4. At the gym: **Clubs** tab → **+ Add here** saves the club.

### 4. Turn on the automations
Open the app → **Settings**. It shows your personal values with **Copy** buttons, plus step-by-step instructions for:
- **Auto check-in on arrival:** Shortcuts → Automation → Arrive.
- **NFC sticker tap (optional):** Shortcuts → Automation → NFC.
- **Wallet:** Automation → Transaction, but only if your EVO pass shows up there.
- **Daily weight sync from Apple Health.** This also keeps the free database awake.

Visits within 3 hours of each other count as one, so overlapping triggers never double-count.

---

## How it fits together

```
iPhone Shortcuts ──POST /rpc/log_visit, /rpc/log_weight──┐
  (arrive / NFC / daily Health)   (secret Shortcut key)   │
                                                          ▼
Web app on home screen ──signed in, Row Level Security──► Supabase Postgres
  (GitHub Pages, React)                                   ▲
GitHub Action every 3 days ──/rpc/ping (keep-alive)───────┘
```

**Security**
- Every table has Row Level Security, so only your signed-in account can read or change your rows.
- Shortcuts don't sign in. They call two narrow functions that require your Shortcut key, which you create and can rotate in Settings.
- The publishable key in the web page can't read anything on its own.

## Files
- `supabase/schema.sql`: tables, security policies, and the Shortcut functions.
- `src/screens/`: the Visits, Strength, Weight, Clubs and Settings screens.
- `src/lib/supabaseApi.ts`: database calls. `demoApi.ts` provides the `?demo` data.
- `src/lib/stats.ts`: visit counts, streaks, e1RM (Epley), and hourly patterns.
- `.github/workflows/deploy.yml`: builds the app and publishes it on every push.
- `.github/workflows/keepalive.yml`: pings the database every 3 days.

**Local development (optional):**
1. `npm install`
2. Create `.env.local` with `VITE_SUPABASE_URL=…` and `VITE_SUPABASE_PUBLISHABLE_KEY=…`.
3. `npm run dev`

**Notes**
- **If Supabase pauses anyway:** open the Supabase dashboard and click **Resume project**. Your data is kept.
- **Keep-alive stops after inactivity:** GitHub turns off scheduled workflows in repos with no activity for 60 days. The daily weight Shortcut is the main keep-alive anyway.
- **Busyness is your own pattern:** EVO doesn't publish live crowd numbers, so the club "busyness" bars show when *you* usually train there.
