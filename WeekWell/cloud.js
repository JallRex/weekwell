(() => {
  "use strict";
  const $ = id => document.getElementById(id);
  const planner = globalThis.WeekwellPlanner;
  const math = globalThis.PlannerMath;
  const merge = globalThis.WeekwellMerge;
  const planKey = "weekwell.planner.v1";
  const baseKey = "weekwell.sync-base.v1";
  const blank = () => ({ version: 1, settings: { ...math.DEFAULT_SETTINGS }, customerTargets: [], weeks: {} });
  let client;
  let clientPromise;
  let signedIn = false;
  let ready = false;
  let busy = false;
  let suppressChange = false;
  let automaticDialog = false;
  let releaseDeviceLock = null;
  let base = null;
  let pending = null;

  function status(message, error = false) {
    $("cloud-status").textContent = message;
    $("cloud-status").className = error ? "form-error" : "field-help";
    $("save-status").textContent = message;
  }

  function controls() {
    const editable = ready && signedIn && !busy && !pending && navigator.onLine && !planner.isProtected();
    $("planner").inert = !editable;
    $("settings-button").inert = !editable;
    document.querySelectorAll("dialog:not(#cloud-dialog):not(#confirm-dialog)").forEach(dialog => { dialog.inert = !editable; });
    $("cloud-login").hidden = signedIn;
    $("cloud-actions").hidden = !signedIn;
    $("cloud-close").hidden = !editable;
    $("cloud-difference").hidden = !["initial", "invalid"].includes(pending?.type);
    $("cloud-merge").hidden = pending?.type === "invalid";
    $("cloud-conflicts").hidden = pending?.type !== "conflicts";
    $("cloud-overlaps").hidden = pending?.type !== "overlaps";
    $("cloud-recover-local").hidden = !signedIn || !planner.hasUnreadableBackup();
    $("cloud-button").textContent = signedIn ? "Cloud sync" : "Sign in / sync";
    $("cloud-dialog").querySelectorAll("button:not(.close-dialog), input, select").forEach(control => {
      control.disabled = busy;
    });
    $("cloud-history").disabled = busy || !ready || Boolean(pending);
    if (!editable && !$("cloud-dialog").open && !busy) {
      automaticDialog = true;
      $("cloud-dialog").showModal();
    } else if (editable && automaticDialog && $("cloud-dialog").open) {
      $("cloud-dialog").close();
      automaticDialog = false;
    }
  }

  function fail(error) {
    console.error("Weekwell cloud sync failed.", error);
    ready = false;
    const message = error.message || "Cloud sync failed. Retry when connected.";
    status(`${message}${planner.isLocallySaved() ? "" : " Local storage failed or changed; keep this page open and download a local backup."}`, true);
  }

  function offlineStatus() {
    status(`Offline. Editing is unavailable; reconnect and sync before editing.${planner.isLocallySaved() ? "" : " Local storage failed or changed; keep this page open and download a local backup."}`, true);
  }

  function check(error) {
    if (error) {
      const failure = new Error(error.message);
      failure.code = error.code;
      throw failure;
    }
  }

  async function getClient() {
    if (!clientPromise) {
      clientPromise = new Promise((resolve, reject) => {
        const script = document.createElement("script");
        script.src = "https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.119.0/dist/umd/supabase.js";
        script.integrity = "sha384-uteMfOloLDGt042uDz+xHGF3ym63/WQ6rFq7murQRG8Ih7QrXGEGNtWd8688sb4O";
        script.crossOrigin = "anonymous";
        script.onload = () => {
          script.remove();
          if (typeof globalThis.supabase?.createClient !== "function") {
            reject(new Error("The verified cloud SDK did not initialize."));
          } else resolve(globalThis.supabase);
        };
        script.onerror = () => {
          script.remove();
          reject(new Error("Could not load and verify the cloud SDK. Connect to the internet and retry."));
        };
        document.head.append(script);
      }).then(({ createClient }) => {
        client = createClient(
          "https://txhktkxgznuiksnlixkr.supabase.co",
          "sb_publishable_wDD1jEXrvd40qIAfDfkvbQ_qaNPkylC",
          { auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: false } }
        );
        client.auth.onAuthStateChange(event => {
          if (event === "SIGNED_OUT") {
            signedIn = false;
            ready = false;
            pending = null;
            status("Signed out. Sign in and sync before editing.");
            controls();
          }
        });
        return client;
      }).catch(error => {
        clientPromise = null;
        throw error;
      });
    }
    return clientPromise;
  }

  function readBase() {
    const raw = localStorage.getItem(baseKey);
    if (!raw) return null;
    let value;
    try { value = JSON.parse(raw); } catch (error) {
      throw new Error("The local sync baseline is unreadable. Export your local backup before resolving this.");
    }
    if (!value || !Number.isSafeInteger(value.revision) || value.revision < 1 || !math.validState(value.plan)) {
      throw new Error("The local sync baseline is invalid. Export your local backup before resolving this.");
    }
    return value;
  }

  function saveBase(remote) {
    if (!releaseDeviceLock) throw new Error("This tab no longer has the device lock. Reload before syncing.");
    if (planner.isProtected()) throw new Error("Another tab changed local data. Reload before syncing.");
    const stored = localStorage.getItem(planKey);
    let storedPlan;
    try { storedPlan = stored === null ? null : JSON.parse(stored); } catch (error) {
      throw new Error("Local saved data became unreadable. Back it up and reload before syncing.");
    }
    if (storedPlan === null || !merge.equal(storedPlan, snapshot())) {
      throw new Error("Local data changed in another tab. Reload before syncing.");
    }
    localStorage.setItem(baseKey, JSON.stringify(remote));
    base = remote;
  }

  async function acquireDeviceLock() {
    if (releaseDeviceLock) return;
    if (!navigator.locks?.request) {
      throw new Error("This browser cannot safely coordinate multiple tabs. Use a current browser with Web Locks support.");
    }
    const acquired = await new Promise((resolve, reject) => {
      navigator.locks.request("weekwell-device-sync", { ifAvailable: true }, lock => {
        if (!lock) { resolve(false); return; }
        resolve(true);
        return new Promise(release => { releaseDeviceLock = release; });
      }).catch(reject);
    });
    if (!acquired) throw new Error("Weekwell is open in another tab on this device. Close that tab, then retry.");
  }

  function snapshot() {
    return JSON.parse(planner.snapshot());
  }

  function replace(plan, expected) {
    suppressChange = true;
    try { planner.replace(plan, JSON.stringify(expected)); }
    finally { suppressChange = false; }
  }

  async function readCloud() {
    const { data, error } = await client.from("weekwell_plans")
      .select("plan,revision,updated_at").maybeSingle();
    check(error);
    if (data && (!math.validState(data.plan) || !Number.isSafeInteger(data.revision) || data.revision <= 0)) {
      throw new Error("The cloud plan is invalid or unsupported. Local data has not been replaced.");
    }
    return data ? { plan: data.plan, revision: data.revision } : null;
  }

  async function writeCloud(plan, revision) {
    if (!releaseDeviceLock || planner.isProtected()) throw new Error("This tab cannot safely write while local storage is changing.");
    if (!math.validState(plan)) throw new Error("The merged plan is invalid. Nothing was written to the cloud.");
    if (new Blob([JSON.stringify(plan)]).size > 5 * 1024 * 1024) throw new Error("The plan exceeds the 5 MB cloud limit. Export a backup.");
    const { data, error } = await client.rpc("weekwell_save_plan", { p_plan: plan, p_expected_revision: revision });
    check(error);
    if (!Array.isArray(data) || data.length !== 1 || !Number.isSafeInteger(data[0].revision) ||
        data[0].revision !== revision + 1) {
      throw new Error("Cloud save could not be confirmed. Retry to check the latest cloud version.");
    }
    return { plan, revision: data[0].revision };
  }

  function conflictUI(result, local, remote) {
    const list = $("cloud-conflict-list");
    list.replaceChildren();
    result.conflicts.forEach((conflict, index) => {
      const label = document.createElement("label");
      const parts = conflict.path.split("/").slice(1).map(decodeURIComponent);
      const visit = parts[0] === "weeks" && parts[2] === "visits" ?
        (local.weeks[parts[1]]?.visits.find(item => item.id === parts[3]) ??
         remote.weeks[parts[1]]?.visits.find(item => item.id === parts[3])) : null;
      label.textContent = visit ? `${visit.customer} · week of ${parts[1]} · ${parts.slice(4).join(" / ") || "visit"}` :
        parts.join(" / ");
      const detail = document.createElement("p");
      detail.className = "field-help";
      detail.textContent = `This device: ${conflict.localDeleted ? "(deleted)" : JSON.stringify(conflict.local)} · Cloud: ${conflict.cloudDeleted ? "(deleted)" : JSON.stringify(conflict.cloud)}`;
      const select = document.createElement("select");
      select.dataset.index = String(index);
      for (const [value, text] of [["", "Choose…"], ["local", "Use this device"], ["cloud", "Use cloud"]]) {
        const option = document.createElement("option");
        option.value = value;
        option.textContent = text;
        select.append(option);
      }
      label.append(detail, select);
      list.append(label);
    });
  }

  function overlapUI(plan) {
    const overlaps = [];
    for (const [week, data] of Object.entries(plan.weeks)) {
      for (let i = 0; i < data.visits.length; i++) {
        for (let j = i + 1; j < data.visits.length; j++) {
          const first = data.visits[i];
          const second = data.visits[j];
          if (!math.visitError(first, []) && !math.visitError(second, []) && math.visitError(first, [second])) {
            overlaps.push({ week, first, second });
          }
        }
      }
    }
    const list = $("cloud-overlap-list");
    list.replaceChildren();
    overlaps.forEach((overlap, index) => {
      const label = document.createElement("label");
      label.textContent = `Week of ${overlap.week} · ${math.DAYS[overlap.first.day]}`;
      const select = document.createElement("select");
      select.dataset.index = String(index);
      for (const [value, text] of [
        ["", "Choose…"],
        ["first", `Keep ${overlap.first.customer} · ${overlap.first.start}–${overlap.first.end}`],
        ["second", `Keep ${overlap.second.customer} · ${overlap.second.start}–${overlap.second.end}`]
      ]) {
        const option = document.createElement("option");
        option.value = value;
        option.textContent = text;
        select.append(option);
      }
      label.append(select);
      list.append(label);
    });
    return overlaps;
  }

  async function finish(plan, local, remote) {
    if (!releaseDeviceLock || planner.isProtected()) throw new Error("This tab cannot safely sync while local storage is changing.");
    if (!math.validState(plan)) {
      const overlaps = overlapUI(plan);
      if (overlaps.length) {
        pending = { type: "overlaps", plan, local, remote, overlaps };
        status("The combined plan has overlapping visits. Choose which visits to keep.");
        return;
      }
      pending = { type: "invalid", local, remote };
      throw new Error("These changes would create an invalid plan (for example, overlapping visits). Download the local backup and use the cloud plan, then re-enter the local changes.");
    }
    if (!merge.equal(plan, local) || !planner.isLocallySaved() || localStorage.getItem(planKey) === null) replace(plan, local);
    const saved = remote && merge.equal(plan, remote.plan) ? remote :
      await writeCloud(plan, remote?.revision ?? 0);
    saveBase(saved);
    pending = null;
    ready = true;
    status(`Synced to cloud · revision ${saved.revision}`);
  }

  async function reconcile(remote, forceMerge = false) {
    if (planner.isProtected()) throw new Error("Local storage is protected because data is unreadable or another tab changed it. Back it up and resolve the storage warning before syncing.");
    const local = snapshot();
    if (!remote) {
      if (base) throw new Error("The cloud plan is missing. Your local plan was preserved; investigate before retrying.");
      await finish(local, local, null);
      return;
    }
    if (!base && !forceMerge && localStorage.getItem(planKey) !== null &&
        !merge.equal(local, remote.plan)) {
      pending = { type: "initial", local, remote };
      status("The local and cloud plans differ. Without a common baseline, merging cannot detect earlier deletions. Choose how to proceed.");
      return;
    }
    const before = base?.plan ?? blank();
    const result = merge.merge(before, local, remote.plan);
    if (result.conflicts.length) {
      pending = { type: "conflicts", local, remote, before, conflicts: result.conflicts };
      conflictUI(result, local, remote.plan);
      status("Choose a version for each conflict. Neither plan has been overwritten.");
      return;
    }
    await finish(result.plan, local, remote);
  }

  async function run(operation) {
    if (busy) return;
    busy = true;
    ready = false;
    controls();
    try {
      await operation();
    } catch (error) {
      if (error.code === "40001" && signedIn) {
        pending = null;
        try { await sync(); } catch (retryError) { fail(retryError); }
      } else fail(error);
    } finally {
      busy = false;
      if (!navigator.onLine) {
        ready = false;
        offlineStatus();
      }
      controls();
    }
  }

  async function sync() {
    if (!signedIn) throw new Error("Sign in before syncing.");
    for (let attempt = 0; attempt < 3; attempt++) {
      status("Checking cloud plan…");
      try {
        const remote = await readCloud();
        await reconcile(remote);
        return;
      } catch (error) {
        if (error.code !== "40001" || attempt === 2) throw error;
      }
    }
  }

  async function authorize() {
    const user = await client.auth.getUser();
    check(user.error);
    if (!user.data.user) throw new Error("Your session expired. Sign in again.");
    const owner = await client.rpc("weekwell_is_owner");
    check(owner.error);
    if (owner.data !== true) throw new Error("This account is not authorized for this planner.");
    const history = await client.from("weekwell_plan_history").select("revision").limit(1);
    check(history.error);
    signedIn = true;
    base = readBase();
    await sync();
  }

  function downloadBackup() {
    const url = URL.createObjectURL(new Blob([planner.backup()], { type: "application/json" }));
    const link = document.createElement("a");
    link.href = url;
    link.download = `weekwell-${planner.hasUnreadableBackup() ? "unreadable" : "local"}-backup-${math.dateKey(new Date())}.json`;
    document.body.append(link);
    link.click();
    link.remove();
    setTimeout(() => URL.revokeObjectURL(url), 60000);
  }

  $("cloud-button").addEventListener("click", () => {
    if (!$("cloud-dialog").open) {
      automaticDialog = false;
      $("cloud-dialog").showModal();
    }
  });
  $("cloud-dialog").addEventListener("cancel", event => { if (!ready || busy || pending) event.preventDefault(); });
  $("cloud-login").addEventListener("submit", event => {
    event.preventDefault();
    const email = $("cloud-email").value.trim();
    const password = $("cloud-password").value;
    $("cloud-password").value = "";
    run(async () => {
      status("Signing in…");
      await acquireDeviceLock();
      const api = await getClient();
      const { error } = await api.auth.signInWithPassword({ email, password });
      check(error);
      await authorize();
    });
  });
  $("cloud-retry").addEventListener("click", () => run(async () => {
    pending = null;
    await acquireDeviceLock();
    if (signedIn) await authorize();
    else {
      await getClient();
      const session = await client.auth.getSession();
      check(session.error);
      if (!session.data.session) throw new Error("Sign in before syncing.");
      await authorize();
    }
  }));
  $("cloud-export-local").addEventListener("click", downloadBackup);
  $("cloud-recover-local").addEventListener("click", () => planner.confirm("Replace unreadable local data?",
    "Download the unreadable local backup first. This replaces it with the current cloud plan and cannot be undone.",
    "Replace local data", () => run(async () => {
      const remote = await readCloud();
      if (!remote) throw new Error("No cloud plan is available. The unreadable local data was not replaced.");
      planner.recoverUnreadable(remote.plan);
      saveBase(remote);
      pending = null;
      ready = true;
      status(`Cloud plan loaded · revision ${remote.revision}`);
    })));
  $("cloud-use-remote").addEventListener("click", () => run(async () => {
    const { local, remote } = pending;
    const latest = await readCloud();
    if (!latest) throw new Error("The cloud plan disappeared. The local plan has not been replaced.");
    if (latest.revision !== remote.revision) {
      pending = null;
      await reconcile(latest);
      return;
    }
    replace(remote.plan, local);
    saveBase(remote);
    pending = null;
    ready = true;
    status(`Cloud plan loaded · revision ${remote.revision}`);
  }));
  $("cloud-merge").addEventListener("click", () => run(async () => {
    const remote = pending.remote;
    pending = null;
    await reconcile(remote, true);
  }));
  $("cloud-resolve").addEventListener("click", () => run(async () => {
    const choices = {};
    for (const select of $("cloud-conflict-list").querySelectorAll("select")) {
      if (!select.value) throw new Error("Choose a version for every conflict.");
      choices[pending.conflicts[Number(select.dataset.index)].path] = select.value;
    }
    const { before, local, remote } = pending;
    const result = merge.merge(before, local, remote.plan, choices);
    if (result.conflicts.length) throw new Error("Some conflicts still need a choice.");
    await finish(result.plan, local, remote);
  }));
  $("cloud-resolve-overlaps").addEventListener("click", () => run(async () => {
    const { plan, local, remote, overlaps } = pending;
    const removed = new Set();
    const kept = new Set();
    for (const select of $("cloud-overlap-list").querySelectorAll("select")) {
      if (!select.value) throw new Error("Choose a visit for every overlap.");
      const overlap = overlaps[Number(select.dataset.index)];
      const keep = select.value === "first" ? overlap.first : overlap.second;
      const remove = select.value === "first" ? overlap.second : overlap.first;
      kept.add(`${overlap.week}:${keep.id}`);
      removed.add(`${overlap.week}:${remove.id}`);
    }
    if ([...kept].some(key => removed.has(key))) {
      throw new Error("Some choices conflict with each other. Review which visits to keep.");
    }
    const resolved = structuredClone(plan);
    for (const [week, data] of Object.entries(resolved.weeks)) {
      data.visits = data.visits.filter(visit => !removed.has(`${week}:${visit.id}`));
    }
    await finish(resolved, local, remote);
  }));
  $("cloud-signout").addEventListener("click", () => run(async () => {
    if (pending || !base || !merge.equal(snapshot(), base.plan)) {
      throw new Error("Local changes have not been synced. Resolve or back them up before signing out.");
    }
    const { error } = await client.auth.signOut({ scope: "local" });
    check(error);
    signedIn = false;
    ready = false;
    if (releaseDeviceLock) {
      releaseDeviceLock();
      releaseDeviceLock = null;
    }
    status("Signed out. Sign in and sync before editing.");
  }));
  $("cloud-history").addEventListener("click", () => run(async () => {
    if (pending || !base || !merge.equal(snapshot(), base.plan)) {
      throw new Error("Sync or resolve local changes before viewing history.");
    }
    const { data, error } = await client.from("weekwell_plan_history")
      .select("revision,updated_at,summary").order("revision", { ascending: false }).limit(100);
    check(error);
    const list = $("cloud-history-list");
    list.replaceChildren();
    for (const entry of data) {
      const button = document.createElement("button");
      button.className = "text-button";
      button.textContent = `Restore revision ${entry.revision} · ${new Date(entry.updated_at).toLocaleString()} · ${entry.summary}`;
      button.addEventListener("click", () => planner.confirm("Restore cloud version?",
        "This replaces the entire current plan with the selected version and syncs it to the cloud. The current version remains in recent history.",
        "Restore version", () => run(async () => {
          const current = await readCloud();
          const old = await client.from("weekwell_plan_history").select("plan").eq("revision", entry.revision).maybeSingle();
          check(old.error);
          if (!old.data || !math.validState(old.data.plan)) throw new Error("This version is no longer available or is invalid.");
          if (!base || !current || current.revision !== base.revision || !merge.equal(snapshot(), base.plan)) {
            throw new Error("The plan changed. Sync before restoring a version.");
          }
          await finish(old.data.plan, snapshot(), current);
        })));
      const row = document.createElement("div");
      row.append(button);
      list.append(row);
    }
    ready = true;
    status("Recent cloud versions loaded.");
  }));
  document.addEventListener("weekwell:change", () => {
    if (!suppressChange && signedIn && !busy && !pending) run(sync);
  });
  document.addEventListener("weekwell:storage-conflict", () => {
    ready = false;
    status("Another tab changed this device's plan. Reload this page before editing.", true);
    controls();
  });
  window.addEventListener("online", () => { if (signedIn && !busy && !pending) run(sync); });
  window.addEventListener("offline", () => {
    ready = false;
    offlineStatus();
    controls();
  });
  setInterval(() => { if (signedIn && ready && !busy && !pending && !document.querySelector("dialog[open]")) run(sync); }, 15000);
  controls();
  run(async () => {
    await acquireDeviceLock();
    const api = await getClient();
    const { data, error } = await api.auth.getSession();
    check(error);
    if (data.session) await authorize();
    else status("Sign in to sync before editing.");
  });
  window.addEventListener("pagehide", () => {
    if (releaseDeviceLock) releaseDeviceLock();
    releaseDeviceLock = null;
    ready = false;
  });
  window.addEventListener("pageshow", event => {
    if (event.persisted) run(async () => {
      await acquireDeviceLock();
      if (signedIn) await authorize();
    });
  });
})();
