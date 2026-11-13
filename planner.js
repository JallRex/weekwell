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
    $("week-progress").style.width = `${Math.min(100, stats.total / stats.target * 100)}%`;
    $("planned-caption").textContent = stats.total === 0 ? "A fresh week. Make it yours." :
      `${Math.round(stats.total / stats.target * 100)}% of your goal · ${duration(stats.breaks)} unpaid breaks`;
    $("remaining-hours").textContent = hours(stats.remaining);
    $("remaining-caption").textContent = stats.overtime > 0 ?
      `${duration(stats.overtime)} above your weekly goal. Nicely planned.` :
      stats.remaining === 0 ? "Weekly goal covered. Your time, your choice." : "Across the week, at your own pace.";
    $("freed-hours").textContent = hours(stats.fridayFreed);
    $("freed-caption").textContent = stats.fridayFreed > 0 ?
      `${duration(stats.fridayFreed)} less needed on Friday, thanks to Mon–Thu.` :
      "Plan extra hours Mon–Thu to open up Friday.";
    $("friday-left").textContent = `${hours(stats.fridayLeft)}h`;
    $("forecast-title").textContent = stats.fridayFreed > 0 ?
      `You've made ${duration(stats.fridayFreed)} of breathing room on Friday.` :
      "A lighter Friday starts earlier in the week.";
    $("forecast-caption").textContent = stats.total === 0 ?
      "Your Monday–Thursday hours will show how much of Friday you can free up." :
      `After Mon–Thu, ${duration(stats.fridayLeft)} remains to hit your goal. Friday currently has ${duration(stats.days[4].net)} planned. Includes extra billed hours, not just elapsed time. Weekend hours are excluded from this forecast.`;
    $("freedom-tag").textContent = stats.fridayFreed >= stats.dailyShare ? "Friday goal covered" : "Your breathing room";
    $("break-explainer").textContent = `${state.settings.breakMinutes} min weekday break from the main customer's regular hours only. Extra billed assignments count in full, even when overlapping. No automatic weekend break.`;

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
    const start = latest && latest < 1439 ? latest : 480;
    const end = Math.min(1439, start + (latest ? 120 : 480));
    const time = mins => `${String(Math.floor(mins / 60)).padStart(2, "0")}:${String(mins % 60).padStart(2, "0")}`;
    $("visit-start").value = time(start);
    $("visit-end").value = time(end);
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
      $("visit-start").value = existing.start;
      $("visit-end").value = existing.end;
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
      start: $("visit-start").value,
      end: $("visit-end").value,
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
