// ===== PRICE LIST =====
// DEFAULT price list (used only on first run)
const PL_DEFAULT = {
  "الأظافر":[
    {n:"جيل بوليش (إيد)",p:300},{n:"جيل بوليش (رجل)",p:250},{n:"هارد جيل باللون",p:400},
    {n:"ريفيل + جيل بوليش",p:380},{n:"X جيل",p:300},{n:"أظافر فيك",p:250},
    {n:"تريتمنت + لون",p:350},{n:"إزالة جيل أو هارد جيل",p:50},{n:"فرنش / أومبريه",p:60},
    {n:"ميرور / كروم",p:50},{n:"كات آي / جليتر",p:50},{n:"إصلاح ظافر",p:15},
    {n:"إكستنشن (للضفر)",p:10},{n:"أكسسوار / ديزاين (للضفر)",p:10},
    {n:"ديزاين يد كاملة",p:80},{n:"مانيكير لون عادي",p:80},{n:"بريس أون نيلز",p:270}
  ],
  "سبا وباديكير":[
    {n:"جلسة سبا لليدين",p:100},{n:"باديكير قدم عادي",p:120},
    {n:"جلسة سبا للقدمين سبيشيال",p:150},{n:"جلسة سبا للقدمين فاخر",p:200},
    {n:"إزالة الجلد الميت / الكالو",p:80}
  ],
  "رموش وحواجب":[
    {n:"رموش كلاسيك",p:450},{n:"رموش هايبرد",p:500},{n:"رموش فوليوم",p:550},
    {n:"رفع رموش Lash Lifting",p:450},{n:"لامينيشن الحواجب",p:450}
  ],
  "باكدجات السبا":[
    {n:"تنضيف البشرة",p:350},{n:"سبا لليد + جيل إيد",p:350},{n:"باديكير + جيل رجل",p:320}
  ]
};

// PL is always read from D.pl (editable), falls back to default
function getPL(){ return D.pl || PL_DEFAULT; }

const SCHED_DEFAULT = {
  Monday:{o:true,s:11,e:20},Tuesday:{o:true,s:11,e:20},Wednesday:{o:true,s:11,e:20},
  Thursday:{o:true,s:12,e:21},Friday:{o:true,s:12,e:21},Saturday:{o:true,s:12,e:21},
  Sunday:{o:false}
};
// Always read from saved data so edits persist
function getSched(){ return D.sched || SCHED_DEFAULT; }
// Keep SCHED as a proxy for backwards compat
const SCHED = new Proxy({}, { get(_,k){ return getSched()[k]; } });
const DAR = {Sunday:'الأحد',Monday:'الاثنين',Tuesday:'الثلاثاء',Wednesday:'الأربعاء',Thursday:'الخميس',Friday:'الجمعة',Saturday:'السبت'};
const MAR = ['يناير','فبراير','مارس','أبريل','مايو','يونيو','يوليو','أغسطس','سبتمبر','أكتوبر','نوفمبر','ديسمبر'];

// ===== SUPABASE CONFIG =====
const SB_URL = 'https://guhsbsnerresgdyzbqnl.supabase.co';
const SB_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imd1aHNic25lcnJlc2dkeXpicW5sIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODI0MDY1NzIsImV4cCI6MjA5Nzk4MjU3Mn0.m6-FccesY77CLsFcAiZ7o8p6OZaWGoDHqhV6usB8x14';
const SB_HEADERS = { 'Content-Type':'application/json', 'apikey': SB_KEY, 'Authorization': 'Bearer '+SB_KEY };

async function sbGet(table) {
  try {
    const r = await fetch(`${SB_URL}/rest/v1/${table}?select=*&order=created_at.asc`, { headers: SB_HEADERS });
    if (!r.ok) return null;
    return await r.json();
  } catch(e) { return null; }
}
async function sbUpsert(table, row) {
  try {
    await fetch(`${SB_URL}/rest/v1/${table}`, {
      method: 'POST',
      headers: { ...SB_HEADERS, 'Prefer': 'resolution=merge-duplicates' },
      body: JSON.stringify(row)
    });
  } catch(e) {}
}
async function sbDelete(table, id) {
  try {
    await fetch(`${SB_URL}/rest/v1/${table}?id=eq.${id}`, { method: 'DELETE', headers: SB_HEADERS });
  } catch(e) {}
}
async function sbUpsertSettings(key, value) {
  await sbUpsert('nelle_settings', { id: key, value: JSON.stringify(value) });
}
async function sbGetSettings(key) {
  try {
    const r = await fetch(`${SB_URL}/rest/v1/nelle_settings?id=eq.${key}&select=value`, { headers: SB_HEADERS });
    const d = await r.json();
    return d?.[0] ? JSON.parse(d[0].value) : null;
  } catch(e) { return null; }
}

// ===== DATA =====
// Local D still used as in-memory cache for fast UI rendering
let D = {techs:[],bks:[],invs:[],exps:[],cls:[],ic:1,costs:{},offers:[],waitlist:[],stock:[],purchases:[]};

// Load from localStorage as instant cache while Supabase loads
try{ const s=localStorage.getItem('nelle3'); if(s) D={...D,...JSON.parse(s)}; }catch(e){}

// sv() — saves to both localStorage (instant) and Supabase (persistent)
function sv(){ localStorage.setItem('nelle3',JSON.stringify(D)); }

// Full sync from Supabase → local D
async function syncFromDB(silent) {
  if(!silent) showSyncStatus('جاري تحميل البيانات...');
  try {
    const [cls, bks, invs, exps, techs, offers, waitlist, stock, purchases, settings] = await Promise.all([
      sbGet('nelle_clients'), sbGet('nelle_bookings'), sbGet('nelle_invoices'),
      sbGet('nelle_expenses'), sbGet('nelle_techs'), sbGet('nelle_offers'),
      sbGet('nelle_waitlist'), sbGet('nelle_stock'), sbGet('nelle_purchases'),
      sbGet('nelle_settings')
    ]);
    if (cls) D.cls = cls.map(r=>({...r.data, id:r.id}));
    if (bks) D.bks = bks.map(r=>({...r.data, id:r.id}));
    if (invs) {
      D.invs = invs.map(r=>({...r.data, id:r.id}));
      // Restore invoice counter
      const maxNum = D.invs.reduce((max,i)=>{ const n=parseInt(i.num?.replace('INV-','')||0); return n>max?n:max; },0);
      if (maxNum >= D.ic) D.ic = maxNum + 1;
    }
    if (exps) D.exps = exps.map(r=>({...r.data, id:r.id}));
    if (techs) D.techs = techs.map(r=>({...r.data, id:r.id}));
    if (offers) D.offers = offers.map(r=>({...r.data, id:r.id}));
    if (waitlist) D.waitlist = waitlist.map(r=>({...r.data, id:r.id}));
    if (stock) D.stock = stock.map(r=>({...r.data, id:r.id}));
    if (purchases) D.purchases = purchases.map(r=>({...r.data, id:r.id}));
    // Load settings
    if (settings) {
      settings.forEach(s=>{ try{ D[s.id]=JSON.parse(s.value); }catch(e){} });
    }
    sv(); // update local cache
    showSyncStatus('✓ متصل بقاعدة البيانات', true);
  } catch(e) {
    showSyncStatus('⚠️ وضع offline — البيانات محلية فقط', false, true);
  }
  // Re-render current page
  rdls(); rdash(); rcal();
  const ck2=[['rent','c-rent'],['sal','c-sal'],['util','c-util'],['sup','c-sup'],['mkt','c-mkt'],['oth','c-oth']];
  ck2.forEach(([k,id])=>{const el=document.getElementById(id);if(el&&D.costs[k])el.value=D.costs[k];});
  // Also refresh whichever page the user is currently looking at
  const PAGE_RENDERERS={dash:rdash,book:rcal,inv:rinv,exp:rexp,cl:rcl,tech:rtech,prices:rprices,offers:rOffers,reports:rreports,waitlist:rWaitlist,stock:rstock,settings:rSettings};
  if(PAGE_RENDERERS[curPage] && curPage!=='dash' && curPage!=='book') PAGE_RENDERERS[curPage]();
}

// ===== BACKGROUND AUTO-REFRESH =====
// Every 60 seconds, quietly pull the latest data from Supabase so multiple
// staff members on different devices stay in sync. Skipped while any modal
// (add/edit form) is open, so it never overwrites something mid-edit.
setInterval(()=>{
  if(document.querySelector('.ov.on')) return; // a modal is open — don't disturb it
  syncFromDB(true);
}, 60000);

// Save a single record to Supabase
async function svRecord(table, record) {
  sv(); // instant local save
  await sbUpsert(table, { id: record.id, data: record });
}
// Delete a single record from Supabase
async function delRecord(table, id) {
  sv(); // instant local save
  await sbDelete(table, id);
}
// Save settings key
async function svSettings(key) {
  sv();
  await sbUpsertSettings(key, D[key]);
}

function showSyncStatus(msg, ok=false, warn=false) {
  const el = document.getElementById('sync-status');
  if (!el) return;
  el.textContent = msg;
  el.style.color = ok ? '#3A7A4A' : warn ? '#B89050' : 'var(--light)';
}

function uid(){ return Math.random().toString(36).slice(2,9)+Date.now().toString(36).slice(-4); }

// ===== HELPERS =====
function tds(d){ return d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2,'0')+'-'+String(d.getDate()).padStart(2,'0'); }
function pld(s){ const[y,m,d]=s.split('-').map(Number); return new Date(y,m-1,d); }
function dname(s){ return ['Sunday','Monday','Tuesday','Wednesday','Thursday','Friday','Saturday'][pld(s).getDay()]; }
function gmk(d){ const day=d.getDay(),diff=d.getDate()-day+(day===0?-6:1); return new Date(d.getFullYear(),d.getMonth(),diff); }
function slots(dn){
  const sc=getSched()[dn]; if(!sc||!sc.o) return [];
  const dur=(D.slotDur||90)/60; // hours
  const r=[]; let h=sc.s;
  while(h+dur<=sc.e){
    const sh=Math.floor(h),sm=Math.round((h%1)*60),eh=Math.floor(h+dur),em=Math.round(((h+dur)%1)*60);
    const f=(hh,mm)=>`${hh%12===0?12:hh%12}:${String(mm).padStart(2,'0')} ${hh<12?'ص':'م'}`;
    r.push({s:f(sh,sm),e:f(eh,em),k:`${sh}:${String(sm).padStart(2,'0')}`}); h+=dur;
  }
  return r;
}

// ===== NAV =====
let curPage='dash';
const PTITLES={dash:'الرئيسية',book:'الحجوزات',inv:'الفواتير',exp:'المصروفات',cl:'العملاء',tech:'الفنيات',prices:'قائمة الأسعار',offers:'العروض والخصومات',reports:'التقارير',waitlist:'قائمة الانتظار',stock:'المخزون',settings:'الإعدادات'};
function goTo(id){
  curPage=id;
  history.replaceState(null,'','#'+id);
  document.querySelectorAll('.pg').forEach(p=>p.classList.remove('on'));
  document.querySelectorAll('.ni').forEach(n=>n.classList.remove('on'));
  document.getElementById('pg-'+id).classList.add('on');
  document.getElementById('ptitle').textContent=PTITLES[id]||id;
  document.querySelectorAll('.ni').forEach(n=>{ if(n.getAttribute('onclick')===`goTo('${id}')`) n.classList.add('on'); });
  const R={dash:rdash,book:rcal,inv:rinv,exp:rexp,cl:rcl,tech:rtech,prices:rprices,offers:rOffers,reports:rreports,waitlist:rWaitlist,stock:rstock,settings:rSettings};
  if(R[id]) R[id]();
  setMobNav(id);
}

// ===== MODALS =====
function openM(id){ document.getElementById(id).classList.add('on'); }
function closeM(id){ document.getElementById(id).classList.remove('on'); }
document.querySelectorAll('.ov').forEach(m=>m.addEventListener('click',e=>{ if(e.target===m) m.classList.remove('on'); }));

