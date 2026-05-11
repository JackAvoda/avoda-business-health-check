import { useState, useEffect, useRef } from "react";

// ── Persistence ───────────────────────────────────────────────────────────────
const SK = "bhc_full_v1";
const load = () => { try { const r = localStorage.getItem(SK); return r ? JSON.parse(r) : null; } catch { return null; } };
const save = (d) => { try { localStorage.setItem(SK, JSON.stringify(d)); } catch {} };

// ── Utils ─────────────────────────────────────────────────────────────────────
const uid = () => Math.random().toString(36).slice(2, 9);
const toNum = (v) => { const n = parseFloat(v); return isNaN(n) ? 0 : n; };
const fmt$ = (n) => { const v = toNum(n); return v === 0 ? "—" : `$${v.toFixed(2)}`; };
const fmt$4 = (n) => { const v = toNum(n); return v === 0 ? "—" : `$${v.toFixed(4)}`; };
const fmtPct = (n) => { const v = parseFloat(n); return isNaN(v) ? "—" : `${v.toFixed(1)}%`; };
const fmtTime = (seconds) => {
  if (seconds < 60) return `${seconds.toFixed(0)}s`;
  if (seconds < 3600) return `${(seconds/60).toFixed(1)}m`;
  return `${(seconds/3600).toFixed(2)}h`;
};

// ── Unit conversion (Phase 1) ─────────────────────────────────────────────────
const UNIT_GROUPS = [
  { label:"Volume / Liquid", units:[
    {v:"gallon",l:"gallon"},{v:"quart",l:"quart"},{v:"pint",l:"pint"},
    {v:"cup",l:"cup"},{v:"oz",l:"oz (fluid)"},{v:"fl_oz",l:"fl oz"},
    {v:"tbsp",l:"tbsp"},{v:"tsp",l:"tsp"},{v:"ml",l:"ml"},{v:"L",l:"liter"},
  ]},
  { label:"Weight / Dry", units:[
    {v:"lb",l:"lb"},{v:"oz_wt",l:"oz (weight)"},{v:"g",l:"g"},{v:"kg",l:"kg"},
  ]},
  { label:"Count", units:[
    {v:"each",l:"each"},{v:"slice",l:"slice"},{v:"scoop",l:"scoop"},
    {v:"sheet",l:"sheet"},{v:"pack",l:"pack"},{v:"bag",l:"bag"},
    {v:"bottle",l:"bottle"},{v:"can",l:"can"},
  ]},
];
const TO_BASE = {
  gallon:128,quart:32,pint:16,cup:8,fl_oz:1,oz:1,tbsp:0.5,tsp:0.1667,ml:0.033814,L:33.814,
  lb:16,oz_wt:1,g:0.035274,kg:35.274,
  each:1,slice:1,scoop:1,sheet:1,pack:1,bag:1,bottle:1,can:1,
};
const FAM = {
  gallon:"v",quart:"v",pint:"v",cup:"v",fl_oz:"v",oz:"v",tbsp:"v",tsp:"v",ml:"v",L:"v",
  lb:"w",oz_wt:"w",g:"w",kg:"w",
  each:"c",slice:"c",scoop:"c",sheet:"c",pack:"c",bag:"c",bottle:"c",can:"c",
};
function convertCost(buyQty,buyUnit,buyPrice,useQty,useUnit) {
  const bQ=toNum(buyQty),bP=toNum(buyPrice),uQ=toNum(useQty);
  if (!bQ||!bP||!uQ) return null;
  const bF=FAM[buyUnit],uF=FAM[useUnit];
  if (bF&&uF&&bF===uF) {
    const bBase=bQ*(TO_BASE[buyUnit]||1), uBase=uQ*(TO_BASE[useUnit]||1);
    return bBase>0?(bP/bBase)*uBase:null;
  }
  return null;
}

// ── Industry benchmarks ───────────────────────────────────────────────────────
const INDUSTRIES = {
  "Food & Beverage / Cafe":     {low:60,avg:70,high:80,laborLow:28,laborAvg:35,laborHigh:42,note:"Coffee 70–75%. Food 60–65%."},
  "Restaurant":                 {low:55,avg:65,high:75,laborLow:28,laborAvg:33,laborHigh:38,note:"Full-service avg 65%. Fast casual 70%."},
  "Retail – Physical Products": {low:40,avg:50,high:60,laborLow:12,laborAvg:18,laborHigh:25,note:"Specialty retail 50–60%."},
  "E-Commerce":                 {low:45,avg:55,high:70,laborLow:8, laborAvg:14,laborHigh:20,note:"55%+ healthy after shipping."},
  "Service Business":           {low:60,avg:75,high:90,laborLow:35,laborAvg:45,laborHigh:55,note:"Labor is the primary cost."},
  "Wholesale / Distribution":   {low:20,avg:30,high:45,laborLow:10,laborAvg:16,laborHigh:22,note:"Thin margins; volume matters."},
  "Health & Beauty":            {low:55,avg:65,high:78,laborLow:20,laborAvg:28,laborHigh:36,note:"Packaging + ingredients key."},
  "Bakery / Specialty Food":    {low:55,avg:65,high:75,laborLow:30,laborAvg:38,laborHigh:45,note:"65%+ target after packaging."},
  "Other":                      {low:45,avg:58,high:72,laborLow:20,laborAvg:30,laborHigh:40,note:"AI coach gives tailored context."},
};

// ── Data constructors ─────────────────────────────────────────────────────────
const newInvItem   = () => ({id:uid(),name:"",category:"ingredients",buyQty:"",buyUnit:"",buyPrice:""});
const newIngRow    = () => ({id:uid(),inventoryId:"",useQty:"",useUnit:""});
const newUniversal = () => ({id:uid(),inventoryId:"",useQty:"1",useUnit:"each"});
const newSize      = (name,oz) => ({id:uid(),name,oz:String(oz),on:true});
const newProduct   = () => ({id:uid(),name:"",sellPrice:""});
// Phase 2
const newEmployee  = () => ({id:uid(),name:"",title:"",wageType:"hourly",wage:"",laborType:"direct"});
const newShift     = () => ({id:uid(),name:"",startTime:"09:00",endTime:"17:00",days:[],positions:[]});
const newTask      = () => ({id:uid(),name:"",timeValue:"",timeUnit:"seconds",positionId:""});
const newProdLabor = () => ({id:uid(),productId:"",sizeId:"__flat__",tasks:[]});

const INV_CATS = [{v:"ingredients",l:"Ingredients"},{v:"packaging",l:"Packaging"},{v:"supplies",l:"Supplies"},{v:"other",l:"Other"}];
const DAYS = ["Mon","Tue","Wed","Thu","Fri","Sat","Sun"];

const DEFAULT = {
  // meta
  step:0, phase:1,
  businessName:"", industry:"",
  // p1
  useSizes:true,
  sizes:[newSize("Small",8),newSize("Medium",12),newSize("Large",16)],
  universalItems:[],
  inventory:[newInvItem()],
  products:[newProduct()],
  // p2
  employees:[newEmployee()],
  shifts:[newShift()],
  tasks:[newTask()],
  productLabor:[],
  lastSaved:null,
};

// ── CSS ───────────────────────────────────────────────────────────────────────
const CSS = `
  :root {
    --bg:#FAFAF8;--bg2:#F2F1EE;--bg3:#E8E6E1;
    --ink:#1C1917;--ink2:#57534E;--ink3:#A8A29E;
    --line:#E7E5E4;--line2:#D6D3D1;
    --gold:#B45309;--gold-bg:#FEF3C7;--gold-line:#FDE68A;
    --green:#166534;--green-bg:#DCFCE7;--green-line:#BBF7D0;
    --red:#9F1239;--red-bg:#FFE4E6;--red-line:#FECDD3;
    --blue:#1E3A8A;--blue-bg:#DBEAFE;--blue-line:#BFDBFE;
    --purple:#5B21B6;--purple-bg:#EDE9FE;--purple-line:#DDD6FE;
    --r:8px;--rL:14px;
    --sh:0 1px 3px rgba(0,0,0,.08),0 1px 2px rgba(0,0,0,.05);
  }
  *{box-sizing:border-box;margin:0;padding:0;}
  body{background:var(--bg);font-family:Georgia,serif;color:var(--ink);}
  input,select,textarea{font-family:Georgia,serif;}
  input::placeholder{color:var(--ink3);}
  input:focus,select:focus{outline:none;border-color:var(--gold)!important;}
  select option{background:#fff;}
  ::-webkit-scrollbar{width:4px;height:4px;}
  ::-webkit-scrollbar-thumb{background:var(--line2);border-radius:2px;}
  input[type=number]::-webkit-inner-spin-button{opacity:.3;}
  @keyframes fadeUp{from{opacity:0;transform:translateY(8px)}to{opacity:1;transform:translateY(0)}}
  @keyframes pulse{0%,100%{opacity:.3;transform:scale(.8)}50%{opacity:1;transform:scale(1.1)}}
  .fu{animation:fadeUp .3s ease both;}
  table{width:100%;border-collapse:collapse;}
  th,td{text-align:left;padding:10px 14px;}
`;

const iS={width:"100%",padding:"8px 11px",fontSize:14,border:"1px solid var(--line2)",borderRadius:"var(--r)",background:"#fff",color:"var(--ink)",fontFamily:"inherit"};
const selS={...iS,appearance:"none",cursor:"pointer",paddingRight:26,backgroundImage:"url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='10' height='6'%3E%3Cpath d='M0 0l5 6 5-6z' fill='%23A8A29E'/%3E%3C/svg%3E\")",backgroundRepeat:"no-repeat",backgroundPosition:"right 9px center"};

// ── Shared micro components ───────────────────────────────────────────────────
function Card({children,style}){return <div style={{background:"#fff",border:"1px solid var(--line)",borderRadius:"var(--rL)",padding:"18px 20px",boxShadow:"var(--sh)",...style}}>{children}</div>;}
function Lbl({children,sub}){return <div style={{marginBottom:6}}><div style={{fontSize:12,fontWeight:600,color:"var(--ink2)",textTransform:"uppercase",letterSpacing:"0.06em"}}>{children}</div>{sub&&<div style={{fontSize:11,color:"var(--ink3)",marginTop:2}}>{sub}</div>}</div>;}
function Btn({children,onClick,ghost,gold,purple,disabled,style}){
  const base={padding:"9px 20px",borderRadius:"var(--r)",fontSize:14,fontWeight:600,border:"none",cursor:disabled?"not-allowed":"pointer",opacity:disabled?.45:1,fontFamily:"inherit",transition:"opacity .15s",...style};
  const v=ghost?{background:"transparent",border:"1px solid var(--line2)",color:"var(--ink2)"}:gold?{background:"var(--gold-bg)",border:"1px solid var(--gold-line)",color:"var(--gold)"}:purple?{background:"var(--purple-bg)",border:"1px solid var(--purple-line)",color:"var(--purple)"}:{background:"var(--ink)",color:"#fff"};
  return <button style={{...base,...v}} onClick={disabled?undefined:onClick}>{children}</button>;
}
function Tag({margin,bench}){
  if(margin===null||!bench) return null;
  if(margin>=bench.high) return <span style={{background:"var(--green-bg)",color:"var(--green)",border:"1px solid var(--green-line)",borderRadius:99,padding:"2px 10px",fontSize:12,fontWeight:600}}>Strong · {fmtPct(margin)}</span>;
  if(margin>=bench.avg)  return <span style={{background:"var(--blue-bg)",color:"var(--blue)",border:"1px solid var(--blue-line)",borderRadius:99,padding:"2px 10px",fontSize:12,fontWeight:600}}>On Target · {fmtPct(margin)}</span>;
  if(margin>=bench.low)  return <span style={{background:"var(--gold-bg)",color:"var(--gold)",border:"1px solid var(--gold-line)",borderRadius:99,padding:"2px 10px",fontSize:12,fontWeight:600}}>Below Avg · {fmtPct(margin)}</span>;
  return <span style={{background:"var(--red-bg)",color:"var(--red)",border:"1px solid var(--red-line)",borderRadius:99,padding:"2px 10px",fontSize:12,fontWeight:600}}>At Risk · {fmtPct(margin)}</span>;
}
function UnitSel({value,onChange,highlight}){
  return <select value={value} onChange={onChange} style={{...selS,borderColor:highlight&&!value?"var(--gold)":undefined,color:highlight&&!value?"var(--ink3)":undefined}}>
    <option value="">— unit —</option>
    {UNIT_GROUPS.map(g=><optgroup key={g.label} label={g.label}>{g.units.map(u=><option key={u.v} value={u.v}>{u.l}</option>)}</optgroup>)}
  </select>;
}
function Toggle({on,onClick}){
  return <div onClick={onClick} style={{width:38,height:22,borderRadius:99,cursor:"pointer",flexShrink:0,transition:"background .2s",background:on?"var(--green)":"var(--line2)",position:"relative"}}>
    <div style={{position:"absolute",top:3,transition:"left .2s",width:16,height:16,borderRadius:"50%",background:"#fff",left:on?18:3,boxShadow:"0 1px 3px rgba(0,0,0,.2)"}}/>
  </div>;
}
function StatBox({label,value,sub,color}){
  return <div style={{background:"var(--bg2)",border:"1px solid var(--line)",borderRadius:"var(--r)",padding:"12px 14px"}}>
    <div style={{fontSize:11,fontWeight:600,color:"var(--ink3)",textTransform:"uppercase",letterSpacing:"0.05em",marginBottom:4}}>{label}</div>
    <div style={{fontSize:22,fontWeight:700,letterSpacing:"-.02em",color:color||"var(--ink)"}}>{value}</div>
    {sub&&<div style={{fontSize:12,color:"var(--ink3)",marginTop:2}}>{sub}</div>}
  </div>;
}
function InfoBox({children,color}){
  const colors={blue:{bg:"var(--blue-bg)",border:"var(--blue-line)",text:"var(--blue)"},gold:{bg:"var(--gold-bg)",border:"var(--gold-line)",text:"var(--gold)"},purple:{bg:"var(--purple-bg)",border:"var(--purple-line)",text:"var(--purple)"}};
  const c=colors[color||"blue"];
  return <div style={{background:c.bg,border:`1px solid ${c.border}`,borderRadius:"var(--r)",padding:"10px 14px",fontSize:13,color:c.text,marginBottom:12}}>{children}</div>;
}

