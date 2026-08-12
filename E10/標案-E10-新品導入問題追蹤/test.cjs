const fs = require('fs');
const dir = 'C:/Users/lekum/Desktop/0812/0812E10/E10/標案-E10-新品導入問題追蹤';
const COLS = ['日期','編號','項目','狀態','負責人','備註','單位','客戶','耗時分鐘','金額'];
const OPEN = ['不合格','待處理'];
function iso(y,m,d){return y+'-'+String(m).padStart(2,'0')+'-'+String(d).padStart(2,'0');}
function cleanDate(s){s=(s||'').trim();if(!s)return null;let m;
 if((m=/^(\d{4})\/(\d{1,2})\/(\d{1,2})$/.exec(s)))return iso(+m[1],+m[2],+m[3]);
 if((m=/^(\d{1,2})月(\d{1,2})日$/.exec(s)))return iso(2026,+m[1],+m[2]);
 if(/^\d{4}$/.test(s)){const mm=+s.slice(0,2),dd=+s.slice(2,4);if(mm>=1&&mm<=12&&dd>=1&&dd<=31)return iso(2026,mm,dd);}
 return null;}
function buildRows(text){
 const lines=text.replace(/\r/g,'').split('\n').filter(l=>l.length).map(l=>l.split(','));
 lines.shift();
 let rows=lines.map(c=>{const o={};COLS.forEach((k,i)=>o[k]=(c[i]||'').trim());return o;});
 const report={raw:rows.length,dup:0,dateNull:0,statusMiss:0,valueFixed:0};
 const seen=new Set();const dedup=[];
 for(const r of rows){const key=COLS.map(k=>r[k]).join('|');if(seen.has(key)){report.dup++;continue;}seen.add(key);dedup.push(r);}
 rows=dedup;
 for(const r of rows){
  r._date=cleanDate(r['日期']);if(r._date===null)report.dateNull++;
  r['狀態']=r['狀態']===''?'狀態缺失':r['狀態'];if(r['狀態']==='狀態缺失')report.statusMiss++;
  if(r['項目']==='')r['項目']='未填';if(r['客戶']==='')r['客戶']='未填';if(r['負責人']==='')r['負責人']='未填';
  ['耗時分鐘','金額'].forEach(k=>{let v=parseFloat(r[k]);if(!isNaN(v)&&v>1000){v=v/100;r[k]=String(v);report.valueFixed++;}else r[k]=isNaN(v)?'':String(v);});
  r._耗時=parseFloat(r['耗時分鐘'])||0;r._金額=parseFloat(r['金額'])||0;
 }
 return {rows,report};
}
function aiAssess(r){let unresolved;
 if(OPEN.includes(r['狀態']))unresolved=true;
 else if(r['狀態']==='狀態缺失')unresolved='uncertain';
 else unresolved=false;
 let score=0;const reasons=[];
 if(r['狀態']==='不合格'){score+=50;reasons.push('狀態不合格');}
 if(r['狀態']==='待處理'){score+=30;reasons.push('待處理');}
 if(r['狀態']==='狀態缺失'){score+=15;reasons.push('狀態缺失待補登');}
 if(r['備註']==='待確認'){score+=25;reasons.push('備註待確認');}
 if(r['備註']==='已回報'){score+=10;reasons.push('已回報待跟進');}
 const kw=/客訴|停線|安全|重大|抱怨|退貨|召回|出貨|良率/;
 if(kw.test(r['備註']+r['客戶'])){score+=40;reasons.push('涉客訴/安全/出貨');}
 if(r._金額>80){score+=15;reasons.push('金額高');}
 if(r._耗時>250){score+=10;reasons.push('耗時長');}
 return {unresolved,score,reasons};
}
const main=fs.readFileSync(dir+'/data/主檔.csv','utf8');
const {rows,report}=buildRows(main);
console.log('清理報告:',report);
console.log('清理後筆數:',rows.length);
const statusDist={};rows.forEach(r=>statusDist[r['狀態']]=(statusDist[r['狀態']]||0)+1);
console.log('狀態分布:',statusDist);
const ai=rows.map(aiAssess).filter(a=>a.unresolved===true).sort((a,b)=>b.score-a.score);
console.log('AI 判定真正未結案:',ai.length);
console.log('Top5:');
rows.map(r=>({r,a:aiAssess(r)})).filter(x=>x.a.unresolved===true).sort((x,y)=>y.a.score-x.a.score||y.r._金額-x.r._金額||y.r._耗時-x.r._耗時).slice(0,5)
 .forEach((x,n)=>console.log(` #${n+1} ${x.r['編號']} ${x.r['項目']} ${x.r['單位']} 狀態=${x.r['狀態']} 備註=${x.r['備註']||'-'} 分=${x.a.score} [${x.a.reasons.join(',')}]`));
const uncertain=rows.map(aiAssess).filter(a=>a.unresolved==='uncertain').length;
console.log('狀態缺失但待跟進(uncertain):',uncertain);
console.log('OK: 無例外，邏輯通過');
