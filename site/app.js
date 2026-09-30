const won = (n) => n.toLocaleString("ko-KR") + "원";
const signed = (n) => (n > 0 ? "+" : n < 0 ? "−" : "") + Math.abs(n).toLocaleString("ko-KR") + "원";
const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
const md = (iso) => { const [, m, d] = iso.split("-"); return `${+m}/${+d}`; };

let data;

function render(trip) {
  const app = document.getElementById("app");
  const range = trip.start === trip.end ? md(trip.start) : `${trip.start} ~ ${trip.end}`;

  const people = trip.people.map((p) => `
    <div class="row"><span>${esc(p.name)}<span class="sub"> · 낸 돈 ${won(p.paid)}</span></span>
    <span class="num"><b>${won(p.share)}</b></span></div>`).join("");

  const transfers = trip.transfers.length
    ? trip.transfers.map((t) => `
      <div class="row"><span>${esc(t.from)}<span class="arrow">→</span>${esc(t.to)}</span>
      <span class="num"><b>${won(t.amount)}</b></span></div>`).join("")
    : `<div class="sub">정산할 금액이 없습니다</div>`;

  const nets = trip.people.map((p) => `
    <div class="row"><span>${esc(p.name)}</span>
    <span class="num ${p.net > 0 ? "plus" : p.net < 0 ? "minus" : ""}">${signed(p.net)}</span></div>`).join("");

  const days = trip.days.map((d) => `
    <details ${trip.days.length <= 3 ? "open" : ""}>
      <summary><span><b>${d.day}일차</b> <span class="sub">${md(d.date)}</span></span><span class="num"><b>${won(d.total)}</b></span></summary>
      <div class="items">${d.items.map((it) => `
        <div class="row item">
          <span><span class="name">${esc(it.item)}</span><br>
            <span class="sub">${esc(it.payer)} 결제 · ${it.everyone ? "전원" : it.shares.map((s) => esc(s.name)).join(", ")}
            ${it.original ? ` · ${it.original.amount.toLocaleString("ko-KR")} ${esc(it.original.currency)}` : ""}</span></span>
          <span class="num">${won(it.amount)}</span>
        </div>`).join("")}</div>
    </details>`).join("");

  app.innerHTML = `
    <div class="card"><div class="sub">${esc(range)} · ${trip.days.length}일 · ${trip.people.length}명</div>
      <div class="total">${won(trip.total)}</div></div>
    <h2>각자 부담할 금액</h2><div class="card">${people}</div>
    <h2>송금 안내</h2><div class="card">${transfers}</div>
    <h2>받을 돈 / 줄 돈</h2><div class="card">${nets}</div>
    <h2>일차별 내역</h2>${days}`;
}

async function main() {
  const app = document.getElementById("app");
  try {
    data = await (await fetch("data.json", { cache: "no-store" })).json();
  } catch {
    app.textContent = "데이터를 불러오지 못했습니다.";
    return;
  }
  if (data.warnings?.length) {
    document.getElementById("warn").innerHTML =
      `<div class="warn">시트에서 건너뛴 행이 있어요<br>${data.warnings.map(esc).join("<br>")}</div>`;
  }
  if (!data.trips.length) { app.textContent = "표시할 여행이 없습니다."; return; }

  const sel = document.getElementById("trip");
  sel.innerHTML = data.trips.map((t, i) => `<option value="${i}">${esc(t.name)}</option>`).join("");
  const byHash = data.trips.findIndex((t) => t.name === decodeURIComponent(location.hash.slice(1)));
  sel.value = byHash >= 0 ? byHash : 0;
  sel.onchange = () => { location.hash = encodeURIComponent(data.trips[sel.value].name); render(data.trips[sel.value]); };
  render(data.trips[sel.value]);
  document.getElementById("foot").textContent =
    "갱신: " + new Date(data.generatedAt).toLocaleString("ko-KR");
}
main();