// ===== MONTH FILTER =====
function initMF(){
  const now=new Date(), cy=now.getFullYear(), cm=now.getMonth()+1;
  [['d','dash'],['b','book'],['i','inv'],['e','exp'],['r','reports']].forEach(([p])=>{
    const ms=document.getElementById(p+'m'), ys=document.getElementById(p+'y');
    if(!ms||!ys) return;
    ms.innerHTML=MAR.map((n,i)=>`<option value="${String(i+1).padStart(2,'0')}"${i+1===cm?' selected':''}>${n}</option>`).join('');
    const yrs=[2025,2026,2027,2028,2029,2030];
    ys.innerHTML=yrs.map(y=>`<option value="${y}"${y===cy?' selected':''}>${y}</option>`).join('');
  });
}
function gmf(p){
  const ms=document.getElementById(p+'m'), ys=document.getElementById(p+'y');
  if(!ms||!ys){ const n=new Date(); return n.getFullYear()+'-'+String(n.getMonth()+1).padStart(2,'0'); }
  return ys.value+'-'+ms.value;
}
function mgo(p,dir){
  const ms=document.getElementById(p+'m'), ys=document.getElementById(p+'y');
  if(!ms||!ys) return;
  const now=new Date();
  if(dir==='t'){ ms.value=String(now.getMonth()+1).padStart(2,'0'); ys.value=now.getFullYear(); }
  else{
    let m=parseInt(ms.value),y=parseInt(ys.value);
    if(dir==='p'){m--;if(m<1){m=12;y--;}} else{m++;if(m>12){m=1;y++;}}
    if(y<2025) y=2025;
    if(y>2030) y=2030;
    ms.value=String(m).padStart(2,'0');
    if(![...ys.options].find(o=>parseInt(o.value)===y)){const o=document.createElement('option');o.value=y;o.textContent=y;ys.appendChild(o);}
    ys.value=y;
  }
  const R={d:rdash,b:rbklist,i:rinv,e:rexp,r:rreports};
  if(R[p]) R[p]();
}

// ===== TECH SELECT =====
function fillTech(id){
  const s=document.getElementById(id); if(!s) return;
  const v=s.value;
  s.innerHTML='<option value="">اختر الفنية</option>';
  D.techs.forEach(t=>{const o=document.createElement('option');o.value=t.id;o.textContent=t.name;if(t.id===v)o.selected=true;s.appendChild(o);});
}
function rdls(){
  const ns=D.cls.map(c=>c.name);
  ['cldl','cldl2'].forEach(id=>{const d=document.getElementById(id);if(d)d.innerHTML=ns.map(n=>`<option value="${n}">`).join('');});
}

// ===== CALENDAR =====
let wk=gmk(new Date());
function chgwk(d){ wk=new Date(wk.getFullYear(),wk.getMonth(),wk.getDate()+d*7); rcal(); }
function rcal(){
  const tf=document.getElementById('tf')?.value||'';
  const days=Array.from({length:7},(_,i)=>new Date(wk.getFullYear(),wk.getMonth(),wk.getDate()+i));
  const fmt=d=>`${d.getDate()}/${d.getMonth()+1}`;
  document.getElementById('wklbl').textContent=fmt(days[0])+' — '+fmt(days[6]);
  const g=document.getElementById('calgrid'); g.innerHTML='';
  days.forEach(day=>{
    const ds=tds(day), dn=dname(ds), sc=SCHED[dn], isO=sc?.o;
    const col=document.createElement('div'); col.className='cday'+(isO?'':' closed');
    col.innerHTML=`<div class="cdh"><div class="cdn">${DAR[dn]||''}</div><div class="cdd">${day.getDate()}</div>${!isO?'<div style="font-size:9px;color:#ccc">مغلق</div>':''}</div>`;
    if(!isO){
      const s=document.createElement('div');s.className='cslot clo';s.innerHTML='<div class="st" style="color:#ddd">مغلق</div>';col.appendChild(s);
    } else {
      slots(dn).forEach(sl=>{
        const bks=D.bks.filter(b=>b.date===ds&&b.sk===sl.k&&(!tf||b.tid===tf));
        const el=document.createElement('div');
        if(bks.length){
          el.className='cslot booked';
          el.innerHTML=`<div class="st">${sl.s}</div>`;
          bks.forEach((b,i)=>{
            if(i>0){ const hr=document.createElement('hr'); hr.style.cssText='border:none;border-top:1px solid #f5e0de;margin:2px 0'; el.appendChild(hr); }
            const entry=document.createElement('div');
            entry.className='cslot-entry';
            entry.innerHTML=`<div class="sn">${b.cn}</div><div class="ss">${b.svc}${b.tn?' · '+b.tn:''}</div>`;
            entry.onclick=(e)=>{ e.stopPropagation(); viewSlot(b); };
            el.appendChild(entry);
          });
        } else {
          el.className='cslot';
          el.innerHTML=`<div class="st">${sl.s}</div><div class="sa">متاح</div>`;
          el.onclick=()=>{ openBkMod(ds,sl.k); };
        }
        col.appendChild(el);
      });
    }
    g.appendChild(col);
  });
  // refresh tech filter
  const tf2=document.getElementById('tf');
  if(tf2){
    const cv=tf2.value; tf2.innerHTML='<option value="">كل الفنيات</option>';
    D.techs.forEach(t=>{const o=document.createElement('option');o.value=t.id;o.textContent=t.name;if(t.id===cv)o.selected=true;tf2.appendChild(o);});
  }
}

function viewSlot(b){
  document.getElementById('sl-ttl').textContent=b.cn;
  document.getElementById('sl-body').innerHTML=`
    <div class="sr"><span class="sl">الخدمة</span><span class="sv">${b.svc}</span></div>
    <div class="sr"><span class="sl">الفنية</span><span class="sv">${b.tn||'—'}</span></div>
    <div class="sr"><span class="sl">التاريخ</span><span class="sv">${b.date}</span></div>
    <div class="sr"><span class="sl">الوقت</span><span class="sv">${b.ss||'—'}</span></div>
    <div class="sr"><span class="sl">الموبايل</span><span class="sv">${b.mob||'—'}</span></div>
    <div class="sr"><span class="sl">ملاحظات</span><span class="sv">${b.notes||'—'}</span></div>`;
  // Store booking id on the buttons directly
  const delBtn=document.getElementById('sl-del');
  delBtn._bkid=b.id;
  const editBtn=document.getElementById('sl-edit');
  editBtn._bkid=b.id;
  openM('mo-slot');
}

document.getElementById('sl-del').addEventListener('click',function(){
  const id=this._bkid; if(!id) return;
  ask('هل تريدين إلغاء هذا الحجز؟', ()=>{
    D.bks=D.bks.filter(b=>b.id!==id);
    delRecord('nelle_bookings',id); closeM('mo-slot'); rcal();
  });
});

document.getElementById('sl-edit').addEventListener('click',function(){
  const id=this._bkid; if(!id) return;
  closeM('mo-slot');
  openBkMod(null,null,id);
});

let editBkId=null;
function openBkMod(ds,sk,editId){
  editBkId=editId||null;
  const b=editBkId?D.bks.find(x=>x.id===editBkId):null;
  document.getElementById('bk-mo-ttl').textContent=b?'تعديل الحجز':'حجز جديد';
  document.getElementById('bk-cl').value=b?b.cn:'';
  document.getElementById('bk-mob').value=b?(b.mob||''):'';
  document.getElementById('bk-notes').value=b?(b.notes||''):'';
  document.getElementById('bk-dt').value=b?b.date:(ds||tds(new Date()));
  document.getElementById('bk-warn').style.display='none';
  fillTech('bk-tech');
  if(b) document.getElementById('bk-tech').value=b.tid||'';
  // fill service select
  const ss=document.getElementById('bk-svc'); ss.innerHTML='';
  Object.entries(getPL()).forEach(([cat,svcs])=>{
    const og=document.createElement('optgroup'); og.label=cat;
    svcs.forEach(s=>{const o=document.createElement('option');o.value=s.n;o.textContent=`${s.n} — ${s.p} ج`;og.appendChild(o);});
    ss.appendChild(og);
  });
  if(b) ss.value=b.svc;
  updslots();
  const targetSk=b?b.sk:sk;
  if(targetSk){ setTimeout(()=>{ const sl=document.getElementById('bk-slot'); for(const o of sl.options){if(o.value===targetSk){o.selected=true;break;}} },60); }
  openM('mo-bk');
}

function updslots(){
  const ds=document.getElementById('bk-dt').value;
  const tid=document.getElementById('bk-tech').value;
  const sl=document.getElementById('bk-slot');
  const wa=document.getElementById('bk-warn');
  wa.style.display='none';
  if(!ds){ sl.innerHTML='<option>اختر التاريخ أولاً</option>'; return; }
  const dn=dname(ds), sc=SCHED[dn];
  if(!sc?.o){ sl.innerHTML='<option>الصالون مغلق هذا اليوم</option>'; wa.textContent=`${DAR[dn]} يوم إغلاق.`; wa.style.display='block'; return; }
  if(tid){
    const t=D.techs.find(t=>t.id===tid);
    if(t?.days?.length&&!t.days.includes(dn)){ wa.textContent=`${t.name} لا تعمل يوم ${DAR[dn]}.`; wa.style.display='block'; sl.innerHTML='<option>الفنية غير متاحة</option>'; return; }
  }
  sl.innerHTML='';
  slots(dn).forEach(s=>{
    const taken=D.bks.some(b=>b.date===ds&&b.sk===s.k&&(!tid||b.tid===tid)&&b.id!==editBkId);
    const o=document.createElement('option'); o.value=s.k; o.textContent=`${s.s} – ${s.e}${taken?' [محجوز]':''}`; o.disabled=taken; sl.appendChild(o);
  });
}

function saveBk(){
  const cn=document.getElementById('bk-cl').value.trim();
  const ds=document.getElementById('bk-dt').value;
  const tid=document.getElementById('bk-tech').value;
  const slel=document.getElementById('bk-slot');
  const sk=slel.value;
  if(!cn||!ds||!sk||sk.includes('اختر')||sk.includes('مغلق')||sk.includes('غير')){ showErr('يرجى تعبئة جميع الحقول.'); return; }
  const t=D.techs.find(t=>t.id===tid);
  const ss=slel.options[slel.selectedIndex]?.textContent.split(' –')[0]||'';
  const mob=document.getElementById('bk-mob').value.trim();
  if(!D.cls.find(c=>c.name===cn)){ D.cls.push({id:uid(),name:cn,mobile:mob,birthday:'',address:'',referredBy:'',skinType:'',allergies:'',notes:'',createdAt:new Date().toISOString()}); rdls(); }
  if(editBkId){
    const b=D.bks.find(x=>x.id===editBkId);
    if(b){
      Object.assign(b,{cn,mob,tid,tn:t?.name||'',svc:document.getElementById('bk-svc').value,date:ds,sk,ss,dn:dname(ds),notes:document.getElementById('bk-notes').value});
      svRecord('nelle_bookings', b);
    }
  } else {
    D.bks.push({id:uid(),cn,mob,tid,tn:t?.name||'',svc:document.getElementById('bk-svc').value,date:ds,sk,ss,dn:dname(ds),notes:document.getElementById('bk-notes').value,createdAt:new Date().toISOString()});
    svRecord('nelle_bookings', D.bks[D.bks.length-1]);
  }
  editBkId=null;
  closeM('mo-bk'); rcal(); rbklist(bkf);
}

