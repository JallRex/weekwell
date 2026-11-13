# Weekwell

A responsive, static weekly customer planner. No build, account, backend, or package installation is required.

## Run

Open `index.html` in a current browser, or serve this folder using a static server (for example VS Code Live Server). Use the same browser and address to return to saved plans. HTTPS or localhost is recommended; storage behavior for directly opened files varies by browser.

## Publish on GitHub Pages

1. Put these files at the root of a GitHub repository and push them.
2. In the repository's **Settings → Pages**, choose **Deploy from a branch**.
3. Select your branch and **/ (root)**, then save.
4. Open the Pages URL once deployment finishes.

Relative asset URLs support both project and user Pages sites. Publishing the app does not upload your entered plans.

## Planning rules

- All seven days are available. Add multiple customer visits, each with a start and end time. Click a visit to edit or delete it.
- Time entry uses separate **24-hour hour/minute dropdowns**, with hours `00`–`23` and minutes `00` or `30`. Existing exact minutes (for example `12:15` from the sample or an imported plan) remain selectable when editing and are never rounded. New visits default to half-hour boundaries. Same-day visits only; no `24:00` endpoint.
- The default weekly goal is **37.5 billed hours after breaks**. Change it in **Preferences**.
- Mark additional work as an **Extra billed assignment** to overlap a different customer's visit. For example, an `08:00–16:00` regular visit plus another customer's `10:00–11:00` extra assignment counts as **8.5h** after a 30-minute break: **7.5h** for the main customer and **1h** for the extra customer.
- Both customer targets and the weekly goal count extra billing in full, even during overlapping time. Totals and the Friday forecast are **billed time, not unique elapsed working time**. Overlaps for the same customer, and overlaps between two regular assignments, are rejected. Adjacent visits are allowed.
- **30 minutes** are deducted once per worked Monday–Friday, from the **main customer's regular hours only**. Extra billed assignments never lose break time; an extra-only day has no deduction. Weekends have no automatic deduction.
- The main customer defaults to the customer with the most regular hours that day (combining their regular visits; ties go to the earliest visit). Use the day's break button to explicitly select another regular customer or change the break, including to zero. If the selected customer is no longer present, automatic selection resumes. The deduction cannot exceed that customer's regular hours and never spills into extra assignments or another customer.
- **Customer targets** repeat each week until changed. Use **Add customer** to create a target (for example `18.5h` or `5h`), or **Set/Edit target** beside an existing customer. Bars and status text show hours still needed, target reached, or hours above target. Customers with targets remain visible in weeks with no visits. Target edits apply to all saved weeks; removing a target leaves visits unchanged.
- Customer progress uses billed hours **after main-customer break deductions**. Customer totals add up to the weekly billed total. Customer names are matched case-insensitively, ignoring surrounding whitespace.
- **Friday goal left** = weekly goal minus billed Monday–Thursday hours after breaks, floored at zero. This deliberately excludes Friday/weekend visits to show the effect of working earlier.
- **Friday time freed up** = one fifth of the weekly goal minus Friday goal left, limited to between zero and one fifth of the goal. It represents reduced goal obligations, not a calendar gap or guaranteed availability. Friday's actual visits can still occupy that time.
- Your example produces **37.75h**, **0.25h above goal**, with **4h freed up** and **3.5h still needed on Friday** after Monday–Thursday.
- **Try your example** fills the selected week with that schedule; it asks before replacing existing visits or custom breaks. **Clear this week** leaves other weeks and recurring customer targets unchanged.

## Storage and privacy

Plans and preferences use `localStorage`, scoped to the current browser and site address. No analytics are used. Cloud storage is optional and used only after signing in and explicitly choosing **Save to cloud**. Without cloud Load / Save or JSON restore, plans **do not sync between devices**. Clearing site data removes local plans; private browsing may discard them. Do not treat browser storage as a backup.

