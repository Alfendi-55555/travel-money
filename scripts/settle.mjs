// CSV 파싱 + 정산 계산 (의존성 없음)

export function parseCsv(text) {
  const rows = [];
  let row = [], cell = "", q = false;
  text = text.replace(/^﻿/, "");
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (q) {
      if (c === '"') { if (text[i + 1] === '"') { cell += '"'; i++; } else q = false; }
      else cell += c;
    } else if (c === '"') q = true;
    else if (c === ",") { row.push(cell); cell = ""; }
    else if (c === "\n" || c === "\r") {
      if (c === "\r" && text[i + 1] === "\n") i++;
      row.push(cell); cell = "";
      rows.push(row); row = [];
    } else cell += c;
  }
  if (cell !== "" || row.length) { row.push(cell); rows.push(row); }
  return rows.filter((r) => r.some((x) => x.trim() !== ""));
}

const HEADERS = {
  trip: ["여행", "여행명"],
  date: ["일자", "날짜", "일차"],
  payer: ["결제자", "결제"],
  item: ["항목", "결제항목", "결제항목명", "항목명"],
  amount: ["금액"],
  currency: ["통화"],
  targets: ["정산대상", "정산해야하는사람", "정산", "대상"],
};

function mapHeader(header) {
  const norm = header.map((h) => h.replace(/\s+/g, ""));
  const idx = {};
  for (const [key, names] of Object.entries(HEADERS)) {
    idx[key] = norm.findIndex((h) => names.includes(h));
  }
  const missing = ["date", "payer", "item", "amount"].filter((k) => idx[k] < 0);
  if (missing.length) throw new Error(`시트 헤더에서 못 찾은 컬럼: ${missing.map((k) => HEADERS[k][0]).join(", ")}`);
  return idx;
}

function parseDate(s) {
  const m = /(\d{4})\D+(\d{1,2})\D+(\d{1,2})/.exec(s);
  if (!m) return null;
  const [y, mo, d] = [+m[1], +m[2], +m[3]];
  const dt = new Date(Date.UTC(y, mo - 1, d));
  if (dt.getUTCMonth() !== mo - 1) return null;
  return dt.toISOString().slice(0, 10);
}

// "지수:2, 민수" → [{name, w}] / 비어 있거나 '전원' → null
function parseTargets(s) {
  s = (s || "").trim();
  if (!s || /^(전원|all|모두)$/i.test(s)) return null;
  return s.split(/[,，、/]/).map((t) => t.trim()).filter(Boolean).map((t) => {
    const m = /^(.+?)\s*[:：]\s*([\d.]+)$/.exec(t);
    return m ? { name: m[1].trim(), w: +m[2] } : { name: t, w: 1 };
  });
}

// 정수(원)로 나누기. 나머지는 1원씩 앞사람부터 (결제자를 맨 앞에 둠)
function split(amount, parts, payer) {
  const ordered = [...parts].sort((a, b) => (b.name === payer) - (a.name === payer));
  const W = ordered.reduce((s, p) => s + p.w, 0);
  const out = ordered.map((p) => ({ name: p.name, v: Math.floor((amount * p.w) / W) }));
  let rest = amount - out.reduce((s, p) => s + p.v, 0);
  for (let i = 0; rest > 0; i = (i + 1) % out.length, rest--) out[i].v++;
  return out;
}

function transfers(net) {
  const cred = [], debt = [];
  for (const [name, v] of Object.entries(net)) {
    if (v > 0) cred.push({ name, v }); else if (v < 0) debt.push({ name, v: -v });
  }
  const byV = (a, b) => b.v - a.v;
  cred.sort(byV); debt.sort(byV);
  const out = [];
  while (cred.length && debt.length) {
    const c = cred[0], d = debt[0], x = Math.min(c.v, d.v);
    out.push({ from: d.name, to: c.name, amount: x });
    c.v -= x; d.v -= x;
    if (!c.v) cred.shift();
    if (!d.v) debt.shift();
    cred.sort(byV); debt.sort(byV);
  }
  return out;
}

export function buildData(rows, rates = {}) {
  const warnings = [];
  if (!rows.length) throw new Error("시트가 비어 있습니다");
  const idx = mapHeader(rows[0]);
  const get = (r, k) => (idx[k] >= 0 ? (r[idx[k]] ?? "").trim() : "");

  const byTrip = new Map();
  rows.slice(1).forEach((r, i) => {
    const line = i + 2;
    const date = parseDate(get(r, "date"));
    const payer = get(r, "payer");
    const item = get(r, "item");
    const raw = Number(get(r, "amount").replace(/[^\d.\-]/g, ""));
    const cur = (get(r, "currency") || "KRW").toUpperCase();
    if (!date) return warnings.push(`${line}행: 날짜를 읽을 수 없어 건너뜀 ("${get(r, "date")}")`);
    if (!payer) return warnings.push(`${line}행: 결제자가 없어 건너뜀`);
    if (!Number.isFinite(raw) || raw <= 0) return warnings.push(`${line}행: 금액이 올바르지 않아 건너뜀`);
    const rate = cur === "KRW" ? 1 : rates[cur];
    if (!rate) return warnings.push(`${line}행: ${cur} 환율이 rates.json 에 없어 건너뜀`);
    const trip = get(r, "trip") || "여행";
    if (!byTrip.has(trip)) byTrip.set(trip, []);
    byTrip.get(trip).push({
      line, date, payer, item: item || "(항목 없음)",
      amount: Math.round(raw * rate),
      original: cur === "KRW" ? null : { amount: raw, currency: cur },
      targets: parseTargets(get(r, "targets")),
    });
  });

  const trips = [];
  for (const [name, entries] of byTrip) {
    // 참가자 = 결제자 + 정산 대상에 이름이 나온 사람 (등장 순서)
    const people = [];
    const add = (n) => { if (!people.includes(n)) people.push(n); };
    for (const e of entries) { add(e.payer); (e.targets || []).forEach((t) => add(t.name)); }

    const stat = Object.fromEntries(people.map((p) => [p, { paid: 0, share: 0 }]));
    entries.sort((a, b) => a.date.localeCompare(b.date) || a.line - b.line);
    const start = entries[0].date;
    const dayMap = new Map();

    for (const e of entries) {
      const parts = e.targets || people.map((p) => ({ name: p, w: 1 }));
      const shares = split(e.amount, parts, e.payer);
      stat[e.payer].paid += e.amount;
      for (const s of shares) stat[s.name].share += s.v;

      const n = Math.round((Date.parse(e.date) - Date.parse(start)) / 864e5) + 1;
      if (!dayMap.has(e.date)) dayMap.set(e.date, { day: n, date: e.date, total: 0, items: [] });
      const day = dayMap.get(e.date);
      day.total += e.amount;
      day.items.push({
        item: e.item, payer: e.payer, amount: e.amount, original: e.original,
        shares: shares.map((s) => ({ name: s.name, amount: s.v })),
        everyone: !e.targets,
      });
    }

    const net = Object.fromEntries(people.map((p) => [p, stat[p].paid - stat[p].share]));
    trips.push({
      name, start, end: entries[entries.length - 1].date,
      total: entries.reduce((s, e) => s + e.amount, 0),
      people: people.map((p) => ({ name: p, ...stat[p], net: net[p] })),
      transfers: transfers(net),
      days: [...dayMap.values()],
    });
  }
  // 최근 여행이 먼저
  trips.sort((a, b) => b.start.localeCompare(a.start));
  return { trips, warnings };
}