// ── Phase nav tabs ────────────────────────────────────────────────────────────
function PhaseNav({phase,setPhase,step}){
  const phases=[
    {id:1,label:"Phase 1",sub:"Product Profitability"},
    {id:2,label:"Phase 2",sub:"Operational Profitability"},
    {id:3,label:"True Margin",sub:"Full Picture"},
  ];
  return <div style={{display:"flex",gap:0,borderBottom:"1px solid var(--line)",marginBottom:0}}>
    {phases.map(p=><button key={p.id} onClick={()=>setPhase(p.id)} style={{padding:"12px 24px",background:"none",border:"none",borderBottom:`2px solid ${phase===p.id?"var(--gold)":"transparent"}`,cursor:"pointer",fontFamily:"inherit",textAlign:"left",transition:"all .2s"}}>
      <div style={{fontSize:13,fontWeight:600,color:phase===p.id?"var(--gold)":"var(--ink2)"}}>{p.label}</div>
      <div style={{fontSize:11,color:phase===p.id?"var(--gold)":"var(--ink3)"}}>{p.sub}</div>
    </button>)}
  </div>;
}

// ── P1 Step bar ───────────────────────────────────────────────────────────────
const P1_STEPS=["Business Info","Product Sizes","Inventory","Recipes","Menu & Margins"];
const P1_STEPS_SKIP=["Business Info","Inventory","Recipes","Menu & Margins"];
function StepBar({current,skipSizes}){
  const steps=skipSizes?P1_STEPS_SKIP:P1_STEPS;
  const di=skipSizes?(current===0?0:current===1?0:current-1):current;
  return <div style={{display:"flex",alignItems:"center",paddingBottom:24}}>
    {steps.map((s,i)=><div key={i} style={{display:"flex",alignItems:"center",flex:i<steps.length-1?1:"none"}}>
      <div style={{display:"flex",flexDirection:"column",alignItems:"center",gap:5}}>
        <div style={{width:26,height:26,borderRadius:"50%",display:"flex",alignItems:"center",justifyContent:"center",fontSize:11,fontWeight:700,transition:"all .3s",background:i<di?"var(--ink)":i===di?"var(--gold)":"var(--bg3)",color:i<=di?"#fff":"var(--ink3)",border:i===di?"2px solid var(--gold)":"2px solid transparent"}}>{i<di?"✓":i+1}</div>
        <div style={{fontSize:10,fontWeight:i===di?600:400,whiteSpace:"nowrap",color:i===di?"var(--gold)":i<di?"var(--ink2)":"var(--ink3)"}}>{s}</div>
      </div>
      {i<steps.length-1&&<div style={{flex:1,height:1,margin:"0 6px",marginBottom:18,transition:"background .3s",background:i<di?"var(--ink)":"var(--line2)"}}/>}
    </div>)}
  </div>;
}

// ── P2 Step bar ───────────────────────────────────────────────────────────────
const P2_STEPS=["Employees","Shifts","Time Analysis","Labor Per Product","Capacity Model"];
function P2StepBar({current}){
  return <div style={{display:"flex",alignItems:"center",paddingBottom:24}}>
    {P2_STEPS.map((s,i)=><div key={i} style={{display:"flex",alignItems:"center",flex:i<P2_STEPS.length-1?1:"none"}}>
      <div style={{display:"flex",flexDirection:"column",alignItems:"center",gap:5}}>
        <div style={{width:26,height:26,borderRadius:"50%",display:"flex",alignItems:"center",justifyContent:"center",fontSize:11,fontWeight:700,transition:"all .3s",background:i<current?"var(--purple)":i===current?"var(--purple)":"var(--bg3)",color:i<=current?"#fff":"var(--ink3)",border:i===current?"2px solid var(--purple)":"2px solid transparent",opacity:i<current?0.7:1}}>{i<current?"✓":i+1}</div>
        <div style={{fontSize:10,fontWeight:i===current?600:400,whiteSpace:"nowrap",color:i===current?"var(--purple)":i<current?"var(--ink2)":"var(--ink3)"}}>{s}</div>
      </div>
      {i<P2_STEPS.length-1&&<div style={{flex:1,height:1,margin:"0 6px",marginBottom:18,transition:"background .3s",background:i<current?"var(--purple)":"var(--line2)"}}/>}
    </div>)}
  </div>;
}

// ════════════════════════════════════════════════════════════════════════════
// PHASE 1 COMPONENTS
// ════════════════════════════════════════════════════════════════════════════

function P1_Business({state,set,onNext}){
  const ok=state.businessName.trim()&&state.industry;
  const bench=INDUSTRIES[state.industry];
  return <div className="fu" style={{maxWidth:520,margin:"0 auto"}}>
    <h2 style={{fontSize:24,fontWeight:700,letterSpacing:"-.02em",marginBottom:8}}>Let's start with your business</h2>
    <p style={{color:"var(--ink2)",fontSize:14,lineHeight:1.6,marginBottom:20}}>This personalizes your experience and compares your numbers against real industry benchmarks.</p>
    <Card style={{display:"flex",flexDirection:"column",gap:18}}>
      <div><Lbl>Business Name</Lbl><input value={state.businessName} onChange={e=>set("businessName",e.target.value)} placeholder="e.g. Green Bean Coffee" style={iS}/></div>
      <div>
        <Lbl sub="Sets benchmark margins we compare you against">Industry</Lbl>
        <select value={state.industry} onChange={e=>set("industry",e.target.value)} style={selS}>
          <option value="">Select your industry…</option>
          {Object.keys(INDUSTRIES).map(k=><option key={k} value={k}>{k}</option>)}
        </select>
      </div>
      {bench&&<InfoBox color="gold"><strong>Benchmark:</strong> {state.industry} margins run <strong>{bench.low}–{bench.high}%</strong>, averaging <strong>{bench.avg}%</strong>. Labor typically <strong>{bench.laborLow}–{bench.laborHigh}%</strong> of revenue. {bench.note}</InfoBox>}
    </Card>
    <div style={{marginTop:20,display:"flex",justifyContent:"flex-end"}}>
      <Btn onClick={()=>onNext(state.industry==="Food & Beverage / Cafe")} disabled={!ok}>Continue →</Btn>
    </div>
  </div>;
}

function P1_Sizes({state,setState,onBack,onNext}){
  const {sizes,useSizes}=state;
  const updSize=(id,f,v)=>setState(p=>({...p,sizes:p.sizes.map(s=>s.id===id?{...s,[f]:v}:s)}));
  const active=sizes.filter(s=>s.on&&s.name.trim());
  return <div className="fu" style={{maxWidth:580,margin:"0 auto"}}>
    <h2 style={{fontSize:22,fontWeight:700,letterSpacing:"-.02em",marginBottom:8}}>Product Sizes</h2>
    <p style={{color:"var(--ink2)",fontSize:14,lineHeight:1.6,marginBottom:16}}>Define your drink or product sizes. Every recipe will get a tab per size automatically.</p>
    <Card style={{marginBottom:14}}>
      <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:14}}>
        <div><div style={{fontSize:14,fontWeight:700,marginBottom:2}}>Sell in multiple sizes?</div><div style={{fontSize:12,color:"var(--ink3)"}}>Toggle off if you don't use sizes.</div></div>
        <Toggle on={useSizes} onClick={()=>setState(p=>({...p,useSizes:!p.useSizes}))}/>
      </div>
      {useSizes&&<>
        <div style={{display:"grid",gridTemplateColumns:"1fr 100px auto",gap:8,marginBottom:6}}>
          {["Size Name","Fluid oz",""].map((h,i)=><div key={i} style={{fontSize:11,fontWeight:600,color:"var(--ink3)",textTransform:"uppercase",letterSpacing:"0.05em"}}>{h}</div>)}
        </div>
        <div style={{display:"flex",flexDirection:"column",gap:6,marginBottom:10}}>
          {sizes.map(sz=><div key={sz.id} style={{display:"grid",gridTemplateColumns:"1fr 100px auto",gap:8,alignItems:"center",opacity:sz.on?1:.45}}>
            <input value={sz.name} onChange={e=>updSize(sz.id,"name",e.target.value)} placeholder="e.g. Small" style={{...iS,fontWeight:500}}/>
            <input type="number" min="0" step="0.5" value={sz.oz} onChange={e=>updSize(sz.id,"oz",e.target.value)} placeholder="oz" style={iS}/>
            <div style={{display:"flex",gap:6}}>
              <button onClick={()=>updSize(sz.id,"on",!sz.on)} style={{background:"none",border:"none",cursor:"pointer",fontSize:14,color:sz.on?"var(--green)":"var(--ink3)",padding:0}}>{sz.on?"●":"○"}</button>
              <button onClick={()=>setState(p=>({...p,sizes:p.sizes.filter(s=>s.id!==sz.id)}))} style={{background:"none",border:"none",cursor:"pointer",fontSize:16,color:"var(--ink3)",padding:0,lineHeight:1}}>×</button>
            </div>
          </div>)}
        </div>
        <button onClick={()=>setState(p=>({...p,sizes:[...p.sizes,newSize("","")]}))} style={{width:"100%",background:"none",border:"1px dashed var(--line2)",borderRadius:"var(--r)",padding:"8px",color:"var(--ink3)",fontSize:13,cursor:"pointer",fontFamily:"inherit"}}>+ Add size</button>
        {active.length>0&&<div style={{marginTop:10,display:"flex",gap:6,flexWrap:"wrap"}}>
          {active.map(s=><span key={s.id} style={{background:"var(--gold-bg)",border:"1px solid var(--gold-line)",borderRadius:99,padding:"3px 12px",fontSize:12,color:"var(--gold)",fontWeight:500}}>{s.name}{s.oz?` · ${s.oz}oz`:""}</span>)}
        </div>}
      </>}
    </Card>
    <InfoBox color="blue">💡 Universal items like cups, lids, and sleeves are set in the Recipes step after inventory.</InfoBox>
    <div style={{display:"flex",justifyContent:"space-between"}}><Btn ghost onClick={onBack}>← Back</Btn><Btn onClick={onNext}>Continue to Inventory →</Btn></div>
  </div>;
}

function P1_Inventory({state,setState,onBack,onNext}){
  const {inventory}=state;
  const upd=(id,f,v)=>setState(p=>({...p,inventory:p.inventory.map(i=>i.id===id?{...i,[f]:v}:i)}));
  const canNext=inventory.some(i=>i.name.trim()&&toNum(i.buyQty)>0&&toNum(i.buyPrice)>0);
  return <div className="fu">
    <h2 style={{fontSize:22,fontWeight:700,letterSpacing:"-.02em",marginBottom:6}}>Inventory — What do you buy?</h2>
    <p style={{color:"var(--ink2)",fontSize:14,lineHeight:1.6,marginBottom:16}}>List everything you purchase. This becomes your cost library for recipes.</p>
    <div style={{display:"grid",gridTemplateColumns:"2fr 1fr 80px 1fr 100px 28px",gap:8,padding:"0 4px",marginBottom:8}}>
      {["Item Name","Category","Buy Qty","Buy Unit","Price Paid",""].map((h,i)=><div key={i} style={{fontSize:11,fontWeight:600,color:"var(--ink3)",textTransform:"uppercase",letterSpacing:"0.05em"}}>{h}</div>)}
    </div>
    <div style={{display:"flex",flexDirection:"column",gap:8,marginBottom:12}}>
      {inventory.map(item=>{
        const cpu=toNum(item.buyQty)>0&&toNum(item.buyPrice)>0?toNum(item.buyPrice)/toNum(item.buyQty):null;
        return <div key={item.id} style={{background:"#fff",border:"1px solid var(--line)",borderRadius:"var(--r)",padding:"10px 12px",boxShadow:"var(--sh)"}}>
          <div style={{display:"grid",gridTemplateColumns:"2fr 1fr 80px 1fr 100px 28px",gap:8,alignItems:"center"}}>
            <input value={item.name} onChange={e=>upd(item.id,"name",e.target.value)} placeholder="e.g. Whole Milk, 12oz Cup" style={iS}/>
            <select value={item.category} onChange={e=>upd(item.id,"category",e.target.value)} style={selS}>{INV_CATS.map(c=><option key={c.v} value={c.v}>{c.l}</option>)}</select>
            <input type="number" min="0" step="0.01" placeholder="1" value={item.buyQty} onChange={e=>upd(item.id,"buyQty",e.target.value)} style={iS}/>
            <select value={item.buyUnit} onChange={e=>upd(item.id,"buyUnit",e.target.value)} style={{...selS,borderColor:!item.buyUnit?"var(--gold)":undefined,color:!item.buyUnit?"var(--ink3)":undefined}}>
              <option value="">— pick unit —</option>
              {UNIT_GROUPS.map(g=><optgroup key={g.label} label={g.label}>{g.units.map(u=><option key={u.v} value={u.v}>{u.l}</option>)}</optgroup>)}
            </select>
            <div style={{position:"relative"}}><span style={{position:"absolute",left:9,top:"50%",transform:"translateY(-50%)",fontSize:12,color:"var(--ink3)"}}>$</span><input type="number" min="0" step="0.01" placeholder="0.00" value={item.buyPrice} onChange={e=>upd(item.id,"buyPrice",e.target.value)} style={{...iS,paddingLeft:20}}/></div>
            <button onClick={()=>{if(inventory.length>1)setState(p=>({...p,inventory:p.inventory.filter(i=>i.id!==item.id)}))}} style={{background:"none",border:"none",color:"var(--ink3)",cursor:"pointer",fontSize:18,padding:0,lineHeight:1}}>×</button>
          </div>
          {cpu!==null&&<div style={{marginTop:5,fontSize:12,color:"var(--ink3)"}}>Cost per {item.buyUnit||"unit"}: <strong style={{color:"var(--ink2)"}}>${cpu.toFixed(4)}</strong></div>}
        </div>;
      })}
    </div>
    <button onClick={()=>setState(p=>({...p,inventory:[...p.inventory,newInvItem()]}))} style={{width:"100%",background:"none",border:"1px dashed var(--line2)",borderRadius:"var(--r)",padding:"10px",color:"var(--ink3)",fontSize:13,cursor:"pointer",fontFamily:"inherit"}}>+ Add inventory item</button>
    <div style={{marginTop:20,display:"flex",justifyContent:"space-between",alignItems:"center"}}>
      <Btn ghost onClick={onBack}>← Back</Btn>
      {!canNext&&<span style={{fontSize:12,color:"var(--ink3)"}}>Add at least one item with qty and price.</span>}
      <Btn onClick={onNext} disabled={!canNext}>Continue to Recipes →</Btn>
    </div>
  </div>;
}

