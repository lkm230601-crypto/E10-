// CI 檢查：驗證 E10 交付物 index.html 能正確載入髒資料並產出結果。
// 不依賴瀏覽器，純 Node 重跑與頁面相同的清理/AI 邏輯。
const fs = require('fs');
const path = require('path');

const CASE = path.join(__dirname, 'E10', '標案-E10-新品導入問題追蹤');
const CSV = path.join(CASE, 'data', '主檔.csv');
const HTML = path.join(CASE, 'index.html');
const COLS = ['日期', '編號', '項目', '狀態', '負責人', '備註', '單位', '客戶', '耗時分鐘', '金額'];
const OPEN = ['不合格', '待處理'];

function iso(y, m, d) { return y + '-' + String(m).padStart(2, '0') + '-' + String(d).padStart(2, '0'); }
function cleanDate(s) {
  s = (s || '').trim(); if (!s) return null; let m;
  if ((m = /^(\d{4})\/(\d{1,2})\/(\d{1,2})$/.exec(s))) return iso(+m[1], +m[2], +m[3]);
  if ((m = /^(\d{1,2})月(\d{1,2})日$/.exec(s))) return iso(2026, +m[1], +m[2]);
  if (/^\d{4}$/.test(s)) { const mm = +s.slice(0, 2), dd = +s.slice(2, 4); if (mm >= 1 && mm <= 12 && dd >= 1 && dd <= 31) return iso(2026, mm, dd); }
  return null;
}
function buildRows(text) {
  const lines = text.replace(/\r/g, '').split('\n').filter(l => l.length).map(l => l.split(','));
  lines.shift();
  let rows = lines.map(c => { const o = {}; COLS.forEach((k, i) => o[k] = (c[i] || '').trim()); return o; });
  const report = { raw: rows.length, dup: 0, dateNull: 0, statusMiss: 0, valueFixed: 0 };
  const seen = new Set(); const dedup = [];
  for (const r of rows) { const key = COLS.map(k => r[k]).join('|'); if (seen.has(key)) { report.dup++; continue; } seen.add(key); dedup.push(r); }
  rows = dedup;
  for (const r of rows) {
    r._date = cleanDate(r['日期']); if (r._date === null) report.dateNull++;
    r['狀態'] = r['狀態'] === '' ? '狀態缺失' : r['狀態']; if (r['狀態'] === '狀態缺失') report.statusMiss++;
    if (r['項目'] === '') r['項目'] = '未填'; if (r['客戶'] === '') r['客戶'] = '未填'; if (r['負責人'] === '') r['負責人'] = '未填';
    ['耗時分鐘', '金額'].forEach(k => { let v = parseFloat(r[k]); if (!isNaN(v) && v > 1000) { v = v / 100; r[k] = String(v); report.valueFixed++; } else r[k] = isNaN(v) ? '' : String(v); });
    r._耗時 = parseFloat(r['耗時分鐘']) || 0; r._金額 = parseFloat(r['金額']) || 0;
  }
  return { rows, report };
}
function aiUnresolved(rows) {
  return rows.filter(r => OPEN.includes(r['狀態'])).length;
}

let fail = 0;
function check(name, cond, extra) {
  if (cond) console.log('  PASS  ' + name + (extra ? '  (' + extra + ')' : ''));
  else { console.log('  FAIL  ' + name + (extra ? '  (' + extra + ')' : '')); fail++; }
}

console.log('[1] index.html 自給自足檢查');
const html = fs.readFileSync(HTML, 'utf8');
check('檔案存在且非空', html.length > 1000, html.length + ' bytes');
check('已內嵌資料 (const RAW_CSV)', /const RAW_CSV = /.test(html));
check('無殘留佔位符 __MAIN__', !html.includes('__MAIN__'));
check('含結論區 #conclusion', html.includes('id="conclusion"'));
check('含 AI 面板 #aiList', html.includes('id="aiList"'));
check('含問題類型圖 #typeChart', html.includes('id="typeChart"'));
check('含階段圖 #unitChart', html.includes('id="unitChart"'));
check('含未結案表 #openTable', html.includes('id="openTable"'));
check('含人在把關標記', html.includes('人在這把關'));

console.log('[2] 資料載入與清理檢查');
const csv = fs.readFileSync(CSV, 'utf8');
let res;
try { res = buildRows(csv); } catch (e) { console.log('  FAIL  清理邏輯拋錯: ' + e.message); fail++; }
if (res) {
  const { rows, report } = res;
  check('原始筆數 = 2012', report.raw === 2012, 'raw=' + report.raw);
  check('清理後仍有資料', rows.length > 0, 'clean=' + rows.length);
  check('日期全部可解析 (dateNull=0)', report.dateNull === 0, 'dateNull=' + report.dateNull);
  check('狀態缺失有被標出', report.statusMiss > 0, 'statusMiss=' + report.statusMiss);
  check('數值錯位已修正', report.valueFixed > 0, 'valueFixed=' + report.valueFixed);
  const ai = aiUnresolved(rows);
  check('AI 判斷出未結案 (>0)', ai > 0, 'unresolved=' + ai);
}

console.log(fail === 0 ? '\nALL CHECKS PASSED ✅' : '\n' + fail + ' CHECK(S) FAILED ❌');
process.exit(fail === 0 ? 0 : 1);