// ===== BOOKING LIST =====
let bkf='';
function bktab(t){
  const cal=document.getElementById('bk-cal'), lst=document.getElementById('bk-lst');
  const tc=document.getElementById('tab-cal'), tl=document.getElementById('tab-lst');
  if(t==='cal'){cal.style.display='';lst.style.display='none';tc.classList.add('on');tl.classList.remove('on');rcal();}
  else{cal.style.display='none';lst.style.display='';tl.classList.add('on');tc.classList.remove('on');rbklist();}
}
function rbklist(f){
  if(f!==undefined) bkf=f;
  const mo=gmf('b'), [y,m]=mo.split('-');
  const lbl=MAR[parseInt(m)-1]+' '+y;
  let list=D.bks.filter(b=>b.date?.startsWith(mo));
  if(bkf) list=list.filter(b=>b.cn.includes(bkf));
  list.sort((a,b)=>a.date.localeCompare(b.date)||a.sk.localeCompare(b.sk));
  const ttl=document.getElementById('bk-lst-ttl'); if(ttl) ttl.textContent='حجوزات '+lbl;
  const lb=document.getElementById('blbl'); if(lb) lb.innerHTML=`<b>${list.length}</b> حجز`;
  const tb=document.getElementById('bklst-body');
  if(!list.length){tb.innerHTML='<tr><td colspan="8" style="text-align:center;color:var(--light);padding:24px">لا توجد حجوزات في هذا الشهر.</td></tr>';return;}
  tb.innerHTML=list.map(b=>`<tr>
    <td>${b.date}</td><td>${DAR[b.dn]||b.dn||'—'}</td>
    <td style="direction:ltr;text-align:center">${b.ss||'—'}</td>
    <td style="font-weight:600">${b.cn}</td>
    <td><span class="badge br">${b.svc}</span></td>
    <td>${b.tn||'—'}</td><td style="font-size:12px;color:var(--light)">${b.notes||'—'}</td>
    <td><div style="display:flex;gap:5px"><button class="btn btn-s btn-sm" onclick="openBkMod(null,null,'${b.id}')">✏️</button><button class="btn btn-d btn-sm" onclick="delBk('${b.id}')">إلغاء</button></div></td>
  </tr>`).join('');
}
function delBk(id){
  ask('هل تريدين إلغاء هذا الحجز؟', ()=>{
    D.bks=D.bks.filter(b=>b.id!==id); delRecord('nelle_bookings',id); rbklist();
  });
}

// ===== INVOICE =====
let ilines=[];
function buildSvcPicker(){
  const el=document.getElementById('svc-picker');
  el.innerHTML=Object.entries(getPL()).map(([cat,svcs])=>`
    <div class="scat">${cat}</div>
    <div class="spg">${svcs.map(s=>`<button class="spb" onclick="addLine('${s.n.replace(/'/g,"\\'")}',${s.p})"><div style="font-weight:700;font-size:12px">${s.n}</div><div style="color:var(--rose);font-size:12px;margin-top:2px">${s.p} ج</div></button>`).join('')}</div>`).join('');
}
function addLine(n,p){ ilines.push({id:uid(),n,p}); rlines(); calctot(); }
function rlines(){
  const c=document.getElementById('inv-lines');
  if(!ilines.length){c.innerHTML='<p style="font-size:12px;color:var(--light);margin-bottom:8px">اضغطي على خدمة لإضافتها.</p>';return;}
  c.innerHTML=`<div style="border:1px solid var(--border);border-radius:9px;overflow:hidden;margin-bottom:9px">`+
    ilines.map(l=>`<div style="display:flex;align-items:center;gap:7px;padding:7px 10px;border-bottom:1px solid #f5f0ee;flex-direction:row-reverse">
      <button class="btn btn-d btn-sm" onclick="rmLine('${l.id}')">✕</button>
      <span style="color:var(--light);font-size:12px">ج</span>
      <input type="number" value="${l.p}" min="0" style="width:100px;padding:5px 9px;border:1px solid var(--border);border-radius:7px;font-size:13px;text-align:center"
        oninput="ilines.find(x=>x.id==='${l.id}').p=parseFloat(this.value)||0;calctot()">
      <span style="flex:1;font-size:13px;font-weight:600;text-align:right">${l.n}</span>
    </div>`).join('')+'</div>';
}
function rmLine(id){ ilines=ilines.filter(l=>l.id!==id); rlines(); calctot(); }
function calctot(){
  const sub=ilines.reduce((s,l)=>s+(l.p||0),0);
  const dt=document.getElementById('in-dt2').value, dv=parseFloat(document.getElementById('in-dv').value)||0;
  let dis=dt==='pct'?sub*dv/100:dt==='fix'?dv:0; dis=Math.min(dis,sub);
  document.getElementById('t-sub').textContent=sub.toFixed(2)+' ج';
  document.getElementById('t-dis').textContent='−'+dis.toFixed(2)+' ج';
  document.getElementById('t-tot').textContent=(sub-dis).toFixed(2)+' ج';
}
let editInvId=null;
function openInvMod(id){
  editInvId=id||null;
  const inv=editInvId?D.invs.find(x=>x.id===editInvId):null;
  document.getElementById('inv-mo-ttl').textContent=inv?'تعديل الفاتورة':'فاتورة جديدة';
  ilines=inv?JSON.parse(JSON.stringify(inv.svcs)):[];
  document.getElementById('in-cl').value=inv?inv.cn:'';
  document.getElementById('in-dt').value=inv?inv.date:tds(new Date());
  document.getElementById('in-notes').value=inv?(inv.notes||''):'';
  document.getElementById('in-pay').value=inv?(inv.pay||'كاش'):'كاش';
  fillTech('in-tech');
  buildSvcPicker(); rlines();
  if(inv){
    document.getElementById('in-dt2').value=inv.dtype||'none';
    document.getElementById('in-dv').value=inv.dval||'';
    document.getElementById('in-dd').value=inv.ddesc||'';
    const ts=document.getElementById('in-tech');
    const wantTn=inv.tn||'غير محدد';
    for(const o of ts.options){ if(o.textContent===wantTn){o.selected=true;break;} }
  } else {
    // Auto-apply active offer (new invoices only)
    const today=tds(new Date());
    const activeOffer=(D.offers||[]).find(o=>(!o.from||o.from<=today)&&(!o.to||o.to>=today));
    if(activeOffer){
      document.getElementById('in-dt2').value=activeOffer.type==='pct'?'pct':'fix';
      document.getElementById('in-dv').value=activeOffer.val;
      document.getElementById('in-dd').value=activeOffer.name;
      showErr('✓ تم تطبيق عرض "'+activeOffer.name+'" تلقائياً');
    } else {
      document.getElementById('in-dt2').value='none';
      document.getElementById('in-dv').value='';
      document.getElementById('in-dd').value='';
    }
  }
  calctot();
  openM('mo-inv');
}
function saveInv(){
  const cl=document.getElementById('in-cl').value.trim();
  if(!cl){showErr('أدخلي اسم العميلة.');return;}
  if(!ilines.length){showErr('أضيفي خدمة واحدة على الأقل.');return;}
  const sub=ilines.reduce((s,l)=>s+(l.p||0),0);
  const dt=document.getElementById('in-dt2').value, dv=parseFloat(document.getElementById('in-dv').value)||0;
  let dis=dt==='pct'?sub*dv/100:dt==='fix'?dv:0; dis=Math.min(dis,sub);
  const ts=document.getElementById('in-tech'); const tn=ts.options[ts.selectedIndex]?.textContent||'';
  if(editInvId){
    const inv=D.invs.find(x=>x.id===editInvId);
    if(inv){
      Object.assign(inv,{cn:cl,date:document.getElementById('in-dt').value,svcs:JSON.parse(JSON.stringify(ilines)),
        sub,dtype:dt,dval:dv,dis,tot:sub-dis,ddesc:document.getElementById('in-dd').value,
        pay:document.getElementById('in-pay').value,tn:tn==='غير محدد'?'':tn,notes:document.getElementById('in-notes').value});
      svRecord('nelle_invoices', inv);
    }
  } else {
    const inv={id:uid(),num:'INV-'+String(D.ic++).padStart(4,'0'),cn:cl,date:document.getElementById('in-dt').value,
      svcs:JSON.parse(JSON.stringify(ilines)),sub,dtype:dt,dval:dv,dis,tot:sub-dis,
      ddesc:document.getElementById('in-dd').value,pay:document.getElementById('in-pay').value,
      tn:tn==='غير محدد'?'':tn,notes:document.getElementById('in-notes').value,createdAt:new Date().toISOString()};
    D.invs.push(inv);
    let c=D.cls.find(c=>c.name===cl);
    if(!c){c={id:uid(),name:cl,mobile:'',createdAt:new Date().toISOString()};D.cls.push(c);rdls();}
    c.lv=inv.date; c.ltv=(c.ltv||0)+inv.tot; c.vc=(c.vc||0)+1;
    svRecord('nelle_invoices', inv);
  }
  editInvId=null;
  closeM('mo-inv'); rinv(); rdash();
}
function rinv(f){
  const mo=gmf('i'), [y,m]=mo.split('-');
  const lbl=MAR[parseInt(m)-1]+' '+y;
  let list=[...D.invs].filter(i=>i.date?.startsWith(mo)).reverse();
  if(f) list=list.filter(i=>i.cn.includes(f));
  const tot=list.reduce((s,i)=>s+i.tot,0);
  const lb=document.getElementById('ilbl'); if(lb) lb.innerHTML=`<b>${list.length}</b> فاتورة &nbsp;|&nbsp; إجمالي: <b>${tot.toFixed(0)} ج</b>`;
  const ttl=document.getElementById('inv-ttl'); if(ttl) ttl.textContent='فواتير '+lbl;
  const tb=document.getElementById('inv-body');
  if(!list.length){tb.innerHTML='<tr><td colspan="9" style="text-align:center;color:var(--light);padding:24px">لا توجد فواتير في هذا الشهر.</td></tr>';return;}
  tb.innerHTML=list.map(inv=>`<tr>
    <td><span class="badge bx">${inv.num}</span></td>
    <td style="font-weight:600">${inv.cn}</td><td>${inv.date}</td>
    <td style="max-width:140px;font-size:12px">${inv.svcs.map(s=>s.n).join('، ')}</td>
    <td>${inv.sub.toFixed(2)} ج</td>
    <td>${inv.dis>0?`<span class="badge br">−${inv.dis.toFixed(2)}</span>`:'—'}</td>
    <td><strong>${inv.tot.toFixed(2)} ج</strong></td>
    <td><span class="badge bx">${inv.pay||'كاش'}</span></td>
    <td><div style="display:flex;gap:5px"><button class="btn btn-s btn-sm" onclick="openInvMod('${inv.id}')">✏️</button><button class="btn btn-s btn-sm" onclick="printInv('${inv.id}')">🖨️</button><button class="btn btn-d btn-sm" onclick="delInv('${inv.id}')">حذف</button></div></td>
  </tr>`).join('');
}
function delInv(id){
  ask('هل تريدين حذف هذه الفاتورة؟', ()=>{
    D.invs=D.invs.filter(i=>i.id!==id); delRecord('nelle_invoices',id); rinv(); rdash();
  });
}