function IngEditor({ings,inventory,universalIds,onChange}){
  const namedInv=inventory.filter(i=>i.name.trim());
  const updIng=(id,f,v)=>onChange(ings.map(i=>i.id===id?{...i,[f]:v}:i));
  return <div>
    <div style={{display:"grid",gridTemplateColumns:"1fr 80px 130px 80px 24px",gap:8,padding:"0 2px",marginBottom:6}}>
      {["Inventory Item","Qty","Unit","Cost",""].map((h,i)=><div key={i} style={{fontSize:11,fontWeight:600,color:"var(--ink3)",textTransform:"uppercase",letterSpacing:"0.05em"}}>{h}</div>)}
    </div>
    <div style={{display:"flex",flexDirection:"column",gap:7,marginBottom:10}}>
      {ings.map(ing=>{
        const inv=inventory.find(i=>i.id===ing.inventoryId);
        const cost=inv?convertCost(inv.buyQty,inv.buyUnit,inv.buyPrice,ing.useQty,ing.useUnit):null;
        const mismatch=inv&&ing.useUnit&&FAM[inv.buyUnit]&&FAM[ing.useUnit]&&FAM[inv.buyUnit]!==FAM[ing.useUnit];
        const isU=ing.universal||(inv&&universalIds.includes(inv.id));
        return <div key={ing.id} style={{background:isU?"var(--gold-bg)":"var(--bg2)",border:`1px solid ${isU?"var(--gold-line)":"var(--line)"}`,borderRadius:"var(--r)",padding:"9px 11px"}}>
          {isU&&<div style={{fontSize:10,color:"var(--gold)",fontWeight:700,textTransform:"uppercase",letterSpacing:"0.05em",marginBottom:5}}>◆ Universal</div>}
          <div style={{display:"grid",gridTemplateColumns:"1fr 80px 130px 80px 24px",gap:8,alignItems:"center"}}>
            <select value={ing.inventoryId} onChange={e=>{const inv2=inventory.find(i=>i.id===e.target.value);onChange(ings.map(i=>i.id===ing.id?{...i,inventoryId:e.target.value,useUnit:inv2?.buyUnit||i.useUnit}:i));}} style={selS}>
              <option value="">— select item —</option>
              {namedInv.map(i=><option key={i.id} value={i.id}>{i.name}{i.buyUnit?` (${i.buyUnit})`:""}</option>)}
            </select>
            <input type="number" min="0" step="0.001" placeholder="Qty" value={ing.useQty} onChange={e=>updIng(ing.id,"useQty",e.target.value)} style={iS}/>
            <UnitSel value={ing.useUnit} onChange={e=>updIng(ing.id,"useUnit",e.target.value)} highlight/>
            <div style={{textAlign:"right",fontSize:13,fontWeight:500,color:cost!==null?"var(--green)":"var(--ink3)"}}>{cost!==null?fmt$4(cost):"—"}</div>
            <button onClick={()=>onChange(ings.filter(i=>i.id!==ing.id))} style={{background:"none",border:"none",color:"var(--ink3)",cursor:"pointer",fontSize:18,padding:0,lineHeight:1}}>×</button>
          </div>
          {mismatch&&<div style={{fontSize:11,color:"var(--red)",marginTop:4,background:"var(--red-bg)",border:"1px solid var(--red-line)",borderRadius:"var(--r)",padding:"4px 8px"}}>⚠ Unit mismatch — use oz (fluid) for liquids, oz (weight) for dry.</div>}
          {!mismatch&&cost!==null&&inv&&inv.buyUnit!==ing.useUnit&&<div style={{fontSize:11,color:"var(--green)",marginTop:3}}>✓ Auto-converted {inv.buyUnit} → {ing.useUnit}</div>}
        </div>;
      })}
    </div>
    <button onClick={()=>onChange([...ings,newIngRow()])} style={{width:"100%",background:"none",border:"1px dashed var(--line2)",borderRadius:"var(--r)",padding:"9px",color:"var(--ink3)",fontSize:13,cursor:"pointer",fontFamily:"inherit"}}>+ Add ingredient</button>
  </div>;
}

function ProductEditor({product,inventory,sizes,useSizes,universalItems,setState}){
  const activeSizes=useSizes?sizes.filter(s=>s.on&&s.name.trim()):[];
  const [activeSzId,setActiveSzId]=useState(activeSizes[0]?.id||"__flat__");
  const universalIds=universalItems.map(u=>u.inventoryId).filter(Boolean);
  function getKey(szId){return szId==="__flat__"?"__flat__":`sz_${szId}`;}
  function getIngs(szId){const key=getKey(szId);if(product[key]&&product[key].length>0)return product[key];const seeded=universalItems.filter(u=>u.inventoryId).map(u=>({id:uid(),inventoryId:u.inventoryId,useQty:u.useQty,useUnit:u.useUnit,universal:true}));return[...seeded,newIngRow()];}
  function setIngs(szId,ings){const key=getKey(szId);setState(p=>({...p,products:p.products.map(x=>x.id===product.id?{...x,[key]:ings}:x)}));}
  function calcTotal(ings){return ings.reduce((s,ing)=>{const inv=inventory.find(i=>i.id===ing.inventoryId);const c=inv?convertCost(inv.buyQty,inv.buyUnit,inv.buyPrice,ing.useQty,ing.useUnit):null;return s+(c||0);},0);}
  const curSzId=activeSizes.length>0?activeSzId:"__flat__";
  const curIngs=getIngs(curSzId);
  const curTotal=calcTotal(curIngs);
  return <div style={{display:"grid",gridTemplateColumns:"1fr 200px",gap:14,alignItems:"start"}}>
    <div>
      {activeSizes.length>0&&<div style={{display:"flex",gap:6,marginBottom:12,flexWrap:"wrap",alignItems:"center"}}>
        {activeSizes.map(sz=><button key={sz.id} onClick={()=>setActiveSzId(sz.id)} style={{padding:"5px 14px",borderRadius:99,fontSize:13,fontWeight:500,cursor:"pointer",border:"1px solid",borderColor:activeSzId===sz.id?"var(--ink)":"var(--line2)",background:activeSzId===sz.id?"var(--ink)":"#fff",color:activeSzId===sz.id?"#fff":"var(--ink2)"}}>{sz.name}{sz.oz?` · ${sz.oz}oz`:""}</button>)}
        <span style={{fontSize:12,color:"var(--ink3)"}}>Fill each size</span>
      </div>}
      <IngEditor ings={curIngs} inventory={inventory} universalIds={universalIds} onChange={ings=>setIngs(curSzId,ings)}/>
    </div>
    <div style={{position:"sticky",top:16}}>
      <Card>
        <div style={{fontSize:11,fontWeight:600,color:"var(--ink3)",textTransform:"uppercase",letterSpacing:"0.06em",marginBottom:10}}>Live Cost</div>
        <div style={{fontSize:13,fontWeight:700,marginBottom:activeSizes.length>0?2:8}}>{product.name||"Unnamed"}</div>
        {activeSizes.length>0&&<div style={{fontSize:12,color:"var(--ink3)",marginBottom:8}}>{activeSizes.find(s=>s.id===activeSzId)?.name||""}</div>}
        <div style={{display:"flex",flexDirection:"column",gap:5}}>
          {curIngs.map(ing=>{const inv=inventory.find(i=>i.id===ing.inventoryId);if(!inv)return null;const c=convertCost(inv.buyQty,inv.buyUnit,inv.buyPrice,ing.useQty,ing.useUnit);return <div key={ing.id} style={{display:"flex",justifyContent:"space-between",fontSize:12}}><span style={{color:ing.universal?"var(--gold)":"var(--ink2)"}}>{ing.universal&&"◆ "}{inv.name}</span><span style={{fontFamily:"monospace",color:c!==null?"var(--ink)":"var(--ink3)"}}>{c!==null?fmt$4(c):"—"}</span></div>;})}
        </div>
        {curTotal>0?<><div style={{height:1,background:"var(--line)",margin:"10px 0"}}/><div style={{display:"flex",justifyContent:"space-between",fontSize:14,fontWeight:700}}><span>COGS</span><span style={{fontFamily:"monospace"}}>{fmt$(curTotal)}</span></div></>:<div style={{textAlign:"center",color:"var(--ink3)",fontSize:12,padding:"10px 0"}}>Select ingredients</div>}
      </Card>
      {activeSizes.length>1&&<Card style={{marginTop:10}}>
        <div style={{fontSize:11,fontWeight:600,color:"var(--ink3)",textTransform:"uppercase",letterSpacing:"0.06em",marginBottom:8}}>All Sizes</div>
        {activeSizes.map(sz=>{const t=calcTotal(getIngs(sz.id));return <div key={sz.id} style={{display:"flex",justifyContent:"space-between",fontSize:12,marginBottom:5}}><span style={{color:"var(--ink2)"}}>{sz.name}{sz.oz?` · ${sz.oz}oz`:""}</span><span style={{fontFamily:"monospace",color:t>0?"var(--ink)":"var(--ink3)"}}>{t>0?fmt$(t):"—"}</span></div>;})}
      </Card>}
    </div>
  </div>;
}

function P1_Recipes({state,setState,onBack,onNext}){
  const {products,inventory,sizes,useSizes,universalItems}=state;
  const [activeId,setActiveId]=useState(products[0]?.id);
  const namedInv=inventory.filter(i=>i.name.trim());
  function addProd(){const np=newProduct();setState(p=>({...p,products:[...p.products,np]}));setActiveId(np.id);}
  function remProd(id){if(products.length<=1)return;const next=products.find(p=>p.id!==id);setState(p=>({...p,products:p.products.filter(x=>x.id!==id)}));setActiveId(next.id);}
  const active=products.find(p=>p.id===activeId)||products[0];
  const canNext=products.some(p=>p.name.trim());
  return <div className="fu">
    <h2 style={{fontSize:22,fontWeight:700,letterSpacing:"-.02em",marginBottom:6}}>Recipes — What goes into each product?</h2>
    <InfoBox color="gold"><strong>Tip:</strong> Use <em>oz (fluid)</em> for liquids. Use <em>oz (weight)</em> for dry ingredients on a scale. Units convert automatically — gallon → oz works correctly.</InfoBox>
    <Card style={{marginBottom:14,background:"var(--gold-bg)",borderColor:"var(--gold-line)"}}>
      <div style={{fontSize:13,fontWeight:700,color:"var(--gold)",marginBottom:4}}>◆ Universal Items — Pre-filled on Every Recipe</div>
      <div style={{fontSize:12,color:"var(--ink2)",marginBottom:10}}>Items every product includes — cup, lid, sleeve. Set once, pre-populate everywhere.</div>
      {universalItems.length>0&&<div style={{display:"flex",flexDirection:"column",gap:6,marginBottom:10}}>
        {universalItems.map(u=><div key={u.id} style={{display:"grid",gridTemplateColumns:"1fr 80px 130px 28px",gap:8,alignItems:"center",background:"#fff",borderRadius:"var(--r)",padding:"8px 10px",border:"1px solid var(--gold-line)"}}>
          <select value={u.inventoryId} onChange={e=>{const inv2=namedInv.find(i=>i.id===e.target.value);setState(p=>({...p,universalItems:p.universalItems.map(x=>x.id===u.id?{...x,inventoryId:e.target.value,useUnit:inv2?.buyUnit||x.useUnit}:x)}));}} style={selS}>
            <option value="">— select item —</option>
            {namedInv.map(i=><option key={i.id} value={i.id}>{i.name}{i.buyUnit?` (${i.buyUnit})`:""}</option>)}
          </select>
          <input type="number" min="0" step="0.001" value={u.useQty} placeholder="1" onChange={e=>setState(p=>({...p,universalItems:p.universalItems.map(x=>x.id===u.id?{...x,useQty:e.target.value}:x)}))} style={iS}/>
          <UnitSel value={u.useUnit} onChange={e=>setState(p=>({...p,universalItems:p.universalItems.map(x=>x.id===u.id?{...x,useUnit:e.target.value}:x)}))} highlight/>
          <button onClick={()=>setState(p=>({...p,universalItems:p.universalItems.filter(x=>x.id!==u.id)}))} style={{background:"none",border:"none",color:"var(--ink3)",cursor:"pointer",fontSize:18,padding:0,lineHeight:1}}>×</button>
        </div>)}
      </div>}
      <button onClick={()=>setState(p=>({...p,universalItems:[...p.universalItems,newUniversal()]}))} style={{background:"#fff",border:"1px dashed var(--gold-line)",borderRadius:"var(--r)",padding:"8px",width:"100%",color:"var(--gold)",fontSize:13,cursor:"pointer",fontFamily:"inherit"}}>+ Add universal item (cup, lid, sleeve…)</button>
    </Card>
    <div style={{display:"flex",gap:8,flexWrap:"wrap",marginBottom:14,borderBottom:"1px solid var(--line)",paddingBottom:10}}>
      {products.map(p=><button key={p.id} onClick={()=>setActiveId(p.id)} style={{padding:"6px 14px",borderRadius:99,fontSize:13,fontWeight:500,cursor:"pointer",border:"1px solid",borderColor:activeId===p.id?"var(--gold)":"var(--line2)",background:activeId===p.id?"var(--gold-bg)":"#fff",color:activeId===p.id?"var(--gold)":"var(--ink2)",display:"flex",alignItems:"center",gap:8}}>
        {p.name||"Unnamed"}{products.length>1&&<span onClick={e=>{e.stopPropagation();remProd(p.id);}} style={{color:"var(--ink3)",fontSize:14}}>×</span>}
      </button>)}
      <button onClick={addProd} style={{padding:"6px 14px",borderRadius:99,fontSize:13,background:"none",border:"1px dashed var(--line2)",color:"var(--ink3)",cursor:"pointer",fontFamily:"inherit"}}>+ New product</button>
    </div>
    {active&&<><Card style={{marginBottom:12}}><Lbl>Product Name</Lbl><input value={active.name} onChange={e=>setState(p=>({...p,products:p.products.map(x=>x.id===active.id?{...x,name:e.target.value}:x)}))} placeholder="e.g. Oat Milk Latte" style={{...iS,fontSize:15,fontWeight:500}}/></Card>
    <ProductEditor key={active.id} product={active} inventory={inventory} sizes={sizes} useSizes={useSizes} universalItems={universalItems} setState={setState}/></>}
    <div style={{marginTop:20,display:"flex",justifyContent:"space-between",alignItems:"center"}}>
      <Btn ghost onClick={onBack}>← Back</Btn>
      {!canNext&&<span style={{fontSize:12,color:"var(--ink3)"}}>Name at least one product to continue.</span>}
      <Btn onClick={onNext} disabled={!canNext}>Continue to Menu & Margins →</Btn>
    </div>
  </div>;
}

