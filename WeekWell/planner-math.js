/* Shared by the planner and the browser-based calculation tests. */
(() => {
  "use strict";
  const DAYS = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"];
  const DEFAULT_SETTINGS = Object.freeze({ target: 37.5, breakMinutes: 30 });
  const customerKey = name => name.trim().toLowerCase();

  function minutes(time) {
    if (typeof time !== "string" || !/^([01]\d|2[0-3]):[0-5]\d$/.test(time)) return NaN;
    const [hours, mins] = time.split(":").map(Number);
    return hours * 60 + mins;
  }

  function visitError(visit, visits, ignoreId = null) {
    const start = minutes(visit.start);
    const end = minutes(visit.end);
    if (!visit.customer.trim()) return "Enter a customer or location.";
    if (!Number.isInteger(visit.day) || visit.day < 0 || visit.day > 6) return "Choose a valid day.";
    if (!Number.isFinite(start) || !Number.isFinite(end)) return "Enter valid start and end times.";
    if (end <= start) return "End time must be after start time. Split overnight work into separate days.";
    const overlaps = visits.filter(other => other.id !== ignoreId && other.day === visit.day &&
      start < minutes(other.end) && end > minutes(other.start));
    if (overlaps.some(other => customerKey(other.customer) === customerKey(visit.customer))) {
      return "This overlaps a visit for the same customer. The same customer's time cannot be billed twice.";
    }
    if (overlaps.some(other => !visit.extra && !other.extra)) {
      return "This overlaps another regular visit. Mark the additional work as an extra billed assignment.";
    }
    return "";
  }

  function calculate(week, settings) {
    const days = DAYS.map((name, day) => {
      const visits = week.visits.filter(visit => visit.day === day)
        .sort((a, b) => minutes(a.start) - minutes(b.start));
      const gross = visits.reduce((sum, visit) => sum + minutes(visit.end) - minutes(visit.start), 0);
      const breakMinutes = week.breaks[day] ?? (day < 5 ? settings.breakMinutes : 0);
      const regularCustomers = new Map();
      for (const visit of visits.filter(visit => !visit.extra)) {
        const key = customerKey(visit.customer);
        const customer = regularCustomers.get(key) ?? { name: visit.customer, minutes: 0 };
        customer.minutes += minutes(visit.end) - minutes(visit.start);
        regularCustomers.set(key, customer);
      }
      const automaticCustomer = [...regularCustomers.values()].sort((a, b) => b.minutes - a.minutes)[0];
      const chosenCustomer = week.breakCustomers?.[day];
      const breakCustomer = (chosenCustomer && regularCustomers.get(customerKey(chosenCustomer))) || automaticCustomer;
      const deduction = breakCustomer ? Math.min(breakCustomer.minutes, breakMinutes) : 0;
      return { name, visits, gross, breakMinutes, deduction, net: gross - deduction,
        breakCustomer: breakCustomer?.name ?? null, regularCustomers: [...regularCustomers.values()] };
    });
    const baseTarget = settings.target * 60;
    const dailyShare = baseTarget / 5;
    const timeOff = Object.entries(week.timeOff ?? {}).reduce((sum, [day]) =>
      sum + (Number(day) < 5 ? dailyShare : 0), 0);
    const adjustment = Object.entries(week.timeOff ?? {}).reduce((sum, [day, entry]) =>
      sum + (Number(day) < 5 && entry.reduceGoal ? dailyShare : 0), 0);
    const target = Math.max(0, baseTarget - adjustment);
    const total = days.reduce((sum, day) => sum + day.net, 0);
    const regularTotal = days.reduce((sum, day) => sum +
      day.regularCustomers.reduce((minutes, customer) => minutes + customer.minutes, 0) - day.deduction, 0);
    const early = days.slice(0, 4).reduce((sum, day) => sum + day.net, 0);
    const fridayLeft = Math.max(0, target - early);
    const fridayFreed = Math.min(dailyShare, Math.max(0, dailyShare - fridayLeft));
    return {
      days, total, regularTotal, target, baseTarget, adjustment, timeOff, dailyShare, fridayLeft, fridayFreed,
      remaining: Math.max(0, target - total),
      overtime: Math.max(0, total - target),
      breaks: days.reduce((sum, day) => sum + day.deduction, 0)
    };
  }

  function targetMinutes(target, settings) {
    return target.percent !== undefined ? settings.target * 60 * target.percent / 100 : target.target * 60;
  }

  function activeOn(target, key) {
    return (!target.startDate || key >= target.startDate) && (!target.endDate || key <= target.endDate);
  }

  function customerSummary(week, settings, targets = [], weekKey = null) {
    const customers = new Map(targets.map(target => {
      let activeDays = 5;
      if (weekKey) {
        activeDays = 0;
        const date = fromKey(weekKey);
        for (let day = 0; day < 5; day++) {
          if (activeOn(target, dateKey(date))) activeDays++;
          date.setDate(date.getDate() + 1);
        }
      }
      return [customerKey(target.customer), { name: target.customer,
        target: activeDays ? targetMinutes(target, settings) * activeDays / 5 : null,
        configured: true, minutes: 0, visits: 0 }];
    }));
    for (const day of calculate(week, settings).days) {
      for (const visit of day.visits) {
        const key = customerKey(visit.customer);
        const entry = customers.get(key) ?? { name: visit.customer, target: null, minutes: 0, visits: 0 };
        entry.minutes += minutes(visit.end) - minutes(visit.start);
        entry.visits += 1;
        customers.set(key, entry);
      }
      if (day.deduction) customers.get(customerKey(day.breakCustomer)).minutes -= day.deduction;
    }
    return [...customers.values()].sort((a, b) => b.minutes - a.minutes || a.name.localeCompare(b.name));
  }

  function monthlySummary(state, monthKey) {
    const [year, month] = monthKey.split("-").map(Number);
    const first = new Date(year, month - 1, 1, 12);
    const next = new Date(year, month, 1, 12);
    const customers = new Map((state.customerTargets ?? []).map(target =>
      [customerKey(target.customer), { name: target.customer, target: 0, configured: true, minutes: 0 }]));
    let weekdays = 0;
    let timeOff = 0;
    let adjustment = 0;
    let total = 0;
    let regularTotal = 0;
    for (const date = new Date(first); date < next; date.setDate(date.getDate() + 1)) {
      const key = dateKey(date);
      const day = (date.getDay() + 6) % 7;
      const weekday = day < 5;
      if (weekday) {
        weekdays++;
        for (const target of state.customerTargets ?? []) {
          if (activeOn(target, key)) customers.get(customerKey(target.customer)).target += targetMinutes(target, state.settings) / 5;
        }
      }
      const week = state.weeks[mondayKey(date)];
      if (!week) continue;
      const off = week.timeOff?.[day];
      if (weekday && off) {
        timeOff += state.settings.target * 60 / 5;
        if (off.reduceGoal) adjustment += state.settings.target * 60 / 5;
      }
      const stats = calculate(week, state.settings).days[day];
      total += stats.net;
      regularTotal += stats.regularCustomers.reduce((sum, customer) => sum + customer.minutes, 0) - stats.deduction;
      for (const visit of stats.visits) {
        const customer = customerKey(visit.customer);
        const entry = customers.get(customer) ?? { name: visit.customer, target: null, configured: false, minutes: 0 };
        entry.minutes += minutes(visit.end) - minutes(visit.start);
        customers.set(customer, entry);
      }
      if (stats.deduction) customers.get(customerKey(stats.breakCustomer)).minutes -= stats.deduction;
    }
    const baseTarget = weekdays * state.settings.target * 60 / 5;
    return { weekdays, timeOff, adjustment, baseTarget, target: Math.max(0, baseTarget - adjustment), total, regularTotal,
      customers: [...customers.values()].sort((a, b) =>
        Math.max(0, (b.target ?? 0) - b.minutes) - Math.max(0, (a.target ?? 0) - a.minutes) || a.name.localeCompare(b.name)) };
  }

  function dateKey(date) {
    return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
  }

  function mondayKey(date) {
    const monday = new Date(date.getFullYear(), date.getMonth(), date.getDate(), 12);
    monday.setDate(monday.getDate() - (monday.getDay() + 6) % 7);
    return dateKey(monday);
  }

  function fromKey(key) {
    const [year, month, day] = key.split("-").map(Number);
    return new Date(year, month - 1, day, 12);
  }

  function validDate(key) {
    return typeof key === "string" && /^\d{4}-\d{2}-\d{2}$/.test(key) && dateKey(fromKey(key)) === key;
  }

  function validState(state) {
    if (!state || state.version !== 1 || !state.settings || !state.weeks ||
      typeof state.weeks !== "object" || Array.isArray(state.weeks)) return false;
    const { target, breakMinutes } = state.settings;
    if (!Number.isFinite(target) || target < 0.5 || target > 168 ||
      !Number.isInteger(breakMinutes) || breakMinutes < 0 || breakMinutes > 240) return false;
    if (state.customerTargets !== undefined) {
      if (!Array.isArray(state.customerTargets)) return false;
      const names = new Set();
      if (!state.customerTargets.every(entry => {
        if (!entry || typeof entry.customer !== "string" || !entry.customer.trim() || entry.customer.length > 80 ||
          !Number.isFinite(entry.target) || entry.target <= 0 || entry.target > 168) return false;
        if ((entry.percent !== undefined && (!Number.isFinite(entry.percent) || entry.percent <= 0 || entry.percent > 100)) ||
          (entry.startDate !== undefined && !validDate(entry.startDate)) ||
          (entry.endDate !== undefined && !validDate(entry.endDate)) ||
          (entry.startDate && entry.endDate && entry.startDate > entry.endDate)) return false;
        const key = customerKey(entry.customer);
        if (names.has(key)) return false;
        names.add(key);
        return true;
      })) return false;
    }
    return Object.entries(state.weeks).every(([key, week]) => {
      if (!/^\d{4}-\d{2}-\d{2}$/.test(key) || mondayKey(fromKey(key)) !== key ||
        !week || !Array.isArray(week.visits) || !week.breaks ||
        typeof week.breaks !== "object" || Array.isArray(week.breaks)) return false;
      const ids = new Set();
      const visitsValid = week.visits.every(visit => {
        if (!visit || typeof visit.id !== "string" || !visit.id || ids.has(visit.id) ||
          typeof visit.customer !== "string" || visit.customer.length > 80 ||
          (visit.extra !== undefined && typeof visit.extra !== "boolean") ||
          (visit.description !== undefined && (typeof visit.description !== "string" || visit.description.length > 500))) return false;
        ids.add(visit.id);
        return !visitError(visit, week.visits.filter(other => other !== visit && other &&
          typeof other.customer === "string" && typeof other.start === "string" && typeof other.end === "string"));
      });
      const ownersValid = week.breakCustomers === undefined ||
        (week.breakCustomers && typeof week.breakCustomers === "object" && !Array.isArray(week.breakCustomers) &&
          Object.entries(week.breakCustomers).every(([day, customer]) =>
            /^[0-6]$/.test(day) && typeof customer === "string" && customer.trim() && customer.length <= 80));
      const timeOffValid = week.timeOff === undefined || (week.timeOff && typeof week.timeOff === "object" &&
        !Array.isArray(week.timeOff) && Object.entries(week.timeOff).every(([day, entry]) =>
          /^[0-6]$/.test(day) && entry && ["sick", "holiday", "other"].includes(entry.type) &&
          typeof entry.reduceGoal === "boolean"));
      return Boolean(visitsValid && ownersValid && timeOffValid && Object.entries(week.breaks).every(([day, value]) =>
        /^[0-6]$/.test(day) && Number.isInteger(value) && value >= 0 && value <= 1440));
    });
  }

  globalThis.PlannerMath = Object.freeze({
    DAYS, DEFAULT_SETTINGS, customerKey, minutes, visitError, calculate, customerSummary, monthlySummary,
    targetMinutes, dateKey, mondayKey, fromKey, validState
  });
})();