// ===== EXPENSES =====
function openExpMod(){
  document.getElementById('ex-dt').value=tds(new Date());
  document.getElementById('ex-desc').value='';
  document.getElementById('ex-amt').value='';
  openM('mo-exp');
}
function saveExp(){
  const amt=parseFloat(document.getElementById('ex-amt').value)||0;
  const desc=document.getElementById('ex-desc').value.trim();
  const dt=document.getElementById('ex-dt').value;
  if(!dt||!amt||!desc){showErr('يرجى تعبئة جميع الحقول.');return;}
  const newExp={id:uid(),date:dt,cat:document.getElementById('ex-cat').value,desc,amt,createdAt:new Date().toISOString()};
  D.exps.push(newExp);
  svRecord('nelle_expenses',newExp); closeM('mo-exp'); rexp(); rdash();
}
function rexp(){
  const mo=gmf('e'), [y,m]=mo.split('-');
  const lbl=MAR[parseInt(m)-1]+' '+y;
  const mexp=D.exps.filter(e=>e.date?.startsWith(mo));
  const tot=mexp.reduce((s,e)=>s+e.amt,0);
  document.getElementById('exp-tot').textContent=tot.toFixed(2)+' ج';
  const ttl=document.getElementById('exp-ttl'); if(ttl) ttl.textContent='مصروفات '+lbl;
  // Payment breakdown for this month
  const mInv=D.invs.filter(i=>i.date?.startsWith(mo));
  const totalRev=mInv.reduce((s,i)=>s+i.tot,0);
  const cash=mInv.filter(i=>i.pay==='كاش').reduce((s,i)=>s+i.tot,0);
  const card=mInv.filter(i=>i.pay==='كارت').reduce((s,i)=>s+i.tot,0);
  const transfer=mInv.filter(i=>i.pay==='تحويل - انستاباي').reduce((s,i)=>s+i.tot,0);
  const set=(id,v)=>{const el=document.getElementById(id);if(el)el.textContent=v;};
  set('ep-total-rev',totalRev.toFixed(2)+' ج');
  set('ep-cash',cash.toFixed(2)+' ج');
  set('ep-card',card.toFixed(2)+' ج');
  set('ep-transfer',transfer.toFixed(2)+' ج');
  const tb=document.getElementById('exp-body');
  if(!mexp.length){tb.innerHTML='<tr><td colspan="5" style="text-align:center;color:var(--light);padding:24px">لا توجد مصروفات في هذا الشهر.</td></tr>';updbe();return;}
  const cc={مستلزمات:'br',معدات:'bg',تسويق:'bt',موظفين:'bp',مرافق:'bg',صيانة:'br',أخرى:'bx'};
  tb.innerHTML=[...mexp].reverse().map(e=>`<tr>
    <td>${e.date}</td><td><span class="badge ${cc[e.cat]||'bx'}">${e.cat}</span></td>
    <td>${e.desc}</td><td><strong>${e.amt.toFixed(2)} ج</strong></td>
    <td><button class="btn btn-d btn-sm" onclick="delExp('${e.id}')">حذف</button></td>
  </tr>`).join('');
  updbe();
}
function delExp(id){
  ask('هل تريدين حذف هذا المصروف؟', ()=>{
    D.exps=D.exps.filter(e=>e.id!==id); delRecord('nelle_expenses',id); rexp(); rdash();
  });
}
function updbe(){
  const ks=[['rent','c-rent'],['sal','c-sal'],['util','c-util'],['sup','c-sup'],['mkt','c-mkt'],['oth','c-oth']];
  let ft=0;
  ks.forEach(([k,id])=>{const el=document.getElementById(id);const v=parseFloat(el?.value)||0;D.costs[k]=v;ft+=v;});
  sv(); sbUpsertSettings('costs',D.costs);
  const mo=gmf('e');
  const rev=D.invs.filter(i=>i.date?.startsWith(mo)).reduce((s,i)=>s+i.tot,0);
  const ve=D.exps.filter(e=>e.date?.startsWith(mo)).reduce((s,e)=>s+e.amt,0);
  const all=ft+ve;
  document.getElementById('exp-be').textContent=all.toFixed(2)+' ج';
  const el=document.getElementById('be-bar');
  if(all>0){
    const pct=Math.min(100,(rev/all)*100), ok=rev>=all;
    el.innerHTML=`<div style="font-size:13px;color:${ok?'var(--ok)':'var(--warn)'};margin-bottom:5px">
      ${ok?'✓ تم تحقيق نقطة التعادل!':('تحتاجين '+(all-rev).toFixed(0)+' ج إضافية · '+pct.toFixed(0)+'% مغطى')}
    </div><div class="pbar"><div class="pfill" style="width:${pct}%;background:${ok?'var(--ok)':'var(--rose)'}"></div></div>`;
  } else el.innerHTML='';
}

// ===== CLIENTS =====
let editCid=null;
function openClMod(id){
  editCid=id||null;
  const c=id?D.cls.find(x=>x.id===id):null;
  document.getElementById('cl-mo-ttl').textContent=c?'تعديل بيانات عميلة':'إضافة عميلة';
  const mp={nm:'name',mob:'mobile',bd:'birthday',addr:'address',ref:'referredBy',skin:'skinType',alg:'allergies',nt:'notes'};
  Object.entries(mp).forEach(([f,k])=>{const el=document.getElementById('cl-'+f);if(el)el.value=c?(c[k]||''):'';});
  openM('mo-cl');
}
function saveCl(){
  const nm=document.getElementById('cl-nm').value.trim();
  if(!nm){showErr('الاسم مطلوب.');return;}
  const d={name:nm,mobile:document.getElementById('cl-mob').value.trim(),birthday:document.getElementById('cl-bd').value,address:document.getElementById('cl-addr').value,referredBy:document.getElementById('cl-ref').value,skinType:document.getElementById('cl-skin').value,allergies:document.getElementById('cl-alg').value,notes:document.getElementById('cl-nt').value};
  if(editCid){const c=D.cls.find(x=>x.id===editCid);if(c){Object.assign(c,d);svRecord('nelle_clients',c);}}
  else{const nc={id:uid(),...d,createdAt:new Date().toISOString()};D.cls.push(nc);svRecord('nelle_clients',nc);}
  sv(); closeM('mo-cl'); rcl(); rdls();
}
function viewCl(id){
  const c=D.cls.find(x=>x.id===id); if(!c) return;
  const now=new Date(), mo=now.getFullYear()+'-'+String(now.getMonth()+1).padStart(2,'0');
  const invs=D.invs.filter(i=>i.cn===c.name);
  const ltv=invs.reduce((s,i)=>s+i.tot,0), avg=invs.length?ltv/invs.length:0;
  const mvis=invs.filter(i=>i.date?.startsWith(mo)).length;
  const lb=D.bks.filter(b=>b.cn===c.name).sort((a,b)=>b.date.localeCompare(a.date))[0];
  const isBday=c.birthday&&(()=>{const b=pld(c.birthday);return b.getMonth()===now.getMonth()&&b.getDate()===now.getDate();})();
  document.getElementById('clv-nm').textContent=c.name+(isBday?' 🎂':'');
  document.getElementById('clv-body').innerHTML=`
    <div class="g2" style="margin-bottom:12px">
      <div class="card"><div class="ct">إجمالي الإنفاق</div><div class="cv">${ltv.toFixed(0)} ج</div></div>
      <div class="card"><div class="ct">إجمالي الزيارات</div><div class="cv">${invs.length}</div></div>
    </div>
    <div class="sr"><span class="sl">الموبايل</span><span class="sv">${c.mobile||'—'}</span></div>
    <div class="sr"><span class="sl">تاريخ الميلاد</span><span class="sv">${c.birthday||'—'}</span></div>
    <div class="sr"><span class="sl">العنوان</span><span class="sv">${c.address||'—'}</span></div>
    <div class="sr"><span class="sl">جاءت بتوصية من</span><span class="sv">${c.referredBy||'—'}</span></div>
    <div class="sr"><span class="sl">نوع البشرة</span><span class="sv">${c.skinType||'—'}</span></div>
    <div class="sr"><span class="sl">الحساسيات</span><span class="sv">${c.allergies||'—'}</span></div>
    <div class="sr"><span class="sl">متوسط الفاتورة</span><span class="sv">${avg.toFixed(0)} ج</span></div>
    <div class="sr"><span class="sl">زيارات هذا الشهر</span><span class="sv">${mvis}</span></div>
    <div class="sr"><span class="sl">آخر حجز</span><span class="sv">${lb?.date||'—'}</span></div>
    <div class="sr"><span class="sl">ملاحظات</span><span class="sv">${c.notes||'—'}</span></div>
    ${invs.length?`<div style="font-size:11px;font-weight:700;color:var(--light);margin:12px 0 6px">سجل الزيارات</div>
    <table><thead><tr><th>التاريخ</th><th>الخدمات</th><th>الإجمالي</th><th>الفنية</th></tr></thead>
    <tbody>${invs.sort((a,b)=>b.date.localeCompare(a.date)).slice(0,15).map(i=>`<tr><td>${i.date}</td><td>${i.svcs.map(s=>s.n).join('، ')}</td><td>${i.tot.toFixed(0)} ج</td><td>${i.tn||'—'}</td></tr>`).join('')}</tbody></table>`:''}
    <div style="margin-top:12px;display:flex;gap:8px">
      <button class="btn btn-s btn-sm" onclick="closeM('mo-clv');openClMod('${id}')">تعديل البيانات</button>
      <button class="btn btn-d btn-sm" onclick="delCl('${id}')">حذف العميلة</button>
    </div>`;
  openM('mo-clv');
}
function delCl(id){
  ask('هل تريدين حذف هذه العميلة وجميع بياناتها؟', ()=>{
    D.cls=D.cls.filter(c=>c.id!==id); delRecord('nelle_clients',id); closeM('mo-clv'); rcl();
  });
}
function rcl(f){
  const now=new Date(), mo=now.getFullYear()+'-'+String(now.getMonth()+1).padStart(2,'0');
  let list=[...D.cls];
  if(f) list=list.filter(c=>c.name.includes(f)||(c.mobile||'').includes(f));
  document.getElementById('cl-tot').textContent=D.cls.length;
  const uv=[...new Set(D.invs.filter(i=>i.date?.startsWith(mo)).map(i=>i.cn))];
  document.getElementById('cl-vis').textContent=uv.length;
  document.getElementById('cl-rb').textContent=D.cls.filter(c=>D.invs.filter(i=>i.cn===c.name).length>=2).length;
  const tb=document.getElementById('cl-body');
  if(!list.length){tb.innerHTML='<tr><td colspan="7" style="text-align:center;color:var(--light);padding:24px">لا توجد عميلات بعد.</td></tr>';return;}
  tb.innerHTML=list.map(c=>{
    const invs=D.invs.filter(i=>i.cn===c.name);
    const ltv=invs.reduce((s,i)=>s+i.tot,0);
    const last=invs.sort((a,b)=>b.date.localeCompare(a.date))[0];
    const bday=c.birthday?pld(c.birthday):null;
    const isBday=bday&&bday.getMonth()===now.getMonth()&&bday.getDate()===now.getDate();
    return `<tr>
      <td style="font-weight:600">${c.name}${isBday?' 🎂':''}</td>
      <td>${c.mobile||'—'}</td><td>${c.birthday||'—'}</td>
      <td><span class="badge br">${invs.length}</span></td>
      <td>${last?.date||'—'}</td>
      <td>${ltv>0?ltv.toFixed(0)+' ج':'—'}</td>
      <td><div style="display:flex;gap:5px"><button class="btn btn-s btn-sm" onclick="viewCl('${c.id}')">عرض</button><button class="btn btn-sm" style="background:var(--gold-l);color:var(--gold);border:1px solid #e0c898" onclick="openClMod('${c.id}')">تعديل</button></div></td>
    </tr>`;
  }).join('');
}