function P1_Menu({state,setState,onBack}){
  const {products,inventory,sizes,useSizes,industry,businessName}=state;
  const bench=INDUSTRIES[industry];
  const activeSizes=useSizes?sizes.filter(s=>s.on&&s.name.trim()):[];
  const [messages,setMessages]=useState([]);
  const [chatInput,setChatInput]=useState("");
  const [loading,setLoading]=useState(false);
  const endRef=useRef(null);
  useEffect(()=>{endRef.current?.scrollIntoView({behavior:"smooth"});},[messages,loading]);

  function calcCOGS(prod,szId){const key=szId==="__flat__"?"__flat__":`sz_${szId}`;const ings=prod[key]||[];return ings.reduce((s,ing)=>{const inv=inventory.find(i=>i.id===ing.inventoryId);const c=inv?convertCost(inv.buyQty,inv.buyUnit,inv.buyPrice,ing.useQty,ing.useUnit):null;return s+(c||0);},0);}
  function calcMargin(sell,cogs){const p=toNum(sell),c=toNum(cogs);return(!p||!c||p<=0)?null:((p-c)/p)*100;}

  const rows=[];
  products.filter(p=>p.name.trim()).forEach(prod=>{
    if(activeSizes.length>0){activeSizes.forEach(sz=>{const cogs=calcCOGS(prod,sz.id);rows.push({key:`${prod.id}-${sz.id}`,label:`${prod.name} · ${sz.name}${sz.oz?` (${sz.oz}oz)`:""}`,prod,szId:sz.id,sellKey:`sell_${sz.id}`,cogs,sellPrice:prod[`sell_${sz.id}`]||""});});}
    else{const cogs=calcCOGS(prod,"__flat__");rows.push({key:prod.id,label:prod.name,prod,szId:"__flat__",sellKey:"sellPrice",cogs,sellPrice:prod.sellPrice||""});}
  });

  function updSell(prod,sellKey,v){setState(p=>({...p,products:p.products.map(x=>x.id===prod.id?{...x,[sellKey]:v}:x)}));}
  const allMargins=rows.map(r=>calcMargin(r.sellPrice,r.cogs)).filter(m=>m!==null);
  const avgMargin=allMargins.length?allMargins.reduce((s,m)=>s+m,0)/allMargins.length:null;

  async function send(override){
    const text=override||chatInput.trim();if(!text)return;
    setChatInput("");const next=[...messages,{role:"user",content:text}];setMessages(next);setLoading(true);
    try{const res=await fetch("https://api.anthropic.com/v1/messages",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({model:"claude-sonnet-4-20250514",max_tokens:1000,system:`You are a direct small-business financial coach. Business: ${businessName} | Industry: ${industry} | Benchmark: ${bench?`${bench.avg}% avg (${bench.low}–${bench.high}%). ${bench.note}`:"Unknown"} | Menu: ${rows.map(r=>`${r.label}: COGS ${fmt$(r.cogs)}, sell ${r.sellPrice?fmt$(r.sellPrice):"not set"}, margin ${calcMargin(r.sellPrice,r.cogs)!==null?fmtPct(calcMargin(r.sellPrice,r.cogs)):"N/A"}`).join("; ")} | Avg margin: ${avgMargin!==null?fmtPct(avgMargin):"N/A"}. Under 200 words, end with one action.`,messages:next})});
    const data=await res.json();setMessages(p=>[...p,{role:"assistant",content:data.content?.find(b=>b.type==="text")?.text||"No response."}]);}
    catch{setMessages(p=>[...p,{role:"assistant",content:"Connection error."}]);}
    setLoading(false);
  }

  return <div className="fu">
    <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start",flexWrap:"wrap",gap:10,marginBottom:14}}>
      <div><h2 style={{fontSize:22,fontWeight:700,letterSpacing:"-.02em",marginBottom:2}}>Menu & Margins</h2><p style={{fontSize:13,color:"var(--ink2)"}}>{businessName} · {industry}</p></div>
      {bench&&<div style={{background:"var(--gold-bg)",border:"1px solid var(--gold-line)",borderRadius:"var(--r)",padding:"8px 14px",fontSize:12}}><strong style={{color:"var(--gold)"}}>Target: {bench.avg}% avg</strong><span style={{color:"var(--ink3)",marginLeft:6}}>({bench.low}–{bench.high}%)</span></div>}
    </div>
    {allMargins.length>0&&<div style={{display:"grid",gridTemplateColumns:"repeat(auto-fit,minmax(120px,1fr))",gap:10,marginBottom:14}}>
      <StatBox label="Avg Margin" value={fmtPct(avgMargin)} color={bench&&avgMargin>=bench.avg?"var(--green)":bench&&avgMargin>=bench.low?"var(--gold)":"var(--red)"}/>
      <StatBox label="Items Priced" value={`${allMargins.length}/${rows.length}`}/>
      <StatBox label="Benchmark" value={bench?`${bench.avg}%`:"—"}/>
      <StatBox label="Gap" value={bench&&avgMargin!==null?`${(avgMargin-bench.avg)>0?"+":""}${(avgMargin-bench.avg).toFixed(1)}%`:"—"} color={bench&&avgMargin!==null&&avgMargin>=bench.avg?"var(--green)":"var(--red)"}/>
    </div>}
    <Card style={{marginBottom:14,padding:0,overflow:"hidden"}}>
      <table>
        <thead><tr style={{background:"var(--bg2)",borderBottom:"1px solid var(--line)"}}>{["Product","COGS","Sell Price","Gross Margin","Profit/Item","vs Benchmark"].map(h=><th key={h} style={{fontSize:11,fontWeight:600,color:"var(--ink3)",textTransform:"uppercase",letterSpacing:"0.05em"}}>{h}</th>)}</tr></thead>
        <tbody>
          {rows.map((row,i)=>{const m=calcMargin(row.sellPrice,row.cogs);const profit=toNum(row.sellPrice)-row.cogs;const vs=m!==null&&bench?m-bench.avg:null;
          return <tr key={row.key} style={{borderBottom:"1px solid var(--line)",background:i%2===0?"#fff":"var(--bg2)"}}>
            <td style={{fontWeight:500}}>{row.label}</td>
            <td style={{fontFamily:"monospace",fontSize:13}}>{row.cogs>0?fmt$(row.cogs):<span style={{color:"var(--ink3)"}}>—</span>}</td>
            <td><div style={{position:"relative",maxWidth:90}}><span style={{position:"absolute",left:8,top:"50%",transform:"translateY(-50%)",fontSize:12,color:"var(--ink3)"}}>$</span><input type="number" min="0" step="0.01" placeholder="0.00" value={row.sellPrice} onChange={e=>updSell(row.prod,row.sellKey,e.target.value)} style={{...iS,paddingLeft:18,width:90,fontSize:13}}/></div></td>
            <td><Tag margin={m} bench={bench}/></td>
            <td style={{fontFamily:"monospace",fontSize:13,fontWeight:500,color:profit>0?"var(--green)":"var(--ink3)"}}>{row.sellPrice&&row.cogs>0?fmt$(profit):"—"}</td>
            <td style={{fontSize:13,fontWeight:500,color:vs===null?"var(--ink3)":vs>=0?"var(--green)":"var(--red)"}}>{vs!==null?`${vs>0?"+":""}${vs.toFixed(1)}%`:"—"}</td>
          </tr>;})}
        </tbody>
      </table>
      {rows.length===0&&<div style={{textAlign:"center",padding:"28px",color:"var(--ink3)",fontSize:14}}>No named products yet.</div>}
    </Card>
    <Card>
      <div style={{fontSize:13,fontWeight:600,marginBottom:10,display:"flex",alignItems:"center",gap:6}}><span style={{width:20,height:20,background:"var(--ink)",color:"#fff",borderRadius:"50%",display:"inline-flex",alignItems:"center",justifyContent:"center",fontSize:10}}>AI</span>Business Coach</div>
      {messages.length===0&&<div style={{display:"flex",flexWrap:"wrap",gap:8,marginBottom:10}}>{["How are my margins?","Which item to reprice first?","How to improve my worst margin?","What price increase is realistic?"].map(q=><button key={q} onClick={()=>send(q)} style={{background:"var(--bg2)",border:"1px solid var(--line)",borderRadius:99,padding:"5px 12px",fontSize:12,color:"var(--ink2)",cursor:"pointer",fontFamily:"inherit"}}>{q}</button>)}</div>}
      {messages.length>0&&<div style={{background:"var(--bg2)",borderRadius:"var(--r)",border:"1px solid var(--line)",maxHeight:280,overflowY:"auto",padding:"12px",display:"flex",flexDirection:"column",gap:10,marginBottom:10}}>
        {messages.map((m,i)=><div key={i} style={{display:"flex",gap:8,flexDirection:m.role==="user"?"row-reverse":"row",alignItems:"flex-start"}}><div style={{width:22,height:22,borderRadius:"50%",background:m.role==="user"?"var(--bg3)":"var(--ink)",display:"flex",alignItems:"center",justifyContent:"center",fontSize:10,fontWeight:600,color:m.role==="user"?"var(--ink2)":"#fff",flexShrink:0}}>{m.role==="user"?"U":"AI"}</div><div style={{maxWidth:"82%",background:"#fff",border:"1px solid var(--line)",borderRadius:"var(--r)",padding:"8px 12px",fontSize:13,lineHeight:1.7,whiteSpace:"pre-wrap"}}>{m.content}</div></div>)}
        {loading&&<div style={{display:"flex",gap:8}}><div style={{width:22,height:22,borderRadius:"50%",background:"var(--ink)",display:"flex",alignItems:"center",justifyContent:"center",fontSize:10,color:"#fff"}}>AI</div><div style={{background:"#fff",border:"1px solid var(--line)",borderRadius:"var(--r)",padding:"9px 12px",display:"flex",gap:5}}>{[0,1,2].map(i=><span key={i} style={{width:5,height:5,borderRadius:"50%",background:"var(--ink3)",display:"inline-block",animation:"pulse 1.2s ease-in-out infinite",animationDelay:`${i*.2}s`}}/>)}</div></div>}
        <div ref={endRef}/>
      </div>}
      <div style={{display:"flex",gap:8}}><input value={chatInput} onChange={e=>setChatInput(e.target.value)} onKeyDown={e=>e.key==="Enter"&&!e.shiftKey&&send()} placeholder="Ask about margins, pricing, or how to improve…" style={{...iS,flex:1}}/><Btn onClick={()=>send()} disabled={loading||!chatInput.trim()}>Ask</Btn></div>
    </Card>
    <div style={{marginTop:16}}><Btn ghost onClick={onBack}>← Back to Recipes</Btn></div>
  </div>;
}

// ════════════════════════════════════════════════════════════════════════════
// PHASE 2 COMPONENTS
// ════════════════════════════════════════════════════════════════════════════

