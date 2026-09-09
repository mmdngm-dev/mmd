/* ============================================================================
   backfill-history.mjs — run ONCE (locally or via the "Backfill history"
   workflow) to seed data/history.json with real past prices and anchor
   data/base.json to the start of that history. After this, the hourly
   fetcher just appends new days.
   Node 18+. No dependencies.  Usage: node backfill-history.mjs [days]
   ============================================================================ */

import { writeFileSync, mkdirSync, existsSync } from "node:fs";
import { dirname } from "node:path";

const KEY = process.env.COMMODITIES_API_KEY || "";
const BASE_URL = "https://api.commoditypriceapi.com/v3";
const MAX_PER_CALL = 5;
const DAYS = Math.min(365, Number(process.env.DAYS || process.argv[2] || 180)); // time-series max 365

const SYMBOLS = {
  gold:"XAU", iron_ore:"TIOC", fishmeal:"FM", copper:"HG-SPOT", brent:"BRENTOIL-SPOT",
  refined_petroleum:"ULSD-NYH", sugar:"LS11", wheat:"ZW-SPOT", soybean_oil:"ZL", palm_oil:"PO",
};
const SYM2KEY = Object.fromEntries(Object.entries(SYMBOLS).map(([k,v])=>[v,k]));
const KEYS = Object.keys(SYMBOLS);

function coerce(raw){
  if(raw==null) return null;
  if(typeof raw==="number") return isNaN(raw)?null:raw;
  if(typeof raw==="object") return raw.close ?? raw.price ?? raw.rate ?? raw.value ?? raw.open ?? null;
  const n=Number(raw); return isNaN(n)?null:n;
}
function writeJson(p,o){ if(!existsSync(dirname(p))) mkdirSync(dirname(p),{recursive:true}); writeFileSync(p, JSON.stringify(o,null,2)); }
const ymd = d => d.toISOString().slice(0,10);

if(!KEY){ console.error("Set COMMODITIES_API_KEY first."); process.exit(1); }

const endDate = ymd(new Date());
const startDate = ymd(new Date(Date.now()-DAYS*86400000));
const symbols = [...new Set(Object.values(SYMBOLS))];

const byDate = {}; // date -> { key: close }
for(let i=0;i<symbols.length;i+=MAX_PER_CALL){
  const chunk=symbols.slice(i,i+MAX_PER_CALL);
  const url=`${BASE_URL}/rates/time-series?symbols=${chunk.join(",")}&startDate=${startDate}&endDate=${endDate}`;
  const res=await fetch(url,{ headers:{ "x-api-key":KEY } });
  if(!res.ok && res.status!==206){ const b=await res.text().catch(()=> ""); throw new Error(`HTTP ${res.status} ${b.slice(0,160)}`); }
  const json=await res.json();
  for(const [date,syms] of Object.entries(json.rates||{})){
    byDate[date]=byDate[date]||{};
    for(const [sym,ohlc] of Object.entries(syms)){
      const key=SYM2KEY[sym]; if(key) byDate[date][key]=coerce(ohlc);
    }
  }
}

const dates=Object.keys(byDate).sort();
if(!dates.length){ console.error("No data returned for the range."); process.exit(1); }

/* forward-fill each commodity so monthly series (e.g. fishmeal) and gaps stay continuous */
const last={}, series=[];
for(const date of dates){
  const row={};
  for(const k of KEYS){
    const v=byDate[date][k];
    if(v!=null) last[k]=v;
    if(last[k]!=null) row[k]=last[k];
  }
  if(Object.keys(row).length) series.push({date,prices:row});
}
writeJson("data/history.json",{series});

/* anchor base.json to the first day that has data */
const first=series.find(r=>Object.keys(r.prices).length);
const base={}; for(const k of KEYS) if(first.prices[k]!=null) base[k]=first.prices[k];
writeJson("data/base.json",{ as_of:first.date, base });

console.log(`Backfilled ${series.length} days: ${series[0].date} \u2192 ${series[series.length-1].date}`);
console.log(`Base anchored at ${first.date}.`);
