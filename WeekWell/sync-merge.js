(() => {
  "use strict";
  const missing = Symbol("missing");
  const object = value => value !== missing && value !== null &&
    typeof value === "object" && !Array.isArray(value);

  function equal(left, right) {
    if (left === right) return true;
    if (Array.isArray(left) && Array.isArray(right)) {
      return left.length === right.length && left.every((value, index) => equal(value, right[index]));
    }
    if (!object(left) || !object(right)) return false;
    const keys = Object.keys(left);
    return keys.length === Object.keys(right).length &&
      keys.every(key => Object.prototype.hasOwnProperty.call(right, key) && equal(left[key], right[key]));
  }

  function merge(base, local, cloud, choices = {}) {
    const conflicts = [];
    function valueAt(container, key) {
      return Object.prototype.hasOwnProperty.call(container, key) ? container[key] : missing;
    }
    function combine(path, before, here, there) {
      if (equal(here, there)) return here;
      if (equal(here, before)) return there;
      if (equal(there, before)) return here;

      const collection = path.endsWith("/visits") ? "id" :
        path === "/customerTargets" ? "customer" : null;
      if (collection && (before === missing || Array.isArray(before)) &&
          Array.isArray(here) && Array.isArray(there)) {
        const key = item => collection === "customer" ?
          globalThis.PlannerMath.customerKey(item.customer) : item.id;
        const maps = [before === missing ? [] : before, here, there].map(items =>
          new Map(items.map(item => [key(item), item])));
        const keys = new Set(maps.flatMap(map => [...map.keys()]));
        return [...keys].map(id => combine(`${path}/${encodeURIComponent(id)}`,
          ...maps.map(map => map.has(id) ? map.get(id) : missing))).filter(item => item !== missing);
      }

      if ((before === missing || object(before)) && object(here) && object(there)) {
        const values = [before === missing ? {} : before, here, there];
        const keys = new Set(values.flatMap(item => Object.keys(item)));
        const result = Object.create(null);
        for (const key of keys) {
          const value = combine(`${path}/${encodeURIComponent(key)}`, ...values.map(item => valueAt(item, key)));
          if (value !== missing) result[key] = value;
        }
        return result;
      }

      if (choices[path] === "local") return here;
      if (choices[path] === "cloud") return there;
      conflicts.push({ path, local: here === missing ? null : here, cloud: there === missing ? null : there,
        localDeleted: here === missing, cloudDeleted: there === missing });
      return here;
    }
    return { plan: combine("", base, local, cloud), conflicts };
  }
  globalThis.WeekwellMerge = Object.freeze({ equal, merge });
})();
