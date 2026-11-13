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
- Time entry and display use **24-hour `HH:MM`** (for example `08:00` and `17:30`), regardless of your browser's AM/PM setting. Same-day visits support `00:00` through `23:59`, not a `24:00` endpoint.
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

Plans and preferences use `localStorage`, scoped to the current browser and site address. No cookies, analytics, or server storage are used. Plans **do not sync between devices**. Clearing site data removes them; private browsing may discard them. Do not treat browser storage as a backup.

Storage failures are shown in the app. Unreadable saved data is not automatically overwritten. If another tab changes the saved plan, this tab stops saving and asks you to reload to avoid overwriting the newer plan.

Existing saved plans are preserved: visits without the new extra-billing flag remain regular assignments, and customer targets start empty. The same storage key is used, with backwards-compatible optional fields for targets, extra assignments, and break ownership.

Google Fonts is used for optional typography; system fonts are used when it is unavailable. No customer data is sent to Google.

## Validate

Open `tests.html` in the browser. The dependency-free suite tests the same calculation and validation module used by the app, including the exact example, regular/extra overlap rules, main-customer break allocation, recurring customer targets, weekends, Friday forecasts, date boundaries, and legacy/new saved data.

For interaction checks: enter `17:30` in a 24-hour field, add an overlapping extra assignment, set/edit/remove customer targets, change the break's main customer, navigate weeks and return, reload to check persistence, and try a narrow mobile viewport.