// ── P2 Module 1: Employees ────────────────────────────────────────────────────
function P2_Employees({state,setState,onNext}){
  const {employees}=state;
  const upd=(id,f,v)=>setState(p=>({...p,employees:p.employees.map(e=>e.id===id?{...e,[f]:v}:e)}));
  const add=()=>setState(p=>({...p,employees:[...p.employees,newEmployee()]}));
  const rem=(id)=>{if(employees.length>1)setState(p=>({...p,employees:p.employees.filter(e=>e.id!==id)}));};
  const canNext=employees.some(e=>e.name.trim()&&toNum(e.wage)>0);

  const totalHourly=employees.filter(e=>e.wageType==="hourly").reduce((s,e)=>s+toNum(e.wage),0);
  const totalSalary=employees.filter(e=>e.wageType==="salary").reduce((s,e)=>s+toNum(e.wage),0);

  return <div className="fu">
    <h2 style={{fontSize:22,fontWeight:700,letterSpacing:"-.02em",marginBottom:6}}>Employee Database</h2>
    <p style={{color:"var(--ink2)",fontSize:14,lineHeight:1.6,marginBottom:16}}>Add every person on your team — their title, wage type, and rate. This feeds your shift builder, labor calculator, and capacity model.</p>
    <div style={{display:"grid",gridTemplateColumns:"1.5fr 1.2fr 1fr 1fr 1fr 28px",gap:8,padding:"0 4px",marginBottom:8}}>
      {["Name","Title / Position","Wage Type","Rate","Labor Type",""].map((h,i)=><div key={i} style={{fontSize:11,fontWeight:600,color:"var(--ink3)",textTransform:"uppercase",letterSpacing:"0.05em"}}>{h}</div>)}
    </div>
    <div style={{display:"flex",flexDirection:"column",gap:8,marginBottom:12}}>
      {employees.map(emp=>{
        const hourlyEq=emp.wageType==="salary"?toNum(emp.wage)/52/40:toNum(emp.wage);
        return <div key={emp.id} style={{background:"#fff",border:"1px solid var(--line)",borderRadius:"var(--r)",padding:"10px 12px",boxShadow:"var(--sh)"}}>
          <div style={{display:"grid",gridTemplateColumns:"1.5fr 1.2fr 1fr 1fr 1fr 28px",gap:8,alignItems:"center"}}>
            <input value={emp.name} onChange={e=>upd(emp.id,"name",e.target.value)} placeholder="Employee name" style={iS}/>
            <input value={emp.title} onChange={e=>upd(emp.id,"title",e.target.value)} placeholder="e.g. Barista, Manager" style={iS}/>
            <select value={emp.wageType} onChange={e=>upd(emp.id,"wageType",e.target.value)} style={selS}>
              <option value="hourly">Hourly</option>
              <option value="salary">Salary</option>
            </select>
            <div style={{position:"relative"}}><span style={{position:"absolute",left:9,top:"50%",transform:"translateY(-50%)",fontSize:12,color:"var(--ink3)"}}>$</span><input type="number" min="0" step="0.01" placeholder={emp.wageType==="hourly"?"0.00/hr":"0/yr"} value={emp.wage} onChange={e=>upd(emp.id,"wage",e.target.value)} style={{...iS,paddingLeft:20}}/></div>
            <select value={emp.laborType} onChange={e=>upd(emp.id,"laborType",e.target.value)} style={selS}>
              <option value="direct">Direct Labor</option>
              <option value="indirect">Indirect Labor</option>
            </select>
            <button onClick={()=>rem(emp.id)} style={{background:"none",border:"none",color:"var(--ink3)",cursor:"pointer",fontSize:18,padding:0,lineHeight:1}}>×</button>
          </div>
          {toNum(emp.wage)>0&&<div style={{marginTop:5,fontSize:12,color:"var(--ink3)"}}>
            {emp.wageType==="salary"?`≈ $${hourlyEq.toFixed(2)}/hr equivalent`:`$${(toNum(emp.wage)*40).toFixed(0)}/wk · $${(toNum(emp.wage)*40*52).toFixed(0)}/yr`}
            <span style={{marginLeft:10,background:emp.laborType==="direct"?"var(--blue-bg)":"var(--purple-bg)",color:emp.laborType==="direct"?"var(--blue)":"var(--purple)",borderRadius:99,padding:"1px 8px",fontSize:11,fontWeight:600}}>{emp.laborType==="direct"?"Direct":"Indirect"}</span>
          </div>}
        </div>;
      })}
    </div>
    <button onClick={add} style={{width:"100%",background:"none",border:"1px dashed var(--line2)",borderRadius:"var(--r)",padding:"10px",color:"var(--ink3)",fontSize:13,cursor:"pointer",fontFamily:"inherit"}}>+ Add employee</button>
    {employees.some(e=>toNum(e.wage)>0)&&<div style={{marginTop:14,display:"grid",gridTemplateColumns:"1fr 1fr",gap:10}}>
      {totalHourly>0&&<InfoBox color="blue">Total hourly wages: <strong>${totalHourly.toFixed(2)}/hr</strong> across {employees.filter(e=>e.wageType==="hourly"&&toNum(e.wage)>0).length} staff</InfoBox>}
      {totalSalary>0&&<InfoBox color="purple">Total salary: <strong>${totalSalary.toLocaleString()}/yr</strong> across {employees.filter(e=>e.wageType==="salary"&&toNum(e.wage)>0).length} staff</InfoBox>}
    </div>}
    <div style={{marginTop:16,display:"flex",justifyContent:"space-between",alignItems:"center"}}>
      <span style={{fontSize:12,color:"var(--ink3)"}}>Phase 2 · Step 1 of 5</span>
      {!canNext&&<span style={{fontSize:12,color:"var(--ink3)"}}>Add at least one employee with a wage.</span>}
      <Btn onClick={onNext} disabled={!canNext}>Continue to Shifts →</Btn>
    </div>
  </div>;
}

// ── P2 Module 2: Shifts ───────────────────────────────────────────────────────
function P2_Shifts({state,setState,onBack,onNext}){
  const {shifts,employees}=state;
  const namedEmps=employees.filter(e=>e.name.trim());
  const upd=(id,f,v)=>setState(p=>({...p,shifts:p.shifts.map(s=>s.id===id?{...s,[f]:v}:s)}));
  const add=()=>setState(p=>({...p,shifts:[...p.shifts,newShift()]}));
  const rem=(id)=>{if(shifts.length>1)setState(p=>({...p,shifts:p.shifts.filter(s=>s.id!==id)}));};
  function toggleDay(shiftId,day){setState(p=>({...p,shifts:p.shifts.map(s=>s.id===shiftId?{...s,days:s.days.includes(day)?s.days.filter(d=>d!==day):[...s.days,day]}:s)}));}
  function togglePos(shiftId,empId){setState(p=>({...p,shifts:p.shifts.map(s=>s.id===shiftId?{...s,positions:s.positions.includes(empId)?s.positions.filter(e=>e!==empId):[...s.positions,empId]}:s)}));}

  function shiftHours(s){
    const [sh,sm]=s.startTime.split(":").map(Number);
    const [eh,em]=s.endTime.split(":").map(Number);
    return Math.max(0,(eh*60+em-sh*60-sm)/60);
  }
  function shiftLaborCost(s){
    const hrs=shiftHours(s);
    return s.positions.reduce((sum,empId)=>{
      const emp=employees.find(e=>e.id===empId);
      if(!emp)return sum;
      const rate=emp.wageType==="hourly"?toNum(emp.wage):toNum(emp.wage)/52/40;
      return sum+rate*hrs;
    },0);
  }

  return <div className="fu">
    <h2 style={{fontSize:22,fontWeight:700,letterSpacing:"-.02em",marginBottom:6}}>Schedule & Shift Builder</h2>
    <p style={{color:"var(--ink2)",fontSize:14,lineHeight:1.6,marginBottom:16}}>Define your shifts — name them, set hours, pick which days they run, and assign employees. Labor cost per shift calculates automatically.</p>
    <div style={{display:"flex",flexDirection:"column",gap:12,marginBottom:12}}>
      {shifts.map(shift=>{
        const hrs=shiftHours(shift);
        const cost=shiftLaborCost(shift);
        const weeklyCost=cost*shift.days.length;
        return <Card key={shift.id}>
          <div style={{display:"grid",gridTemplateColumns:"1fr 120px 120px 28px",gap:10,marginBottom:12,alignItems:"end"}}>
            <div><Lbl>Shift Name</Lbl><input value={shift.name} onChange={e=>upd(shift.id,"name",e.target.value)} placeholder="e.g. Morning Bar, Kitchen AM" style={iS}/></div>
            <div><Lbl>Start Time</Lbl><input type="time" value={shift.startTime} onChange={e=>upd(shift.id,"startTime",e.target.value)} style={iS}/></div>
            <div><Lbl>End Time</Lbl><input type="time" value={shift.endTime} onChange={e=>upd(shift.id,"endTime",e.target.value)} style={iS}/></div>
            <button onClick={()=>rem(shift.id)} style={{background:"none",border:"none",color:"var(--ink3)",cursor:"pointer",fontSize:18,padding:0,lineHeight:1,paddingTop:20}}>×</button>
          </div>
          <div style={{marginBottom:12}}>
            <Lbl>Days this shift runs</Lbl>
            <div style={{display:"flex",gap:6,flexWrap:"wrap"}}>
              {DAYS.map(d=><button key={d} onClick={()=>toggleDay(shift.id,d)} style={{padding:"4px 10px",borderRadius:99,fontSize:12,fontWeight:500,cursor:"pointer",border:"1px solid",borderColor:shift.days.includes(d)?"var(--ink)":"var(--line2)",background:shift.days.includes(d)?"var(--ink)":"#fff",color:shift.days.includes(d)?"#fff":"var(--ink2)"}}>{d}</button>)}
            </div>
          </div>
          {namedEmps.length>0&&<div style={{marginBottom:10}}>
            <Lbl>Employees on this shift</Lbl>
            <div style={{display:"flex",gap:6,flexWrap:"wrap"}}>
              {namedEmps.map(emp=><button key={emp.id} onClick={()=>togglePos(shift.id,emp.id)} style={{padding:"4px 10px",borderRadius:99,fontSize:12,cursor:"pointer",border:"1px solid",borderColor:shift.positions.includes(emp.id)?"var(--blue)":"var(--line2)",background:shift.positions.includes(emp.id)?"var(--blue-bg)":"#fff",color:shift.positions.includes(emp.id)?"var(--blue)":"var(--ink2)"}}>{emp.name}{emp.title?` · ${emp.title}`:""}</button>)}
            </div>
          </div>}
          {hrs>0&&<div style={{display:"flex",gap:16,fontSize:12,color:"var(--ink3)",background:"var(--bg2)",borderRadius:"var(--r)",padding:"8px 12px"}}>
            <span>⏱ {hrs.toFixed(1)} hrs/shift</span>
            {cost>0&&<span>💰 ${cost.toFixed(2)} labor/shift</span>}
            {weeklyCost>0&&shift.days.length>0&&<span>📅 ${weeklyCost.toFixed(2)}/week</span>}
            {shift.positions.length>0&&<span>👥 {shift.positions.length} staff</span>}
          </div>}
        </Card>;
      })}
    </div>
    <button onClick={add} style={{width:"100%",background:"none",border:"1px dashed var(--line2)",borderRadius:"var(--r)",padding:"10px",color:"var(--ink3)",fontSize:13,cursor:"pointer",fontFamily:"inherit"}}>+ Add shift</button>
    <div style={{marginTop:20,display:"flex",justifyContent:"space-between"}}>
      <Btn ghost onClick={onBack}>← Back</Btn>
      <Btn onClick={onNext}>Continue to Time Analysis →</Btn>
    </div>
  </div>;
}

// ── P2 Module 3: Time Analysis ────────────────────────────────────────────────
function P2_TimeAnalysis({state,setState,onBack,onNext}){
  const {tasks,employees}=state;
  const namedEmps=employees.filter(e=>e.name.trim());
  const upd=(id,f,v)=>setState(p=>({...p,tasks:p.tasks.map(t=>t.id===id?{...t,[f]:v}:t)}));
  const add=()=>setState(p=>({...p,tasks:[...p.tasks,newTask()]}));
  const rem=(id)=>{if(tasks.length>1)setState(p=>({...p,tasks:p.tasks.filter(t=>t.id!==id)}));};

  function toSeconds(val,unit){const n=toNum(val);if(unit==="minutes")return n*60;if(unit==="hours")return n*3600;return n;}
  function totalSeconds(taskList){return taskList.reduce((s,t)=>s+toSeconds(t.timeValue,t.timeUnit),0);}

  const total=totalSeconds(tasks);
  const byPosition={};
  tasks.forEach(t=>{if(t.positionId){if(!byPosition[t.positionId])byPosition[t.positionId]=0;byPosition[t.positionId]+=toSeconds(t.timeValue,t.timeUnit);}});

  return <div className="fu">
    <h2 style={{fontSize:22,fontWeight:700,letterSpacing:"-.02em",marginBottom:6}}>Time & Motion Analysis</h2>
    <p style={{color:"var(--ink2)",fontSize:14,lineHeight:1.6,marginBottom:16}}>Break down every task that goes into making your product or delivering your service. Assign it to a position and set the time. Use the toggle to enter time in seconds, minutes, or hours.</p>
    <div style={{display:"grid",gridTemplateColumns:"2fr 1fr 80px 100px 1fr 28px",gap:8,padding:"0 4px",marginBottom:8}}>
      {["Task Name","Position","Time","Unit","Notes",""].map((h,i)=><div key={i} style={{fontSize:11,fontWeight:600,color:"var(--ink3)",textTransform:"uppercase",letterSpacing:"0.05em"}}>{h}</div>)}
    </div>
    <div style={{display:"flex",flexDirection:"column",gap:8,marginBottom:12}}>
      {tasks.map(task=>{
        const secs=toSeconds(task.timeValue,task.timeUnit);
        return <div key={task.id} style={{background:"#fff",border:"1px solid var(--line)",borderRadius:"var(--r)",padding:"10px 12px",boxShadow:"var(--sh)"}}>
          <div style={{display:"grid",gridTemplateColumns:"2fr 1fr 80px 100px 1fr 28px",gap:8,alignItems:"center"}}>
            <input value={task.name} onChange={e=>upd(task.id,"name",e.target.value)} placeholder="e.g. Pull espresso shot" style={iS}/>
            <select value={task.positionId} onChange={e=>upd(task.id,"positionId",e.target.value)} style={selS}>
              <option value="">— position —</option>
              {namedEmps.map(emp=><option key={emp.id} value={emp.id}>{emp.title||emp.name}</option>)}
            </select>
            <input type="number" min="0" step="0.1" placeholder="45" value={task.timeValue} onChange={e=>upd(task.id,"timeValue",e.target.value)} style={iS}/>
            {/* Time unit toggle */}
            <div style={{display:"flex",borderRadius:"var(--r)",overflow:"hidden",border:"1px solid var(--line2)"}}>
              {["seconds","minutes","hours"].map(u=><button key={u} onClick={()=>upd(task.id,"timeUnit",u)} style={{flex:1,padding:"8px 2px",fontSize:11,fontWeight:600,border:"none",cursor:"pointer",background:task.timeUnit===u?"var(--ink)":"#fff",color:task.timeUnit===u?"#fff":"var(--ink3)",transition:"all .15s"}}>{u==="seconds"?"sec":u==="minutes"?"min":"hr"}</button>)}
            </div>
            <input value={task.notes||""} onChange={e=>upd(task.id,"notes",e.target.value)} placeholder="Optional note" style={iS}/>
            <button onClick={()=>rem(task.id)} style={{background:"none",border:"none",color:"var(--ink3)",cursor:"pointer",fontSize:18,padding:0,lineHeight:1}}>×</button>
          </div>
          {secs>0&&<div style={{marginTop:5,fontSize:12,color:"var(--ink3)"}}>= {fmtTime(secs)}</div>}
        </div>;
      })}
    </div>
    <button onClick={add} style={{width:"100%",background:"none",border:"1px dashed var(--line2)",borderRadius:"var(--r)",padding:"10px",color:"var(--ink3)",fontSize:13,cursor:"pointer",fontFamily:"inherit"}}>+ Add task</button>
    {total>0&&<Card style={{marginTop:14}}>
      <div style={{fontSize:13,fontWeight:700,marginBottom:10}}>Time Summary</div>
      <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fit,minmax(140px,1fr))",gap:10,marginBottom:12}}>
        <StatBox label="Total Time/Unit" value={fmtTime(total)} sub={`${(total/60).toFixed(1)} min total`}/>
        <StatBox label="Units/Hour (1 staff)" value={total>0?`${(3600/total).toFixed(1)}`:"—"} sub="theoretical max"/>
        <StatBox label="Units/8hr Day" value={total>0?`${(8*3600/total).toFixed(0)}`:"—"} sub="1 employee"/>
      </div>
      {Object.keys(byPosition).length>0&&<div>
        <div style={{fontSize:12,fontWeight:600,color:"var(--ink3)",textTransform:"uppercase",letterSpacing:"0.05em",marginBottom:8}}>Time by Position</div>
        {Object.entries(byPosition).map(([empId,secs])=>{const emp=employees.find(e=>e.id===empId);return <div key={empId} style={{display:"flex",justifyContent:"space-between",fontSize:13,marginBottom:6,alignItems:"center"}}>
          <span style={{color:"var(--ink2)"}}>{emp?.title||emp?.name||"Unknown"}</span>
          <div style={{display:"flex",gap:10,alignItems:"center"}}>
            <div style={{width:100,height:6,background:"var(--bg3)",borderRadius:99,overflow:"hidden"}}><div style={{width:`${Math.min(100,(secs/total)*100)}%`,height:"100%",background:"var(--blue)",borderRadius:99}}/></div>
            <span style={{fontSize:12,color:"var(--ink3)",minWidth:40,textAlign:"right"}}>{fmtTime(secs)}</span>
          </div>
        </div>;})}
      </div>}
    </Card>}
    <div style={{marginTop:20,display:"flex",justifyContent:"space-between"}}>
      <Btn ghost onClick={onBack}>← Back</Btn>
      <Btn onClick={onNext}>Continue to Labor Per Product →</Btn>
    </div>
  </div>;
}