// ===== TECHNICIANS =====
function openTechMod(){
  ['tc-nm','tc-role','tc-mob'].forEach(id=>document.getElementById(id).value='');
  document.getElementById('tc-type').value='full';
  document.querySelectorAll('.td').forEach(c=>c.checked=false);
  openM('mo-tech');
}
function saveTech(){
  const nm=document.getElementById('tc-nm').value.trim();
  if(!nm){showErr('الاسم مطلوب.');return;}
  const days=[...document.querySelectorAll('.td:checked')].map(c=>c.value);
  const nt={id:uid(),name:nm,role:document.getElementById('tc-role').value,mobile:document.getElementById('tc-mob').value,type:document.getElementById('tc-type').value,days,createdAt:new Date().toISOString()};
  D.techs.push(nt);
  svRecord('nelle_techs',nt); closeM('mo-tech'); rtech(); rcal();
}
function delTech(id){
  ask('هل تريدين حذف هذه الفنية؟', ()=>{
    D.techs=D.techs.filter(t=>t.id!==id); delRecord('nelle_techs',id); rtech(); rcal();
  });
}
function rtech(){
  const c=document.getElementById('tech-cards');
  if(!D.techs.length){c.innerHTML=`<div class="panel" style="grid-column:1/-1"><div class="pb"><p style="color:var(--light);font-size:13px">لا توجد فنيات بعد.</p></div></div>`;return;}
  const now=new Date(), mo=now.getFullYear()+'-'+String(now.getMonth()+1).padStart(2,'0');
  const NIRMEEN='نيرمين';

  // First pass: base stats + pedicure breakdown (by line item) for every technician
  const stats=D.techs.map(t=>{
    const tInvs=D.invs.filter(i=>i.tn===t.name);
    const tot=tInvs.length;
    const mth=tInvs.filter(i=>i.date?.startsWith(mo)).length;
    const baseRev=tInvs.reduce((s,i)=>s+i.tot,0);
    let pedCount=0, pedCountMonth=0, pedRev=0;
    tInvs.forEach(inv=>{
      (inv.svcs||[]).forEach(s=>{
        if(s.n&&s.n.includes('باديكير')){
          pedCount++; pedRev+=(s.p||0);
          if(inv.date?.startsWith(mo)) pedCountMonth++;
        }
      });
    });
    return {t,tot,mth,baseRev,pedCount,pedCountMonth,pedRev};
  });

  // Pedicures (count + revenue) from every technician OTHER than نيرمين get moved to her
  let movedCount=0, movedMonthCount=0, movedRev=0;
  stats.forEach(s=>{ if(s.t.name!==NIRMEEN){ movedCount+=s.pedCount; movedMonthCount+=s.pedCountMonth; movedRev+=s.pedRev; } });

  c.innerHTML=stats.map(({t,tot,mth,baseRev,pedCount,pedCountMonth,pedRev})=>{
    const isNirmeen=t.name===NIRMEEN;
    const netTot=isNirmeen?(tot+movedCount):(tot-pedCount);
    const netMth=isNirmeen?(mth+movedMonthCount):(mth-pedCountMonth);
    const netRev=isNirmeen?(baseRev+movedRev):(baseRev-pedRev);
    return `<div class="panel">
      <div class="ph">
        <div><div style="font-weight:700;font-size:15px">${t.name}</div><div style="font-size:12px;color:var(--light)">${t.role||'فنية'}</div></div>
        <span class="badge ${t.type==='full'?'bk':'br'}">${t.type==='full'?'دوام كامل':'دوام جزئي'}</span>
      </div>
      <div class="pb">
        <div class="sr"><span class="sl">أيام العمل</span><span class="sv" style="font-size:12px">${t.days?.length?t.days.map(d=>DAR[d]||d).join('، '):'كل الأيام'}</span></div>
        <div class="sr"><span class="sl">الموبايل</span><span class="sv">${t.mobile||'—'}</span></div>
        <div class="sr"><span class="sl">حجوزات هذا الشهر</span><span class="sv">${netMth}</span></div>
        <div class="sr"><span class="sl">إجمالي الحجوزات</span><span class="sv">${netTot}</span></div>
        <div class="sr"><span class="sl">إجمالي الإيرادات</span><span class="sv">${netRev.toFixed(2)} ج</span></div>
        <div style="margin-top:11px"><button class="btn btn-d btn-sm" onclick="delTech('${t.id}')">حذف الفنية</button></div>
      </div>
    </div>`;
  }).join('');
}

// ===== DASHBOARD =====
function rdash(){
  const mo=gmf('d'), [y,m]=mo.split('-');
  const lbl=MAR[parseInt(m)-1]+' '+y;
  const now=new Date(), today=tds(now);
  const todayB=D.bks.filter(b=>b.date===today);
  const mInv=D.invs.filter(i=>i.date?.startsWith(mo));
  const rev=mInv.reduce((s,i)=>s+i.tot,0);
  const mexp=D.exps.filter(e=>e.date?.startsWith(mo)).reduce((s,e)=>s+e.amt,0);
  const ft=Object.values(D.costs).reduce((s,v)=>s+(v||0),0);
  const all=mexp+ft, pr=rev-all, avg=mInv.length?rev/mInv.length:0;

  // Payment breakdown
  const cash=mInv.filter(i=>i.pay==='كاش').reduce((s,i)=>s+i.tot,0);
  const card=mInv.filter(i=>i.pay==='كارت').reduce((s,i)=>s+i.tot,0);
  const transfer=mInv.filter(i=>i.pay==='تحويل - انستاباي').reduce((s,i)=>s+i.tot,0);
  const set=(id,v)=>{const el=document.getElementById(id);if(el)el.textContent=v;};
  set('d-cash',cash.toFixed(0));
  set('d-card',card.toFixed(0));
  set('d-transfer',transfer.toFixed(0));
  set('sn-cash',cash.toFixed(2)+' ج');
  set('sn-card',card.toFixed(2)+' ج');
  set('sn-transfer',transfer.toFixed(2)+' ج');

  const snap=document.getElementById('snap-ttl'); if(snap) snap.textContent='ملخص '+lbl;
  const dlb=document.getElementById('dlbl'); if(dlb) dlb.innerHTML=`<b>${mInv.length}</b> فاتورة في ${lbl}`;
  const rs=document.getElementById('d-revsub'); if(rs) rs.textContent='جنيه — '+lbl;

  set('d-today',todayB.length);
  set('d-rev',rev.toFixed(0));
  set('d-cls',D.cls.length);
  set('d-avg',avg.toFixed(0));
  set('sn-inv',rev.toFixed(2)+' ج');
  set('sn-exp',all.toFixed(2)+' ج');
  const pel=document.getElementById('sn-pr');
  if(pel){pel.textContent=(pr>=0?'+':'')+pr.toFixed(2)+' ج';pel.style.color=pr>=0?'var(--ok)':'var(--err)';}
  const uv=[...new Set(mInv.map(i=>i.cn))];
  set('sn-vis',uv.length);
  set('sn-rb',D.cls.filter(c=>D.invs.filter(i=>i.cn===c.name).length>=2).length);
  if(all>0){
    const pct=(rev/all*100).toFixed(0), ok=rev>=all;
    const be=document.getElementById('sn-be');
    if(be){be.textContent=ok?'✓ تم التعادل':`${pct}% (ناقص ${(all-rev).toFixed(0)} ج)`;be.style.color=ok?'var(--ok)':'var(--warn)';}
  }
  const sc=document.getElementById('d-sch');
  if(!todayB.length){sc.innerHTML='<p style="color:var(--light);font-size:13px">لا توجد حجوزات اليوم.</p>';return;}
  sc.innerHTML=todayB.sort((a,b)=>a.sk.localeCompare(b.sk)).map(b=>
    `<div class="sr"><span class="sl">${b.ss||b.sk}<br><span style="color:var(--rose);font-size:11px">${b.svc}${b.tn?' · '+b.tn:''}</span></span><span class="sv">${b.cn}</span></div>`
  ).join('');
}

// ===== PRICES PAGE =====
let editPriceKey = null;

function rprices() {
  const pl = getPL();
  const cont = document.getElementById('prices-cats');
  if (!cont) return;
  const catSel = document.getElementById('pr-cat');
  if (catSel) {
    const cats = Object.keys(pl);
    catSel.innerHTML = cats.map(c=>`<option>${c}</option>`).join('') + '<option>+ قسم جديد...</option>';
  }
  cont.innerHTML = Object.entries(pl).map(([cat, svcs]) => `
    <div class="panel" style="margin-bottom:14px">
      <div class="ph"><h3>${cat}</h3><span class="badge bx">${svcs.length} خدمة</span></div>
      <table>
        <thead><tr><th>اسم الخدمة</th><th>السعر</th><th style="width:130px"></th></tr></thead>
        <tbody>${svcs.map((s,i)=>`<tr>
          <td style="font-weight:500">${s.n}</td>
          <td><strong style="color:var(--rose)">${s.p} ج</strong></td>
          <td><div style="display:flex;gap:6px">
            <button class="btn btn-s btn-sm" onclick="openEditPrice('${encodeURIComponent(cat)}',${i})">تعديل</button>
            <button class="btn btn-d btn-sm" onclick="delPrice('${encodeURIComponent(cat)}',${i})">حذف</button>
          </div></td>
        </tr>`).join('')}</tbody>
      </table>
    </div>`).join('');
}

function openPriceMod() {
  editPriceKey = null;
  document.getElementById('price-mo-ttl').textContent = 'إضافة خدمة جديدة';
  document.getElementById('pr-name').value = '';
  document.getElementById('pr-price').value = '';
  document.getElementById('pr-newcat').value = '';
  document.getElementById('pr-newcat-wrap').style.display = 'none';
  const catSel = document.getElementById('pr-cat');
  catSel.value = Object.keys(getPL())[0] || 'الأظافر';
  openM('mo-price');
}

function openEditPrice(catEnc, idx) {
  const cat = decodeURIComponent(catEnc);
  const svc = getPL()[cat]?.[idx];
  if (!svc) return;
  editPriceKey = {cat, idx};
  document.getElementById('price-mo-ttl').textContent = 'تعديل خدمة';
  document.getElementById('pr-cat').value = cat;
  document.getElementById('pr-name').value = svc.n;
  document.getElementById('pr-price').value = svc.p;
  document.getElementById('pr-newcat-wrap').style.display = 'none';
  openM('mo-price');
}

document.addEventListener('change', function(e) {
  if (e.target && e.target.id === 'pr-cat') {
    document.getElementById('pr-newcat-wrap').style.display = e.target.value.startsWith('+') ? '' : 'none';
  }
});

function savePrice() {
  const nm = document.getElementById('pr-name').value.trim();
  const pr = parseFloat(document.getElementById('pr-price').value) || 0;
  if (!nm) { showErr('أدخلي اسم الخدمة.'); return; }
  if (!pr) { showErr('أدخلي السعر.'); return; }
  if (!D.pl) D.pl = JSON.parse(JSON.stringify(PL_DEFAULT));
  let cat = document.getElementById('pr-cat').value;
  if (cat.startsWith('+')) {
    cat = document.getElementById('pr-newcat').value.trim();
    if (!cat) { showErr('أدخلي اسم القسم الجديد.'); return; }
    if (!D.pl[cat]) D.pl[cat] = [];
  }
  if (editPriceKey) {
    if (editPriceKey.cat !== cat) {
      D.pl[editPriceKey.cat].splice(editPriceKey.idx, 1);
      if (D.pl[editPriceKey.cat].length === 0) delete D.pl[editPriceKey.cat];
      if (!D.pl[cat]) D.pl[cat] = [];
      D.pl[cat].push({n:nm, p:pr});
    } else {
      D.pl[editPriceKey.cat][editPriceKey.idx] = {n:nm, p:pr};
    }
  } else {
    if (!D.pl[cat]) D.pl[cat] = [];
    D.pl[cat].push({n:nm, p:pr});
  }
  sv(); sbUpsertSettings('pl',D.pl); closeM('mo-price'); rprices();
  showErr(editPriceKey ? '✓ تم تعديل الخدمة' : '✓ تمت إضافة الخدمة');
}

function delPrice(catEnc, idx) {
  const cat = decodeURIComponent(catEnc);
  const svcName = getPL()[cat]?.[idx]?.n || 'هذه الخدمة';
  ask('هل تريدين حذف "' + svcName + '"؟', () => {
    if (!D.pl) D.pl = JSON.parse(JSON.stringify(PL_DEFAULT));
    D.pl[cat].splice(idx, 1);
    if (D.pl[cat].length === 0) delete D.pl[cat];
    sv(); sbUpsertSettings('pl',D.pl); rprices(); showErr('✓ تم الحذف');
  });
}

// ===== STOCK TABS & RESTOCK =====
function switchStockTab(tab) {
  const inv=document.getElementById('st-inv-view'), hist=document.getElementById('st-hist-view');
  const ti=document.getElementById('st-tab-inv'), th=document.getElementById('st-tab-hist');
  if(tab==='inventory'){
    inv.style.display=''; hist.style.display='none';
    ti.classList.add('on'); th.classList.remove('on'); rstock();
  } else {
    inv.style.display='none'; hist.style.display='';
    th.classList.add('on'); ti.classList.remove('on'); rPurchaseHist();
  }
}
function goToTab(tabId){ const el=document.getElementById(tabId); if(el) el.click(); }

