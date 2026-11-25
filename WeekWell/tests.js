(() => {
  "use strict";
  const M = globalThis.PlannerMath;
  const settings = { target: 37.5, breakMinutes: 30 };
  const visit = (day, start, end, customer = "Test customer") =>
    ({ id: `${day}-${start}`, day, start, end, customer });
  const calc = (visits, breaks = {}, customSettings = settings) =>
    M.calculate({ visits, breaks }, customSettings);
  const equal = (actual, expected) => {
    if (JSON.stringify(actual) !== JSON.stringify(expected)) {
      throw new Error(`Expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`);
    }
  };
  const tests = [
    ["The user's exact example totals 37.75h and frees 4h of Friday", () => {
      const result = calc([
        visit(0, "08:00", "16:00"), visit(1, "07:30", "17:30"),
        visit(2, "07:30", "17:30"), visit(3, "08:00", "16:00"), visit(4, "08:00", "12:15")
      ]);
      equal(result.days.map(day => day.net), [450, 570, 570, 450, 225, 0, 0]);
      equal([result.total, result.remaining, result.overtime, result.fridayFreed, result.fridayLeft],
        [2265, 0, 15, 240, 210]);
    }],
    ["A daily break is deducted once across multiple customer visits", () => {
      const result = calc([visit(0, "08:00", "12:00", "A"), visit(0, "13:00", "17:00", "B")]);
      equal([result.days[0].gross, result.days[0].net, result.breaks], [480, 450, 30]);
    }],
    ["Empty days never lose time and very short visits cannot create negative paid hours", () => {
      equal(calc([]).total, 0);
      const result = calc([visit(1, "08:00", "08:15")]);
      equal([result.total, result.breaks, result.remaining], [0, 15, 2250]);
    }],
    ["Weekends count toward the goal without an automatic break or changing the Friday forecast", () => {
      const result = calc([visit(5, "08:00", "12:00"), visit(6, "10:00", "12:00")]);
      equal([result.total, result.breaks, result.remaining, result.fridayLeft, result.fridayFreed],
        [360, 0, 1890, 2250, 0]);
    }],
    ["Custom weekday and weekend breaks override defaults, including zero", () => {
      const result = calc([visit(0, "08:00", "16:00"), visit(5, "08:00", "12:00")], { 0: 0, 5: 45 });
      equal([result.days[0].net, result.days[5].net, result.breaks], [480, 195, 45]);
    }],
    ["Friday freedom is capped at one daily share, even when the goal is exceeded by Thursday", () => {
      const result = calc([0, 1, 2, 3].map(day => visit(day, "06:00", "18:00")));
      equal([result.fridayFreed, result.fridayLeft], [450, 0]);
    }],
    ["An early shortfall does not report misleading Friday freedom", () => {
      const result = calc([visit(0, "08:00", "18:00")]);
      equal([result.fridayFreed, result.fridayLeft], [0, 1680]);
    }],
    ["Changing the weekly target and default break recalculates the forecast", () => {
      const result = calc([0, 1, 2, 3].map(day => visit(day, "08:00", "16:00")), {}, { target: 40, breakMinutes: 0 });
      equal([result.total, result.dailyShare, result.fridayFreed, result.fridayLeft], [1920, 480, 0, 480]);
    }],
    ["Adjacent visits are allowed but unmarked overlaps are rejected", () => {
      const existing = [visit(0, "09:00", "12:00")];
      equal(M.visitError(visit(0, "12:00", "13:00"), existing), "");
      for (const [start, end] of [["08:00", "10:00"], ["10:00", "11:00"], ["08:00", "13:00"]]) {
        equal(M.visitError(visit(0, start, end), existing).includes("overlaps"), true);
      }
      equal(M.visitError(visit(1, "09:00", "12:00"), existing), "");
      equal(M.visitError(existing[0], existing, existing[0].id), "");
    }],
    ["Extra assignments may overlap different customers, but never the same customer", () => {
      const regular = visit(0, "08:00", "16:00", "CustomerX");
      const extra = { ...visit(0, "10:00", "11:00", "CustA"), extra: true };
      equal(M.visitError(extra, [regular]), "");
      equal(M.visitError(regular, [extra]), "");
      equal(M.visitError({ ...extra, extra: false }, [regular]).includes("extra billed"), true);
      equal(M.visitError({ ...extra, customer: " customerx " }, [regular]).includes("same customer"), true);
      equal(M.visitError(extra, [regular, extra], extra.id), "");
    }],
    ["Overlapping extra billing counts toward both targets, with the break only on the main customer", () => {
      const plan = { visits: [visit(0, "08:00", "16:00", "CustomerX"),
        { ...visit(0, "10:00", "11:00", "CustA"), extra: true }], breaks: {} };
      const result = M.calculate(plan, settings);
      equal([result.total, result.breaks, result.days[0].breakCustomer], [510, 30, "CustomerX"]);
      equal(result.regularTotal, 450);
      const customers = M.customerSummary(plan, settings, [
        { customer: "CustomerX", target: 18.5 }, { customer: "CustA", target: 5 }
      ]);
      equal(customers.map(customer => [customer.name, customer.minutes, customer.target]),
        [["CustomerX", 450, 1110], ["CustA", 60, 300]]);
      equal(customers.reduce((sum, customer) => sum + customer.minutes, 0), result.total);
    }],
    ["Extra-only days never lose break time, even with a custom break", () => {
      const extra = { ...visit(0, "08:00", "09:00", "Extra"), extra: true };
      const result = calc([extra], { 0: 90 });
      equal([result.total, result.breaks, result.days[0].breakCustomer], [60, 0, null]);
      equal(result.regularTotal, 0);
    }],
    ["Main customer defaults to most regular hours and may be explicitly overridden", () => {
      const plan = { visits: [visit(0, "08:00", "10:00", "A"), visit(0, "10:00", "16:00", "B"),
        { ...visit(0, "10:00", "11:00", "A"), extra: true }], breaks: { 0: 90 } };
      equal(M.calculate(plan, settings).days[0].breakCustomer, "B");
      plan.breakCustomers = { 0: "a" };
      const customers = M.customerSummary(plan, settings);
      equal(customers.map(customer => [customer.name, customer.minutes]), [["B", 360], ["A", 90]]);
      plan.breaks[0] = 240;
      equal(M.calculate(plan, settings).breaks, 120);
      equal(M.calculate(plan, settings).regularTotal, 360);
      equal(M.customerSummary(plan, settings).find(customer => customer.name === "A").minutes, 60);
    }],
    ["Customer targets recur on empty weeks and match names case-insensitively", () => {
      const targets = [{ customer: "CustomerX", target: 18.5 }, { customer: "CustA", target: 5 }];
      const empty = M.customerSummary({ visits: [], breaks: {} }, settings, targets);
      equal(empty.length, 2);
      equal(empty.every(customer => customer.minutes === 0 && customer.target > 0), true);
      const customers = M.customerSummary({
        visits: [visit(0, "08:00", "16:00", " customerx "), visit(1, "08:00", "16:00", "CUSTOMERX")], breaks: {}
      }, settings, targets);
      equal(customers.map(customer => [customer.name, customer.minutes]), [["CustomerX", 900], ["CustA", 0]]);
    }],
    ["Monthly targets use active weekdays and project dates, including partial boundary weeks", () => {
      const state = { settings, weeks: {}, customerTargets: [
        { customer: "Full month", target: 7.5, percent: 20 },
        { customer: "Three weeks", target: 7.5, percent: 20, startDate: "2026-10-05", endDate: "2026-10-23" },
        { customer: "Not active", target: 10, startDate: "2026-11-01" }
      ] };
      const october = M.monthlySummary(state, "2026-10");
      equal(october.weekdays, 22);
      equal(october.customers.map(customer => [customer.name, customer.target]),
        [["Full month", 1980], ["Three weeks", 1350], ["Not active", 0]]);
      equal(M.customerSummary({ visits: [], breaks: {} }, settings, state.customerTargets, "2026-10-19")
        .find(customer => customer.name === "Three weeks").target, 450);
      equal(M.customerSummary({ visits: [], breaks: {} }, settings, state.customerTargets, "2026-10-26")
        .find(customer => customer.name === "Three weeks").target, null);
      state.settings = { ...settings, target: 40 };
      equal(M.monthlySummary(state, "2026-10").customers.find(customer => customer.name === "Full month").target, 2112);
      equal(M.monthlySummary(state, "2028-02").weekdays, 21);
    }],
    ["Monthly billed totals split weeks at calendar boundaries and deduct breaks from their owner", () => {
      const state = { settings, customerTargets: [{ customer: "A", target: 7.5 }], weeks: {
        "2026-11-30": { visits: [visit(0, "08:00", "16:00", "A"), visit(1, "08:00", "16:00", "A"),
          { ...visit(1, "10:00", "11:00", "B"), extra: true }], breaks: {} }
      } };
      const november = M.monthlySummary(state, "2026-11");
      const december = M.monthlySummary(state, "2026-12");
      equal(november.customers.find(customer => customer.name === "A").minutes, 450);
      equal(december.customers.map(customer => [customer.name, customer.minutes]), [["A", 450], ["B", 60]]);
    }],
    ["Time off remains separate from customer targets and optionally reduces overall goals", () => {
      const plan = { visits: [visit(0, "08:00", "16:00", "A")], breaks: {}, timeOff: {
        0: { type: "sick", reduceGoal: false }, 1: { type: "holiday", reduceGoal: true },
        5: { type: "other", reduceGoal: true }
      } };
      const week = M.calculate(plan, settings);
      equal([week.total, week.timeOff, week.adjustment, week.baseTarget, week.target], [450, 900, 450, 2250, 1800]);
      const month = M.monthlySummary({ settings, weeks: { "2026-11-02": plan },
        customerTargets: [{ customer: "A", target: 7.5 }] }, "2026-11");
      equal([month.weekdays, month.timeOff, month.adjustment, month.target, month.customers[0].target],
        [21, 900, 450, 9000, 1890]);
      plan.timeOff = Object.fromEntries([0, 1, 2, 3, 4].map(day => [day, { type: "sick", reduceGoal: true }]));
      equal(M.calculate(plan, settings).target, 0);
    }],
    ["New fields round-trip and reject invalid descriptions, project dates and time-off entries", () => {
      const saved = { version: 1, settings, customerTargets: [
        { customer: "A", target: 7.5, percent: 20, startDate: "2026-11-01", endDate: "2026-12-31" }
      ], weeks: { "2026-11-09": { visits: [{ ...visit(0, "08:00", "16:00", "A"), description: "Test note" }],
        breaks: {}, timeOff: { 0: { type: "sick", reduceGoal: false } } } } };
      equal(M.validState(JSON.parse(JSON.stringify(saved))), true);
      const badDescription = structuredClone(saved);
      badDescription.weeks["2026-11-09"].visits[0].description = "x".repeat(501);
      equal(M.validState(badDescription), false);
      for (const changes of [{ percent: 101 }, { startDate: "2026-02-30" }, { endDate: "2026-10-01" }]) {
        const bad = structuredClone(saved);
        Object.assign(bad.customerTargets[0], changes);
        equal(M.validState(bad), false);
      }
      const badTimeOff = structuredClone(saved);
      badTimeOff.weeks["2026-11-09"].timeOff[0].reduceGoal = "yes";
      equal(M.validState(badTimeOff), false);
    }],
    ["Invalid, reversed, overnight, and zero-length visits are rejected", () => {
      for (const [start, end] of [["25:00", "26:00"], ["08:60", "12:00"], ["22:00", "06:00"], ["08:00", "08:00"]]) {
        equal(Boolean(M.visitError(visit(0, start, end), [])), true);
      }
      equal(Boolean(M.visitError(visit(0, "08:00", "09:00", "  "), [])), true);
      equal(Boolean(M.visitError(visit(7, "08:00", "09:00"), [])), true);
    }],
    ["Local week navigation handles Sunday, year boundaries, and DST weeks", () => {
      equal(M.mondayKey(new Date(2026, 10, 15)), "2026-11-09");
      equal(M.mondayKey(new Date(2027, 0, 1)), "2026-12-28");
      equal(M.mondayKey(new Date(2026, 2, 29)), "2026-03-23");
    }],
    ["Stored plans reject corrupt data, duplicates, impossible dates, and overlaps", () => {
      const good = { version: 1, settings, weeks: { "2026-11-09": { visits: [visit(0, "08:00", "16:00")], breaks: { 0: 0 } } } };
      equal(M.validState(good), true);
      for (const bad of [null, {}, { ...good, settings: { target: -1, breakMinutes: 30 } },
        { ...good, weeks: { "2026-02-30": { visits: [], breaks: {} } } },
        { ...good, weeks: { "2026-11-09": { visits: [visit(0, "08:00", "16:00"), visit(0, "08:00", "16:00")], breaks: {} } } },
        { ...good, weeks: { "2026-11-09": { visits: [null], breaks: {} } } },
        { ...good, weeks: { "2026-11-09": { visits: [], breaks: { 7: 30 } } } }]) {
        equal(M.validState(bad), false);
      }
    }],
    ["Saved targets and extra assignments round-trip while legacy plans remain valid", () => {
      const plan = { visits: [visit(0, "08:00", "16:00", "CustomerX"),
        { ...visit(0, "10:00", "11:00", "CustA"), extra: true }], breaks: {}, breakCustomers: { 0: "CustomerX" } };
      const saved = { version: 1, settings, customerTargets: [{ customer: "CustA", target: 5 }], weeks: { "2026-11-09": plan } };
      equal(M.validState(JSON.parse(JSON.stringify(saved))), true);
      equal(M.validState({ version: 1, settings, weeks: { "2026-11-09": { visits: [visit(0, "08:00", "16:00")], breaks: {} } } }), true);
      for (const customerTargets of [[{ customer: "A", target: -1 }],
        [{ customer: "A", target: 1 }, { customer: " a ", target: 2 }],
        [{ customer: "", target: 1 }], {}]) {
        equal(M.validState({ ...saved, customerTargets }), false);
      }
      const bad = structuredClone(saved);
      bad.weeks["2026-11-09"].visits[1].extra = "yes";
      equal(M.validState(bad), false);
      bad.weeks["2026-11-09"].visits[1].extra = true;
      bad.weeks["2026-11-09"].breakCustomers[0] = 123;
      equal(M.validState(bad), false);
    }]
  ];
  let passed = 0;
  for (const [name, run] of tests) {
    const li = document.createElement("li");
    try {
      run();
      passed += 1;
      li.className = "pass";
      li.textContent = `PASS — ${name}`;
    } catch (error) {
      li.className = "fail";
      li.textContent = `FAIL — ${name}: ${error.message}`;
      console.error(name, error);
    }
    document.getElementById("results").append(li);
  }
  document.getElementById("summary").textContent = `${passed}/${tests.length} tests passed`;
  document.getElementById("summary").dataset.passed = String(passed === tests.length);
})();