// ── P2 Module 4: Labor Per Product ────────────────────────────────────────────
function P2_LaborPerProduct({state,setState,onBack,onNext}){
  const {products,sizes,useSizes,employees,tasks,industry}=state;
  const bench=INDUSTRIES[industry];
  const activeSizes=useSizes?sizes.filter(s=>s.on&&s.name.trim()):[];
  const namedProds=products.filter(p=>p.name.trim());
  const namedEmps=employees.filter(e=>e.name.trim());

  function toSeconds(val,unit){const n=toNum(val);if(unit==="minutes")return n*60;if(unit==="hours")return n*3600;return n;}

  // For each product×size, allow assigning tasks and overriding time
  function getProdLaborKey(prodId,szId){return `labor_${prodId}_${szId}`;}
  function getProdTasks(prodId,szId){return state[getProdLaborKey(prodId,szId)]||[];}
  function setProdTasks(prodId,szId,taskList){setState(p=>({...p,[getProdLaborKey(prodId,szId)]:taskList}));}

  function laborCostForTasks(taskList){
    return taskList.reduce((sum,t)=>{
      const emp=employees.find(e=>e.id===t.positionId);
      if(!emp)return sum;
      const rate=emp.wageType==="hourly"?toNum(emp.wage):toNum(emp.wage)/52/40;
      const secs=toSeconds(t.timeValue,t.timeUnit);
      return sum+rate*(secs/3600);
    },0);
  }

  const [activeProdId,setActiveProdId]=useState(namedProds[0]?.id||"");
  const [activeSzId,setActiveSzId]=useState(activeSizes[0]?.id||"__flat__");
  const activeProd=namedProds.find(p=>p.id===activeProdId)||namedProds[0];

  function getSellPrice(prod,szId){return szId==="__flat__"?prod.sellPrice||"":prod[`sell_${szId}`]||prod.sellPrice||"";}
  function getCOGS(prod,szId){
    const key=szId==="__flat__"?"__flat__":`sz_${szId}`;
    const ings=prod[key]||[];
    return ings.reduce((s,ing)=>{const inv=state.inventory.find(i=>i.id===ing.inventoryId);const c=inv?convertCost(inv.buyQty,inv.buyUnit,inv.buyPrice,ing.useQty,ing.useUnit):null;return s+(c||0);},0);
  }

  if(namedProds.length===0) return <div className="fu"><h2 style={{fontSize:22,fontWeight:700,marginBottom:12}}>Labor Per Product</h2><InfoBox color="gold">Go back to Phase 1 and add at least one named product first.</InfoBox><Btn ghost onClick={onBack}>← Back</Btn></div>;

  const curSzId=activeSizes.length>0?activeSzId:"__flat__";
  const curTasks=getProdTasks(activeProd?.id,curSzId);
  const laborCost=laborCostForTasks(curTasks);
  const cogs=activeProd?getCOGS(activeProd,curSzId):0;
  const sellPrice=activeProd?toNum(getSellPrice(activeProd,curSzId)):0;
  const laborPct=sellPrice>0?(laborCost/sellPrice)*100:null;
  const contribution=sellPrice>0?sellPrice-cogs-laborCost:null;
  const contributionPct=sellPrice>0&&contribution!==null?(contribution/sellPrice)*100:null;

  function addTask(){setProdTasks(activeProd.id,curSzId,[...curTasks,{id:uid(),positionId:"",timeValue:"",timeUnit:"seconds",notes:"",fromGlobal:false}]);}
  function addFromGlobal(task){setProdTasks(activeProd.id,curSzId,[...curTasks,{...task,id:uid(),fromGlobal:true}]);}
  function updTask(tid,f,v){setProdTasks(activeProd.id,curSzId,curTasks.map(t=>t.id===tid?{...t,[f]:v}:t));}
  function remTask(tid){setProdTasks(activeProd.id,curSzId,curTasks.filter(t=>t.id!==tid));}

  const unusedGlobalTasks=tasks.filter(gt=>gt.name.trim()&&!curTasks.find(ct=>ct.name===gt.name&&ct.positionId===gt.positionId));

  return <div className="fu">
    <h2 style={{fontSize:22,fontWeight:700,letterSpacing:"-.02em",marginBottom:6}}>Labor Per Product</h2>
    <p style={{color:"var(--ink2)",fontSize:14,lineHeight:1.6,marginBottom:14}}>Assign the tasks and time it takes to make each product. This calculates your true labor cost per unit, labor percentage, and contribution profit.</p>

    <div style={{display:"flex",gap:8,flexWrap:"wrap",marginBottom:12,borderBottom:"1px solid var(--line)",paddingBottom:10}}>
      {namedProds.map(p=><button key={p.id} onClick={()=>setActiveProdId(p.id)} style={{padding:"6px 14px",borderRadius:99,fontSize:13,fontWeight:500,cursor:"pointer",border:"1px solid",borderColor:activeProdId===p.id?"var(--purple)":"var(--line2)",background:activeProdId===p.id?"var(--purple-bg)":"#fff",color:activeProdId===p.id?"var(--purple)":"var(--ink2)"}}>{p.name}</button>)}
    </div>

    {activeSizes.length>0&&<div style={{display:"flex",gap:6,marginBottom:12,flexWrap:"wrap"}}>
      {activeSizes.map(sz=><button key={sz.id} onClick={()=>setActiveSzId(sz.id)} style={{padding:"4px 12px",borderRadius:99,fontSize:12,fontWeight:500,cursor:"pointer",border:"1px solid",borderColor:activeSzId===sz.id?"var(--ink)":"var(--line2)",background:activeSzId===sz.id?"var(--ink)":"#fff",color:activeSzId===sz.id?"#fff":"var(--ink2)"}}>{sz.name}{sz.oz?` · ${sz.oz}oz`:""}</button>)}
    </div>}

    <div style={{display:"grid",gridTemplateColumns:"1fr 200px",gap:14,alignItems:"start"}}>
      <div>
        {unusedGlobalTasks.length>0&&<div style={{marginBottom:12}}>
          <div style={{fontSize:12,fontWeight:600,color:"var(--ink3)",textTransform:"uppercase",letterSpacing:"0.05em",marginBottom:6}}>Quick-add from Time Analysis</div>
          <div style={{display:"flex",gap:6,flexWrap:"wrap"}}>
            {unusedGlobalTasks.map(gt=><button key={gt.id} onClick={()=>addFromGlobal(gt)} style={{padding:"4px 12px",borderRadius:99,fontSize:12,cursor:"pointer",border:"1px solid var(--blue-line)",background:"var(--blue-bg)",color:"var(--blue)",fontFamily:"inherit"}}>+ {gt.name}{gt.timeValue?` · ${gt.timeValue}${gt.timeUnit==="seconds"?"s":gt.timeUnit==="minutes"?"m":"h"}`:""}</button>)}
          </div>
        </div>}

        <div style={{display:"grid",gridTemplateColumns:"2fr 1fr 80px 100px 24px",gap:8,padding:"0 2px",marginBottom:6}}>
          {["Task","Position","Time","Unit",""].map((h,i)=><div key={i} style={{fontSize:11,fontWeight:600,color:"var(--ink3)",textTransform:"uppercase",letterSpacing:"0.05em"}}>{h}</div>)}
        </div>
        <div style={{display:"flex",flexDirection:"column",gap:7,marginBottom:10}}>
          {curTasks.map(task=>{
            const emp=employees.find(e=>e.id===task.positionId);
            const secs=toSeconds(task.timeValue,task.timeUnit);
            const rate=emp?(emp.wageType==="hourly"?toNum(emp.wage):toNum(emp.wage)/52/40):0;
            const cost=rate*(secs/3600);
            return <div key={task.id} style={{background:task.fromGlobal?"var(--blue-bg)":"var(--bg2)",border:`1px solid ${task.fromGlobal?"var(--blue-line)":"var(--line)"}`,borderRadius:"var(--r)",padding:"9px 11px"}}>
              <div style={{display:"grid",gridTemplateColumns:"2fr 1fr 80px 100px 24px",gap:8,alignItems:"center"}}>
                <input value={task.name} onChange={e=>updTask(task.id,"name",e.target.value)} placeholder="Task name" style={iS}/>
                <select value={task.positionId} onChange={e=>updTask(task.id,"positionId",e.target.value)} style={selS}>
                  <option value="">— who —</option>
                  {namedEmps.map(emp=><option key={emp.id} value={emp.id}>{emp.title||emp.name}</option>)}
                </select>
                <input type="number" min="0" step="0.1" placeholder="45" value={task.timeValue} onChange={e=>updTask(task.id,"timeValue",e.target.value)} style={iS}/>
                <div style={{display:"flex",borderRadius:"var(--r)",overflow:"hidden",border:"1px solid var(--line2)"}}>
                  {["seconds","minutes","hours"].map(u=><button key={u} onClick={()=>updTask(task.id,"timeUnit",u)} style={{flex:1,padding:"8px 2px",fontSize:11,fontWeight:600,border:"none",cursor:"pointer",background:task.timeUnit===u?"var(--ink)":"#fff",color:task.timeUnit===u?"#fff":"var(--ink3)",transition:"all .15s"}}>{u==="seconds"?"sec":u==="minutes"?"min":"hr"}</button>)}
                </div>
                <button onClick={()=>remTask(task.id)} style={{background:"none",border:"none",color:"var(--ink3)",cursor:"pointer",fontSize:18,padding:0,lineHeight:1}}>×</button>
              </div>
              {cost>0&&<div style={{marginTop:4,fontSize:12,color:"var(--ink3)"}}>Labor cost: <strong style={{color:"var(--ink2)"}}>${cost.toFixed(4)}</strong>{emp&&` · ${emp.title||emp.name} @ $${(emp.wageType==="hourly"?toNum(emp.wage):toNum(emp.wage)/52/40).toFixed(2)}/hr`}</div>}
            </div>;
          })}
        </div>
        <button onClick={addTask} style={{width:"100%",background:"none",border:"1px dashed var(--line2)",borderRadius:"var(--r)",padding:"9px",color:"var(--ink3)",fontSize:13,cursor:"pointer",fontFamily:"inherit"}}>+ Add task</button>
      </div>

      <div style={{position:"sticky",top:16}}>
        <Card>
          <div style={{fontSize:11,fontWeight:600,color:"var(--ink3)",textTransform:"uppercase",letterSpacing:"0.06em",marginBottom:10}}>Labor Breakdown</div>
          <div style={{display:"flex",flexDirection:"column",gap:8}}>
            <div style={{display:"flex",justifyContent:"space-between",fontSize:13}}><span style={{color:"var(--ink2)"}}>Sell Price</span><span style={{fontFamily:"monospace",fontWeight:500}}>{sellPrice>0?fmt$(sellPrice):"Set in Phase 1"}</span></div>
            <div style={{display:"flex",justifyContent:"space-between",fontSize:13}}><span style={{color:"var(--ink2)"}}>COGS</span><span style={{fontFamily:"monospace",fontWeight:500,color:"var(--red)"}}>{cogs>0?`− ${fmt$(cogs)}`:"—"}</span></div>
            <div style={{display:"flex",justifyContent:"space-between",fontSize:13}}><span style={{color:"var(--ink2)"}}>Labor</span><span style={{fontFamily:"monospace",fontWeight:500,color:"var(--gold)"}}>{laborCost>0?`− ${fmt$(laborCost)}`:"—"}</span></div>
            <div style={{height:1,background:"var(--line)",margin:"2px 0"}}/>
            <div style={{display:"flex",justifyContent:"space-between",fontSize:15,fontWeight:700}}><span>Contribution</span><span style={{fontFamily:"monospace",color:contribution!==null&&contribution>0?"var(--green)":"var(--red)"}}>{contribution!==null?fmt$(contribution):"—"}</span></div>
            {contributionPct!==null&&<div style={{display:"flex",justifyContent:"space-between",fontSize:13}}><span style={{color:"var(--ink3)"}}>Contribution %</span><span style={{fontWeight:600,color:contributionPct>40?"var(--green)":contributionPct>20?"var(--gold)":"var(--red)"}}>{fmtPct(contributionPct)}</span></div>}
            {laborPct!==null&&<>
              <div style={{height:1,background:"var(--line)",margin:"2px 0"}}/>
              <div style={{display:"flex",justifyContent:"space-between",fontSize:13}}><span style={{color:"var(--ink2)"}}>Labor %</span><span style={{fontWeight:600,color:bench&&laborPct<=bench.laborAvg?"var(--green)":bench&&laborPct<=bench.laborHigh?"var(--gold)":"var(--red)"}}>{fmtPct(laborPct)}</span></div>
              {bench&&<div style={{fontSize:11,color:"var(--ink3)",marginTop:2}}>Industry avg: {bench.laborLow}–{bench.laborHigh}%</div>}
              <div style={{background:"var(--bg3)",borderRadius:99,height:6,overflow:"hidden",marginTop:4}}>
                <div style={{width:`${Math.min(100,laborPct)}%`,height:"100%",background:laborPct<=( bench?.laborAvg||30)?"var(--green)":laborPct<=(bench?.laborHigh||42)?"var(--gold)":"var(--red)",borderRadius:99,transition:"width .4s"}}/>
              </div>
            </>}
          </div>
        </Card>
      </div>
    </div>

    <div style={{marginTop:20,display:"flex",justifyContent:"space-between"}}>
      <Btn ghost onClick={onBack}>← Back</Btn>
      <Btn onClick={onNext}>Continue to Capacity Model →</Btn>
    </div>
  </div>;
}