function openRestockMod() {
  const prods=D.stock||[];
  if(!prods.length){showErr('أضيفي منتجات في المخزون أولاً.');return;}
  const sel=document.getElementById('rs-prod');
  sel.innerHTML=prods.map(p=>`<option value="${p.id}">${p.name} (${p.cat}) — كمية حالية: ${p.qty} ${p.unit}</option>`).join('');
  document.getElementById('rs-qty').value='';
  document.getElementById('rs-date').value=tds(new Date());
  document.getElementById('rs-price').value='';
  document.getElementById('rs-notes').value='';
  document.getElementById('rs-preview').style.display='none';
  const updatePreview=()=>{
    const p=D.stock?.find(x=>x.id===sel.value);
    const qty=parseInt(document.getElementById('rs-qty').value)||0;
    const prev=document.getElementById('rs-preview');
    if(p&&qty>0){prev.style.display='';prev.innerHTML=`الكمية الحالية: <strong>${p.qty}</strong> ${p.unit} + <strong style="color:var(--ok)">${qty}</strong> = <strong style="color:var(--rose)">${p.qty+qty}</strong> ${p.unit}`;}
    else prev.style.display='none';
  };
  sel.onchange=updatePreview;
  document.getElementById('rs-qty').oninput=updatePreview;
  openM('mo-restock');
}
function saveRestock() {
  const prodId=document.getElementById('rs-prod').value;
  const qty=parseInt(document.getElementById('rs-qty').value)||0;
  const date=document.getElementById('rs-date').value;
  if(!qty||qty<1){showErr('أدخلي كمية صحيحة.');return;}
  const prod=D.stock?.find(p=>p.id===prodId); if(!prod) return;
  const prevQty=prod.qty;
  prod.qty+=qty; prod.bought=date;
  if(!D.purchases) D.purchases=[];
  D.purchases.push({id:uid(),prodId,prodName:prod.name,prodCode:prod.code||'',cat:prod.cat,qty,prevQty,newQty:prod.qty,
    price:parseFloat(document.getElementById('rs-price').value)||0,
    date,notes:document.getElementById('rs-notes').value,createdAt:new Date().toISOString()});
  sv(); sbUpsertSettings('stock',D.stock); sbUpsertSettings('purchases',D.purchases); closeM('mo-restock');
  showErr(`✓ تمت إضافة ${qty} ${prod.unit} لـ "${prod.name}" — الكمية الجديدة: ${prod.qty}`);
  rstock(); rPurchaseHist();
}
function rPurchaseHist() {
  const list=(D.purchases||[]).slice().reverse();
  const tb=document.getElementById('hist-body');
  if(!list.length){tb.innerHTML='<tr><td colspan="6" style="text-align:center;color:var(--light);padding:24px">لا توجد طلبيات مسجلة بعد.</td></tr>';return;}
  tb.innerHTML=list.map(p=>`<tr>
    <td>${p.date}</td>
    <td style="font-family:monospace;font-size:12px;color:var(--mid);background:var(--cream);padding:4px 8px;border-radius:5px">${p.prodCode||'—'}</td>
    <td style="font-weight:600">${p.prodName}<br><span class="badge bx" style="font-size:10px">${p.cat}</span></td>
    <td><span style="color:var(--ok);font-weight:700">+${p.qty}</span></td>
    <td style="font-size:12px;color:var(--mid)">${p.prevQty} ← <strong>${p.newQty}</strong></td>
    <td>${p.price>0?p.price.toFixed(2)+' ج':'—'}</td>
    <td style="font-size:12px;color:var(--light)">${p.notes||'—'}</td>
  </tr>`).join('');
}

// ===== CUSTOM CONFIRM (replaces window.confirm which is blocked in iframes) =====
function ask(msg, onYes) {
  document.getElementById('cfm-msg').textContent = msg;
  document.getElementById('cfm-yes').onclick = () => { closeM('mo-cfm'); onYes(); };
  openM('mo-cfm');
}
function showErr(msg) {
  const t = document.getElementById('toast');
  t.textContent = msg; t.style.opacity = '1';
  setTimeout(() => { t.style.opacity = '0'; }, 3000);
}

// ===== OFFERS =====
function openOfferMod(id) {
  const o = id ? D.offers?.find(x=>x.id===id) : null;
  document.getElementById('offer-ttl').textContent = o ? 'تعديل عرض' : 'إضافة عرض جديد';
  document.getElementById('of-name').value = o?.name||'';
  document.getElementById('of-type').value = o?.type||'pct';
  document.getElementById('of-val').value = o?.val||'';
  document.getElementById('of-from').value = o?.from||tds(new Date());
  document.getElementById('of-to').value = o?.to||'';
  document.getElementById('of-svcs').value = o?.svcs||'';
  document.getElementById('of-notes').value = o?.notes||'';
  openM('mo-offer');
}
function saveOffer() {
  const nm = document.getElementById('of-name').value.trim();
  const val = parseFloat(document.getElementById('of-val').value)||0;
  if (!nm) { showErr('أدخلي اسم العرض.'); return; }
  if (!val) { showErr('أدخلي قيمة الخصم.'); return; }
  if (!D.offers) D.offers = [];
  const no={id:uid(),name:nm,type:document.getElementById('of-type').value,val,from:document.getElementById('of-from').value,to:document.getElementById('of-to').value,svcs:document.getElementById('of-svcs').value,notes:document.getElementById('of-notes').value,createdAt:new Date().toISOString()};
  D.offers.push(no);
  svRecord('nelle_offers',no); closeM('mo-offer'); rOffers(); showErr('✓ تم إضافة العرض');
}
function rOffers() {
  const tb = document.getElementById('offers-body');
  const list = D.offers||[];
  if (!list.length) { tb.innerHTML='<tr><td colspan="6" style="text-align:center;color:var(--light);padding:24px">لا توجد عروض بعد.</td></tr>'; return; }
  const today = tds(new Date());
  tb.innerHTML = list.map(o => {
    const active = (!o.from||o.from<=today) && (!o.to||o.to>=today);
    return `<tr>
      <td style="font-weight:600">${o.name}</td>
      <td>${o.type==='pct'?'نسبة %':'مبلغ ثابت'}</td>
      <td><strong style="color:var(--rose)">${o.val}${o.type==='pct'?'%':' ج'}</strong></td>
      <td>${o.to||'بدون انتهاء'}</td>
      <td><span class="badge ${active?'bk':'bx'}">${active?'نشط':'منتهي'}</span></td>
      <td><div style="display:flex;gap:5px">
        <button class="btn btn-s btn-sm" onclick="openOfferMod('${o.id}')">تعديل</button>
        <button class="btn btn-d btn-sm" onclick="delOffer('${o.id}')">حذف</button>
      </div></td>
    </tr>`;
  }).join('');
}
function delOffer(id) {
  ask('هل تريدين حذف هذا العرض؟', ()=>{ D.offers=D.offers.filter(o=>o.id!==id); delRecord('nelle_offers',id); rOffers(); });
}

// ===== REPORTS =====
function rreports() {
  const mo = gmf('r'), [y,m] = mo.split('-');
  const lbl = MAR[parseInt(m)-1]+' '+y;

  // Build last 6 months
  const months = [];
  let cm = parseInt(m), cy2 = parseInt(y);
  for (let i=5; i>=0; i--) {
    let mm = cm - i, yy = cy2;
    if (mm <= 0) { mm += 12; yy--; }
    months.push(yy+'-'+String(mm).padStart(2,'0'));
  }

  const mInv = D.invs.filter(i=>i.date?.startsWith(mo));
  const rev = mInv.reduce((s,i)=>s+i.tot,0);
  const avg = mInv.length ? rev/mInv.length : 0;

  // Retention rate
  const prevMo = months[months.length-2];
  const prevClients = new Set(D.invs.filter(i=>i.date?.startsWith(prevMo)).map(i=>i.cn));
  const currClients = new Set(mInv.map(i=>i.cn));
  const retained = [...prevClients].filter(c=>currClients.has(c)).length;
  const retRate = prevClients.size ? Math.round(retained/prevClients.size*100) : 0;

  document.getElementById('rp-rev').textContent = rev.toFixed(0);
  document.getElementById('rp-inv').textContent = mInv.length;
  document.getElementById('rp-avg').textContent = avg.toFixed(0);
  document.getElementById('rp-ret').textContent = retRate+'%';

  // Payment breakdown in reports
  const cash = mInv.filter(i=>i.pay==='كاش').reduce((s,i)=>s+i.tot,0);
  const card = mInv.filter(i=>i.pay==='كارت').reduce((s,i)=>s+i.tot,0);
  const transfer = mInv.filter(i=>i.pay==='تحويل - انستاباي').reduce((s,i)=>s+i.tot,0);
  const setEl=(id,v)=>{const el=document.getElementById(id);if(el)el.textContent=v;};
  setEl('rp-cash', cash.toFixed(0)+' ج');
  setEl('rp-card', card.toFixed(0)+' ج');
  setEl('rp-transfer', transfer.toFixed(0)+' ج');
  const pct=(v)=>rev>0?Math.round(v/rev*100)+'%':'0%';
  setEl('rp-cash-pct', pct(cash)+' من الإجمالي');
  setEl('rp-card-pct', pct(card)+' من الإجمالي');
  setEl('rp-transfer-pct', pct(transfer)+' من الإجمالي');
  const setBar=(id,v)=>{const el=document.getElementById(id);if(el)el.style.width=(rev>0?Math.round(v/rev*100):0)+'%';};
  setBar('rp-cash-bar',cash); setBar('rp-card-bar',card); setBar('rp-transfer-bar',transfer);

  // Revenue chart (canvas bars)
  const canvas = document.getElementById('chart-rev');
  const ctx = canvas.getContext('2d');
  const W = canvas.parentElement.offsetWidth - 32 || 400;
  canvas.width = W; canvas.height = 180;
  ctx.clearRect(0,0,W,180);
  const revByMonth = months.map(mo2 => D.invs.filter(i=>i.date?.startsWith(mo2)).reduce((s,i)=>s+i.tot,0));
  const maxR = Math.max(...revByMonth,1);
  const barW = Math.floor((W-40)/months.length) - 8;
  const gap = Math.floor((W-40)/months.length);
  revByMonth.forEach((r,i) => {
    const bh = Math.round((r/maxR)*130);
    const x = 20 + i*gap;
    const y = 145 - bh;
    ctx.fillStyle = months[i]===mo ? '#C4726A' : '#E8C4BF';
    ctx.beginPath();
    ctx.roundRect(x, y, barW, bh, 4);
    ctx.fill();
    // Month label
    ctx.fillStyle = '#A38070';
    ctx.font = '10px sans-serif';
    ctx.textAlign = 'center';
    const [my,mm2] = months[i].split('-');
    ctx.fillText(MAR[parseInt(mm2)-1].slice(0,3), x+barW/2, 165);
    // Value
    if (r > 0) {
      ctx.fillStyle = '#2C1F1A';
      ctx.font = 'bold 10px sans-serif';
      ctx.fillText(r>=1000?(r/1000).toFixed(1)+'k':r.toFixed(0), x+barW/2, y-4);
    }
  });

  // Top services
  const svcCount = {};
  mInv.forEach(inv => inv.svcs?.forEach(s => { svcCount[s.n]=(svcCount[s.n]||0)+1; }));
  const sorted = Object.entries(svcCount).sort((a,b)=>b[1]-a[1]).slice(0,6);
  const maxSvc = sorted[0]?.[1]||1;
  document.getElementById('rp-top-svcs').innerHTML = sorted.length ? sorted.map(([n,c])=>`
    <div style="margin-bottom:10px">
      <div style="display:flex;justify-content:space-between;font-size:12px;margin-bottom:3px">
        <span style="font-weight:600">${n}</span><span style="color:var(--rose)">${c} مرة</span>
      </div>
      <div class="pbar"><div class="pfill" style="width:${Math.round(c/maxSvc*100)}%"></div></div>
    </div>`).join('') : '<p style="color:var(--light);font-size:13px">لا توجد بيانات بعد.</p>';

  // Tech performance
  const techRev = {};
  mInv.forEach(inv => { if(inv.tn) techRev[inv.tn]=(techRev[inv.tn]||0)+inv.tot; });
  const techSorted = Object.entries(techRev).sort((a,b)=>b[1]-a[1]);
  document.getElementById('rp-techs').innerHTML = techSorted.length ? techSorted.map(([n,r])=>`
    <div class="sr"><span class="sl">${n}</span><span class="sv">${r.toFixed(0)} ج</span></div>`).join('')
    : '<p style="color:var(--light);font-size:13px">لا توجد بيانات بعد.</p>';

  // Client insights
  const newCls = mInv.filter(i=>D.invs.filter(x=>x.cn===i.cn).length===1).length;
  const topCl = [...currClients].map(cn=>({ cn, tot:mInv.filter(i=>i.cn===cn).reduce((s,i)=>s+i.tot,0) })).sort((a,b)=>b.tot-a.tot)[0];
  document.getElementById('rp-clients').innerHTML = `
    <div class="sr"><span class="sl">عملاء جدد هذا الشهر</span><span class="sv">${newCls}</span></div>
    <div class="sr"><span class="sl">عملاء عائدون</span><span class="sv">${currClients.size - newCls}</span></div>
    <div class="sr"><span class="sl">معدل العودة</span><span class="sv">${retRate}%</span></div>
    <div class="sr"><span class="sl">أعلى عميلة إنفاقاً</span><span class="sv">${topCl ? topCl.cn+' ('+topCl.tot.toFixed(0)+' ج)' : '—'}</span></div>
    <div class="sr"><span class="sl">إجمالي زيارات الشهر</span><span class="sv">${mInv.length}</span></div>`;
}

