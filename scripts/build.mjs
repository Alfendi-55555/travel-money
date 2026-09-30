// 구글 시트(웹에 게시된 CSV) → site/data.json
// 사용: SHEET_CSV_URL=... node scripts/build.mjs   또는   node scripts/build.mjs --file sample.csv
import { readFile, writeFile, mkdir } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { parseCsv, buildData } from "./settle.mjs";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");

async function loadCsv() {
  const i = process.argv.indexOf("--file");
  if (i > 0) return readFile(process.argv[i + 1], "utf8");
  const url = process.env.SHEET_CSV_URL;
  if (!url) throw new Error("SHEET_CSV_URL 이 없습니다 (저장소 Secrets 에 시트 CSV 링크를 넣어주세요)");
  const res = await fetch(url, { redirect: "follow" });
  if (!res.ok) throw new Error(`시트 받기 실패: HTTP ${res.status}`);
  const text = await res.text();
  if (/^\s*<(!doctype|html)/i.test(text)) {
    throw new Error("CSV가 아니라 HTML이 왔습니다. 게시 형식을 'CSV'로 골랐는지 확인하세요");
  }
  return text;
}

const rates = JSON.parse(await readFile(resolve(root, "rates.json"), "utf8"));
const data = buildData(parseCsv(await loadCsv()), rates);
data.generatedAt = new Date().toISOString();

await mkdir(resolve(root, "site"), { recursive: true });
await writeFile(resolve(root, "site/data.json"), JSON.stringify(data));
console.log(`여행 ${data.trips.length}개, 경고 ${data.warnings.length}건`);
for (const w of data.warnings) console.warn("  경고:", w);