// ── P2 Module 5: Capacity Model ───────────────────────────────────────────────
function P2_Capacity({state,onBack}){
  const {products,sizes,useSizes,employees,shifts,tasks,industry}=state;
  const bench=INDUSTRIES[industry];
  const activeSizes=useSizes?sizes.filter(s=>s.on&&s.name.trim()):[];
  const namedProds=products.filter(p=>p.name.trim());

  function toSeconds(val,unit){const n=toNum(val);if(unit==="minutes")return n*60;if(unit==="hours")return n*3600;return n;}
  function getProdLaborKey(prodId,szId){return `labor_${prodId}_${szId}`;}
  function getProdTasks(prodId,szId){return state[getProdLaborKey(prodId,szId)]||[];}
  function totalTaskSecs(taskList){return taskList.reduce((s,t)=>s+toSeconds(t.timeValue,t.timeUnit),0);}
  function getCOGS(prod,szId){const key=szId==="__flat__"?"__flat__":`sz_${szId}`;const ings=prod[key]||[];return ings.reduce((s,ing)=>{const inv=state.inventory.find(i=>i.id===ing.inventoryId);const c=inv?convertCost(inv.buyQty,inv.buyUnit,inv.buyPrice,ing.useQty,ing.useUnit):null;return s+(c||0);},0);}
  function getSell(prod,szId){return szId==="__flat__"?toNum(prod.sellPrice):toNum(prod[`sell_${szId}`]||prod.sellPrice);}
  function laborCostForTasks(taskList){return taskList.reduce((sum,t)=>{const emp=employees.find(e=>e.id===t.positionId);if(!emp)return sum;const rate=emp.wageType==="hourly"?toNum(emp.wage):toNum(emp.wage)/52/40;return sum+rate*(toSeconds(t.timeValue,t.timeUnit)/3600);},0);}

  // Build rows
  const rows=[];
  namedProds.forEach(prod=>{
    const szList=activeSizes.length>0?activeSizes:[{id:"__flat__",name:"",oz:""}];
    szList.forEach(sz=>{
      const taskList=getProdTasks(prod.id,sz.id);
      const secs=totalTaskSecs(taskList);
      const laborCost=laborCostForTasks(taskList);
      const cogs=getCOGS(prod,sz.id);
      const sell=getSell(prod,sz.id);
      const unitsPerHour=secs>0?3600/secs:null;
      const unitsPerDay=unitsPerHour?unitsPerHour*8:null;
      const teamSize=shifts.reduce((s,sh)=>s+sh.positions.length,0)||1;
      const teamUnitsPerHour=unitsPerHour?unitsPerHour*teamSize:null;
      const teamUnitsPerDay=teamUnitsPerHour?teamUnitsPerHour*8:null;
      const revenuePerHour=unitsPerHour&&sell?unitsPerHour*sell:null;
      const laborPct=sell>0?(laborCost/sell)*100:null;
      const contribution=sell>0?sell-cogs-laborCost:null;
      // Hire trigger: when demand exceeds 85% capacity
      const hireTrigger=unitsPerDay?Math.round(unitsPerDay*0.85):null;
      rows.push({prod,sz,secs,unitsPerHour,unitsPerDay,teamSize,teamUnitsPerHour,teamUnitsPerDay,revenuePerHour,laborPct,contribution,sell,cogs,laborCost,hireTrigger});
    });
  });

  return <div className="fu">
    <h2 style={{fontSize:22,fontWeight:700,letterSpacing:"-.02em",marginBottom:6}}>Capacity Model</h2>
    <p style={{color:"var(--ink2)",fontSize:14,lineHeight:1.6,marginBottom:16}}>See exactly how many units one employee or your full team can produce per hour and per day, and when you'd need to hire or add a team.</p>

    {rows.length===0&&<InfoBox color="gold">Add tasks in the Labor Per Product step to see your capacity model.</InfoBox>}

    {rows.map((row,i)=>{
      const label=row.sz.id!=="__flat__"?`${row.prod.name} · ${row.sz.name}${row.sz.oz?` (${row.sz.oz}oz)`:""}`:row.prod.name;
      return <Card key={i} style={{marginBottom:12}}>
        <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start",marginBottom:14,flexWrap:"wrap",gap:8}}>
          <div>
            <div style={{fontSize:15,fontWeight:700}}>{label}</div>
            <div style={{fontSize:12,color:"var(--ink3)",marginTop:2}}>Time per unit: {row.secs>0?fmtTime(row.secs):"Not set"}</div>
          </div>
          {row.laborPct!==null&&<div style={{textAlign:"right"}}>
            <div style={{fontSize:11,color:"var(--ink3)",marginBottom:2}}>Labor %</div>
            <div style={{fontSize:18,fontWeight:700,color:bench&&row.laborPct<=bench.laborAvg?"var(--green)":bench&&row.laborPct<=bench.laborHigh?"var(--gold)":"var(--red)"}}>{fmtPct(row.laborPct)}</div>
            {bench&&<div style={{fontSize:11,color:"var(--ink3)"}}>target ≤{bench.laborAvg}%</div>}
          </div>}
        </div>

        <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fit,minmax(130px,1fr))",gap:10,marginBottom:12}}>
          <StatBox label="Units/hr (1 staff)" value={row.unitsPerHour?row.unitsPerHour.toFixed(1):"—"} sub="theoretical max"/>
          <StatBox label="Units/day (1 staff)" value={row.unitsPerDay?row.unitsPerDay.toFixed(0):"—"} sub="8hr shift"/>
          <StatBox label={`Units/hr (team of ${row.teamSize})`} value={row.teamUnitsPerHour?row.teamUnitsPerHour.toFixed(1):"—"}/>
          <StatBox label="Revenue/hr (1 staff)" value={row.revenuePerHour?fmt$(row.revenuePerHour):"—"} sub={row.sell?`@ ${fmt$(row.sell)}/unit`:""}/>
          <StatBox label="Contribution/unit" value={row.contribution!==null?fmt$(row.contribution):"—"} color={row.contribution!==null&&row.contribution>0?"var(--green)":"var(--red)"}/>
          <StatBox label="Hire trigger" value={row.hireTrigger?`${row.hireTrigger}+/day`:"—"} sub="add staff at this volume"/>
        </div>

        {row.secs>0&&<div style={{background:"var(--bg2)",borderRadius:"var(--r)",padding:"10px 14px",fontSize:13}}>
          <div style={{fontWeight:600,marginBottom:6}}>Insights</div>
          <div style={{display:"flex",flexDirection:"column",gap:4,color:"var(--ink2)"}}>
            {row.unitsPerDay&&<div>📦 One employee can make up to <strong>{row.unitsPerDay.toFixed(0)} units/day</strong> working an 8hr shift.</div>}
            {row.teamUnitsPerDay&&row.teamSize>1&&<div>👥 Your team of {row.teamSize} can produce up to <strong>{row.teamUnitsPerDay.toFixed(0)} units/day</strong>.</div>}
            {row.hireTrigger&&<div>🚨 Consider hiring or adding a shift when you hit <strong>{row.hireTrigger}+ units/day</strong> (85% capacity).</div>}
            {row.laborPct!==null&&bench&&row.laborPct>bench.laborHigh&&<div style={{color:"var(--red)"}}>⚠ Labor % is above the {bench.laborHigh}% industry high — this product may need repricing or process optimization.</div>}
            {row.laborPct!==null&&bench&&row.laborPct<=bench.laborLow&&<div style={{color:"var(--green)"}}>✓ Labor % is below industry average — this product scales well.</div>}
            {row.contribution!==null&&row.contribution<0&&<div style={{color:"var(--red)"}}>🔴 Negative contribution profit — selling this at a loss after COGS and labor. Raise price or reduce labor time.</div>}
          </div>
        </div>}
      </Card>;
    })}

    <div style={{marginTop:16}}><Btn ghost onClick={onBack}>← Back</Btn></div>
  </div>;
}

