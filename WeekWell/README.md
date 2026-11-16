# Weekwell

**Make room for Friday.**

Weekwell is a lightweight, responsive planner for people who divide their working week between customer locations. It brings visits, recurring customer commitments, billed hours, and breathing room into one view.

[Open the app](https://jallrex.github.io/weekwell/)

## A week that makes sense at a glance

The seven-day planner supports multiple visits each day, 24-hour time selectors, and editable unpaid breaks. Customer targets repeat from week to week, with progress bars showing what is still needed, what is covered, and where you are ahead.

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

Extra billed assignments may overlap a different customer's visit and count fully toward customer and weekly targets. Two regular visits cannot overlap, and the same customer's time cannot be billed twice. Visits stay within one day.

Breaks are deducted only from the main customer's regular hours, never from extra billing. The main customer defaults to whoever has the most regular time that day; daily overrides can change the customer or break length. Weekends have no automatic break.

**For example:** an `08:00-16:00` regular visit and another customer's `10:00-11:00` extra assignment produce **8.5 billed hours** and **7.5 expected hours** after a 30-minute break. Billed hours are not unique elapsed working time.

## Local first, with optional private cloud saving

Plans save automatically in browser storage and normally survive closing the browser. They belong to that browser and site origin, not to the public repository. Private browsing, clearing site data, or switching devices can leave that local copy unavailable.

The optional Supabase connection is restricted to the configured owner. Cloud **Load / Save** actions transfer the entire saved plan, including all weeks and preferences. They are manual replacements, not automatic synchronization or merging. Confirmation prompts and revision checks help prevent accidental or stale overwrites.

Cloud sign-in lasts for the current page session. Passwords and authentication tokens are not included in planner backups or saved in browser local storage by the app. Signing out leaves local plans on the device.

## Backups and weekly records

JSON backups preserve all weeks, recurring targets, preferences, extra assignments, and custom breaks. Restoring replaces the local plan only after validation and confirmation.

Printable weekly records include visits, customer progress, break deductions, totals, and Friday calculations, with browser PDF support. They are snapshots of entered plans, **not independently verified proof of work**.

Backups and reports can contain customer names and schedules, so they should be treated as private documents.

## Public code, private access

Weekwell is a static HTML, CSS, and JavaScript app hosted on GitHub Pages. Local planning needs no account or backend. The public Supabase URL and publishable key are browser configuration, not administrator credentials; cloud privacy depends on the deployed owner checks, row-level security, and restricted database permissions.

The cloud SDK loads only when signing in. Its version is pinned, and the browser checks a SHA-384 integrity hash before executing it. Network failures or an integrity mismatch block cloud sign-in without preventing local planning. Optional typography is fetched from Google Fonts, with system-font fallbacks.

The repository includes [calculation tests](tests.html), the [one-time backend schema](supabase/setup.sql), and [transactional backend checks](supabase/verify.sql). The schema is not a rerunnable migration; the verification script rolls back its test writes. Source code and these checks do not by themselves establish the configuration of a live Supabase project.