// ===== WAITLIST =====
function openWaitMod() {
  document.getElementById('wl-nm').value='';
  document.getElementById('wl-mob').value='';
  document.getElementById('wl-notes').value='';
  fillTech('wl-tech');
  // Fill service select
  const ss=document.getElementById('wl-svc'); ss.innerHTML='';
  Object.entries(getPL()).forEach(([cat,svcs])=>{
    const og=document.createElement('optgroup'); og.label=cat;
    svcs.forEach(s=>{const o=document.createElement('option');o.value=s.n;o.textContent=s.n;og.appendChild(o);});
    ss.appendChild(og);
  });
  openM('mo-wait');
}
function saveWait() {
  const nm=document.getElementById('wl-nm').value.trim();
  if(!nm){showErr('أدخلي اسم العميلة.');return;}
  if(!D.waitlist) D.waitlist=[];
  const tech=D.techs.find(t=>t.id===document.getElementById('wl-tech').value);
  D.waitlist.push({ id:uid(), name:nm, mobile:document.getElementById('wl-mob').value.trim(),
    svc:document.getElementById('wl-svc').value, techId:document.getElementById('wl-tech').value,
    techName:tech?.name||'', notes:document.getElementById('wl-notes').value,
    createdAt:new Date().toISOString() });
  const nw=D.waitlist[D.waitlist.length-1]; svRecord('nelle_waitlist',nw); closeM('mo-wait'); rWaitlist(); showErr('✓ تمت الإضافة لقائمة الانتظار');
}
function rWaitlist() {
  const list=D.waitlist||[];
  const cnt=document.getElementById('wl-count'); if(cnt) cnt.textContent=list.length;
  const tb=document.getElementById('wl-body');
  if(!list.length){tb.innerHTML='<tr><td colspan="7" style="text-align:center;color:var(--light);padding:24px">قائمة الانتظار فاضية.</td></tr>';return;}
  tb.innerHTML=list.map(w=>`<tr>
    <td style="font-weight:600">${w.name}</td>
    <td>${w.mobile||'—'}</td>
    <td><span class="badge br">${w.svc}</span></td>
    <td>${w.techName||'أي فنية'}</td>
    <td style="font-size:12px">${w.createdAt?.split('T')[0]||'—'}</td>
    <td style="font-size:12px;color:var(--light)">${w.notes||'—'}</td>
    <td><div style="display:flex;gap:5px">
      <button class="btn btn-s btn-sm" onclick="moveToBooking('${w.id}')">📅 حجز</button>
      <button class="btn btn-d btn-sm" onclick="delWait('${w.id}')">حذف</button>
    </div></td>
  </tr>`).join('');
}
function delWait(id) {
  ask('حذف من قائمة الانتظار؟', ()=>{ D.waitlist=D.waitlist.filter(w=>w.id!==id); delRecord('nelle_waitlist',id); rWaitlist(); });
}
function moveToBooking(id) {
  const w=D.waitlist?.find(x=>x.id===id); if(!w) return;
  openBkMod();
  setTimeout(()=>{
    document.getElementById('bk-cl').value=w.name;
    document.getElementById('bk-mob').value=w.mobile||'';
    if(w.techId) document.getElementById('bk-tech').value=w.techId;
    // set service
    const ss=document.getElementById('bk-svc');
    for(const o of ss.options){if(o.value===w.svc){o.selected=true;break;}}
    showErr('تم نقل بيانات العميلة — اختاري التاريخ والميعاد');
    // Remove from waitlist after booking
    D.waitlist=D.waitlist.filter(x=>x.id!==id); sv(); rWaitlist();
  },200);
}

// ===== STOCK =====
let editStockId=null;
// Default stock cats + any saved custom ones
const DEFAULT_STOCK_CATS = ['ألوان أظافر','مستلزمات رموش','منتجات بشرة','أدوات','مواد تنظيف','أخرى'];
function getStockCats() {
  const saved = D.stockCats || [];
  return [...new Set([...DEFAULT_STOCK_CATS, ...saved])];
}
function toggleNewStockCat() {
  const sel = document.getElementById('st-cat');
  document.getElementById('st-newcat-wrap').style.display = sel.value==='__new__' ? '' : 'none';
}
function fillStockCatSelect(currentCat) {
  const sel = document.getElementById('st-cat');
  const cats = getStockCats();
  sel.innerHTML = cats.map(c=>`<option value="${c}"${c===currentCat?' selected':''}>${c}</option>`).join('') +
    '<option value="__new__">+ فئة جديدة...</option>';
  document.getElementById('st-newcat-wrap').style.display = 'none';
}
function openStockMod(id) {
  editStockId=id||null;
  const s=id?D.stock?.find(x=>x.id===id):null;
  document.getElementById('st-mo-ttl').textContent=s?'تعديل منتج':'إضافة منتج';
  document.getElementById('st-nm').value=s?.name||'';
  fillStockCatSelect(s?.cat||'ألوان أظافر');
  document.getElementById('st-code').value=s?.code||'';
  document.getElementById('st-brand').value=s?.brand||'';
  document.getElementById('st-qty').value=s?.qty??'';
  document.getElementById('st-min').value=s?.min??5;
  document.getElementById('st-unit').value=s?.unit||'قطعة';
  document.getElementById('st-price').value=s?.price||'';
  document.getElementById('st-bought').value=s?.bought||tds(new Date());
  document.getElementById('st-notes').value=s?.notes||'';
  document.getElementById('st-newcat').value='';
  openM('mo-stock');
}
function saveStock() {
  const nm=document.getElementById('st-nm').value.trim();
  const qty=parseFloat(document.getElementById('st-qty').value)||0;
  if(!nm){showErr('أدخلي اسم المنتج.');return;}
  if(!D.stock) D.stock=[];
  // Handle new category
  let cat = document.getElementById('st-cat').value;
  if (cat==='__new__') {
    cat = document.getElementById('st-newcat').value.trim();
    if(!cat){showErr('أدخلي اسم الفئة الجديدة.');return;}
    if(!D.stockCats) D.stockCats=[];
    if(!D.stockCats.includes(cat)) D.stockCats.push(cat);
  }
  const item={name:nm,cat,
    code:document.getElementById('st-code').value.trim(),
    brand:document.getElementById('st-brand').value.trim(),
    qty,
    min:parseFloat(document.getElementById('st-min').value)||5,
    unit:document.getElementById('st-unit').value||'قطعة',
    price:parseFloat(document.getElementById('st-price').value)||0,
    bought:document.getElementById('st-bought').value,
    notes:document.getElementById('st-notes').value};
  if(editStockId){const i=D.stock.find(x=>x.id===editStockId);if(i)Object.assign(i,item);}
  else D.stock.push({id:uid(),...item,createdAt:new Date().toISOString()});
  sv(); sbUpsertSettings('stock',D.stock); closeM('mo-stock'); rstock(); showErr('✓ تم الحفظ');
}
function rstock(f) {
  const list=D.stock||[];
  document.getElementById('st-total').textContent=list.length;
  document.getElementById('st-low').textContent=list.filter(s=>s.qty>0&&s.qty<=s.min).length;
  document.getElementById('st-zero').textContent=list.filter(s=>s.qty===0).length;
  const lowItems=list.filter(s=>s.qty<=s.min);
  const alEl=document.getElementById('stock-alerts');
  alEl.innerHTML=lowItems.length?`<div class="alert alert-w">⚠️ ${lowItems.length} منتج وصل للحد الأدنى أو انتهى: ${lowItems.map(s=>s.name).join('، ')}</div>`:'';
  let filtered=f?list.filter(s=>s.name.includes(f)||s.cat.includes(f)):list;
  const tb=document.getElementById('stock-body');
  if(!filtered.length){tb.innerHTML='<tr><td colspan="7" style="text-align:center;color:var(--light);padding:24px">لا توجد منتجات بعد.</td></tr>';return;}
  tb.innerHTML=filtered.map(s=>{
    const status=s.qty===0?'<span class="badge br">منتهي</span>':s.qty<=s.min?'<span class="badge" style="background:var(--warn-l);color:var(--warn)">قارب الانتهاء</span>':'<span class="badge bk">متاح</span>';
    return`<tr>
      <td style="font-size:12px;color:var(--light);font-family:monospace">${s.code||'—'}</td>
      <td style="font-weight:600">${s.name}</td>
      <td>${s.brand?`<span class="badge bg">${s.brand}</span>`:'—'}</td>
      <td><span class="badge bx">${s.cat}</span></td>
      <td><div style="display:flex;align-items:center;gap:6px">
        <button class="btn btn-sm" style="background:#f0ede8;border:none;padding:3px 8px;font-size:16px;cursor:pointer" onclick="adjStock('${s.id}',-1)">−</button>
        <strong>${s.qty}</strong>
        <button class="btn btn-sm" style="background:#f0ede8;border:none;padding:3px 8px;font-size:16px;cursor:pointer" onclick="adjStock('${s.id}',1)">+</button>
      </div></td>
      <td>${s.min} ${s.unit}</td>
      <td>${s.unit}</td>
      <td style="font-size:12px">${s.bought||'—'}</td>
      <td>${status}</td>
      <td><div style="display:flex;gap:5px">
        <button class="btn btn-s btn-sm" onclick="openStockMod('${s.id}')">تعديل</button>
        <button class="btn btn-d btn-sm" onclick="delStock('${s.id}')">حذف</button>
      </div></td>
    </tr>`;
  }).join('');
}
function adjStock(id,delta) {
  const s=D.stock?.find(x=>x.id===id); if(!s) return;
  s.qty=Math.max(0,(s.qty||0)+delta); sv(); sbUpsertSettings('stock',D.stock); rstock();
}
function delStock(id) {
  ask('هل تريدين حذف هذا المنتج؟',()=>{ D.stock=D.stock.filter(s=>s.id!==id); sv(); sbUpsertSettings('stock',D.stock); rstock(); });
}

