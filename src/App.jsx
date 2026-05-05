import { useState, useEffect, useRef } from "react";

// ── Persistence ───────────────────────────────────────────────────────────────
const SK = "bhc_v2";
const load = () => { try { const r = localStorage.getItem(SK); return r ? JSON.parse(r) : null; } catch { return null; } };
const save = (d) => { try { localStorage.setItem(SK, JSON.stringify(d)); } catch {} };

// ── Utils ─────────────────────────────────────────────────────────────────────
const uid = () => Math.random().toString(36).slice(2, 9);
const toNum = (v) => { const n = parseFloat(v); return isNaN(n) ? 0 : n; };
const fmt$ = (n) => { const v = toNum(n); return v === 0 ? "—" : `$${v.toFixed(2)}`; };
const fmt$4 = (n) => { const v = toNum(n); return v === 0 ? "—" : `$${v.toFixed(4)}`; };
const fmtPct = (n) => { const v = parseFloat(n); return isNaN(v) ? "—" : `${v.toFixed(1)}%`; };

// ── Units ─────────────────────────────────────────────────────────────────────
const UNIT_GROUPS = [
  { label: "Volume / Liquid", units: [
    {v:"gallon",l:"gallon"},{v:"quart",l:"quart"},{v:"pint",l:"pint"},
    {v:"cup",l:"cup"},{v:"oz",l:"oz (fluid)"},{v:"fl_oz",l:"fl oz"},
    {v:"tbsp",l:"tbsp"},{v:"tsp",l:"tsp"},{v:"ml",l:"ml"},{v:"L",l:"liter"},
  ]},
  { label: "Weight / Dry", units: [
    {v:"lb",l:"lb"},{v:"oz_wt",l:"oz (weight)"},{v:"g",l:"g"},{v:"kg",l:"kg"},
  ]},
  { label: "Count", units: [
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

function convertCost(buyQty, buyUnit, buyPrice, useQty, useUnit) {
  const bQ=toNum(buyQty), bP=toNum(buyPrice), uQ=toNum(useQty);
  if (!bQ||!bP||!uQ) return null;
  const bF=FAM[buyUnit], uF=FAM[useUnit];
  if (bF && uF && bF===uF) {
    const bBase = bQ*(TO_BASE[buyUnit]||1);
    const uBase = uQ*(TO_BASE[useUnit]||1);
    return bBase>0 ? (bP/bBase)*uBase : null;
  }
  return null;
}

// ── Industry benchmarks ───────────────────────────────────────────────────────
const INDUSTRIES = {
  "Food & Beverage / Cafe":     {low:60,avg:70,high:80,note:"Coffee targets 70–75%. Food items 60–65%."},
  "Restaurant":                 {low:55,avg:65,high:75,note:"Full-service avg 65%. Fast casual 70%."},
  "Retail – Physical Products": {low:40,avg:50,high:60,note:"Specialty retail targets 50–60%."},
  "E-Commerce":                 {low:45,avg:55,high:70,note:"55%+ is healthy after shipping."},
  "Service Business":           {low:60,avg:75,high:90,note:"High margins; labor is the key cost."},
  "Wholesale / Distribution":   {low:20,avg:30,high:45,note:"Thin margins; volume drives profit."},
  "Health & Beauty":            {low:55,avg:65,high:78,note:"Packaging and ingredients are key costs."},
  "Bakery / Specialty Food":    {low:55,avg:65,high:75,note:"Target 65%+ after packaging and labor."},
  "Other":                      {low:45,avg:58,high:72,note:"AI coach will give tailored context."},
};

// ── Data constructors ─────────────────────────────────────────────────────────
const newInvItem   = () => ({id:uid(),name:"",category:"ingredients",buyQty:"",buyUnit:"",buyPrice:""});
const newIngRow    = () => ({id:uid(),inventoryId:"",useQty:"",useUnit:""});
const newUniversal = () => ({id:uid(),inventoryId:"",useQty:"1",useUnit:"each"});
const newSize      = (name,oz) => ({id:uid(),name,oz:String(oz),on:true});
const newProduct   = () => ({id:uid(),name:"",sellPrice:""});

const INV_CATS = [
  {v:"ingredients",l:"Ingredients"},
  {v:"packaging",  l:"Packaging"},
  {v:"supplies",   l:"Supplies"},
  {v:"other",      l:"Other"},
];

const DEFAULT_STATE = {
  step:0,
  businessName:"",
  industry:"",
  useSizes:true,
  sizes:[newSize("Small",8),newSize("Medium",12),newSize("Large",16)],
  universalItems:[],
  inventory:[newInvItem()],
  products:[newProduct()],
  lastSaved:null,
};

// ── Styles ────────────────────────────────────────────────────────────────────
const CSS = `
  :root {
    --bg:#FAFAF8; --bg2:#F2F1EE; --bg3:#E8E6E1;
    --ink:#1C1917; --ink2:#57534E; --ink3:#A8A29E;
    --line:#E7E5E4; --line2:#D6D3D1;
    --gold:#B45309; --gold-bg:#FEF3C7; --gold-line:#FDE68A;
    --green:#166534; --green-bg:#DCFCE7; --green-line:#BBF7D0;
    --red:#9F1239; --red-bg:#FFE4E6; --red-line:#FECDD3;
    --blue:#1E3A8A; --blue-bg:#DBEAFE; --blue-line:#BFDBFE;
    --r:8px; --rL:14px;
    --sh:0 1px 3px rgba(0,0,0,.08),0 1px 2px rgba(0,0,0,.05);
  }
  *{box-sizing:border-box;margin:0;padding:0;}
  body{background:var(--bg);font-family:Georgia,serif;color:var(--ink);}
  input,select{font-family:Georgia,serif;}
  input::placeholder{color:var(--ink3);}
  input:focus,select:focus{outline:none;border-color:var(--gold)!important;}
  select option{background:#fff;}
  ::-webkit-scrollbar{width:4px;height:4px;}
  ::-webkit-scrollbar-thumb{background:var(--line2);border-radius:2px;}
  input[type=number]::-webkit-inner-spin-button{opacity:.3;}
  @keyframes fadeUp{from{opacity:0;transform:translateY(8px)}to{opacity:1;transform:translateY(0)}}
  @keyframes pulse{0%,100%{opacity:.3;transform:scale(.8)}50%{opacity:1;transform:scale(1.1)}}
  .fu{animation:fadeUp .3s ease both;}
`;

const iS = {width:"100%",padding:"8px 11px",fontSize:14,border:"1px solid var(--line2)",borderRadius:"var(--r)",background:"#fff",color:"var(--ink)",fontFamily:"inherit"};
const selS = {...iS,appearance:"none",cursor:"pointer",paddingRight:26,
  backgroundImage:"url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='10' height='6'%3E%3Cpath d='M0 0l5 6 5-6z' fill='%23A8A29E'/%3E%3C/svg%3E\")",
  backgroundRepeat:"no-repeat",backgroundPosition:"right 9px center"};

// ── Micro components ──────────────────────────────────────────────────────────
function Card({children,style}) {
  return (
    <div style={{background:"#fff",border:"1px solid var(--line)",borderRadius:"var(--rL)",padding:"18px 20px",boxShadow:"var(--sh)",...style}}>
      {children}
    </div>
  );
}

function Lbl({children,sub}) {
  return (
    <div style={{marginBottom:6}}>
      <div style={{fontSize:12,fontWeight:600,color:"var(--ink2)",textTransform:"uppercase",letterSpacing:"0.06em"}}>{children}</div>
      {sub && <div style={{fontSize:11,color:"var(--ink3)",marginTop:2}}>{sub}</div>}
    </div>
  );
}

function Btn({children,onClick,ghost,gold,disabled,style}) {
  const base = {padding:"9px 20px",borderRadius:"var(--r)",fontSize:14,fontWeight:600,border:"none",cursor:disabled?"not-allowed":"pointer",opacity:disabled?.45:1,fontFamily:"inherit",transition:"opacity .15s",...style};
  const v = ghost ? {background:"transparent",border:"1px solid var(--line2)",color:"var(--ink2)"}
           : gold  ? {background:"var(--gold-bg)",border:"1px solid var(--gold-line)",color:"var(--gold)"}
           : {background:"var(--ink)",color:"#fff"};
  return <button style={{...base,...v}} onClick={disabled?undefined:onClick}>{children}</button>;
}

function MarginTag({margin,bench}) {
  if (margin===null||!bench) return null;
  if (margin>=bench.high) return <span style={{background:"var(--green-bg)",color:"var(--green)",border:"1px solid var(--green-line)",borderRadius:99,padding:"2px 10px",fontSize:12,fontWeight:600}}>Strong · {fmtPct(margin)}</span>;
  if (margin>=bench.avg)  return <span style={{background:"var(--blue-bg)", color:"var(--blue)", border:"1px solid var(--blue-line)", borderRadius:99,padding:"2px 10px",fontSize:12,fontWeight:600}}>On Target · {fmtPct(margin)}</span>;
  if (margin>=bench.low)  return <span style={{background:"var(--gold-bg)", color:"var(--gold)", border:"1px solid var(--gold-line)", borderRadius:99,padding:"2px 10px",fontSize:12,fontWeight:600}}>Below Avg · {fmtPct(margin)}</span>;
  return <span style={{background:"var(--red-bg)",color:"var(--red)",border:"1px solid var(--red-line)",borderRadius:99,padding:"2px 10px",fontSize:12,fontWeight:600}}>At Risk · {fmtPct(margin)}</span>;
}

function UnitSel({value,onChange,highlight}) {
  return (
    <select value={value} onChange={onChange} style={{...selS,borderColor:highlight&&!value?"var(--gold)":undefined,color:highlight&&!value?"var(--ink3)":undefined}}>
      <option value="">— unit —</option>
      {UNIT_GROUPS.map(g => (
        <optgroup key={g.label} label={g.label}>
          {g.units.map(u => <option key={u.v} value={u.v}>{u.l}</option>)}
        </optgroup>
      ))}
    </select>
  );
}

// ── Step bar ──────────────────────────────────────────────────────────────────
const ALL_STEPS = ["Business Info","Product Sizes","Inventory","Recipes","Menu & Margins"];
const SKIP_STEPS = ["Business Info","Inventory","Recipes","Menu & Margins"];

function StepBar({current, skipSizes}) {
  // When skipping sizes: step 0=Business, 2=Inventory, 3=Recipes, 4=Menu
  // Map real step numbers to display positions
  const steps = skipSizes ? SKIP_STEPS : ALL_STEPS;
  // Display index: if skipping, step 2→1, 3→2, 4→3 for display
  const displayIdx = skipSizes
    ? (current===0?0:current===1?0:current-1)
    : current;
  return (
    <div style={{display:"flex",alignItems:"center",paddingBottom:28}}>
      {steps.map((s,i) => (
        <div key={i} style={{display:"flex",alignItems:"center",flex:i<steps.length-1?1:"none"}}>
          <div style={{display:"flex",flexDirection:"column",alignItems:"center",gap:5}}>
            <div style={{width:28,height:28,borderRadius:"50%",display:"flex",alignItems:"center",justifyContent:"center",
              fontSize:12,fontWeight:700,transition:"all .3s",
              background:i<displayIdx?"var(--ink)":i===displayIdx?"var(--gold)":"var(--bg3)",
              color:i<=displayIdx?"#fff":"var(--ink3)",
              border:i===displayIdx?"2px solid var(--gold)":"2px solid transparent"}}>
              {i<displayIdx?"✓":i+1}
            </div>
            <div style={{fontSize:11,fontWeight:i===displayIdx?600:400,whiteSpace:"nowrap",
              color:i===displayIdx?"var(--gold)":i<displayIdx?"var(--ink2)":"var(--ink3)"}}>
              {s}
            </div>
          </div>
          {i<steps.length-1 && (
            <div style={{flex:1,height:1,margin:"0 8px",marginBottom:20,transition:"background .3s",
              background:i<displayIdx?"var(--ink)":"var(--line2)"}}/>
          )}
        </div>
      ))}
    </div>
  );
}

// ── STEP 0: Business Info ─────────────────────────────────────────────────────
function S0_Business({state,set,onNext}) { // onNext(true) = go to sizes, onNext(false) = skip to inventory
  const ok = state.businessName.trim() && state.industry;
  const bench = INDUSTRIES[state.industry];
  return (
    <div className="fu" style={{maxWidth:520,margin:"0 auto"}}>
      <h2 style={{fontSize:26,fontWeight:700,letterSpacing:"-.02em",marginBottom:8}}>Let's start with your business</h2>
      <p style={{color:"var(--ink2)",fontSize:15,lineHeight:1.6,marginBottom:24}}>
        This personalizes your experience and compares your margins against real industry benchmarks.
      </p>
      <Card style={{display:"flex",flexDirection:"column",gap:18}}>
        <div>
          <Lbl>Business Name</Lbl>
          <input value={state.businessName} onChange={e=>set("businessName",e.target.value)} placeholder="e.g. Green Bean Coffee" style={iS}/>
        </div>
        <div>
          <Lbl sub="Sets the benchmark margins we compare you against">Industry</Lbl>
          <select value={state.industry} onChange={e=>set("industry",e.target.value)} style={selS}>
            <option value="">Select your industry…</option>
            {Object.keys(INDUSTRIES).map(k => <option key={k} value={k}>{k}</option>)}
          </select>
        </div>
        {bench && (
          <div style={{background:"var(--gold-bg)",border:"1px solid var(--gold-line)",borderRadius:"var(--r)",padding:"12px 14px",fontSize:13,color:"var(--gold)"}}>
            <strong>Benchmark:</strong> {state.industry} margins run <strong>{bench.low}–{bench.high}%</strong>, averaging <strong>{bench.avg}%</strong>. {bench.note}
          </div>
        )}
      </Card>
      <div style={{marginTop:20,display:"flex",justifyContent:"flex-end"}}>
        <Btn onClick={()=>onNext(state.industry==="Food & Beverage / Cafe")} disabled={!ok}>Continue →</Btn>
      </div>
    </div>
  );
}

// ── STEP 1: Product Sizes ─────────────────────────────────────────────────────
function S1_Sizes({state,setState,onBack,onNext}) {
  const {sizes,useSizes} = state;
  const toggle = () => setState(p=>({...p,useSizes:!p.useSizes}));
  const updSize = (id,f,v) => setState(p=>({...p,sizes:p.sizes.map(s=>s.id===id?{...s,[f]:v}:s)}));
  const addSize = () => setState(p=>({...p,sizes:[...p.sizes,newSize("","")]}));
  const remSize = (id) => setState(p=>({...p,sizes:p.sizes.filter(s=>s.id!==id)}));
  const activeSizes = sizes.filter(s=>s.on&&s.name.trim());

  return (
    <div className="fu" style={{maxWidth:600,margin:"0 auto"}}>
      <h2 style={{fontSize:24,fontWeight:700,letterSpacing:"-.02em",marginBottom:6}}>Product Sizes</h2>
      <p style={{color:"var(--ink2)",fontSize:14,lineHeight:1.6,marginBottom:20}}>
        If you sell drinks or items in multiple sizes — like 8oz, 12oz, and 16oz — define them here. Every recipe will automatically get a tab per size so you can enter different ingredient amounts for each one.
      </p>

      <Card style={{marginBottom:16}}>
        <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:16}}>
          <div>
            <div style={{fontSize:15,fontWeight:700,marginBottom:2}}>Drink / Product Sizes</div>
            <div style={{fontSize:13,color:"var(--ink3)"}}>Toggle off if you don't sell in multiple sizes.</div>
          </div>
          <div onClick={toggle} style={{width:38,height:22,borderRadius:99,cursor:"pointer",flexShrink:0,transition:"background .2s",
            background:useSizes?"var(--green)":"var(--line2)",position:"relative"}}>
            <div style={{position:"absolute",top:3,transition:"left .2s",width:16,height:16,borderRadius:"50%",background:"#fff",
              left:useSizes?18:3,boxShadow:"0 1px 3px rgba(0,0,0,.2)"}}/>
          </div>
        </div>

        {useSizes && (
          <>
            <div style={{display:"grid",gridTemplateColumns:"1fr 100px auto",gap:8,padding:"0 2px",marginBottom:6}}>
              {["Size Name","Fluid oz",""].map((h,i) => (
                <div key={i} style={{fontSize:11,fontWeight:600,color:"var(--ink3)",textTransform:"uppercase",letterSpacing:"0.05em"}}>{h}</div>
              ))}
            </div>
            <div style={{display:"flex",flexDirection:"column",gap:6,marginBottom:10}}>
              {sizes.map(sz => (
                <div key={sz.id} style={{display:"grid",gridTemplateColumns:"1fr 100px auto",gap:8,alignItems:"center",opacity:sz.on?1:.45,transition:"opacity .2s"}}>
                  <input value={sz.name} onChange={e=>updSize(sz.id,"name",e.target.value)}
                    placeholder="e.g. Small, Medium, Large" style={{...iS,fontWeight:500}}/>
                  <div style={{position:"relative"}}>
                    <input type="number" min="0" step="0.5" value={sz.oz}
                      onChange={e=>updSize(sz.id,"oz",e.target.value)} placeholder="oz" style={iS}/>
                    <span style={{position:"absolute",right:9,top:"50%",transform:"translateY(-50%)",fontSize:11,color:"var(--ink3)",pointerEvents:"none"}}>oz</span>
                  </div>
                  <div style={{display:"flex",gap:6,alignItems:"center"}}>
                    <button onClick={()=>updSize(sz.id,"on",!sz.on)}
                      style={{background:"none",border:"none",cursor:"pointer",fontSize:15,padding:0,color:sz.on?"var(--green)":"var(--ink3)"}}>
                      {sz.on?"●":"○"}
                    </button>
                    <button onClick={()=>remSize(sz.id)}
                      style={{background:"none",border:"none",cursor:"pointer",fontSize:18,padding:0,lineHeight:1,color:"var(--ink3)"}}>×</button>
                  </div>
                </div>
              ))}
            </div>
            <button onClick={addSize} style={{width:"100%",background:"none",border:"1px dashed var(--line2)",borderRadius:"var(--r)",padding:"8px",color:"var(--ink3)",fontSize:13,cursor:"pointer",fontFamily:"inherit"}}>
              + Add size
            </button>
            {activeSizes.length>0 && (
              <div style={{marginTop:12,display:"flex",gap:6,flexWrap:"wrap"}}>
                {activeSizes.map(s => (
                  <span key={s.id} style={{background:"var(--gold-bg)",border:"1px solid var(--gold-line)",borderRadius:99,padding:"3px 12px",fontSize:12,color:"var(--gold)",fontWeight:500}}>
                    {s.name}{s.oz?` · ${s.oz}oz`:""}
                  </span>
                ))}
              </div>
            )}
          </>
        )}
      </Card>

      <div style={{background:"var(--blue-bg)",border:"1px solid var(--blue-line)",borderRadius:"var(--r)",padding:"12px 14px",fontSize:13,color:"var(--blue)",marginBottom:20}}>
        💡 <strong>Universal items</strong> like cups, lids, and sleeves that go into every drink are set up in the Recipes step, after you've added your inventory.
      </div>

      <div style={{display:"flex",justifyContent:"space-between"}}>
        <Btn ghost onClick={onBack}>← Back</Btn>
        <Btn onClick={onNext}>Continue to Inventory →</Btn>
      </div>
    </div>
  );
}

// ── STEP 2: Inventory ─────────────────────────────────────────────────────────
function S2_Inventory({state,setState,onBack,onNext}) {
  const {inventory} = state;
  const upd = (id,f,v) => setState(p=>({...p,inventory:p.inventory.map(i=>i.id===id?{...i,[f]:v}:i)}));
  const add = () => setState(p=>({...p,inventory:[...p.inventory,newInvItem()]}));
  const rem = (id) => { if(inventory.length>1) setState(p=>({...p,inventory:p.inventory.filter(i=>i.id!==id)})); };
  const canNext = inventory.some(i=>i.name.trim()&&toNum(i.buyQty)>0&&toNum(i.buyPrice)>0);

  return (
    <div className="fu">
      <h2 style={{fontSize:24,fontWeight:700,letterSpacing:"-.02em",marginBottom:6}}>Inventory — What do you buy?</h2>
      <p style={{color:"var(--ink2)",fontSize:14,lineHeight:1.6,marginBottom:20}}>
        List everything you purchase — ingredients, packaging, supplies. Enter the size you buy and what you pay. This becomes your cost library for building recipes.
      </p>

      <div style={{display:"grid",gridTemplateColumns:"2fr 1fr 80px 1fr 100px 28px",gap:8,padding:"0 4px",marginBottom:8}}>
        {["Item Name","Category","Buy Qty","Buy Unit","Price Paid",""].map((h,i) => (
          <div key={i} style={{fontSize:11,fontWeight:600,color:"var(--ink3)",textTransform:"uppercase",letterSpacing:"0.05em"}}>{h}</div>
        ))}
      </div>

      <div style={{display:"flex",flexDirection:"column",gap:8,marginBottom:12}}>
        {inventory.map(item => {
          const cpu = toNum(item.buyQty)>0&&toNum(item.buyPrice)>0 ? toNum(item.buyPrice)/toNum(item.buyQty) : null;
          return (
            <div key={item.id} style={{background:"#fff",border:"1px solid var(--line)",borderRadius:"var(--r)",padding:"10px 12px",boxShadow:"var(--sh)"}}>
              <div style={{display:"grid",gridTemplateColumns:"2fr 1fr 80px 1fr 100px 28px",gap:8,alignItems:"center"}}>
                <input value={item.name} onChange={e=>upd(item.id,"name",e.target.value)} placeholder="e.g. Whole Milk, 12oz Cup, Vanilla Syrup" style={iS}/>
                <select value={item.category} onChange={e=>upd(item.id,"category",e.target.value)} style={selS}>
                  {INV_CATS.map(c => <option key={c.v} value={c.v}>{c.l}</option>)}
                </select>
                <input type="number" min="0" step="0.01" placeholder="1" value={item.buyQty}
                  onChange={e=>upd(item.id,"buyQty",e.target.value)} style={iS}/>
                <select value={item.buyUnit} onChange={e=>upd(item.id,"buyUnit",e.target.value)}
                  style={{...selS,borderColor:!item.buyUnit?"var(--gold)":undefined,color:!item.buyUnit?"var(--ink3)":undefined}}>
                  <option value="">— pick unit —</option>
                  {UNIT_GROUPS.map(g => (
                    <optgroup key={g.label} label={g.label}>
                      {g.units.map(u => <option key={u.v} value={u.v}>{u.l}</option>)}
                    </optgroup>
                  ))}
                </select>
                <div style={{position:"relative"}}>
                  <span style={{position:"absolute",left:9,top:"50%",transform:"translateY(-50%)",fontSize:12,color:"var(--ink3)"}}>$</span>
                  <input type="number" min="0" step="0.01" placeholder="0.00" value={item.buyPrice}
                    onChange={e=>upd(item.id,"buyPrice",e.target.value)} style={{...iS,paddingLeft:20}}/>
                </div>
                <button onClick={()=>rem(item.id)} style={{background:"none",border:"none",color:"var(--ink3)",cursor:"pointer",fontSize:18,padding:0,lineHeight:1}}>×</button>
              </div>
              {cpu!==null && (
                <div style={{marginTop:5,fontSize:12,color:"var(--ink3)"}}>
                  Cost per {item.buyUnit||"unit"}: <strong style={{color:"var(--ink2)"}}>${cpu.toFixed(4)}</strong>
                </div>
              )}
            </div>
          );
        })}
      </div>

      <button onClick={add} style={{width:"100%",background:"none",border:"1px dashed var(--line2)",borderRadius:"var(--r)",padding:"10px",color:"var(--ink3)",fontSize:13,cursor:"pointer",fontFamily:"inherit"}}>
        + Add inventory item
      </button>

      <div style={{marginTop:24,display:"flex",justifyContent:"space-between",alignItems:"center"}}>
        <Btn ghost onClick={onBack}>← Back</Btn>
        {!canNext && <span style={{fontSize:12,color:"var(--ink3)"}}>Add at least one item with qty and price to continue.</span>}
        <Btn onClick={onNext} disabled={!canNext}>Continue to Recipes →</Btn>
      </div>
    </div>
  );
}

// ── Ingredient editor (own component so it can hold local state safely) ───────
function IngEditor({ings, inventory, universalIds, onChange}) {
  const namedInv = inventory.filter(i=>i.name.trim());

  const updIng = (id,f,v) => onChange(ings.map(i=>i.id===id?{...i,[f]:v}:i));
  const remIng = (id) => onChange(ings.filter(i=>i.id!==id));
  const addIng = () => onChange([...ings,newIngRow()]);

  return (
    <div>
      <div style={{display:"grid",gridTemplateColumns:"1fr 80px 130px 80px 24px",gap:8,padding:"0 2px",marginBottom:6}}>
        {["Inventory Item","Qty Used","Unit","Cost",""].map((h,i) => (
          <div key={i} style={{fontSize:11,fontWeight:600,color:"var(--ink3)",textTransform:"uppercase",letterSpacing:"0.05em"}}>{h}</div>
        ))}
      </div>
      <div style={{display:"flex",flexDirection:"column",gap:7,marginBottom:10}}>
        {ings.map(ing => {
          const inv = inventory.find(i=>i.id===ing.inventoryId);
          const cost = inv ? convertCost(inv.buyQty,inv.buyUnit,inv.buyPrice,ing.useQty,ing.useUnit) : null;
          const isMismatch = inv && ing.useUnit && FAM[inv.buyUnit] && FAM[ing.useUnit] && FAM[inv.buyUnit]!==FAM[ing.useUnit];
          const isUniversal = ing.universal || (inv && universalIds.includes(inv.id));
          return (
            <div key={ing.id} style={{background:isUniversal?"var(--gold-bg)":"var(--bg2)",
              border:`1px solid ${isUniversal?"var(--gold-line)":"var(--line)"}`,borderRadius:"var(--r)",padding:"9px 11px"}}>
              {isUniversal && (
                <div style={{fontSize:10,color:"var(--gold)",fontWeight:700,textTransform:"uppercase",letterSpacing:"0.05em",marginBottom:5}}>
                  ◆ Universal item
                </div>
              )}
              <div style={{display:"grid",gridTemplateColumns:"1fr 80px 130px 80px 24px",gap:8,alignItems:"center"}}>
                <select value={ing.inventoryId} onChange={e=>{
                  const inv2 = inventory.find(i=>i.id===e.target.value);
                  const updated = ings.map(i=>i.id===ing.id?{...i,inventoryId:e.target.value,useUnit:inv2?.buyUnit||i.useUnit}:i);
                  onChange(updated);
                }} style={selS}>
                  <option value="">— select item —</option>
                  {namedInv.map(i => (
                    <option key={i.id} value={i.id}>{i.name}{i.buyUnit?` (${i.buyUnit})`:""}</option>
                  ))}
                </select>
                <input type="number" min="0" step="0.001" placeholder="Qty" value={ing.useQty}
                  onChange={e=>updIng(ing.id,"useQty",e.target.value)} style={iS}/>
                <UnitSel value={ing.useUnit} onChange={e=>updIng(ing.id,"useUnit",e.target.value)} highlight/>
                <div style={{textAlign:"right",fontSize:13,fontWeight:500,color:cost!==null?"var(--green)":"var(--ink3)"}}>
                  {cost!==null ? fmt$4(cost) : "—"}
                </div>
                <button onClick={()=>remIng(ing.id)}
                  style={{background:"none",border:"none",color:"var(--ink3)",cursor:"pointer",fontSize:18,padding:0,lineHeight:1}}>×</button>
              </div>
              {isMismatch && (
                <div style={{fontSize:11,color:"var(--red)",marginTop:4,background:"var(--red-bg)",border:"1px solid var(--red-line)",borderRadius:"var(--r)",padding:"4px 8px"}}>
                  ⚠ Unit mismatch: "{inv?.buyUnit}" and "{ing.useUnit}" are different types.
                  {FAM[inv?.buyUnit]==="v"&&FAM[ing.useUnit]==="w" ? " Use oz (fluid) for liquids, oz (weight) for dry ingredients." : " Change one unit to match."}
                </div>
              )}
              {!isMismatch && cost!==null && inv && inv.buyUnit!==ing.useUnit && (
                <div style={{fontSize:11,color:"var(--green)",marginTop:3}}>✓ Auto-converted {inv.buyUnit} → {ing.useUnit}</div>
              )}
            </div>
          );
        })}
      </div>
      <button onClick={addIng} style={{width:"100%",background:"none",border:"1px dashed var(--line2)",borderRadius:"var(--r)",padding:"9px",color:"var(--ink3)",fontSize:13,cursor:"pointer",fontFamily:"inherit"}}>
        + Add ingredient
      </button>
    </div>
  );
}

// ── Per-product editor — needs own useState for active size tab ───────────────
function ProductEditor({product, inventory, sizes, useSizes, universalItems, setState}) {
  const activeSizes = useSizes ? sizes.filter(s=>s.on&&s.name.trim()) : [];
  const [activeSzId, setActiveSzId] = useState(activeSizes[0]?.id || "__flat__");
  const universalIds = universalItems.map(u=>u.inventoryId).filter(Boolean);

  function getKey(szId) { return szId==="__flat__" ? "__flat__" : `sz_${szId}`; }

  function getIngs(szId) {
    const key = getKey(szId);
    if (product[key] && product[key].length>0) return product[key];
    // Seed with universal items on first access
    const seeded = universalItems.filter(u=>u.inventoryId).map(u=>({id:uid(),inventoryId:u.inventoryId,useQty:u.useQty,useUnit:u.useUnit,universal:true}));
    return [...seeded, newIngRow()];
  }

  function setIngs(szId, ings) {
    const key = getKey(szId);
    setState(p=>({...p,products:p.products.map(x=>x.id===product.id?{...x,[key]:ings}:x)}));
  }

  function calcTotal(ings) {
    return ings.reduce((s,ing)=>{
      const inv = inventory.find(i=>i.id===ing.inventoryId);
      const c = inv ? convertCost(inv.buyQty,inv.buyUnit,inv.buyPrice,ing.useQty,ing.useUnit) : null;
      return s+(c||0);
    },0);
  }

  const curSzId = activeSizes.length>0 ? activeSzId : "__flat__";
  const curIngs = getIngs(curSzId);
  const curTotal = calcTotal(curIngs);

  return (
    <div style={{display:"grid",gridTemplateColumns:"1fr 210px",gap:16,alignItems:"start"}}>
      <div>
        {activeSizes.length>0 && (
          <div style={{display:"flex",gap:6,marginBottom:12,flexWrap:"wrap",alignItems:"center"}}>
            {activeSizes.map(sz => (
              <button key={sz.id} onClick={()=>setActiveSzId(sz.id)}
                style={{padding:"5px 14px",borderRadius:99,fontSize:13,fontWeight:500,cursor:"pointer",border:"1px solid",
                  borderColor:activeSzId===sz.id?"var(--ink)":"var(--line2)",
                  background:activeSzId===sz.id?"var(--ink)":"#fff",
                  color:activeSzId===sz.id?"#fff":"var(--ink2)"}}>
                {sz.name}{sz.oz?` · ${sz.oz}oz`:""}
              </button>
            ))}
            <span style={{fontSize:12,color:"var(--ink3)"}}>Fill amounts for each size</span>
          </div>
        )}
        <IngEditor
          ings={curIngs}
          inventory={inventory}
          universalIds={universalIds}
          onChange={ings=>setIngs(curSzId,ings)}
        />
      </div>

      <div style={{position:"sticky",top:16}}>
        <Card>
          <div style={{fontSize:11,fontWeight:600,color:"var(--ink3)",textTransform:"uppercase",letterSpacing:"0.06em",marginBottom:10}}>Live Cost Preview</div>
          <div style={{fontSize:14,fontWeight:700,marginBottom:activeSizes.length>0?2:10}}>{product.name||"Unnamed"}</div>
          {activeSizes.length>0 && (
            <div style={{fontSize:12,color:"var(--ink3)",marginBottom:10}}>
              {activeSizes.find(s=>s.id===activeSzId)?.name||""} size
            </div>
          )}
          <div style={{display:"flex",flexDirection:"column",gap:6}}>
            {curIngs.map(ing=>{
              const inv = inventory.find(i=>i.id===ing.inventoryId);
              if(!inv) return null;
              const c = convertCost(inv.buyQty,inv.buyUnit,inv.buyPrice,ing.useQty,ing.useUnit);
              return (
                <div key={ing.id} style={{display:"flex",justifyContent:"space-between",alignItems:"center",fontSize:13}}>
                  <span style={{color:ing.universal?"var(--gold)":"var(--ink2)",display:"flex",alignItems:"center",gap:3}}>
                    {ing.universal && <span style={{fontSize:9}}>◆</span>}
                    {inv.name}
                    {ing.useQty&&ing.useUnit && <span style={{fontSize:11,color:"var(--ink3)"}}> · {ing.useQty} {ing.useUnit}</span>}
                  </span>
                  <span style={{fontFamily:"monospace",color:c!==null?"var(--ink)":"var(--ink3)",fontWeight:500}}>
                    {c!==null?fmt$4(c):"—"}
                  </span>
                </div>
              );
            })}
          </div>
          {curTotal>0 ? (
            <>
              <div style={{height:1,background:"var(--line)",margin:"10px 0"}}/>
              <div style={{display:"flex",justifyContent:"space-between",fontSize:15,fontWeight:700}}>
                <span>Total COGS</span>
                <span style={{fontFamily:"monospace"}}>{fmt$(curTotal)}</span>
              </div>
            </>
          ) : (
            <div style={{textAlign:"center",color:"var(--ink3)",fontSize:13,padding:"12px 0"}}>Select ingredients to see cost</div>
          )}
        </Card>

        {activeSizes.length>1 && (
          <Card style={{marginTop:10}}>
            <div style={{fontSize:11,fontWeight:600,color:"var(--ink3)",textTransform:"uppercase",letterSpacing:"0.06em",marginBottom:8}}>All Sizes</div>
            {activeSizes.map(sz => {
              const t = calcTotal(getIngs(sz.id));
              return (
                <div key={sz.id} style={{display:"flex",justifyContent:"space-between",fontSize:13,marginBottom:5}}>
                  <span style={{color:"var(--ink2)"}}>{sz.name}{sz.oz?` · ${sz.oz}oz`:""}</span>
                  <span style={{fontFamily:"monospace",color:t>0?"var(--ink)":"var(--ink3)"}}>{t>0?fmt$(t):"—"}</span>
                </div>
              );
            })}
          </Card>
        )}
      </div>
    </div>
  );
}

// ── STEP 3: Recipes ───────────────────────────────────────────────────────────
function S3_Recipes({state,setState,onBack,onNext}) {
  const {products,inventory,sizes,useSizes,universalItems} = state;
  const [activeId,setActiveId] = useState(products[0]?.id);
  const namedInv = inventory.filter(i=>i.name.trim());

  function addProduct() {
    const np = newProduct();
    setState(p=>({...p,products:[...p.products,np]}));
    setActiveId(np.id);
  }
  function remProduct(id) {
    if(products.length<=1) return;
    const next = products.find(p=>p.id!==id);
    setState(p=>({...p,products:p.products.filter(x=>x.id!==id)}));
    setActiveId(next.id);
  }
  function updProdName(id,v) { setState(p=>({...p,products:p.products.map(x=>x.id===id?{...x,name:v}:x)})); }

  const active = products.find(p=>p.id===activeId) || products[0];
  const canNext = products.some(p=>p.name.trim());

  return (
    <div className="fu">
      <h2 style={{fontSize:24,fontWeight:700,letterSpacing:"-.02em",marginBottom:6}}>Recipes — What goes into each product?</h2>
      <p style={{color:"var(--ink2)",fontSize:14,lineHeight:1.6,marginBottom:6}}>
        Name each product, select its ingredients from your inventory, and enter the exact amount used per item. Units convert automatically — if you bought a <strong>gallon</strong> and use <strong>10 oz</strong> per drink, it calculates correctly.
      </p>
      <div style={{background:"var(--gold-bg)",border:"1px solid var(--gold-line)",borderRadius:"var(--r)",padding:"9px 14px",fontSize:12,color:"var(--gold)",marginBottom:16}}>
        <strong>Tip:</strong> Use <em>oz (fluid)</em> for liquid measurements. Use <em>oz (weight)</em> only for dry ingredients measured on a scale like espresso or flour.
      </div>

      {/* Universal items */}
      <Card style={{marginBottom:16,background:"var(--gold-bg)",borderColor:"var(--gold-line)"}}>
        <div style={{fontSize:14,fontWeight:700,color:"var(--gold)",marginBottom:4}}>◆ Universal Items — Pre-filled on Every Recipe</div>
        <div style={{fontSize:12,color:"var(--ink2)",marginBottom:12}}>
          Set items that every product includes automatically — e.g. cup, lid, sleeve. They pre-populate on all recipes but can be removed from individual ones.
        </div>
        {universalItems.length>0 && (
          <div style={{display:"flex",flexDirection:"column",gap:7,marginBottom:10}}>
            <div style={{display:"grid",gridTemplateColumns:"1fr 80px 130px 28px",gap:8,padding:"0 2px"}}>
              {["Inventory Item","Qty","Unit",""].map((h,i) => (
                <div key={i} style={{fontSize:10,fontWeight:600,color:"var(--ink3)",textTransform:"uppercase",letterSpacing:"0.05em"}}>{h}</div>
              ))}
            </div>
            {universalItems.map(u => (
              <div key={u.id} style={{display:"grid",gridTemplateColumns:"1fr 80px 130px 28px",gap:8,alignItems:"center",background:"#fff",borderRadius:"var(--r)",padding:"8px 10px",border:"1px solid var(--gold-line)"}}>
                <select value={u.inventoryId} onChange={e=>{
                  const inv2 = namedInv.find(i=>i.id===e.target.value);
                  setState(p=>({...p,universalItems:p.universalItems.map(x=>x.id===u.id?{...x,inventoryId:e.target.value,useUnit:inv2?.buyUnit||x.useUnit}:x)}));
                }} style={selS}>
                  <option value="">— select item —</option>
                  {namedInv.map(i => <option key={i.id} value={i.id}>{i.name}{i.buyUnit?` (${i.buyUnit})`:""}</option>)}
                </select>
                <input type="number" min="0" step="0.001" value={u.useQty} placeholder="1"
                  onChange={e=>setState(p=>({...p,universalItems:p.universalItems.map(x=>x.id===u.id?{...x,useQty:e.target.value}:x)}))}
                  style={iS}/>
                <UnitSel value={u.useUnit}
                  onChange={e=>setState(p=>({...p,universalItems:p.universalItems.map(x=>x.id===u.id?{...x,useUnit:e.target.value}:x)}))}
                  highlight/>
                <button onClick={()=>setState(p=>({...p,universalItems:p.universalItems.filter(x=>x.id!==u.id)}))}
                  style={{background:"none",border:"none",color:"var(--ink3)",cursor:"pointer",fontSize:18,padding:0,lineHeight:1}}>×</button>
              </div>
            ))}
          </div>
        )}
        <button onClick={()=>setState(p=>({...p,universalItems:[...p.universalItems,newUniversal()]}))}
          style={{background:"#fff",border:"1px dashed var(--gold-line)",borderRadius:"var(--r)",padding:"8px",width:"100%",color:"var(--gold)",fontSize:13,cursor:"pointer",fontFamily:"inherit"}}>
          + Add universal item (cup, lid, sleeve…)
        </button>
        {universalItems.length>0 && (
          <p style={{fontSize:11,color:"var(--ink3)",marginTop:8}}>These pre-fill on all new recipes. You can remove them from individual products if needed.</p>
        )}
      </Card>

      {/* Product tabs */}
      <div style={{display:"flex",gap:8,flexWrap:"wrap",marginBottom:16,borderBottom:"1px solid var(--line)",paddingBottom:12}}>
        {products.map(p => (
          <button key={p.id} onClick={()=>setActiveId(p.id)}
            style={{padding:"6px 16px",borderRadius:99,fontSize:13,fontWeight:500,cursor:"pointer",border:"1px solid",
              borderColor:activeId===p.id?"var(--gold)":"var(--line2)",
              background:activeId===p.id?"var(--gold-bg)":"#fff",
              color:activeId===p.id?"var(--gold)":"var(--ink2)",
              display:"flex",alignItems:"center",gap:8}}>
            {p.name||"Unnamed product"}
            {products.length>1 && (
              <span onClick={e=>{e.stopPropagation();remProduct(p.id);}}
                style={{color:"var(--ink3)",fontSize:15,lineHeight:1}}>×</span>
            )}
          </button>
        ))}
        <button onClick={addProduct}
          style={{padding:"6px 14px",borderRadius:99,fontSize:13,background:"none",border:"1px dashed var(--line2)",color:"var(--ink3)",cursor:"pointer",fontFamily:"inherit"}}>
          + New product
        </button>
      </div>

      {active && (
        <>
          <Card style={{marginBottom:12}}>
            <Lbl>Product Name</Lbl>
            <input value={active.name} onChange={e=>updProdName(active.id,e.target.value)}
              placeholder="e.g. Oat Milk Latte, Cold Brew, Chai" style={{...iS,fontSize:16,fontWeight:500}}/>
          </Card>
          <ProductEditor
            key={active.id}
            product={active}
            inventory={inventory}
            sizes={sizes}
            useSizes={useSizes}
            universalItems={universalItems}
            setState={setState}
          />
        </>
      )}

      <div style={{marginTop:24,display:"flex",justifyContent:"space-between",alignItems:"center"}}>
        <Btn ghost onClick={onBack}>← Back</Btn>
        {!canNext && <span style={{fontSize:12,color:"var(--ink3)"}}>Name at least one product to continue.</span>}
        <Btn onClick={onNext} disabled={!canNext}>Continue to Menu & Margins →</Btn>
      </div>
    </div>
  );
}

// ── STEP 4: Menu & Margins ────────────────────────────────────────────────────
function S4_Menu({state,setState,onBack}) {
  const {products,inventory,sizes,useSizes,industry,businessName,universalItems} = state;
  const bench = INDUSTRIES[industry];
  const activeSizes = useSizes ? sizes.filter(s=>s.on&&s.name.trim()) : [];
  const [messages,setMessages] = useState([]);
  const [chatInput,setChatInput] = useState("");
  const [loading,setLoading] = useState(false);
  const endRef = useRef(null);
  useEffect(()=>{ endRef.current?.scrollIntoView({behavior:"smooth"}); },[messages,loading]);

  function calcTotal(prod,szId) {
    const key = szId==="__flat__" ? "__flat__" : `sz_${szId}`;
    const ings = prod[key] || [];
    return ings.reduce((s,ing)=>{
      const inv = inventory.find(i=>i.id===ing.inventoryId);
      const c = inv ? convertCost(inv.buyQty,inv.buyUnit,inv.buyPrice,ing.useQty,ing.useUnit) : null;
      return s+(c||0);
    },0);
  }

  function calcMargin(sell,cogs) {
    const p=toNum(sell), c=toNum(cogs);
    return (!p||!c||p<=0) ? null : ((p-c)/p)*100;
  }

  // Build one row per product×size (or just per product if no sizes)
  const rows = [];
  products.filter(p=>p.name.trim()).forEach(prod=>{
    if(activeSizes.length>0) {
      activeSizes.forEach(sz=>{
        const cogs = calcTotal(prod,sz.id);
        const sellKey = `sell_${sz.id}`;
        rows.push({key:`${prod.id}-${sz.id}`,label:`${prod.name} · ${sz.name}${sz.oz?` (${sz.oz}oz)`:""}`,prod,szId:sz.id,sellKey,cogs,sellPrice:prod[sellKey]||""});
      });
    } else {
      const cogs = calcTotal(prod,"__flat__");
      rows.push({key:prod.id,label:prod.name,prod,szId:"__flat__",sellKey:"sellPrice",cogs,sellPrice:prod.sellPrice||""});
    }
  });

  function updSell(prod,sellKey,v) {
    setState(p=>({...p,products:p.products.map(x=>x.id===prod.id?{...x,[sellKey]:v}:x)}));
  }

  const allMargins = rows.map(r=>calcMargin(r.sellPrice,r.cogs)).filter(m=>m!==null);
  const avgMargin = allMargins.length ? allMargins.reduce((s,m)=>s+m,0)/allMargins.length : null;

  function buildSystem() {
    return `You are a direct, practical small-business financial coach. Reference their specific numbers. Under 200 words, end with one concrete action.

Business: ${businessName} | Industry: ${industry}
Benchmark: ${bench?`${bench.avg}% avg (${bench.low}–${bench.high}%). ${bench.note}`:"Unknown"}
Menu:
${rows.map(r=>`  • ${r.label}: COGS ${fmt$(r.cogs)}, sell ${r.sellPrice?fmt$(r.sellPrice):"not set"}, margin ${calcMargin(r.sellPrice,r.cogs)!==null?fmtPct(calcMargin(r.sellPrice,r.cogs)):"N/A"}`).join("\n")}
Avg margin: ${avgMargin!==null?fmtPct(avgMargin):"not enough data"}`;
  }

  async function send(override) {
    const text = override||chatInput.trim();
    if(!text) return;
    setChatInput("");
    const next = [...messages,{role:"user",content:text}];
    setMessages(next); setLoading(true);
    try {
      const res = await fetch("https://api.anthropic.com/v1/messages",{method:"POST",headers:{"Content-Type":"application/json"},
        body:JSON.stringify({model:"claude-sonnet-4-20250514",max_tokens:1000,system:buildSystem(),messages:next})});
      const data = await res.json();
      setMessages(p=>[...p,{role:"assistant",content:data.content?.find(b=>b.type==="text")?.text||"No response."}]);
    } catch { setMessages(p=>[...p,{role:"assistant",content:"Connection error. Please try again."}]); }
    setLoading(false);
  }

  function copyReport() {
    const txt = [
      `${businessName} — Menu Cost Report`,
      `Industry: ${industry}`,
      bench?`Benchmark: ${bench.low}–${bench.high}% (avg ${bench.avg}%)`:"",
      `Date: ${new Date().toLocaleDateString()}`, "",
      ...rows.map(r=>{
        const m=calcMargin(r.sellPrice,r.cogs);
        const profit=toNum(r.sellPrice)-r.cogs;
        return `${r.label}\n  COGS: ${fmt$(r.cogs)} | Sell: ${r.sellPrice?fmt$(r.sellPrice):"—"} | Margin: ${m!==null?fmtPct(m):"—"} | Profit/item: ${r.sellPrice&&r.cogs>0?fmt$(profit):"—"}`;
      }),
      "",`Avg Margin: ${avgMargin!==null?fmtPct(avgMargin):"—"}`,
    ].filter(Boolean).join("\n");
    navigator.clipboard.writeText(txt).catch(()=>{});
    alert("Report copied to clipboard!");
  }

  const QS = ["How are my margins overall?","Which item should I reprice first?","How do I improve my worst margin?","What price increase is realistic?"];

  return (
    <div className="fu">
      <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start",flexWrap:"wrap",gap:12,marginBottom:16}}>
        <div>
          <h2 style={{fontSize:24,fontWeight:700,letterSpacing:"-.02em",marginBottom:4}}>Menu & Margins</h2>
          <p style={{fontSize:13,color:"var(--ink2)"}}>{businessName} · {industry}</p>
        </div>
        {bench && (
          <div style={{background:"var(--gold-bg)",border:"1px solid var(--gold-line)",borderRadius:"var(--r)",padding:"8px 14px",fontSize:12}}>
            <strong style={{color:"var(--gold)"}}>Target: {bench.avg}% avg margin</strong>
            <span style={{color:"var(--ink3)",marginLeft:6}}>({bench.low}–{bench.high}% range)</span>
          </div>
        )}
      </div>

      {allMargins.length>0 && (
        <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fit,minmax(130px,1fr))",gap:10,marginBottom:16}}>
          {[
            {l:"Avg Margin",v:fmtPct(avgMargin),c:bench&&avgMargin>=bench.avg?"var(--green)":bench&&avgMargin>=bench.low?"var(--gold)":"var(--red)"},
            {l:"Items Priced",v:`${allMargins.length} / ${rows.length}`},
            {l:"Benchmark",v:bench?`${bench.avg}%`:"—"},
            {l:"Gap vs Avg",v:bench&&avgMargin!==null?`${(avgMargin-bench.avg)>0?"+":""}${(avgMargin-bench.avg).toFixed(1)}%`:"—",
              c:bench&&avgMargin!==null&&avgMargin>=bench.avg?"var(--green)":"var(--red)"},
          ].map(b => (
            <div key={b.l} style={{background:"var(--bg2)",border:"1px solid var(--line)",borderRadius:"var(--r)",padding:"12px 14px"}}>
              <div style={{fontSize:11,fontWeight:600,color:"var(--ink3)",textTransform:"uppercase",letterSpacing:"0.05em",marginBottom:4}}>{b.l}</div>
              <div style={{fontSize:22,fontWeight:700,letterSpacing:"-.02em",color:b.c||"var(--ink)"}}>{b.v}</div>
            </div>
          ))}
        </div>
      )}

      <Card style={{marginBottom:16,padding:0,overflow:"hidden"}}>
        <table style={{width:"100%",borderCollapse:"collapse",fontSize:14}}>
          <thead>
            <tr style={{background:"var(--bg2)",borderBottom:"1px solid var(--line)"}}>
              {["Product","COGS","Sell Price","Gross Margin","Profit / Item","vs Benchmark"].map(h => (
                <th key={h} style={{padding:"10px 14px",textAlign:"left",fontSize:11,fontWeight:600,color:"var(--ink3)",textTransform:"uppercase",letterSpacing:"0.05em"}}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((row,i) => {
              const m = calcMargin(row.sellPrice,row.cogs);
              const profit = toNum(row.sellPrice)-row.cogs;
              const vs = m!==null&&bench ? m-bench.avg : null;
              return (
                <tr key={row.key} style={{borderBottom:"1px solid var(--line)",background:i%2===0?"#fff":"var(--bg2)"}}>
                  <td style={{padding:"11px 14px",fontWeight:500}}>{row.label}</td>
                  <td style={{padding:"11px 14px",fontFamily:"monospace",fontSize:13}}>
                    {row.cogs>0 ? fmt$(row.cogs) : <span style={{color:"var(--ink3)"}}>Add ingredients</span>}
                  </td>
                  <td style={{padding:"8px 14px"}}>
                    <div style={{position:"relative",maxWidth:100}}>
                      <span style={{position:"absolute",left:8,top:"50%",transform:"translateY(-50%)",fontSize:12,color:"var(--ink3)"}}>$</span>
                      <input type="number" min="0" step="0.01" placeholder="0.00" value={row.sellPrice}
                        onChange={e=>updSell(row.prod,row.sellKey,e.target.value)}
                        style={{...iS,paddingLeft:20,width:100,fontSize:13}}/>
                    </div>
                  </td>
                  <td style={{padding:"11px 14px"}}><MarginTag margin={m} bench={bench}/></td>
                  <td style={{padding:"11px 14px",fontFamily:"monospace",fontSize:13,fontWeight:500,color:profit>0?"var(--green)":"var(--ink3)"}}>
                    {row.sellPrice&&row.cogs>0 ? fmt$(profit) : "—"}
                  </td>
                  <td style={{padding:"11px 14px",fontSize:13,fontWeight:500,color:vs===null?"var(--ink3)":vs>=0?"var(--green)":"var(--red)"}}>
                    {vs!==null ? `${vs>0?"+":""}${vs.toFixed(1)}%` : "—"}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
        {rows.length===0 && (
          <div style={{textAlign:"center",padding:"32px",color:"var(--ink3)",fontSize:14}}>
            No named products yet — go back to Recipes to add them.
          </div>
        )}
      </Card>

      <button onClick={copyReport} style={{marginBottom:20,background:"none",border:"1px solid var(--line2)",borderRadius:"var(--r)",padding:"8px 18px",fontSize:13,color:"var(--ink2)",cursor:"pointer",fontFamily:"inherit"}}>
        Copy report to clipboard
      </button>

      <Card>
        <div style={{fontSize:13,fontWeight:600,marginBottom:12,display:"flex",alignItems:"center",gap:6}}>
          <span style={{width:22,height:22,background:"var(--ink)",color:"#fff",borderRadius:"50%",display:"inline-flex",alignItems:"center",justifyContent:"center",fontSize:10}}>AI</span>
          Business Coach
        </div>
        {messages.length===0 && (
          <div style={{display:"flex",flexWrap:"wrap",gap:8,marginBottom:12}}>
            {QS.map(q => (
              <button key={q} onClick={()=>send(q)}
                style={{background:"var(--bg2)",border:"1px solid var(--line)",borderRadius:99,padding:"6px 14px",fontSize:12,color:"var(--ink2)",cursor:"pointer",fontFamily:"inherit"}}>
                {q}
              </button>
            ))}
          </div>
        )}
        {messages.length>0 && (
          <div style={{background:"var(--bg2)",borderRadius:"var(--r)",border:"1px solid var(--line)",maxHeight:320,overflowY:"auto",padding:"12px",display:"flex",flexDirection:"column",gap:10,marginBottom:12}}>
            {messages.map((m,i) => (
              <div key={i} style={{display:"flex",gap:8,flexDirection:m.role==="user"?"row-reverse":"row",alignItems:"flex-start"}}>
                <div style={{width:24,height:24,borderRadius:"50%",display:"flex",alignItems:"center",justifyContent:"center",fontSize:10,fontWeight:600,flexShrink:0,
                  background:m.role==="user"?"var(--bg3)":"var(--ink)",color:m.role==="user"?"var(--ink2)":"#fff"}}>
                  {m.role==="user"?"U":"AI"}
                </div>
                <div style={{maxWidth:"82%",background:"#fff",border:"1px solid var(--line)",borderRadius:"var(--r)",padding:"9px 12px",fontSize:13,lineHeight:1.7,whiteSpace:"pre-wrap"}}>
                  {m.content}
                </div>
              </div>
            ))}
            {loading && (
              <div style={{display:"flex",gap:8}}>
                <div style={{width:24,height:24,borderRadius:"50%",background:"var(--ink)",display:"flex",alignItems:"center",justifyContent:"center",fontSize:10,color:"#fff"}}>AI</div>
                <div style={{background:"#fff",border:"1px solid var(--line)",borderRadius:"var(--r)",padding:"10px 14px",display:"flex",gap:5}}>
                  {[0,1,2].map(i => <span key={i} style={{width:5,height:5,borderRadius:"50%",background:"var(--ink3)",display:"inline-block",animation:"pulse 1.2s ease-in-out infinite",animationDelay:`${i*.2}s`}}/>)}
                </div>
              </div>
            )}
            <div ref={endRef}/>
          </div>
        )}
        <div style={{display:"flex",gap:8}}>
          <input value={chatInput} onChange={e=>setChatInput(e.target.value)}
            onKeyDown={e=>e.key==="Enter"&&!e.shiftKey&&send()}
            placeholder="Ask about your margins, pricing, or how to improve…" style={{...iS,flex:1}}/>
          <Btn onClick={()=>send()} disabled={loading||!chatInput.trim()}>Ask</Btn>
        </div>
      </Card>

      <div style={{marginTop:20}}>
        <Btn ghost onClick={onBack}>← Back to Recipes</Btn>
      </div>
    </div>
  );
}

// ── Root ──────────────────────────────────────────────────────────────────────
export default function App() {
  const [state,setState] = useState(()=>load()||DEFAULT_STATE);
  const [importMsg,setImportMsg] = useState("");
  const importRef = useRef(null);
  useEffect(()=>{ save({...state,lastSaved:Date.now()}); },[state]);
  const set = (f,v) => setState(p=>({...p,[f]:v}));
  const go  = (n)   => setState(p=>({...p,step:n}));

  function exportData() {
    const filename = `${(state.businessName||"my-business").toLowerCase().replace(/\s+/g,"-")}-health-check.json`;
    const blob = new Blob([JSON.stringify(state, null, 2)], {type:"application/json"});
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url; a.download = filename; a.click();
    URL.revokeObjectURL(url);
  }

  function importData(e) {
    const file = e.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => {
      try {
        const parsed = JSON.parse(ev.target.result);
        if (!parsed.businessName && !parsed.inventory) throw new Error("Invalid file");
        setState({...DEFAULT_STATE,...parsed});
        setImportMsg("✓ Data loaded successfully");
        setTimeout(()=>setImportMsg(""),3000);
      } catch {
        setImportMsg("⚠ Could not read that file — make sure it's a Health Check export");
        setTimeout(()=>setImportMsg(""),4000);
      }
    };
    reader.readAsText(file);
    e.target.value = "";
  }

  return (
    <div style={{minHeight:"100vh",background:"var(--bg)",paddingBottom:80}}>
      <style>{CSS}</style>
      <div style={{background:"#fff",borderBottom:"1px solid var(--line)",padding:"14px 28px",display:"flex",justifyContent:"space-between",alignItems:"center",flexWrap:"wrap",gap:10}}>
        <div>
          <div style={{fontSize:11,fontWeight:700,color:"var(--ink3)",textTransform:"uppercase",letterSpacing:"0.1em",marginBottom:2}}>Business Health Check · Phase 1</div>
          <div style={{fontSize:17,fontWeight:700,color:"var(--ink)",letterSpacing:"-.02em"}}>
            {state.businessName||"Your Business"} <span style={{fontWeight:400,color:"var(--ink3)"}}>— Cost & Margin Analyzer</span>
          </div>
        </div>
        <div style={{display:"flex",alignItems:"center",gap:10,flexWrap:"wrap"}}>
          {importMsg && <span style={{fontSize:12,color:importMsg.startsWith("✓")?"var(--green)":"var(--gold)"}}>{importMsg}</span>}
          {state.lastSaved && <span style={{fontSize:11,color:"var(--ink3)"}}>Saved {new Date(state.lastSaved).toLocaleTimeString([],{hour:"2-digit",minute:"2-digit"})}</span>}
          <input ref={importRef} type="file" accept=".json" onChange={importData} style={{display:"none"}}/>
          <button onClick={()=>importRef.current.click()} style={{padding:"7px 14px",borderRadius:"var(--r)",border:"1px solid var(--line2)",background:"var(--bg2)",color:"var(--ink2)",fontSize:12,cursor:"pointer",fontFamily:"inherit",fontWeight:600}}>
            ↑ Import data
          </button>
          <button onClick={exportData} style={{padding:"7px 14px",borderRadius:"var(--r)",border:"1px solid var(--gold-line)",background:"var(--gold-bg)",color:"var(--gold)",fontSize:12,cursor:"pointer",fontFamily:"inherit",fontWeight:600}}>
            ↓ Export my data
          </button>
        </div>
      </div>
      <div style={{maxWidth:880,margin:"0 auto",padding:"28px 20px"}}>
        <StepBar current={state.step} skipSizes={state.industry!=="Food & Beverage / Cafe"}/>
        {state.step===0 && <S0_Business state={state} set={set} onNext={(showSizes)=>go(showSizes?1:2)}/>}
        {state.step===1 && <S1_Sizes    state={state} setState={setState} onBack={()=>go(0)} onNext={()=>go(2)}/>}
        {state.step===2 && <S2_Inventory state={state} setState={setState} onBack={()=>go(state.industry==="Food & Beverage / Cafe"?1:0)} onNext={()=>go(3)}/>}
        {state.step===3 && <S3_Recipes  state={state} setState={setState} onBack={()=>go(2)} onNext={()=>go(4)}/>}
        {state.step===4 && <S4_Menu     state={state} setState={setState} onBack={()=>go(3)}/>}
      </div>
    </div>
  );
}
