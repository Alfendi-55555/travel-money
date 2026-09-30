const fmt = (n) => n.toLocaleString("ko-KR");
const won = (n) => fmt(n) + "원";
const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
const WD = "일월화수목금토";
const dt = (iso) => {
  const [y, m, d] = iso.split("-");
  return { y, md: `${m}.${d}`, wd: WD[new Date(Date.UTC(+y, m - 1, +d)).getUTCDay()] };
};
const HUES = [12, 190, 40, 265, 150, 330, 90, 220];
const PLANE = `<svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M21 16v-2l-8-5V3.5a1.5 1.5 0 0 0-3 0V9l-8 5v2l8-2.5V19l-2 1.5V22l3.5-1 3.5 1v-1.5L13 19v-5.5z" transform="rotate(90 12 12)"/></svg>`;
const ARROW = `<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-label="에게"><path d="M5 12h14M13 6l6 6-6 6"/></svg>`;

let data;

function summary(trip) {
  const lines = [`[여정산] ${trip.name}`, `${trip.start} ~ ${trip.end} · ${trip.people.length}명`, `총 ${won(trip.total)}`, ""];
  lines.push("■ 송금");
  if (trip.transfers.length) trip.transfers.forEach((t) => lines.push(`${t.from} → ${t.to} ${won(t.amount)}`));
  else lines.push("주고받을 돈 없음");
  lines.push("", "■ 각자 부담");
  trip.people.forEach((p) => lines.push(`${p.name} ${won(p.share)} (낸 돈 ${won(p.paid)})`));
  return lines.join("\n");
}

function render(trip) {
  const idx = Object.fromEntries(trip.people.map((p, i) => [p.name, i]));
  const av = (n) => `<span class="av" style="--h:${HUES[(idx[n] ?? 0) % HUES.length]}">${esc([...n][0])}</span>`;
  const s = dt(trip.start), e = dt(trip.end);
  const nDays = Math.round((Date.parse(trip.end) - Date.parse(trip.start)) / 864e5) + 1;
  const count = trip.days.reduce((a, d) => a + d.items.length, 0);
  const maxShare = Math.max(1, ...trip.people.map((p) => p.share));

  const pass = `
    <section class="pass" style="margin-top:0">
      <div class="pass-main">
        <div class="label">Trip · ${esc(s.y)}</div>
        <div class="trip-name">${esc(trip.name)}</div>
        <div class="route">
          <div><div class="label">출발</div><div class="big num">${s.md}</div><div class="sub">${s.wd}요일</div></div>
          <div class="line">${PLANE}</div>
          <div class="end"><div class="label">도착</div><div class="big num">${e.md}</div><div class="sub">${e.wd}요일</div></div>
        </div>
        <div class="meta"><span>${nDays}일</span><span>${trip.people.length}명</span><span>결제 ${count}건</span></div>
      </div>
      <div class="pass-stub">
        <div><div class="label">Total</div><div class="total">${fmt(trip.total)}<small>원</small></div></div>
        <div class="stub-side"><div class="label">1인 평균</div><div class="num"><b>${won(Math.round(trip.total / trip.people.length))}</b></div></div>
      </div>
    </section>`;

  const transfers = trip.transfers.length
    ? trip.transfers.map((t) => `
      <li class="tr">
        <span class="who">${av(t.from)}<span>${esc(t.from)}</span></span>
        <span class="arrow">${ARROW}</span>
        <span class="who">${av(t.to)}<span>${esc(t.to)}</span></span>
        <b class="amt">${won(t.amount)}</b>
      </li>`).join("")
    : `<li class="empty">모두 정산 완료! 주고받을 돈이 없어요</li>`;

  const people = trip.people.map((p) => {
    const [cls, label] = p.net > 0 ? ["get", "받을 돈"] : p.net < 0 ? ["give", "보낼 돈"] : ["even", "정산 완료"];
    return `
      <li class="person">
        ${av(p.name)}
        <div>
          <div class="pname">${esc(p.name)}</div>
          <div class="sub"><span class="nw">부담 <b>${won(p.share)}</b></span> · <span class="nw">낸 돈 ${won(p.paid)}</span></div>
          <div class="bar"><i style="width:${(p.share / maxShare) * 100}%"></i></div>
        </div>
        <span class="chip ${cls}">${label}${p.net ? `<b>${fmt(Math.abs(p.net))}</b>` : ""}</span>
      </li>`;
  }).join("");

  const days = trip.days.map((d) => {
    const x = dt(d.date);
    return `
      <li class="day"><details ${trip.days.length <= 4 ? "open" : ""}>
        <summary><span class="day-no">DAY ${d.day}</span><span class="sub">${x.md} (${x.wd})</span><span class="amt">${won(d.total)}</span></summary>
        <ul class="items">${d.items.map((it) => `
          <li class="it">
            <div>
              <div class="iname">${esc(it.item)}</div>
              <div class="sub">${esc(it.payer)} 결제 · ${it.everyone ? "전원 N빵" : it.shares.map((s) => `${esc(s.name)} ${fmt(s.amount)}`).join(" · ")}</div>
            </div>
            <span class="amt">${won(it.amount)}${it.original ? `<span class="sub orig">${fmt(it.original.amount)} ${esc(it.original.currency)}</span>` : ""}</span>
          </li>`).join("")}
        </ul>
      </details></li>`;
  }).join("");

  document.getElementById("app").innerHTML = `
    ${pass}
    <section>
      <div class="sec-head"><h2><span class="step">01</span>누가 누구에게</h2><button class="btn" id="copy">결과 복사</button></div>
      <ul class="card">${transfers}</ul>
    </section>
    <section>
      <div class="sec-head"><h2><span class="step">02</span>사람별 정산</h2></div>
      <ul class="card">${people}</ul>
    </section>
    <section>
      <div class="sec-head"><h2><span class="step">03</span>여정 다시 보기</h2></div>
      <ol class="timeline">${days}</ol>
    </section>`;

  const btn = document.getElementById("copy");
  btn.onclick = async () => {
    try {
      await navigator.clipboard.writeText(summary(trip));
      btn.textContent = "복사됨";
    } catch {
      btn.textContent = "복사 실패";
    }
    setTimeout(() => (btn.textContent = "결과 복사"), 1500);
  };
}

async function main() {
  const app = document.getElementById("app");
  try {
    data = await (await fetch("data.json", { cache: "no-store" })).json();
  } catch {
    app.innerHTML = `<p class="loading">데이터를 불러오지 못했어요.</p>`;
    return;
  }
  if (data.warnings?.length) {
    document.getElementById("warn").innerHTML =
      `<div class="warn"><b>시트에서 건너뛴 행이 있어요</b><br>${data.warnings.map(esc).join("<br>")}</div>`;
  }
  if (!data.trips.length) { app.innerHTML = `<p class="loading">아직 기록된 여정이 없어요.</p>`; return; }

  const sel = document.getElementById("trip");
  sel.innerHTML = data.trips.map((t, i) => `<option value="${i}">${esc(t.name)}</option>`).join("");
  sel.hidden = data.trips.length < 2;
  const byHash = data.trips.findIndex((t) => t.name === decodeURIComponent(location.hash.slice(1)));
  sel.value = byHash >= 0 ? byHash : 0;
  const show = () => {
    const t = data.trips[sel.value];
    document.title = `${t.name} · 여정산`;
    render(t);
  };
  sel.onchange = () => { location.hash = encodeURIComponent(data.trips[sel.value].name); show(); };
  show();
  document.getElementById("updated").textContent = "갱신 " + new Date(data.generatedAt).toLocaleString("ko-KR");
}
main();
