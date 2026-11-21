// "?" yer tutucularını Postgres'in $1, $2… biçimine çevirir. Tek tırnaklı dizgelerin,
// çift tırnaklı adların, -- ve /* */ yorumlarının ve $$…$$ bloklarının içindeki "?"
// karakterlerine dokunmaz.

const cache = new Map<string, string>();

export function toPgPlaceholders(sql: string): string {
  const hit = cache.get(sql);
  if (hit !== undefined) return hit;
  let out = "";
  let n = 0;
  let i = 0;
  const len = sql.length;
  while (i < len) {
    const c = sql[i];
    if (c === "'" || c === '"') {
      // Dizge / ad: kapanan tırnağa kadar (iki tırnak kaçış sayılır)
      let j = i + 1;
      while (j < len) {
        if (sql[j] === c) {
          if (sql[j + 1] === c) {
            j += 2;
            continue;
          }
          break;
        }
        j++;
      }
      out += sql.slice(i, j + 1);
      i = j + 1;
      continue;
    }
    if (c === "-" && sql[i + 1] === "-") {
      const j = sql.indexOf("\n", i);
      const end = j === -1 ? len : j;
      out += sql.slice(i, end);
      i = end;
      continue;
    }
    if (c === "/" && sql[i + 1] === "*") {
      const j = sql.indexOf("*/", i + 2);
      const end = j === -1 ? len : j + 2;
      out += sql.slice(i, end);
      i = end;
      continue;
    }
    if (c === "$" && sql[i + 1] === "$") {
      const j = sql.indexOf("$$", i + 2);
      const end = j === -1 ? len : j + 2;
      out += sql.slice(i, end);
      i = end;
      continue;
    }
    if (c === "?") {
      n += 1;
      out += `$${n}`;
      i++;
      continue;
    }
    out += c;
    i++;
  }
  if (cache.size > 2000) cache.clear();
  cache.set(sql, out);
  return out;
}
