(() => {
  "use strict";
  const $ = id => document.getElementById(id);
  let client;
  let clientPromise;
  let signedIn = false;
  let busy = false;
  let revision = null;
  let cloudPlan = null;
  let savedSnapshot = null;

  function status(message, error = false) {
    $("cloud-status").textContent = message;
    $("cloud-status").className = error ? "form-error" : "field-help";
  }

  function updateControls() {
    $("cloud-login").hidden = signedIn;
    $("cloud-actions").hidden = !signedIn;
    $("cloud-dialog").querySelectorAll("button:not(.close-dialog), input").forEach(control => {
      control.disabled = busy;
    });
    $("cloud-load").disabled = busy || !signedIn;
    $("cloud-save").disabled = busy || !signedIn || revision === null;
    $("cloud-button").textContent = signedIn ? "Cloud plans" : "Sign in / cloud";
  }

  async function getClient() {
    if (!clientPromise) {
      clientPromise = import("https://esm.sh/@supabase/supabase-js@2.119.0").then(({ createClient }) => {
        client = createClient(
          "https://txhktkxgznuiksnlixkr.supabase.co",
          "sb_publishable_wDD1jEXrvd40qIAfDfkvbQ_qaNPkylC",
          { auth: { persistSession: false, autoRefreshToken: true, detectSessionInUrl: false } }
        );
        client.auth.onAuthStateChange(event => {
          if (event === "SIGNED_OUT") {
            signedIn = false;
            revision = null;
            cloudPlan = null;
            savedSnapshot = null;
            updateControls();
            status("Signed out. Local plans stay on this device.");
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

  function checkError(error) {
    if (error) throw new Error(error.message);
  }

  async function readCloud() {
    const { data, error } = await client.from("weekwell_plans")
      .select("plan,revision,updated_at").maybeSingle();
    checkError(error);
    if (data && (!globalThis.PlannerMath.validState(data.plan) ||
      !Number.isSafeInteger(data.revision) || data.revision <= 0)) {
      throw new Error("Cloud plan is invalid or unsupported. Local plans have not changed.");
    }
    return data;
  }

  async function run(operation) {
    if (busy) return;
    busy = true;
    updateControls();
    try {
      await operation();
    } catch (error) {
      status(error.message || "Cloud request failed. Local plans are unchanged; retry when connected.", true);
    } finally {
      busy = false;
      updateControls();
    }
  }

  $("cloud-button").addEventListener("click", () => {
    $("cloud-dialog").showModal();
    updateControls();
  });

  $("cloud-login").addEventListener("submit", event => {
    event.preventDefault();
    const email = $("cloud-email").value.trim();
    const password = $("cloud-password").value;
    $("cloud-password").value = "";
    run(async () => {
      status("Signing in…");
      const api = await getClient();
      const { error } = await api.auth.signInWithPassword({ email, password });
      checkError(error);
      const owner = await api.rpc("weekwell_is_owner");
      if (owner.error || owner.data !== true) {
        const logout = await api.auth.signOut({ scope: "local" });
        checkError(logout.error);
        throw new Error(owner.error ? `Cloud setup is unavailable: ${owner.error.message}` : "This account is not authorized for this planner.");
      }
      signedIn = true;
      revision = null;
      cloudPlan = null;
      savedSnapshot = null;
      const remote = await readCloud();
      revision = remote?.revision ?? 0;
      cloudPlan = remote?.plan ?? null;
      status(remote ? "Signed in. Load your cloud plan, or explicitly replace it with this device's plan. No local data has changed." :
        "Signed in. No cloud plan yet. Save this device's plan to start.");
    });
  });

  $("cloud-load").addEventListener("click", () => run(async () => {
    const local = globalThis.WeekwellPlanner.snapshot();
    status("Reading cloud plan…");
    const remote = await readCloud();
    if (!remote) {
      revision = 0;
      cloudPlan = null;
      status("No cloud plan yet. Save this device's plan first.");
      return;
    }
    globalThis.WeekwellPlanner.confirm("Load cloud plan?",
      "This replaces all local weeks and preferences with the cloud version. Download a JSON backup first to keep local changes.",
      "Load cloud plan", () => {
        try {
          globalThis.WeekwellPlanner.replace(remote.plan, local);
          revision = remote.revision;
          cloudPlan = remote.plan;
          savedSnapshot = globalThis.WeekwellPlanner.snapshot();
          status(`Cloud plan loaded and saved locally. Revision ${revision}.`);
        } catch (error) {
          status(error.message, true);
        }
        updateControls();
      });
  }));

  $("cloud-save").addEventListener("click", () => {
    if (busy || revision === null) return;
    const snapshot = globalThis.WeekwellPlanner.snapshot();
    const expectedRevision = revision;
    const save = () => run(async () => {
      if (revision !== expectedRevision) throw new Error("Cloud version changed in this tab. Review it before saving.");
      const plan = JSON.parse(snapshot);
      if (!globalThis.PlannerMath.validState(plan)) throw new Error("Local plan is invalid. Export a backup before continuing.");
      if (new Blob([snapshot]).size > 5 * 1024 * 1024) throw new Error("Plan exceeds the 5 MB cloud limit. Keep a JSON backup.");
      status("Saving to cloud…");
      const { data, error } = await client.rpc("weekwell_save_plan", {
        p_plan: plan, p_expected_revision: expectedRevision
      });
      if (error?.code === "40001") {
        revision = null;
        throw new Error("A newer cloud plan exists. Export your local backup, then load the latest cloud plan before saving. Nothing was overwritten.");
      }
      checkError(error);
      if (!Array.isArray(data) || data.length !== 1 || !Number.isSafeInteger(data[0].revision) ||
        data[0].revision !== expectedRevision + 1) {
        revision = null;
        throw new Error("Cloud save could not be confirmed. Load the cloud plan to check it before saving again.");
      }
      revision = data[0].revision;
      cloudPlan = plan;
      savedSnapshot = snapshot;
      status(globalThis.WeekwellPlanner.snapshot() === snapshot ?
        `Saved to cloud. Revision ${revision}.` : "The captured plan was saved. Newer local changes still need saving.");
    });
    if (cloudPlan && JSON.stringify(cloudPlan) !== snapshot && savedSnapshot === null) {
      globalThis.WeekwellPlanner.confirm("Replace the cloud plan?",
        "You have not loaded this cloud plan. Save this device's entire plan instead? Existing cloud weeks will be replaced. Back up or load the cloud plan first if you need to keep it.",
        "Replace cloud plan", save);
    } else save();
  });

  $("cloud-signout").addEventListener("click", () => run(async () => {
    const { error } = await client.auth.signOut({ scope: "local" });
    checkError(error);
  }));
  document.addEventListener("weekwell:change", () => {
    if (signedIn && !busy) status("Local plan changed. Click Save to cloud when ready.");
  });
  updateControls();
})();
