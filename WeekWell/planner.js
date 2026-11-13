(() => {
  "use strict";
  const M = globalThis.PlannerMath;
  const $ = id => document.getElementById(id);
  const STORAGE_KEY = "weekwell.planner.v1";
  const escape = value => String(value).replace(/[&<>"']/g, char =>
    ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[char]);
  const hours = mins => new Intl.NumberFormat(undefined, { maximumFractionDigits: 2 }).format(mins / 60);
  const duration = mins => {
    const h = Math.floor(mins / 60);
    const m = Math.round(mins % 60);
    return [h ? `${h}h` : "", m ? `${m}m` : ""].filter(Boolean).join(" ") || "0h";
  };
  const formatDate = (date, options) => date.toLocaleDateString("en-GB", options);
  const emptyWeek = () => ({ visits: [], breaks: {} });
  let protectedStorage = false;
  let state = { version: 1, settings: { ...M.DEFAULT_SETTINGS }, customerTargets: [], weeks: {} };
  let currentWeek = M.mondayKey(new Date());
  let editingId = null;
  let editingCustomerKey = null;
  let breakDay = 0;
  let confirmAction = null;

  function storageWarning(message, recoverable = false) {
    const warning = $("storage-warning");
    warning.textContent = message;
    if (recoverable) {
      const button = document.createElement("button");
      button.className = "text-button";
      button.textContent = "Replace unreadable saved data";
      button.addEventListener("click", () => confirm(
        "Replace saved data?",
        "Your unreadable saved data will be replaced with the plan currently on screen. This cannot be undone.",
        "Replace saved data",
        () => { protectedStorage = false; persist(); }
      ));
      warning.append(button);
    }
    warning.hidden = false;
    $("save-status").textContent = "Changes not saved";
  }

  function load() {
    let raw;
    try {
      raw = localStorage.getItem(STORAGE_KEY);
    } catch (error) {
      console.error("Weekwell could not read browser storage.", error);
      storageWarning("Browser storage is unavailable. You can plan here, but changes will be lost when you close or reload this page.");
      return;
    }
    if (raw === null) return;
    let saved;
    try {
      saved = JSON.parse(raw);
    } catch (error) {
      console.error("Weekwell saved data is unreadable.", error);
      protectedStorage = true;
      storageWarning("Saved plans could not be read. They have not been overwritten. New edits are temporary until you choose to replace the saved data.", true);
      return;
    }
    if (!M.validState(saved)) {
      console.error("Weekwell saved data failed validation.");
      protectedStorage = true;
      storageWarning("Saved plans are in an unsupported or invalid format. They have not been overwritten. New edits are temporary until you choose to replace the saved data.", true);
      return;
    }
    state = saved;
    state.customerTargets ??= [];
  }

  function persist() {
    if (protectedStorage) return;
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
      $("storage-warning").hidden = true;
      $("save-status").textContent = "Saved on this device";
    } catch (error) {
      console.error("Weekwell could not save the plan.", error);
      storageWarning("Your latest changes could not be saved to this browser (storage may be blocked or full). Keep this page open to retain them and enable browser storage before editing again.");
    }
  }

  function week() {
    return state.weeks[currentWeek] ?? emptyWeek();
  }

  function mutableWeek() {
    state.weeks[currentWeek] ??= emptyWeek();
    return state.weeks[currentWeek];
  }

  function announce(message) {
    $("announcement").textContent = message;
  }

  function commit(message) {
    persist();
    render();
    announce(message);
    document.dispatchEvent(new Event("weekwell:change"));
  }

  function customerTone(customer) {
    return [...M.customerKey(customer)].reduce((hash, char) => (hash * 31 + char.charCodeAt(0)) >>> 0, 0) % 4;
  }

  function dateAt(day) {
    const date = M.fromKey(currentWeek);
    date.setDate(date.getDate() + day);
    return date;
  }

  function render() {
    const plan = week();
    const stats = M.calculate(plan, state.settings);
    const start = dateAt(0);
    const end = dateAt(6);
    $("week-label").textContent = `${formatDate(start, { day: "numeric", month: "short" })} – ${formatDate(end, { day: "numeric", month: "short", year: "numeric" })}`;
    $("target-label").textContent = `${hours(stats.target)}h weekly goal`;
    $("planned-hours").textContent = hours(stats.total);
    $("planned-goal").textContent = `/ ${hours(stats.target)}h goal`;
    $("planned-card").classList.toggle("goal-exceeded", stats.overtime > 0);
    $("week-progress").style.width = `${Math.min(100, stats.total / stats.target * 100)}%`;
    $("week-progress-track").setAttribute("aria-valuemax", stats.target / 60);
    $("week-progress-track").setAttribute("aria-valuenow", Math.min(stats.total, stats.target) / 60);
    $("week-progress-track").setAttribute("aria-valuetext",
      `${hours(stats.total)} of ${hours(stats.target)} hours${stats.overtime > 0 ? `, ${duration(stats.overtime)} above goal` : ""}`);
    $("planned-caption").textContent = stats.total === 0 ? "A fresh week. Make it yours." :
      `${Math.round(stats.total / stats.target * 100)}% of your goal · ${duration(stats.breaks)} unpaid breaks`;
    $("remaining-hours").textContent = hours(stats.overtime || stats.remaining);
    $("remaining-label").textContent = stats.overtime > 0 ? "ABOVE YOUR GOAL" :
      stats.remaining === 0 ? "WEEKLY GOAL REACHED" : "LEFT TO YOUR GOAL";
    $("remaining-card").classList.toggle("goal-covered", stats.remaining === 0);
    $("remaining-caption").textContent = stats.overtime > 0 ?
      `${duration(stats.overtime)} above your weekly goal. Nicely planned.` :
      stats.remaining === 0 ? "Weekly goal covered. Your time, your choice." : "Across the week, at your own pace.";
    $("freed-hours").textContent = hours(stats.fridayFreed);
    $("freed-caption").textContent = stats.fridayFreed > 0 ?
      `${duration(stats.fridayFreed)} less needed on Friday, thanks to Mon–Thu.` :
      "Plan extra hours Mon–Thu to open up Friday.";
    $("freedom-tag").textContent = stats.fridayFreed >= stats.dailyShare ? "Friday goal covered" : "Your breathing room";

    $("day-grid").innerHTML = stats.days.map((day, index) => {
      const date = dateAt(index);
      const isToday = M.dateKey(date) === M.dateKey(new Date());
      const isFriday = index === 4;
      const extra = index < 4 ? Math.max(0, day.net - stats.dailyShare) : 0;
      let note = index < 5 ? (day.net > 0 ? `${duration(Math.max(0, stats.dailyShare - day.net))} below daily share` : "Nothing planned yet") : "Optional extra hours";
      if (day.net === stats.dailyShare && index < 5) note = "Daily share covered";
      if (extra > 0) note = `↗ ${duration(extra)} toward a lighter Friday`;
      if (isFriday && stats.fridayFreed > 0) note = "A little space, earned earlier";
      const visits = day.visits.map(visit => `
        <button class="visit-block tone-${customerTone(visit.customer)}" data-edit="${escape(visit.id)}" aria-label="Edit ${escape(visit.customer)}, ${visit.start} to ${visit.end}, ${day.name}">
          <span class="visit-customer">${escape(visit.customer)}</span>
          <span class="visit-time">${visit.start} – ${visit.end}</span>
          <span class="visit-duration">${duration(M.minutes(visit.end) - M.minutes(visit.start))} ${visit.extra ? "extra billed" : "on location"}</span>
          ${visit.extra ? '<span class="extra-badge">＋ Extra billing</span>' : ""}
        </button>`).join("");
      return `<article class="day-card${index > 4 ? " weekend" : ""}${isToday ? " today" : ""}" aria-label="${day.name}">
        <div class="day-header"><span class="day-name">${day.name}</span><span class="day-date"${isToday ? ' aria-label="Today"' : ""}>${date.getDate()}</span></div>
        <div class="day-total">${hours(day.net)}<span>h</span></div>
        <div class="day-share">${index < 5 ? `/ ${hours(stats.dailyShare)}h daily share` : "outside the five-day goal"}</div>
        <div class="day-bar"><div class="${extra > 0 ? "ahead" : ""}" style="width:${Math.min(100, day.net / stats.dailyShare * 100)}%"></div></div>
        ${visits ? `<div class="visits">${visits}</div>` : `<div class="empty-day">${index > 4 ? "A little room<br>for whatever comes." : "An open day.<br>Start with a visit."}</div>`}
        ${isFriday && stats.fridayFreed > 0 ? `<div class="freed-slot"><strong>✧ ${duration(stats.fridayFreed)} freed up</strong><span>Less needed for your goal.<br>Not a specific clock-time slot.</span></div>` : ""}
        <div class="day-footer">
          <button class="break-button" data-break="${index}" aria-label="Edit ${day.name} unpaid break">◷ ${day.gross > 0 ? day.deduction : day.breakMinutes} min break${Object.hasOwn(plan.breaks, index) ? " · custom" : ""}${day.breakCustomer ? ` · ${escape(day.breakCustomer)}` : " · regular work only"}</button>
          <span class="day-note">${note}</span>
          <button class="add-visit" data-add="${index}" aria-label="Add visit on ${day.name}">＋ Add visit</button>
        </div>
      </article>`;
    }).join("");

    const customers = M.customerSummary(plan, state.settings, state.customerTargets);
    $("total-billed-hours").textContent = `${hours(stats.total)}h`;
    $("expected-hours").textContent = `${hours(stats.regularTotal)}h`;
    const priorities = customers.filter(customer => customer.target !== null && customer.minutes < customer.target)
      .sort((a, b) => (b.target - b.minutes) - (a.target - a.minutes) || a.name.localeCompare(b.name));
    $("customer-hours-left").textContent = duration(priorities.reduce((sum, customer) => sum + customer.target - customer.minutes, 0));
    $("customer-priorities").innerHTML = priorities.length ? `<ol class="priority-list">${priorities.map(customer =>
      `<li><span>${escape(customer.name)}</span><strong>${duration(customer.target - customer.minutes)} left</strong></li>`
    ).join("")}</ol>` : `<p class="customer-empty">${state.customerTargets.length ?
      "All customer targets covered. Nicely planned!" : "Add customer targets to see who needs your time next."}</p>`;
    $("customer-breakdown").innerHTML = customers.length ? customers.map(customer => {
      const hasTarget = customer.target !== null;
      const remaining = hasTarget ? Math.max(0, customer.target - customer.minutes) : 0;
      const met = hasTarget && remaining === 0;
      const status = !hasTarget ? "No weekly target" : remaining > 0 ? `${duration(remaining)} still needed` :
        customer.minutes > customer.target ? `${duration(customer.minutes - customer.target)} above target` : "Target reached";
      return `<div class="customer-goal${met ? " goal-met" : ""}" data-customer="${escape(customer.name)}">
        <div class="customer-row"><i class="customer-dot tone-${customerTone(customer.name)}"></i><span class="customer-name">${escape(customer.name)}</span><strong>${hours(customer.minutes)}h${hasTarget ? ` <small>/ ${hours(customer.target)}h</small>` : ""}</strong></div>
        ${hasTarget ? `<div class="customer-progress" role="progressbar" aria-label="${escape(customer.name)} weekly target" aria-valuemin="0" aria-valuemax="${customer.target / 60}" aria-valuenow="${Math.min(customer.minutes, customer.target) / 60}" aria-valuetext="${escape(`${hours(customer.minutes)} of ${hours(customer.target)} hours. ${status}`)}"><div style="width:${Math.min(100, customer.minutes / customer.target * 100)}%"></div></div>` : ""}
        <div class="customer-goal-footer"><span>${met ? "✓ " : ""}${status}</span><button class="text-button" data-target="${escape(customer.name)}" aria-label="${hasTarget ? "Edit" : "Set"} ${escape(customer.name)} weekly target">${hasTarget ? "Edit target" : "Set target"}</button></div>
      </div>`;
    }).join("") : '<p class="customer-empty">Add a customer target or plan a visit to start tracking their week.</p>';
  }

  function defaultTimes(day) {
    const visits = week().visits.filter(visit => visit.day === day);
    const latest = visits.reduce((end, visit) => Math.max(end, M.minutes(visit.end)), 0);
    const rounded = Math.ceil(latest / 30) * 30;
    const start = latest && rounded < 1410 ? rounded : 480;
    const end = Math.min(1410, start + (latest ? 120 : 480));
    const time = mins => `${String(Math.floor(mins / 60)).padStart(2, "0")}:${String(mins % 60).padStart(2, "0")}`;
    setTime("start", time(start));
    setTime("end", time(end));
  }

  function setTime(endpoint, time) {
    const [hour, minute] = time.split(":");
    const hourSelect = $(`visit-${endpoint}-hour`);
    const minuteSelect = $(`visit-${endpoint}-minute`);
    hourSelect.innerHTML = Array.from({ length: 24 }, (_, hour) => {
      const value = String(hour).padStart(2, "0");
      return `<option value="${value}">${value}</option>`;
    }).join("");
    const minutes = [...new Set(["00", "30", minute])].sort();
    minuteSelect.innerHTML = minutes.map(value =>
      `<option value="${value}">${value}${value !== "00" && value !== "30" ? " (saved)" : ""}</option>`
    ).join("");
    hourSelect.value = hour;
    minuteSelect.value = minute;
  }

  function selectedTime(endpoint) {
    return `${$(`visit-${endpoint}-hour`).value}:${$(`visit-${endpoint}-minute`).value}`;
  }

  function openVisit(day, id = null) {
    editingId = id;
    const existing = id ? week().visits.find(visit => visit.id === id) : null;
    $("visit-form").reset();
    $("visit-error").hidden = true;
    $("visit-dialog-title").textContent = existing ? "Edit customer visit" : "Plan a customer visit";
    $("delete-visit").hidden = !existing;
    $("visit-day").innerHTML = M.DAYS.map((name, index) =>
      `<option value="${index}">${name}, ${formatDate(dateAt(index), { day: "numeric", month: "short" })}</option>`
    ).join("");
    $("visit-day").value = existing ? existing.day : day;
    $("visit-customer").value = existing?.customer ?? "";
    $("visit-extra").checked = existing?.extra ?? false;
    if (existing) {
      setTime("start", existing.start);
      setTime("end", existing.end);
    } else {
      defaultTimes(day);
    }
    const names = new Set([...state.customerTargets.map(target => target.customer),
      ...Object.values(state.weeks).flatMap(saved => saved.visits.map(visit => visit.customer))]);
    $("customer-suggestions").innerHTML = [...names].sort().map(name => `<option value="${escape(name)}"></option>`).join("");
    $("visit-dialog").showModal();
    $("visit-customer").focus();
  }

  function openCustomer(name = null) {
    const target = state.customerTargets.find(target => M.customerKey(target.customer) === M.customerKey(name ?? ""));
    editingCustomerKey = target ? M.customerKey(target.customer) : null;
    $("customer-form").reset();
    $("customer-error").hidden = true;
    $("customer-title").textContent = target ? "Edit customer target" : "Add customer target";
    $("target-customer").value = target?.customer ?? name ?? "";
    $("target-customer").readOnly = name !== null;
    $("customer-target-hours").value = target?.target ?? "";
    $("remove-customer-target").hidden = !target;
    $("customer-dialog").showModal();
    (name ? $("customer-target-hours") : $("target-customer")).focus();
  }

  function confirm(title, message, actionLabel, action) {
    $("confirm-title").textContent = title;
    $("confirm-message").textContent = message;
    $("confirm-action").textContent = actionLabel;
    confirmAction = action;
    $("confirm-dialog").showModal();
    $("confirm-dialog").querySelector(".close-dialog").focus();
  }

  function changeWeek(offset) {
    const date = dateAt(offset * 7);
    currentWeek = M.mondayKey(date);
    render();
    announce(`Showing ${$("week-label").textContent}`);
  }

  $("day-grid").addEventListener("click", event => {
    const add = event.target.closest("[data-add]");
    const edit = event.target.closest("[data-edit]");
    const breakButton = event.target.closest("[data-break]");
    if (add) openVisit(Number(add.dataset.add));
    if (edit) openVisit(0, edit.dataset.edit);
    if (breakButton) {
      breakDay = Number(breakButton.dataset.break);
      $("break-title").textContent = `${M.DAYS[breakDay]}'s unpaid break`;
      $("day-break").value = week().breaks[breakDay] ?? (breakDay < 5 ? state.settings.breakMinutes : 0);
      const day = M.calculate(week(), state.settings).days[breakDay];
      $("break-customer").innerHTML = '<option value="">Automatic · longest regular assignment</option>' +
        day.regularCustomers.map(customer => `<option value="${escape(customer.name)}">${escape(customer.name)}</option>`).join("");
      const savedOwner = week().breakCustomers?.[breakDay];
      $("break-customer").value = day.regularCustomers.find(customer =>
        savedOwner && M.customerKey(customer.name) === M.customerKey(savedOwner))?.name ?? "";
      $("break-customer").disabled = day.regularCustomers.length === 0;
      $("break-owner-help").textContent = day.breakCustomer ?
        `Currently deducted from ${day.breakCustomer}. Automatic chooses the customer with the most regular hours; ties go to the earliest visit. If that customer is removed, automatic selection resumes.` :
        "No regular assignments on this day. No break is deducted from extra billed assignments.";
      $("break-dialog").showModal();
    }
  });

  $("visit-day").addEventListener("change", () => {
    if (!editingId) defaultTimes(Number($("visit-day").value));
  });

  $("visit-form").addEventListener("submit", event => {
    event.preventDefault();
    const visit = {
      id: editingId ?? crypto.randomUUID(),
      customer: $("visit-customer").value.trim(),
      day: Number($("visit-day").value),
      start: selectedTime("start"),
      end: selectedTime("end"),
      extra: $("visit-extra").checked
    };
    const error = M.visitError(visit, week().visits, editingId);
    if (error) {
      $("visit-error").textContent = error;
      $("visit-error").hidden = false;
      return;
    }
    const plan = mutableWeek();
    if (editingId) plan.visits = plan.visits.map(existing => existing.id === editingId ? visit : existing);
    else plan.visits.push(visit);
    $("visit-dialog").close();
    commit(`${visit.customer} visit saved on ${M.DAYS[visit.day]}.`);
  });

  $("delete-visit").addEventListener("click", () => {
    mutableWeek().visits = week().visits.filter(visit => visit.id !== editingId);
    $("visit-dialog").close();
    commit("Visit deleted.");
  });

  $("break-form").addEventListener("submit", event => {
    event.preventDefault();
    mutableWeek().breaks[breakDay] = Number($("day-break").value);
    const owners = mutableWeek().breakCustomers ??= {};
    if ($("break-customer").value) owners[breakDay] = $("break-customer").value;
    else delete owners[breakDay];
    $("break-dialog").close();
    commit("Daily break updated.");
  });
  $("reset-break").addEventListener("click", () => {
    delete mutableWeek().breaks[breakDay];
    if (week().breakCustomers) delete week().breakCustomers[breakDay];
    $("break-dialog").close();
    commit("Daily break restored to default.");
  });

  $("add-customer").addEventListener("click", () => openCustomer());
  $("customer-breakdown").addEventListener("click", event => {
    const button = event.target.closest("[data-target]");
    if (button) openCustomer(button.dataset.target);
  });
  $("customer-form").addEventListener("submit", event => {
    event.preventDefault();
    const customer = $("target-customer").value.trim();
    const key = M.customerKey(customer);
    const duplicate = state.customerTargets.some(target =>
      M.customerKey(target.customer) === key && key !== editingCustomerKey);
    if (!customer || duplicate) {
      $("customer-error").textContent = duplicate ?
        "This customer already has a target. Edit their existing target instead." : "Enter a customer or location.";
      $("customer-error").hidden = false;
      return;
    }
    const entry = { customer, target: Number($("customer-target-hours").value) };
    if (editingCustomerKey) state.customerTargets = state.customerTargets.map(target =>
      M.customerKey(target.customer) === editingCustomerKey ? entry : target);
    else state.customerTargets.push(entry);
    $("customer-dialog").close();
    commit(`${customer}'s weekly target saved.`);
  });
  $("remove-customer-target").addEventListener("click", () => {
    state.customerTargets = state.customerTargets.filter(target => M.customerKey(target.customer) !== editingCustomerKey);
    $("customer-dialog").close();
    commit("Recurring target removed. Planned visits are unchanged.");
  });

  $("settings-button").addEventListener("click", () => {
    $("setting-target").value = state.settings.target;
    $("setting-break").value = state.settings.breakMinutes;
    $("settings-dialog").showModal();
  });
  $("settings-form").addEventListener("submit", event => {
    event.preventDefault();
    state.settings = {
      target: Number($("setting-target").value),
      breakMinutes: Number($("setting-break").value)
    };
    $("settings-dialog").close();
    commit("Preferences saved. All weekly totals updated.");
  });

  $("confirm-form").addEventListener("submit", event => {
    event.preventDefault();
    $("confirm-dialog").close();
    confirmAction?.();
    confirmAction = null;
  });
  document.querySelectorAll(".close-dialog").forEach(button => button.addEventListener("click", () => button.closest("dialog").close()));
  $("previous-week").addEventListener("click", () => changeWeek(-1));
  $("next-week").addEventListener("click", () => changeWeek(1));
  $("this-week").addEventListener("click", () => { currentWeek = M.mondayKey(new Date()); render(); });
  $("add-visit-top").addEventListener("click", () => openVisit(currentWeek === M.mondayKey(new Date()) ? (new Date().getDay() + 6) % 7 : 0));
  $("clear-week").addEventListener("click", () => confirm(
    "Clear this week's plan?", "All visits and custom breaks in this week will be removed. Other weeks and preferences will stay unchanged.",
    "Clear week", () => { delete state.weeks[currentWeek]; commit("Week cleared."); }
  ));
  $("example-button").addEventListener("click", () => {
    const applyExample = () => {
      state.weeks[currentWeek] = {
        visits: [
          { id: crypto.randomUUID(), customer: "Northside office", day: 0, start: "08:00", end: "16:00" },
          { id: crypto.randomUUID(), customer: "Harbor studio", day: 1, start: "07:30", end: "17:30" },
          { id: crypto.randomUUID(), customer: "Northside office", day: 2, start: "07:30", end: "17:30" },
          { id: crypto.randomUUID(), customer: "Oak & Co.", day: 3, start: "08:00", end: "16:00" },
          { id: crypto.randomUUID(), customer: "Oak & Co.", day: 4, start: "08:00", end: "12:15" }
        ],
        breaks: { 0: 30, 1: 30, 2: 30, 3: 30, 4: 30 }
      };
      commit("Example loaded: 7.5, 9.5, 9.5, 7.5 and 3.75 paid hours. Weekly goal unchanged.");
    };
    if (week().visits.length || Object.keys(week().breaks).length) {
      confirm("Try your example?", "This replaces the selected week's plan with your example: 7.5h, 9.5h, 9.5h, 7.5h, and 3.75h after daily 30-minute breaks. Your weekly goal stays unchanged.", "Load example", applyExample);
    } else applyExample();
  });

  function exportStatus(message, isError = false) {
    $("export-status").textContent = message;
    $("export-status").className = isError ? "form-error" : "field-help";
  }

  $("export-button").addEventListener("click", () => {
    exportStatus("");
    $("restore-file").value = "";
    $("export-dialog").showModal();
  });

  $("download-backup").addEventListener("click", () => {
    const blob = new Blob([JSON.stringify(state, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `weekwell-backup-${M.dateKey(new Date())}.json`;
    document.body.append(link);
    link.click();
    link.remove();
    setTimeout(() => URL.revokeObjectURL(url), 60000);
    exportStatus("Backup download requested. Keep the file safe to restore on this or another device.");
  });

  $("restore-file").addEventListener("change", async () => {
    const file = $("restore-file").files[0];
    if (!file) return;
    if (protectedStorage) {
      exportStatus("Resolve the saved-data warning or reload after another tab's changes before restoring.", true);
      $("restore-file").value = "";
      return;
    }
    if (file.size > 5 * 1024 * 1024) {
      exportStatus("This file is too large. Choose a Weekwell JSON backup smaller than 5 MB.", true);
      $("restore-file").value = "";
      return;
    }
    $("restore-file").disabled = true;
    let restored;
    try {
      restored = JSON.parse(await file.text());
    } catch (error) {
      console.error("Weekwell could not read the backup.", error);
      exportStatus("Could not read this JSON backup. Your current plans have not changed.", true);
    } finally {
      $("restore-file").disabled = false;
      $("restore-file").value = "";
    }
    if (restored === undefined) return;
    if (!M.validState(restored)) {
      exportStatus("This is not a valid supported Weekwell backup. Your current plans have not changed.", true);
      return;
    }
    restored.customerTargets ??= [];
    confirm("Replace all saved plans?",
      `Restore ${Object.keys(restored.weeks).length} weeks and ${restored.customerTargets.length} customer targets from this backup? All current weeks and preferences will be replaced. Download a backup first if you need to keep them.`,
      "Restore backup", () => {
        if (protectedStorage) {
          exportStatus("Saved plans changed while you were restoring. Reload before trying again.", true);
          return;
        }
        try {
          localStorage.setItem(STORAGE_KEY, JSON.stringify(restored));
        } catch (error) {
          console.error("Weekwell could not save the restored backup.", error);
          exportStatus("Restore could not be saved (storage may be blocked or full). Your current plans have not changed.", true);
          return;
        }
        state = restored;
        $("storage-warning").hidden = true;
        $("save-status").textContent = "Saved on this device";
        render();
        exportStatus("Backup restored and saved on this device.");
        announce("All weeks and preferences restored from backup.");
        document.dispatchEvent(new Event("weekwell:change"));
      });
  });

  globalThis.WeekwellPlanner = Object.freeze({
    snapshot: () => JSON.stringify(state),
    confirm,
    replace(plan, expectedSnapshot) {
      if (protectedStorage) throw new Error("Resolve the saved-data warning before loading cloud plans.");
      if (JSON.stringify(state) !== expectedSnapshot) throw new Error("Local plan changed while loading. Try loading again.");
      if (!M.validState(plan)) throw new Error("Unsupported cloud plan. Local plans have not changed.");
      const restored = structuredClone(plan);
      restored.customerTargets ??= [];
      try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(restored));
      } catch (error) {
        console.error("Weekwell could not save the loaded cloud plan locally.", error);
        throw new Error("Cloud plan could not be saved locally. Local plans are unchanged.");
      }
      state = restored;
      $("storage-warning").hidden = true;
      $("save-status").textContent = "Saved on this device";
      render();
      announce("Cloud plan loaded and saved on this device.");
      document.dispatchEvent(new Event("weekwell:change"));
    }
  });

  function renderReport() {
    const stats = M.calculate(week(), state.settings);
    const customers = M.customerSummary(week(), state.settings, state.customerTargets);
    const rows = stats.days.flatMap((day, index) => day.visits.map(visit =>
      `<tr><td>${day.name}, ${M.dateKey(dateAt(index))}</td><td>${escape(visit.customer)}</td><td>${visit.start}</td><td>${visit.end}</td><td>${visit.extra ? "Extra billed" : "Regular"}</td><td>${hours(M.minutes(visit.end) - M.minutes(visit.start))}h</td></tr>`
    )).join("");
    $("printable-report").innerHTML = `
      <h1>Weekwell · Weekly planning record</h1>
      <p><strong>${escape($("week-label").textContent)}</strong><br>Generated ${escape(new Date().toLocaleString("en-GB", { hour12: false }))}</p>
      <p>Entered plan only — not independently verified proof of work. Extra assignments may overlap; totals are billed hours, not unique elapsed working time.</p>
      <p><strong>Total billed after breaks: ${hours(stats.total)}h</strong> · Goal: ${hours(stats.target)}h · Remaining: ${hours(stats.remaining)}h · Above goal: ${hours(stats.overtime)}h<br>Friday goal left: ${hours(stats.fridayLeft)}h · Friday goal time freed: ${hours(stats.fridayFreed)}h (based on Monday–Thursday only)</p>
      <h2>Customer targets and totals</h2>
      <table><thead><tr><th>Customer</th><th>Billed after breaks</th><th>Weekly target</th><th>Progress</th></tr></thead><tbody>${customers.length ? customers.map(customer =>
        `<tr><td>${escape(customer.name)}</td><td>${hours(customer.minutes)}h</td><td>${customer.target === null ? "Not set" : `${hours(customer.target)}h`}</td><td>${customer.target === null ? "No target" : customer.minutes < customer.target ? `${hours(customer.target - customer.minutes)}h still needed` : customer.minutes === customer.target ? "Target reached" : `${hours(customer.minutes - customer.target)}h above target`}</td></tr>`
      ).join("") : '<tr><td colspan="4">No customers planned or targets set.</td></tr>'}</tbody></table>
      <h2>Visits · durations before daily breaks</h2>
      <table><thead><tr><th>Day / date</th><th>Customer</th><th>Start</th><th>End</th><th>Type</th><th>Duration</th></tr></thead><tbody>${rows || '<tr><td colspan="6">No visits planned.</td></tr>'}</tbody></table>
      <h2>Daily totals and actual break deductions</h2>
      <table><thead><tr><th>Day</th><th>Gross billed</th><th>Break deducted</th><th>Main customer</th><th>Net billed</th></tr></thead><tbody>${stats.days.map(day =>
        `<tr><td>${day.name}</td><td>${hours(day.gross)}h</td><td>${day.deduction} min</td><td>${escape(day.breakCustomer ?? "None")}</td><td>${hours(day.net)}h</td></tr>`
      ).join("")}</tbody></table>
      <p>Breaks are deducted only from the main customer's regular hours. Extra billed assignments retain their full duration. Recurring targets and preferences are recorded as configured when this report was generated.</p>`;
  }

  window.addEventListener("beforeprint", renderReport);
  $("print-report").addEventListener("click", () => {
    $("export-dialog").close();
    renderReport();
    window.print();
  });

  window.addEventListener("storage", event => {
    if (event.storageArea === localStorage && (event.key === STORAGE_KEY || event.key === null)) {
      protectedStorage = true;
      storageWarning("Saved plans changed in another tab. Reload this page to load them before making more edits. This tab will not overwrite the newer saved plan.");
    }
  });

  $("today-label").textContent = formatDate(new Date(), { weekday: "short", day: "numeric", month: "short", year: "numeric" });
  load();
  render();
})();