// ════════════════════════════════════════════════════════════════════════════
// TRUE MARGIN DASHBOARD
// ════════════════════════════════════════════════════════════════════════════
function TrueMarginDashboard({state}){
  const {products,sizes,useSizes,employees,inventory,industry,businessName}=state;
  const bench=INDUSTRIES[industry];
  const activeSizes=useSizes?sizes.filter(s=>s.on&&s.name.trim()):[];
  const namedProds=products.filter(p=>p.name.trim());

  function toSeconds(val,unit){const n=toNum(val);if(unit==="minutes")return n*60;if(unit==="hours")return n*3600;return n;}
  function getProdTasks(prodId,szId){return state[`labor_${prodId}_${szId}`]||[];}
  function getCOGS(prod,szId){const key=szId==="__flat__"?"__flat__":`sz_${szId}`;const ings=prod[key]||[];return ings.reduce((s,ing)=>{const inv=inventory.find(i=>i.id===ing.inventoryId);const c=inv?convertCost(inv.buyQty,inv.buyUnit,inv.buyPrice,ing.useQty,ing.useUnit):null;return s+(c||0);},0);}
  function getSell(prod,szId){return szId==="__flat__"?toNum(prod.sellPrice):toNum(prod[`sell_${szId}`]||prod.sellPrice);}
  function laborCost(prodId,szId){return getProdTasks(prodId,szId).reduce((sum,t)=>{const emp=employees.find(e=>e.id===t.positionId);if(!emp)return sum;const rate=emp.wageType==="hourly"?toNum(emp.wage):toNum(emp.wage)/52/40;return sum+rate*(toSeconds(t.timeValue,t.timeUnit)/3600);},0);}

  const rows=[];
  namedProds.forEach(prod=>{
    const szList=activeSizes.length>0?activeSizes:[{id:"__flat__",name:"",oz:""}];
    szList.forEach(sz=>{
      const cogs=getCOGS(prod,sz.id);
      const labor=laborCost(prod.id,sz.id);
      const sell=getSell(prod,sz.id);
      const grossMargin=sell>0?((sell-cogs)/sell)*100:null;
      const laborPct=sell>0?(labor/sell)*100:null;
      const contribution=sell>0?sell-cogs-labor:null;
      const contributionPct=sell>0&&contribution!==null?(contribution/sell)*100:null;
      const label=sz.id!=="__flat__"?`${prod.name} · ${sz.name}${sz.oz?` (${sz.oz}oz)`:""}`:prod.name;
      rows.push({label,sell,cogs,labor,grossMargin,laborPct,contribution,contributionPct});
    });
  });

  const validRows=rows.filter(r=>r.sell>0);
  const avgGross=validRows.length?validRows.reduce((s,r)=>s+(r.grossMargin||0),0)/validRows.length:null;
  const avgContrib=validRows.length?validRows.reduce((s,r)=>s+(r.contributionPct||0),0)/validRows.length:null;
  const avgLabor=validRows.length?validRows.reduce((s,r)=>s+(r.laborPct||0),0)/validRows.length:null;

  function copyReport(){
    const txt=[
      `${businessName} — True Margin Report`,
      `Industry: ${industry}`,
      bench?`COGS Benchmark: ${bench.low}–${bench.high}% | Labor Benchmark: ${bench.laborLow}–${bench.laborHigh}%`:"",
      `Date: ${new Date().toLocaleDateString()}`,"",
      ...rows.map(r=>`${r.label}\n  Sell: ${fmt$(r.sell)} | COGS: ${fmt$(r.cogs)} | Labor: ${fmt$(r.labor)}\n  Gross Margin: ${r.grossMargin!==null?fmtPct(r.grossMargin):"—"} | Labor %: ${r.laborPct!==null?fmtPct(r.laborPct):"—"} | Contribution: ${r.contribution!==null?fmt$(r.contribution):"—"} (${r.contributionPct!==null?fmtPct(r.contributionPct):"—"})`),
      "",
      `Avg Gross Margin: ${avgGross!==null?fmtPct(avgGross):"—"}`,
      `Avg Labor %: ${avgLabor!==null?fmtPct(avgLabor):"—"}`,
      `Avg Contribution %: ${avgContrib!==null?fmtPct(avgContrib):"—"}`,
    ].filter(Boolean).join("\n");
    navigator.clipboard.writeText(txt).catch(()=>{});
    alert("True Margin Report copied to clipboard!");
  }

  return <div className="fu">
    <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start",flexWrap:"wrap",gap:10,marginBottom:16}}>
      <div><h2 style={{fontSize:22,fontWeight:700,letterSpacing:"-.02em",marginBottom:2}}>True Margin Dashboard</h2><p style={{fontSize:13,color:"var(--ink2)"}}>{businessName} · Full Profitability Picture</p></div>
      <button onClick={copyReport} style={{padding:"8px 16px",border:"1px solid var(--line2)",borderRadius:"var(--r)",background:"var(--bg2)",color:"var(--ink2)",fontSize:12,cursor:"pointer",fontFamily:"inherit",fontWeight:600}}>Copy Full Report</button>
    </div>

    {bench&&<div style={{display:"grid",gridTemplateColumns:"repeat(auto-fit,minmax(160px,1fr))",gap:10,marginBottom:16}}>
      <div style={{background:"var(--gold-bg)",border:"1px solid var(--gold-line)",borderRadius:"var(--r)",padding:"10px 14px",fontSize:12,color:"var(--gold)"}}>
        <div style={{fontWeight:700,marginBottom:2}}>COGS Benchmark</div>
        <div style={{fontSize:18,fontWeight:700}}>{bench.low}–{bench.high}%</div>
        <div>avg {bench.avg}%</div>
      </div>
      <div style={{background:"var(--purple-bg)",border:"1px solid var(--purple-line)",borderRadius:"var(--r)",padding:"10px 14px",fontSize:12,color:"var(--purple)"}}>
        <div style={{fontWeight:700,marginBottom:2}}>Labor Benchmark</div>
        <div style={{fontSize:18,fontWeight:700}}>{bench.laborLow}–{bench.laborHigh}%</div>
        <div>avg {bench.laborAvg}%</div>
      </div>
      {avgGross!==null&&<StatBox label="Your Avg Gross" value={fmtPct(avgGross)} color={avgGross>=bench.avg?"var(--green)":avgGross>=bench.low?"var(--gold)":"var(--red)"}/>}
      {avgLabor!==null&&<StatBox label="Your Avg Labor" value={fmtPct(avgLabor)} color={avgLabor<=bench.laborAvg?"var(--green)":avgLabor<=bench.laborHigh?"var(--gold)":"var(--red)"}/>}
      {avgContrib!==null&&<StatBox label="Avg Contribution" value={fmtPct(avgContrib)} color={avgContrib>35?"var(--green)":avgContrib>15?"var(--gold)":"var(--red)"}/>}
    </div>}

    {rows.length===0&&<InfoBox color="gold">Complete Phase 1 (products + pricing) and Phase 2 (labor per product) to see your full true margin picture here.</InfoBox>}

    <Card style={{padding:0,overflow:"hidden",marginBottom:16}}>
      <table>
        <thead>
          <tr style={{background:"var(--bg2)",borderBottom:"1px solid var(--line)"}}>
            {["Product","Sell Price","COGS","Labor","Gross Margin","Labor %","Contribution $","Contribution %","Signal"].map(h=><th key={h} style={{fontSize:10,fontWeight:600,color:"var(--ink3)",textTransform:"uppercase",letterSpacing:"0.04em",whiteSpace:"nowrap"}}>{h}</th>)}
          </tr>
        </thead>
        <tbody>
          {rows.map((row,i)=>{
            const cogsOk=row.grossMargin!==null&&bench&&row.grossMargin>=bench.avg;
            const laborOk=row.laborPct!==null&&bench&&row.laborPct<=bench.laborAvg;
            const signal=!row.sell?"No price set":row.contribution!==null&&row.contribution<0?"🔴 Losing money":cogsOk&&laborOk?"🟢 Push this":"🟡 Review";
            return <tr key={i} style={{borderBottom:"1px solid var(--line)",background:i%2===0?"#fff":"var(--bg2)"}}>
              <td style={{fontWeight:500,whiteSpace:"nowrap"}}>{row.label}</td>
              <td style={{fontFamily:"monospace",fontSize:13}}>{row.sell>0?fmt$(row.sell):"—"}</td>
              <td style={{fontFamily:"monospace",fontSize:13,color:"var(--red)"}}>{row.cogs>0?fmt$(row.cogs):"—"}</td>
              <td style={{fontFamily:"monospace",fontSize:13,color:"var(--gold)"}}>{row.labor>0?fmt$(row.labor):"—"}</td>
              <td>{row.grossMargin!==null?<Tag margin={row.grossMargin} bench={bench}/>:<span style={{color:"var(--ink3)"}}>—</span>}</td>
              <td style={{fontSize:13,fontWeight:600,color:row.laborPct!==null&&bench?row.laborPct<=bench.laborAvg?"var(--green)":row.laborPct<=bench.laborHigh?"var(--gold)":"var(--red)":"var(--ink3)"}}>{row.laborPct!==null?fmtPct(row.laborPct):"—"}</td>
              <td style={{fontFamily:"monospace",fontSize:13,fontWeight:600,color:row.contribution!==null&&row.contribution>0?"var(--green)":"var(--red)"}}>{row.contribution!==null?fmt$(row.contribution):"—"}</td>
              <td style={{fontSize:13,fontWeight:600,color:row.contributionPct!==null&&row.contributionPct>30?"var(--green)":row.contributionPct!==null&&row.contributionPct>10?"var(--gold)":"var(--red)"}}>{row.contributionPct!==null?fmtPct(row.contributionPct):"—"}</td>
              <td style={{fontSize:12,whiteSpace:"nowrap"}}>{signal}</td>
            </tr>;
          })}
        </tbody>
      </table>
      {rows.length===0&&<div style={{textAlign:"center",padding:"28px",color:"var(--ink3)",fontSize:14}}>No products with pricing yet.</div>}
    </Card>

    {validRows.length>0&&<Card>
      <div style={{fontSize:13,fontWeight:700,marginBottom:12}}>Strategic Insights</div>
      <div style={{display:"flex",flexDirection:"column",gap:8,fontSize:13,color:"var(--ink2)"}}>
        {validRows.filter(r=>r.grossMargin!==null&&bench&&r.grossMargin>=bench.high&&r.laborPct!==null&&r.laborPct<=bench.laborAvg).map((r,i)=><div key={i} style={{background:"var(--green-bg)",border:"1px solid var(--green-line)",borderRadius:"var(--r)",padding:"8px 12px"}}>🟢 <strong>{r.label}</strong> — strong margin + low labor. Push this product.</div>)}
        {validRows.filter(r=>r.contribution!==null&&r.contribution<0).map((r,i)=><div key={i} style={{background:"var(--red-bg)",border:"1px solid var(--red-line)",borderRadius:"var(--r)",padding:"8px 12px"}}>🔴 <strong>{r.label}</strong> — selling at a loss after COGS and labor. Raise price or cut production time.</div>)}
        {validRows.filter(r=>r.laborPct!==null&&bench&&r.laborPct>bench.laborHigh).map((r,i)=><div key={i} style={{background:"var(--gold-bg)",border:"1px solid var(--gold-line)",borderRadius:"var(--r)",padding:"8px 12px"}}>⚠ <strong>{r.label}</strong> — labor % above industry high ({bench.laborHigh}%). Consider streamlining or outsourcing production.</div>)}
      </div>
    </Card>}
  </div>;
}

// ════════════════════════════════════════════════════════════════════════════
// ROOT APP
// ════════════════════════════════════════════════════════════════════════════
export default function App(){
  const [state,setState]=useState(()=>load()||DEFAULT);
  const [phase,setPhase]=useState(1);
  const [p2step,setP2step]=useState(0);
  const importRef=useRef(null);
  const [importMsg,setImportMsg]=useState("");
  useEffect(()=>{save({...state,lastSaved:Date.now()});},[state]);
  const set=(f,v)=>setState(p=>({...p,[f]:v}));
  const go=(n)=>setState(p=>({...p,step:n}));

  function exportData(){
    const filename=`${(state.businessName||"my-business").toLowerCase().replace(/\s+/g,"-")}-health-check.json`;
    const blob=new Blob([JSON.stringify(state,null,2)],{type:"application/json"});
    const url=URL.createObjectURL(blob);const a=document.createElement("a");a.href=url;a.download=filename;a.click();URL.revokeObjectURL(url);
  }
  function importData(e){
    const file=e.target.files[0];if(!file)return;
    const reader=new FileReader();
    reader.onload=(ev)=>{try{const parsed=JSON.parse(ev.target.result);if(!parsed.businessName&&!parsed.inventory)throw new Error("Invalid");setState({...DEFAULT,...parsed});setImportMsg("✓ Data loaded");setTimeout(()=>setImportMsg(""),3000);}catch{setImportMsg("⚠ Invalid file");setTimeout(()=>setImportMsg(""),4000);}};
    reader.readAsText(file);e.target.value="";
  }

  const skipSizes=state.industry!=="Food & Beverage / Cafe";

  return <div style={{minHeight:"100vh",background:"var(--bg)",paddingBottom:80}}>
    <style>{CSS}</style>
    {/* Header */}
    <div style={{background:"#fff",borderBottom:"1px solid var(--line)",padding:"12px 24px",display:"flex",justifyContent:"space-between",alignItems:"center",flexWrap:"wrap",gap:10}}>
      <div>
        <div style={{fontSize:10,fontWeight:700,color:"var(--ink3)",textTransform:"uppercase",letterSpacing:"0.1em",marginBottom:2}}>Avoda Business Health Check</div>
        <div style={{fontSize:16,fontWeight:700,color:"var(--ink)",letterSpacing:"-.02em"}}>{state.businessName||"Your Business"} <span style={{fontWeight:400,color:"var(--ink3)"}}>— Full Profitability System</span></div>
      </div>
      <div style={{display:"flex",alignItems:"center",gap:10,flexWrap:"wrap"}}>
        {importMsg&&<span style={{fontSize:12,color:importMsg.startsWith("✓")?"var(--green)":"var(--gold)"}}>{importMsg}</span>}
        {state.lastSaved&&<span style={{fontSize:11,color:"var(--ink3)"}}>Saved {new Date(state.lastSaved).toLocaleTimeString([],{hour:"2-digit",minute:"2-digit"})}</span>}
        <input ref={importRef} type="file" accept=".json" onChange={importData} style={{display:"none"}}/>
        <button onClick={()=>importRef.current.click()} style={{padding:"6px 12px",borderRadius:"var(--r)",border:"1px solid var(--line2)",background:"var(--bg2)",color:"var(--ink2)",fontSize:12,cursor:"pointer",fontFamily:"inherit",fontWeight:600}}>↑ Import</button>
        <button onClick={exportData} style={{padding:"6px 12px",borderRadius:"var(--r)",border:"1px solid var(--gold-line)",background:"var(--gold-bg)",color:"var(--gold)",fontSize:12,cursor:"pointer",fontFamily:"inherit",fontWeight:600}}>↓ Export</button>
      </div>
    </div>

    {/* Phase nav */}
    <div style={{background:"#fff",borderBottom:"1px solid var(--line)",padding:"0 24px"}}>
      <PhaseNav phase={phase} setPhase={setPhase} step={state.step}/>
    </div>

    <div style={{maxWidth:900,margin:"0 auto",padding:"24px 20px"}}>
      {/* ── PHASE 1 ── */}
      {phase===1&&<>
        <StepBar current={state.step} skipSizes={skipSizes}/>
        {state.step===0&&<P1_Business state={state} set={set} onNext={(showSizes)=>go(showSizes?1:2)}/>}
        {state.step===1&&<P1_Sizes state={state} setState={setState} onBack={()=>go(0)} onNext={()=>go(2)}/>}
        {state.step===2&&<P1_Inventory state={state} setState={setState} onBack={()=>go(skipSizes?0:1)} onNext={()=>go(3)}/>}
        {state.step===3&&<P1_Recipes state={state} setState={setState} onBack={()=>go(2)} onNext={()=>go(4)}/>}
        {state.step===4&&<P1_Menu state={state} setState={setState} onBack={()=>go(3)}/>}
      </>}

      {/* ── PHASE 2 ── */}
      {phase===2&&<>
        <P2StepBar current={p2step}/>
        {p2step===0&&<P2_Employees state={state} setState={setState} onNext={()=>setP2step(1)}/>}
        {p2step===1&&<P2_Shifts state={state} setState={setState} onBack={()=>setP2step(0)} onNext={()=>setP2step(2)}/>}
        {p2step===2&&<P2_TimeAnalysis state={state} setState={setState} onBack={()=>setP2step(1)} onNext={()=>setP2step(3)}/>}
        {p2step===3&&<P2_LaborPerProduct state={state} setState={setState} onBack={()=>setP2step(2)} onNext={()=>setP2step(4)}/>}
        {p2step===4&&<P2_Capacity state={state} onBack={()=>setP2step(3)}/>}
      </>}

      {/* ── TRUE MARGIN ── */}
      {phase===3&&<TrueMarginDashboard state={state}/>}
    </div>
  </div>;
}
