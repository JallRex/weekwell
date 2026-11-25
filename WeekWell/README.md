# Weekwell

**Make room for Friday.**

Weekwell is a lightweight, responsive planner for people who divide their working week between customer locations. It brings visits, recurring customer commitments, billed hours, and breathing room into one view.

[Open the app](https://jallrex.github.io/weekwell/)

## A week that makes sense at a glance

The seven-day planner supports multiple visits each day, 24-hour time selectors, and editable unpaid breaks. Customer targets repeat from week to week, with progress bars showing what is still needed, what is covered, and where you are ahead.

Visits can include optional descriptions. Days can be marked as sick, holidays, or other time off, with an optional overall-goal reduction. Planned visits remain possible on those days and are clearly marked.

The monthly overview opens on the current calendar month; use the arrows to browse past or future months and **This month** to return. It shows all customers, billed and in-person hours, and customer estimates ordered by the largest remaining gap. Visits from weeks crossing a month boundary count only on their actual calendar dates. Estimates and overall goals use current targets and preferences, not historical snapshots. A customer allocation can be expressed in weekly hours or as a percentage of the overall weekly goal, with optional inclusive project start and end dates. Monthly estimates count only active weekdays: a 20% allocation of a 37.5-hour week is 7.5 hours per full week, or 33 hours in a 22-weekday month. Partial weeks are apportioned by weekday. Time off does not reduce customer estimates.

The weekly overview celebrates going beyond your goal with a green striped progress bar and a surplus-hours total. Beside the customer targets, a priority list highlights the largest unmet customer commitments. Extra time for one customer does not hide a shortfall for another.

The default weekly goal is **37.5 billed hours after breaks**, with a **30-minute unpaid break on worked weekdays**. Both are adjustable.

## Hours with a clear meaning

| Figure | What it represents |
|---|---|
| Planned billed hours / Total billed hours | All regular and extra billed assignments for the selected week, after applicable breaks. |
| Expected hours | In-person regular visits only, after breaks; extra billed assignments are excluded. |
| Weekly goal remaining / surplus | The difference between all billed hours and the weekly goal. |
| Customer priorities: Left to your goal | Each customer's unmet weekly target, ordered by largest shortfall, plus their combined remaining hours. |
| Friday time freed up | Reduced Friday goal obligations from Monday-Thursday billing, compared with an even five-day week. Not a guaranteed empty calendar slot. |
| Monthly overall goal | Weekly goal divided by five, multiplied by the number of weekdays in the selected month; optionally reduced by the same daily share for marked days off. |

Extra billed assignments may overlap a different customer's visit and count fully toward customer and weekly targets. Two regular visits cannot overlap, and the same customer's time cannot be billed twice. Visits stay within one day.

Breaks are deducted only from the main customer's regular hours, never from extra billing. The main customer defaults to whoever has the most regular time that day; daily overrides can change the customer or break length. Weekends have no automatic break.

**For example:** an `08:00-16:00` regular visit and another customer's `10:00-11:00` extra assignment produce **8.5 billed hours** and **7.5 expected hours** after a 30-minute break. Billed hours are not unique elapsed working time.

## Private cloud sync

Sign in to the configured owner account before editing. The app checks and loads the cloud plan on opening, then saves changes automatically. Editing is blocked when the connection or sync is unavailable; a change made just as the connection fails is preserved locally and must be synced before further editing. The sync status reports whether changes are saved.

When devices have changed different items, Weekwell merges them where possible. If the same information differs, choose a version for each conflict. The app will not save a merged plan with invalid visits, such as overlapping regular assignments. If an existing local plan differs from the cloud plan and has no shared sync baseline, you can back it up, load the cloud, or merge; without a baseline the merge cannot infer past deletions.

The cloud retains the latest 100 saved revisions, including the current plan; an older version can be restored as a new revision. History contains complete plans, including descriptions and days off, and older versions are removed as the limit is reached. A browser copy and sync baseline are stored locally. Clearing browser data removes these local copies, but not a successfully saved cloud plan.

Sessions are remembered in browser storage on that device, so sign in only on trusted devices and sign out on shared devices. Passwords and authentication tokens are not included in planner backups. Signing out leaves the locally saved plan on the device.

To prevent competing tabs from overwriting the same browser copy, only one Weekwell tab per browser profile can edit or sync at a time. Close the other tab and retry if prompted. This requires a current browser with Web Locks support.

## Backups and weekly records

JSON backups preserve all weeks, project dates and allocations, descriptions, days off, preferences, extra assignments, and custom breaks. Restoring replaces the local plan only after validation and confirmation.

Printable weekly records include visits, customer progress, break deductions, totals, and Friday calculations, with browser PDF support. They are snapshots of entered plans, **not independently verified proof of work**.

Backups, cloud plans, revision history, and reports can contain customer names, descriptions, schedules, and sensitive day-off information, so they should be treated as private documents.

## Public code, private access

Weekwell is a static HTML, CSS, and JavaScript app hosted on GitHub Pages. Planning requires an account and a working backend connection. The public Supabase URL and publishable key are browser configuration, not administrator credentials; cloud privacy depends on the deployed owner checks, row-level security, and restricted database permissions.

The cloud SDK version is pinned, and the browser checks a SHA-384 integrity hash before executing it. Network failures or an integrity mismatch block sign-in and editing. Optional typography is fetched from Google Fonts, with system-font fallbacks.

The repository includes [calculation and merge tests](tests.html), the [one-time backend schema](supabase/setup.sql), the [history migration](supabase/sync_history.sql), and [transactional backend checks](supabase/verify.sql). The setup and migration are not rerunnable; the verification script rolls back its test writes. Source code and these checks do not by themselves establish the configuration of a live Supabase project.