// ===== PRINT INVOICE =====
function printInv(id) {
  const inv=D.invs.find(i=>i.id===id); if(!inv) return;
  document.getElementById('print-content').innerHTML=`
    <div style="text-align:center;margin-bottom:16px;padding-bottom:12px;border-bottom:2px solid var(--border)">
      <div style="font-size:22px;font-weight:700;color:var(--rose);letter-spacing:2px">NELLE</div>
      <div style="font-size:12px;color:var(--light)">NAILS & SPA</div>
      <div style="font-size:11px;color:var(--light);margin-top:4px">٢٤ ش شبرا — 01227779214</div>
    </div>
    <div style="display:flex;justify-content:space-between;margin-bottom:14px;font-size:13px">
      <div><strong>العميلة:</strong> ${inv.cn}</div>
      <div><strong>${inv.num}</strong></div>
    </div>
    <div style="font-size:12px;color:var(--light);margin-bottom:12px">التاريخ: ${inv.date}${inv.tn?' &nbsp;|&nbsp; الفنية: '+inv.tn:''}</div>
    <table style="width:100%;border-collapse:collapse;margin-bottom:14px">
      <thead><tr style="background:var(--cream)">
        <th style="padding:7px 10px;text-align:right;font-size:12px;border-bottom:1px solid var(--border)">الخدمة</th>
        <th style="padding:7px 10px;text-align:left;font-size:12px;border-bottom:1px solid var(--border)">السعر</th>
      </tr></thead>
      <tbody>${inv.svcs?.map(s=>`<tr>
        <td style="padding:6px 10px;font-size:13px;border-bottom:1px solid #f5f0ee">${s.n}</td>
        <td style="padding:6px 10px;font-size:13px;border-bottom:1px solid #f5f0ee;text-align:left">${s.p} ج</td>
      </tr>`).join('')}</tbody>
    </table>
    <div style="background:var(--cream);border-radius:8px;padding:12px 14px;font-size:13px">
      <div style="display:flex;justify-content:space-between;margin-bottom:5px"><span>الإجمالي قبل الخصم</span><span>${inv.sub?.toFixed(2)} ج</span></div>
      ${inv.dis>0?`<div style="display:flex;justify-content:space-between;margin-bottom:5px;color:var(--rose)"><span>خصم ${inv.ddesc||''}</span><span>−${inv.dis?.toFixed(2)} ج</span></div>`:''}
      <div style="display:flex;justify-content:space-between;font-size:16px;font-weight:700;margin-top:8px;padding-top:8px;border-top:1px solid var(--border)"><span>الإجمالي</span><span>${inv.tot?.toFixed(2)} ج</span></div>
      <div style="font-size:12px;color:var(--light);margin-top:6px">الدفع: ${inv.pay||'كاش'}</div>
    </div>
    <div style="text-align:center;margin-top:16px;font-size:12px;color:var(--light)">شكراً لزيارتكم 🌸</div>`;
  openM('mo-print');
}
function doPrint() {
  const content=document.getElementById('print-content').innerHTML;
  const w=window.open('','_blank');
  w.document.write(`<html dir="rtl"><head><meta charset="UTF-8"><title>فاتورة Nelle</title>
    <style>body{font-family:Arial,sans-serif;padding:30px;max-width:400px;margin:0 auto;direction:rtl}
    *{box-sizing:border-box}</style></head><body>${content}</body></html>`);
  w.document.close(); w.focus(); w.print(); w.close();
}

// ===== SETTINGS =====
const DAYS_ORDER = ['Monday','Tuesday','Wednesday','Thursday','Friday','Saturday','Sunday'];
const HOURS = Array.from({length:24},(_,i)=>i); // 0-23

function rSettings() {
  const sched = getSched();
  const dur = D.slotDur || 90;
  // Set slot duration select
  const ds = document.getElementById('slot-dur');
  if(ds) ds.value = dur;

  const tb = document.getElementById('sched-body');
  if(!tb) return;

  tb.innerHTML = DAYS_ORDER.map(day => {
    const sc = sched[day] || {o:false,s:9,e:20};
    const isOpen = sc.o;
    // Calculate preview slots
    let slotCount = 0;
    if(isOpen) {
      const h = dur/60;
      slotCount = Math.floor((sc.e - sc.s) / h);
    }
    const timeOpts = (selected) => HOURS.map(h =>
      `<option value="${h}" ${h===selected?'selected':''}>${h===0?'12 ص':h<12?h+' ص':h===12?'12 م':(h-12)+' م'}</option>`
    ).join('');

    return `<tr style="background:${isOpen?'':'#fdf8f8'}">
      <td style="font-weight:700">${DAR[day]}</td>
      <td>
        <label style="display:flex;align-items:center;gap:6px;cursor:pointer;font-size:13px">
          <input type="checkbox" id="sc-${day}-open" ${isOpen?'checked':''} onchange="previewSched('${day}')">
          <span id="sc-${day}-lbl" style="color:${isOpen?'var(--ok)':'var(--light)'}">${isOpen?'مفتوح':'مغلق'}</span>
        </label>
      </td>
      <td>
        <select id="sc-${day}-s" onchange="previewSched('${day}')" ${isOpen?'':'disabled'}
          style="padding:5px 8px;border:1px solid var(--border);border-radius:7px;font-size:12px;font-family:inherit;${isOpen?'':'opacity:0.4'}">
          ${timeOpts(sc.s)}
        </select>
      </td>
      <td>
        <select id="sc-${day}-e" onchange="previewSched('${day}')" ${isOpen?'':'disabled'}
          style="padding:5px 8px;border:1px solid var(--border);border-radius:7px;font-size:12px;font-family:inherit;${isOpen?'':'opacity:0.4'}">
          ${timeOpts(sc.e)}
        </select>
      </td>
      <td id="sc-${day}-preview" style="font-size:12px;color:var(--mid)">
        ${isOpen ? slotCount+' سلوت' : '—'}
      </td>
    </tr>`;
  }).join('');
}

function previewSched(day) {
  const openEl = document.getElementById(`sc-${day}-open`);
  const sEl = document.getElementById(`sc-${day}-s`);
  const eEl = document.getElementById(`sc-${day}-e`);
  const lblEl = document.getElementById(`sc-${day}-lbl`);
  const prevEl = document.getElementById(`sc-${day}-preview`);
  const isOpen = openEl.checked;
  const dur = parseInt(document.getElementById('slot-dur').value) || 90;

  sEl.disabled = !isOpen; sEl.style.opacity = isOpen?'1':'0.4';
  eEl.disabled = !isOpen; eEl.style.opacity = isOpen?'1':'0.4';
  lblEl.textContent = isOpen?'مفتوح':'مغلق';
  lblEl.style.color = isOpen?'var(--ok)':'var(--light)';

  if(isOpen) {
    const s=parseInt(sEl.value), e=parseInt(eEl.value);
    const h=dur/60;
    const slots = e>s ? Math.floor((e-s)/h) : 0;
    prevEl.textContent = slots+' سلوت';
    prevEl.style.color = slots>0?'var(--ok)':'var(--err)';
  } else {
    prevEl.textContent='—'; prevEl.style.color='var(--light)';
  }
}

function saveSettings() {
  const dur = parseInt(document.getElementById('slot-dur').value)||90;
  D.slotDur = dur;
  const newSched = {};
  DAYS_ORDER.forEach(day => {
    const isOpen = document.getElementById(`sc-${day}-open`)?.checked;
    const s = parseInt(document.getElementById(`sc-${day}-s`)?.value)||9;
    const e = parseInt(document.getElementById(`sc-${day}-e`)?.value)||20;
    newSched[day] = {o:isOpen, s, e};
  });
  D.sched = newSched;
  sv(); sbUpsertSettings('sched',D.sched); sbUpsertSettings('slotDur',D.slotDur);
  showErr('✓ تم حفظ مواعيد العمل — التقويم اتحدث تلقائياً');
  rcal(); // refresh calendar immediately
}

// ===== BACKUP & RESTORE =====
function exportData() {
  const now = new Date();
  const dateStr = now.getFullYear() + '-' + String(now.getMonth()+1).padStart(2,'0') + '-' + String(now.getDate()).padStart(2,'0');
  const payload = JSON.stringify(D, null, 2);
  const blob = new Blob([payload], {type: 'application/json'});
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = 'nelle-backup-' + dateStr + '.json';
  a.click();
  URL.revokeObjectURL(url);
  showErr('✓ تم تصدير النسخة الاحتياطية بنجاح');
}

function importData(input) {
  const file = input.files[0];
  if (!file) return;
  const reader = new FileReader();
  reader.onload = function(e) {
    try {
      const imported = JSON.parse(e.target.result);
      // Validate it looks like our data
      if (!imported.cls && !imported.invs && !imported.bks) {
        showErr('❌ الملف غير صحيح — تأكدي إنه نسخة احتياطية من نيللي');
        return;
      }
      ask('هل تريدين استعادة هذه النسخة الاحتياطية؟ البيانات الحالية هتتستبدل.', () => {
        D = {...D, ...imported};
        sv();
        // Refresh everything
        const ck2=[['rent','c-rent'],['sal','c-sal'],['util','c-util'],['sup','c-sup'],['mkt','c-mkt'],['oth','c-oth']];
        ck2.forEach(([k,id])=>{const el=document.getElementById(id);if(el&&D.costs[k])el.value=D.costs[k];});
        rdls(); rdash(); rcal();
        showErr('✓ تم استعادة البيانات بنجاح — ' + (imported.cls?.length||0) + ' عميلة، ' + (imported.invs?.length||0) + ' فاتورة');
      });
    } catch(err) {
      showErr('❌ حدث خطأ في قراءة الملف');
    }
    input.value = ''; // reset so same file can be picked again
  };
  reader.readAsText(file);
}

// ===== MOBILE NAV =====
function toggleSidebar() {
  document.querySelector('.sb').classList.toggle('open');
  document.getElementById('sb-overlay').classList.toggle('open');
}
function toggleMoreMenu() {
  document.getElementById('mob-more-menu').classList.toggle('open');
  document.getElementById('mob-overlay').classList.toggle('open');
}
const MOB_NAV_PAGES = ['dash','book','inv','cl'];
const MOB_MORE_PAGES = ['exp','tech','prices','offers','reports','waitlist','stock','settings'];
function setMobNav(id) {
  // Bottom nav buttons
  document.querySelectorAll('.mob-ni').forEach(b=>b.classList.remove('on'));
  const mainBtn = document.getElementById('mn-'+id);
  if (mainBtn) mainBtn.classList.add('on');
  else { // it's in "more" menu
    document.getElementById('mn-more')?.classList.add('on');
  }
  // More menu items
  document.querySelectorAll('.mob-more-item').forEach(b=>b.classList.remove('on'));
  const moreItem = document.getElementById('mm-'+id);
  if (moreItem) moreItem.classList.add('on');
  // Close sidebar if open
  document.querySelector('.sb')?.classList.remove('open');
  document.getElementById('sb-overlay')?.classList.remove('open');
}

// ===== INIT =====
document.getElementById('tdate').textContent=new Date().toLocaleDateString('ar-EG',{weekday:'long',year:'numeric',month:'long',day:'numeric'});
const ck=[['rent','c-rent'],['sal','c-sal'],['util','c-util'],['sup','c-sup'],['mkt','c-mkt'],['oth','c-oth']];
ck.forEach(([k,id])=>{const el=document.getElementById(id);if(el&&D.costs[k])el.value=D.costs[k];});
initMF(); rdls();
// Restore whichever page was open before a refresh (via URL hash), default to dashboard
const VALID_PAGES=['dash','book','inv','exp','cl','tech','prices','offers','reports','waitlist','stock','settings'];
const startPage=VALID_PAGES.includes(location.hash.replace('#',''))?location.hash.replace('#',''):'dash';
goTo(startPage);
// Sync from Supabase on load
syncFromDB();