Storage failures are shown in the app. Unreadable saved data is not automatically overwritten. If another tab changes the saved plan, this tab stops saving and asks you to reload to avoid overwriting the newer plan.

Existing saved plans are preserved: visits without the new extra-billing flag remain regular assignments, and customer targets start empty. The same storage key is used, with backwards-compatible optional fields for targets, extra assignments, and break ownership.

Google Fonts is used for optional typography; system fonts are used when it is unavailable. No customer data is sent to Google.

## Backups and weekly records

Use **Export / restore**:

- **Download JSON backup** saves all weeks, targets, settings, extra assignments, custom breaks, and main-customer choices. It includes unsaved in-memory edits if browser storage failed. Keep this file private: it contains customer names and schedules.
- **Restore a backup** accepts supported Weekwell JSON up to 5 MB. It validates before asking for confirmation, then replaces **all** local plans and preferences, not just the selected week. Download a current backup first. Invalid files and storage failures leave current plans unchanged. The selected week remains selected. Old backups without targets or extra-billing fields remain supported.
- **Print weekly report / PDF** opens the browser's print dialog for the selected week. Choose **Save as PDF** for a portable record. Includes generation time, visit times/types, customer targets and progress, daily break ownership/deductions, weekly totals, and Friday forecast. Browser Print also uses this report layout.

Reports are snapshots of your entered plans, **not independently verified proof of work**. Neither backups nor print reports upload data. Restoring the JSON on another device is a manual way to move your plan before cloud sync is added.

## Private Supabase saving

The public app stays on GitHub Pages. Supabase hosts auth and a single private JSON plan. The browser uses only the project URL and **publishable** key; never add a database password or a service-role/secret key.

Initial setup:

1. In Supabase **Authentication → Users**, create exactly one email/password user with Auto Confirm User enabled.
2. Run [supabase/setup.sql](supabase/setup.sql) once in that project's SQL Editor. It stores the existing user's ID in a private owner table, enables row-level security, grants read access only to that owner, and exposes a version-checked save function. Running it with zero or multiple users stops without configuring an owner. Do not rerun this one-time schema script against an already configured project.
3. In **Authentication → Sign In / Providers**, disable **Allow new users to sign up**, keeping Email enabled. Set the Site URL to `https://jallrex.github.io/weekwell/`.
4. Open **Sign in / cloud** in the app and sign in with the user you created. There is no registration form. If you forget the password, change it through the Supabase dashboard.

Use **Save to cloud** on the first device, then **Load cloud plan** on another. These are explicit full-plan replacements, **not automatic sync or merge**. Loading asks before replacing local weeks. Saving an existing cloud plan without first loading it asks before replacement. A stale save is rejected if another device has changed the cloud revision; export local changes to JSON, load the latest cloud plan, and reconcile before saving again.

Passwords and auth tokens are not stored in planner backups or browser local storage. The Supabase SDK keeps the session in memory and refreshes it while the page stays open. Reloading requires sign-in again. Signing out retains local plans, so clear site data on a shared device if needed. The SDK is loaded from a pinned CDN only when signing in; failed cloud requests are shown, and local planning remains available.

## Validate

Open `tests.html` in the browser. The dependency-free suite tests the same calculation and validation module used by the app, including the exact example, regular/extra overlap rules, main-customer break allocation, recurring customer targets, weekends, Friday forecasts, date boundaries, and legacy/new saved data.

After Supabase setup, run [supabase/verify.sql](supabase/verify.sql) in the SQL Editor. It checks owner read/write, stale-save and invalid-plan rejection, non-owner row isolation, and anonymous denial. All test writes are rolled back; a successful run ends with a PASS message.

For interaction checks: select `17:30`, edit an existing `12:15` visit without changing its minutes, round-trip a multi-week JSON backup, reject invalid backups, cancel restore, print a report with extra billing and breaks, navigate weeks and return, reload to check persistence, and try a narrow mobile viewport.
