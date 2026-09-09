/* ============================================================================
   fetch-prices.mjs — runs on a schedule (GitHub Actions), not in the browser.
   Pulls current prices from CommodityPriceAPI and writes:
     data/prices.json   current snapshot the page reads
     data/history.json  one row per day (the chart time-series)
     data/base.json     each commodity's "base 100" price, captured once
   Node 18+ (built-in fetch). No dependencies. No manual values.
   ----------------------------------------------------------------------------
   Why base.json: every symbol comes in its own native unit/currency (copper in
   USD/lb, soybean oil in US cents, palm oil in MYR...). We never convert. We
   capture each commodity's first observed price as its base = 100, so the index
   is always a clean ratio price/base — no calibration, no unit landmines.
   ============================================================================ */

import { readFileSync, writeFileSync, mkdirSync, existsSync } from "node:fs";
import { dirname } from "node:path";

const KEY = process.env.COMMODITIES_API_KEY || "";
const BASE_URL = "https://api.commoditypriceapi.com/v3";
const MAX_PER_CALL = 5; // entry ("Lite") plan allows up to 5 symbols per request

/* our internal key -> provider symbol (verified on commoditypriceapi.com/symbols) */
const SYMBOLS = {
  gold:              "XAU",            // Gold, USD / troy ounce
  iron_ore:          "TIOC",           // Iron Ore 62% Fe, USD / tonne (10-min)
  fishmeal:          "FM",             // Fish Meal, USD / tonne (monthly, World Bank)
  copper:            "HG-SPOT",        // Copper spot, USD / pound
  brent:             "BRENTOIL-SPOT",  // Brent crude, USD / barrel
  refined_petroleum: "ULSD-NYH",       // Diesel (ULSD) NY Harbor, USD / gallon
  sugar:             "LS11",           // Sugar No.11, USD / pound (10-min)
  wheat:             "ZW-SPOT",        // Wheat spot, USD / bushel
  soybean_oil:       "ZL",             // Soybean oil, US cents / pound
  palm_oil:          "PO",             // Palm oil, MYR / tonne
};
/* display units (labels only — the index never depends on them) */
const UNITS = {
  gold:"USD/oz", iron_ore:"USD/t", fishmeal:"USD/t", copper:"USD/lb", brent:"USD/bbl",
  refined_petroleum:"USD/gal", sugar:"USD/lb", wheat:"USD/bu", soybean_oil:"US\u00a2/lb", palm_oil:"MYR/t",
};

function coerce(raw){
  if(raw==null) return null;
  if(typeof raw==="number") return isNaN(raw)?null:raw;
  if(typeof raw==="object") return raw.close ?? raw.price ?? raw.rate ?? raw.value ?? raw.open ?? null;
  const n=Number(raw); return isNaN(n)?null:n;
}
function readJson(p,def){ try{ return JSON.parse(readFileSync(p,"utf8")); }catch{ return def; } }
function writeJson(p,o){ if(!existsSync(dirname(p))) mkdirSync(dirname(p),{recursive:true}); writeFileSync(p, JSON.stringify(o,null,2)); }

async function fetchLatest(symbols){
  if(!KEY){ console.warn("No COMMODITIES_API_KEY set — every price will be null."); return {}; }
  const merged={};
  for(let i=0;i<symbols.length;i+=MAX_PER_CALL){
    const chunk=symbols.slice(i,i+MAX_PER_CALL);
    const url=`${BASE_URL}/rates/latest?symbols=${chunk.join(",")}`;
    const res=await fetch(url,{ headers:{ "x-api-key":KEY } });
    // 200 and 206 are both success; 206 = some symbols unresolved (listed under `unresolved`)
    if(!res.ok && res.status!==206){
      const body=await res.text().catch(()=> "");
      throw new Error(`HTTP ${res.status} for [${chunk.join(",")}] ${body.slice(0,160)}`);
    }
    const json=await res.json();
    Object.assign(merged, json.rates || {});
    if(json.unresolved) for(const s of Object.keys(json.unresolved)) console.warn(`  unresolved: ${s} — ${json.unresolved[s].message||""}`);
  }
  return merged;
}

const nowIso=new Date().toISOString();
const day=nowIso.slice(0,10);

const rates = await fetchLatest([...new Set(Object.values(SYMBOLS))]);

/* current snapshot */
const prices={};
for(const [key,sym] of Object.entries(SYMBOLS)){
  const v=coerce(rates[sym]);
  prices[key]={ value:v, unit:UNITS[key], date:day, source: v==null?"missing":"live" };
}
writeJson("data/prices.json",{ as_of:nowIso, prices });

/* history: one row per day, last write of the day wins */
const hist=readJson("data/history.json",{series:[]});
if(!Array.isArray(hist.series)) hist.series=[];
const flat={}; for(const [k,v] of Object.entries(prices)) if(v.value!=null) flat[k]=v.value;
const last=hist.series[hist.series.length-1];
if(last && last.date===day) hist.series[hist.series.length-1]={date:day,prices:flat};
else hist.series.push({date:day,prices:flat});
hist.series=hist.series.slice(-2000);
writeJson("data/history.json",hist);

/* base: create if missing; fill any newly-available key; never overwrite an existing base */
const baseFile=readJson("data/base.json",null);
const base = baseFile && baseFile.base ? {...baseFile.base} : {};
let changed=false;
for(const [k,v] of Object.entries(prices)){ if(base[k]==null && v.value!=null){ base[k]=v.value; changed=true; } }
if(!baseFile) changed=true;
if(changed) writeJson("data/base.json",{ as_of: baseFile && baseFile.as_of ? baseFile.as_of : nowIso, base });

console.log("prices.json written", nowIso);
for(const [k,v] of Object.entries(prices)) console.log(`  ${k.padEnd(18)} ${v.value ?? "\u2014"} ${v.unit}  (${v.source})`);
