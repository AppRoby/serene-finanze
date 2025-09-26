
/* SERENI FINANZE - script.js (v20 stable) */
/* Single-tap dropdowns + Conteggi BASE/PREMIUM allineati a Excel */

/* =========================
   Costanti e utilità
   ========================= */
const MESI = ["gennaio","febbraio","marzo","aprile","maggio","giugno","luglio","agosto","settembre","ottobre","novembre","dicembre"];
const cap = s => s ? s.charAt(0).toUpperCase()+s.slice(1) : s;
const fmt = n => `€${Number(n||0).toFixed(2)}`;
const idxMeseFromName = m => MESI.indexOf(m);

function periodToNum(mIdx, year){ return year*12 + mIdx; }
function numToPeriod(n){ return { mIdx: (n%12+12)%12, anno: Math.floor(n/12) }; }

/* =========================
   Storage keys & stato
   ========================= */
const STORE_MAIN   = "sereniFinanze_v8";
const STORE_CUM    = "sereniFinanze_cumulativo_v8";
const STORE_ABO    = "sereniFinanze_abbonamento_v1";
const STORE_PREM_A = "sereniFinanze_premiumAnnuali";
const STORE_PREM_M = "sereniFinanze_premiumMensili";

let datiPerPeriodo = {};              // { "gennaio-2025": {entrate:[],spese:[],obiettivoMensileManuale:Number} }
let obiettivoCumulativo = null;       // {amount, meseInizioIdx, annoInizio, meseTargetIdx, annoTarget}
let statoAbbonamento = { versione:"base", giorniProva:30 };
let speseAnnuali = [];                // [{desc, imp, mesi, meseStart, annoStart}]
let speseMensili = [];                // [{desc, imp, meseStart, annoStart, attiva:true}]
let periodoCorrente = { mese:"", anno:0 };

/* =========================
   Storage helpers
   ========================= */
function caricaDati(){
  try { const raw=localStorage.getItem(STORE_MAIN); if(raw) datiPerPeriodo = JSON.parse(raw); } catch{}
  try { const raw=localStorage.getItem(STORE_CUM);  if(raw) obiettivoCumulativo = JSON.parse(raw); } catch{}
  try { const raw=localStorage.getItem(STORE_ABO);  if(raw) statoAbbonamento   = JSON.parse(raw); } catch{}
  try { const raw=localStorage.getItem(STORE_PREM_A); if(raw) speseAnnuali = JSON.parse(raw); } catch{}
  try { const raw=localStorage.getItem(STORE_PREM_M); if(raw) speseMensili = JSON.parse(raw); } catch{}
  const now = new Date();
  periodoCorrente.mese = MESI[now.getMonth()];
  periodoCorrente.anno = now.getFullYear();
}
function salvaDati(){ localStorage.setItem(STORE_MAIN, JSON.stringify(datiPerPeriodo)); }
function salvaCumulativo(){ localStorage.setItem(STORE_CUM, JSON.stringify(obiettivoCumulativo)); }
function salvaAbbonamento(){ localStorage.setItem(STORE_ABO, JSON.stringify(statoAbbonamento)); }
function salvaPremium(){
  localStorage.setItem(STORE_PREM_A, JSON.stringify(speseAnnuali));
  localStorage.setItem(STORE_PREM_M, JSON.stringify(speseMensili));
}

/* =========================
   Periodo helpers
   ========================= */
function ensurePeriodo(mese, anno){
  const key = `${mese}-${anno}`;
  if(!datiPerPeriodo[key]) datiPerPeriodo[key] = { entrate:[], spese:[], obiettivoMensileManuale: 0 };
  return datiPerPeriodo[key];
}
function getPeriodoData(mese, anno){
  const key = `${mese}-${anno}`;
  return datiPerPeriodo[key] || { entrate:[], spese:[], obiettivoMensileManuale: 0 };
}

/* =========================
   Obiettivi helpers
   ========================= */
function getObiettivoMensileManuale(d){
  if(d && typeof d.obiettivoMensileManuale === "number") return Number(d.obiettivoMensileManuale);
  if(d && typeof d.obiettivoMensile === "number") return Number(d.obiettivoMensile); // retrocompatibilità
  return 0;
}
function setObiettivoMensileManuale(d, val){
  if(!d) return;
  d.obiettivoMensileManuale = Number(val);
  d.obiettivoMensile = Number(val); // mantieni il vecchio campo per retrocompatibilità
}
function quotaCumulativoPerMese(meseNome, anno){
  if(!obiettivoCumulativo) return 0;
  const startN = periodToNum(obiettivoCumulativo.meseInizioIdx, obiettivoCumulativo.annoInizio);
  const endN   = periodToNum(obiettivoCumulativo.meseTargetIdx, obiettivoCumulativo.annoTarget);
  const curN   = periodToNum(idxMeseFromName(meseNome), anno);
  if(curN < startN || curN > endN) return 0;
  const mesi = endN - startN + 1;
  return mesi>0 ? Number(obiettivoCumulativo.amount)/mesi : 0;
}

/* =========================
   Calcoli
   ========================= */
function calcolaSpesePremiumMese(mese, anno){
  let totale = 0;
  const idxM = idxMeseFromName(mese);
  // annuali ripartite
  speseAnnuali.forEach(s => {
    const startIdx = idxMeseFromName(s.meseStart);
    const startY   = s.annoStart;
    const quota    = Number(s.imp)/Number(s.mesi);
    for(let i=0;i<s.mesi;i++){
      const y = startY + Math.floor((startIdx+i)/12);
      const mIdx = (startIdx+i)%12;
      if(y===anno && mIdx===idxM) totale += quota;
    }
  });
  // mensili attive
  speseMensili.forEach(s => {
    if(!s.attiva) return;
    const idxStart = idxMeseFromName(s.meseStart);
    if(anno>s.annoStart || (anno===s.annoStart && idxM>=idxStart)) totale += Number(s.imp);
  });
  return totale;
}

function saldoDisponibileOfNome(meseNome, anno){
  const d = getPeriodoData(meseNome, anno);
  const entr = d.entrate.reduce((s,e)=>s+Number(e.importo),0);
  const spe  = d.spese.reduce((s,e)=>s+Number(e.importo),0);
  const isPrem = (statoAbbonamento && statoAbbonamento.versione === "premium");
  const extra = isPrem ? calcolaSpesePremiumMese(meseNome, anno) : 0;
  return entr - (spe + extra);
}
function saldoTotaleFinoA(mIdxLimite, annoLimite){
  let tot = 0;
  for(const k in datiPerPeriodo){
    const [mName, aStr] = k.split("-");
    const a = Number(aStr);
    const idx = idxMeseFromName(mName);
    if(a < annoLimite || (a===annoLimite && idx<=mIdxLimite)){
      tot += saldoDisponibileOfNome(mName, a);
    }
  }
  return tot;
}
function saldoTotaleTra(mStartIdx, yStart, mEndIdx, yEnd){
  let total = 0;
  const nA = periodToNum(mStartIdx, yStart);
  const nB = periodToNum(mEndIdx, yEnd);
  for(let n=nA; n<=nB; n++){
    const { mIdx, anno } = numToPeriod(n);
    total += saldoDisponibileOfNome(MESI[mIdx], anno);
  }
  return total;
}
function progressEndWithin(sIdx, sY, eIdx, eY){
  const curIdx = idxMeseFromName(periodoCorrente.mese);
  const curY   = periodoCorrente.anno;
  const curN = periodToNum(curIdx, curY);
  const endN = periodToNum(eIdx, eY);
  const startN = periodToNum(sIdx, sY);
  const progN = Math.min(curN, endN);
  if (progN < startN) return null;
  return numToPeriod(progN);
}

/* =========================
   Entrate / Spese
   ========================= */
function aggiungiEntrata(){
  const desc = document.getElementById("descrizioneEntrata").value.trim();
  const imp  = parseFloat(document.getElementById("importoEntrata").value);
  if(!desc || !isFinite(imp) || imp<=0){ alert("⚠️ Inserisci descrizione e importo valido (>0)."); return; }
  const d = ensurePeriodo(periodoCorrente.mese, periodoCorrente.anno);
 const now = Date.now();
d.entrate.push({ descrizione: desc, importo: imp, ts: now });
  document.getElementById("descrizioneEntrata").value="";
  document.getElementById("importoEntrata").value="";
  salvaDati(); aggiornaUI();
}
function aggiungiSpesa(){
  const desc = document.getElementById("descrizioneSpesa").value.trim();
  const imp  = parseFloat(document.getElementById("importoSpesa").value);
  if(!desc || !isFinite(imp) || imp<=0){ alert("⚠️ Inserisci descrizione e importo valido (>0)."); return; }
  const d = ensurePeriodo(periodoCorrente.mese, periodoCorrente.anno);
  const now = Date.now();
d.spese.push({ descrizione: desc, importo: imp, ts: now });
  document.getElementById("descrizioneSpesa").value="";
  document.getElementById("importoSpesa").value="";
  salvaDati(); aggiornaUI();
}

/* =========================
   Obiettivo Mensile / Cumulativo
   ========================= */
function salvaObiettivoMensile(){
  const val = parseFloat(document.getElementById("obiettivoMensile").value);
  if(!isFinite(val) || val<0){ alert("Inserisci un numero valido per l'obiettivo mensile."); return; }
  const d = ensurePeriodo(periodoCorrente.mese, periodoCorrente.anno);
  setObiettivoMensileManuale(d, val);
  salvaDati(); aggiornaUI();
}
function salvaObiettivoCumulativo(){
  const imp = parseFloat(document.getElementById("importoCumulativo").value);
  const meseInizio = document.getElementById("meseInizioTarget").value;
  const annoInizio = Number(document.getElementById("annoInizioTarget").value);
  const meseFine   = document.getElementById("meseTarget").value;
  const annoFine   = Number(document.getElementById("annoTarget").value);
  if(!isFinite(imp) || imp<=0){ alert("Inserisci un importo cumulativo valido (>0)."); return; }
  const sIdx = idxMeseFromName(meseInizio);
  const eIdx = idxMeseFromName(meseFine);
  const mesiRim = (annoFine-annoInizio)*12 + (eIdx - sIdx) + 1;
  if(mesiRim<=0){ alert("Periodo non valido. Correggi le date."); return; }
  obiettivoCumulativo = { amount: imp, meseInizioIdx: sIdx, annoInizio, meseTargetIdx: eIdx, annoTarget: annoFine };
  salvaCumulativo();
  aggiornaUI();
}

/* =========================
   Premium ricorrenti
   ========================= */
function aggiungiAnnuale(){
  const desc=document.getElementById("descAnnuale").value.trim();
  const imp=parseFloat(document.getElementById("impAnnuale").value);
  const mesi=parseInt(document.getElementById("mesiRate").value);
  const meseStart=document.getElementById("meseAnnuale").value;
  const annoStart=Number(document.getElementById("annoAnnuale").value);
  if(!desc || !isFinite(imp) || imp<=0){ alert("⚠️ Inserisci descrizione e importo valido."); return; }
  speseAnnuali.push({desc,imp,mesi,meseStart,annoStart});
  salvaPremium(); renderPremium(); aggiornaUI();
}
function aggiungiMensile(){
  const desc=document.getElementById("descMensile").value.trim();
  const imp=parseFloat(document.getElementById("impMensile").value);
  const meseStart=document.getElementById("meseMensile").value;
  const annoStart=Number(document.getElementById("annoMensile").value);
  if(!desc || !isFinite(imp) || imp<=0){ alert("⚠️ Inserisci descrizione e importo valido."); return; }
  speseMensili.push({desc,imp,meseStart,annoStart,attiva:true});
  salvaPremium(); renderPremium(); aggiornaUI();
}
function rimuoviAnnuale(i){ speseAnnuali.splice(i,1); salvaPremium(); renderPremium(); aggiornaUI(); }
function rimuoviMensile(i){ speseMensili.splice(i,1); salvaPremium(); renderPremium(); aggiornaUI(); }

function renderPremium(){
  const ULann=document.getElementById("listaAnnuali");
  const ULmen=document.getElementById("listaMensili");
  if(!ULann || !ULmen) return;
  ULann.innerHTML=""; ULmen.innerHTML="";
  speseAnnuali.forEach((s,i)=>{
    ULann.innerHTML += `<li><span>${s.desc} — ${fmt(s.imp)} divisi in ${s.mesi} mesi (da ${cap(s.meseStart)} ${s.annoStart})</span>
      <button onclick="rimuoviAnnuale(${i})">✖</button></li>`;
  });
  speseMensili.forEach((s,i)=>{
    ULmen.innerHTML += `<li><span>${s.desc} — ${fmt(s.imp)} (da ${cap(s.meseStart)} ${s.annoStart})</span>
      <button onclick="rimuoviMensile(${i})">✖</button></li>`;
  });
}

/* =========================
   UI
   ========================= */
function updateHeader(){
  const m = periodoCorrente.mese, a = periodoCorrente.anno;
  const labelPeriodo = document.getElementById("labelPeriodo");
  const labelMeseObj = document.getElementById("meseObiettivo");
  if (labelPeriodo) labelPeriodo.innerText = `${cap(m)} ${a}`;
  if (labelMeseObj) labelMeseObj.innerText = `${cap(m)} ${a}`;
  const giorniProvaEl = document.getElementById("giorniProva");
  if (giorniProvaEl) giorniProvaEl.innerText = String(statoAbbonamento.giorniProva);
  const verEl = document.getElementById("versioneAttiva");
  if (verEl) verEl.innerText = (statoAbbonamento.versione === "premium" ? "🌟 Versione Premium attiva" : "✅ Versione Base attiva");
}
function updateLists(){
  const m = periodoCorrente.mese, a = periodoCorrente.anno;
  const d = getPeriodoData(m,a);
  const ULent = document.getElementById("listaEntrate");
  const ULspe = document.getElementById("listaSpese");

  if(ULent) ULent.innerHTML = "";
  if(ULspe) ULspe.innerHTML = "";

  // Ultima entrata (se esiste)
  const lastE = d.entrate.length ? d.entrate[d.entrate.length - 1] : null;
  if(ULent){
    if(lastE){
      ULent.innerHTML = `<li>
        <span>➕ ${String(lastE.descrizione||"")}</span>
        <span class="importo-verde">${fmt(lastE.importo)}</span>
      </li>`;
    } else {
      ULent.innerHTML = `<li class="muted">Nessuna entrata inserita</li>`;
    }
  }

  // Ultima spesa (se esiste)
  const lastS = d.spese.length ? d.spese[d.spese.length - 1] : null;
  if(ULspe){
    if(lastS){
      ULspe.innerHTML = `<li>
        <span>➖ ${String(lastS.descrizione||"")}</span>
        <span class="importo-rosso">-${fmt(Math.abs(lastS.importo))}</span>
      </li>`;
    } else {
      ULspe.innerHTML = `<li class="muted">Nessuna spesa inserita</li>`;
    }
  }
}

function updateSaldoBox(){
  const m = periodoCorrente.mese, a = periodoCorrente.anno;
  const mIdx = idxMeseFromName(m);
  const d = getPeriodoData(m,a);

const saldoDisp = saldoDisponibileOfNome(m,a);
const obMesManuale = getObiettivoMensileManuale(d);
const quotaCum = quotaCumulativoPerMese(m,a);

let saldoCont;

// BASE → resta invariato
if (statoAbbonamento.versione === "base") {
  saldoCont = saldoDisp - obMesManuale - quotaCum;
}

// PREMIUM → aggiornata con la quota cumulativa
else if (statoAbbonamento.versione === "premium") {
  saldoCont = saldoDisp - quotaCum;
}
  const saldoTot  = saldoTotaleFinoA(mIdx,a);

  const saldoBox = document.getElementById("saldo");
  if(saldoBox){
    saldoBox.innerHTML = `
      <div class="saldo-breakdown">
        <div class="rowline"><span>💸 Disponibile Mensile</span><strong>${fmt(saldoDisp)}</strong></div>
        <div class="rowline sub"><span>– Obiettivo mensile</span><span>${fmt(obMesManuale)}</span></div>
        <div class="rowline sub"><span>– Quota cumulativo</span><span>${fmt(quotaCum)}</span></div>
        <div class="rowline total"><span>📘 Contabile Mensile</span><strong>${fmt(saldoCont)}</strong></div>
        <div class="rowline"><span>💰 Saldo Totale</span><strong>${fmt(saldoTot)}</strong></div>
      </div>
    `;
  }

  // Verifica mensile
  const mm = document.getElementById("messMens");
  const df = document.getElementById("diffMens");
  if(mm && df){
    const diff = saldoDisp - obMesManuale;
    df.textContent = "";
    if(obMesManuale > 0){
      if(diff >= 0){
        mm.className = "verde";
        mm.textContent = `✅ Obiettivo mensile di ${fmt(obMesManuale)} raggiunto a ${cap(m)} ${a}.`;
        if(diff>0) df.textContent = `Hai superato di ${fmt(diff)}.`;
      }else{
        mm.className = "neutro";
        mm.textContent = `⚠️ Ti mancano ${fmt(Math.abs(diff))} per arrivare a ${fmt(obMesManuale)} a ${cap(m)} ${a}.`;
      }
    }else{
      mm.className = "muted";
      mm.textContent = "Nessun obiettivo mensile impostato.";
    }
  }
}

function aggiornaCumulativoUI(){
  const msg = document.getElementById("messaggioCumulativo");
  const det = document.getElementById("dettaglioCumulativo");
  const bar = document.getElementById("progressBar");
  const badge = document.getElementById("badgeCumulativo");
  if(!msg || !det) return;

  if(!obiettivoCumulativo){
    msg.className="muted"; msg.innerText="🔔 Hai un obiettivo cumulativo? Impostalo a sinistra.";
    det.innerText=""; if(bar){ bar.style.width="0%"; bar.setAttribute("aria-valuenow","0"); }
    if(badge){ badge.classList.add("hidden"); }
    return;
  }
  const amount = Number(obiettivoCumulativo.amount)||0;
  const sIdx = obiettivoCumulativo.meseInizioIdx;
  const sY   = obiettivoCumulativo.annoInizio;
  const eIdx = obiettivoCumulativo.meseTargetIdx;
  const eY   = obiettivoCumulativo.annoTarget;

  const labelStart = `${cap(MESI[sIdx])} ${sY}`;
  const labelEnd   = `${cap(MESI[eIdx])} ${eY}`;

  const progEnd = progressEndWithin(sIdx, sY, eIdx, eY);
  if(progEnd === null){
    msg.className="neutro"; msg.innerText = `⏳ Partenza da ${labelStart}.`;
    det.innerText = `Target: ${fmt(amount)} entro ${labelEnd}.`;
    if(bar){ bar.style.width="0%"; bar.setAttribute("aria-valuenow","0"); }
    if(badge){ badge.classList.add("hidden"); }
    return;
  }
  const cumulato = saldoTotaleTra(sIdx, sY, progEnd.mIdx, progEnd.anno);
  const percent = amount>0 ? Math.max(0,Math.min(100,(cumulato/amount)*100)) : 100;
  if(bar){ bar.style.width=`${percent}%`; bar.setAttribute("aria-valuenow", percent.toFixed(0)); }

  if(cumulato >= amount){
    msg.className="verde"; msg.innerText = "🏆 Obiettivo cumulativo raggiunto!";
    det.innerText = `Risparmiati ${fmt(cumulato)} su ${fmt(amount)} entro ${labelEnd}.`;
    if(badge){ badge.classList.remove("hidden"); }
  }else{
    msg.className="neutro"; msg.innerText = "⏳ Obiettivo cumulativo in corso...";
    const quotaMeseCorrente = quotaCumulativoPerMese(periodoCorrente.mese, periodoCorrente.anno);
    det.innerText = `Finora ${fmt(cumulato)} (${percent.toFixed(0)}%). Quota mese corrente: ${fmt(quotaMeseCorrente)}. Target: ${fmt(amount)} entro ${labelEnd}.`;
    if(badge){ badge.classList.add("hidden"); }
  }
}

/* =========================
   Locks & Abbonamento
   ========================= */
function lockMensileByCumulativo(){
  const input = document.getElementById("obiettivoMensile");
  const btn   = document.getElementById("btnSalvaObiettivoMensile");
  const nota  = document.getElementById("notaAuto");
  if(!input||!btn||!nota) return;
  input.disabled = false; btn.disabled = false; nota.textContent = "";
  const d = getPeriodoData(periodoCorrente.mese, periodoCorrente.anno);
  const man = getObiettivoMensileManuale(d);
  if(man>0) input.value = man;
}
function attivaBase(){ statoAbbonamento.versione="base"; salvaAbbonamento(); aggiornaUI(); }
function attivaPremium(){ statoAbbonamento.versione="premium"; salvaAbbonamento(); aggiornaUI(); }

/* =========================
   Periodo & Selects
   ========================= */
function cambiaPeriodo(){
  const mEl=document.getElementById("mese");
  const aEl=document.getElementById("anno");
  if(mEl && aEl){
    periodoCorrente.mese = mEl.value;
    periodoCorrente.anno = Number(aEl.value);
  }
  aggiornaUI();
}
function popolaSelectMesiEAnni(){
  const annoNow = new Date().getFullYear();
  const anni = []; for(let y=annoNow-2; y<=annoNow+5; y++) anni.push(y);
  const mesiIds = ["mese","meseInizioTarget","meseTarget","meseAnnuale","meseMensile"];
  const anniIds = ["anno","annoInizioTarget","annoTarget","annoAnnuale","annoMensile"];
  mesiIds.forEach(id=>{
    const sel=document.getElementById(id); if(!sel) return;
    sel.innerHTML=""; MESI.forEach(m=>{ const o=document.createElement("option"); o.value=m; o.text=cap(m); sel.appendChild(o); });
  });
  anniIds.forEach(id=>{
    const sel=document.getElementById(id); if(!sel) return;
    sel.innerHTML=""; anni.forEach(y=>{ const o=document.createElement("option"); o.value=y; o.text=y; sel.appendChild(o); });
  });
  const selM=document.getElementById("mese"); const selA=document.getElementById("anno");
  if(selM) selM.value = periodoCorrente.mese;
  if(selA) selA.value = String(periodoCorrente.anno);
}

/* =========================
   Custom Dropdowns (single-tap)
   ========================= */
function buildDropdownForSelect(selectEl){
  if(!selectEl || selectEl.dataset.ddBuilt==="1") return;
  const currentText = selectEl.options[selectEl.selectedIndex]?.text || "";
  const wrap = document.createElement('div'); wrap.className='dd';
  const btn  = document.createElement('button'); btn.type='button'; btn.className='dd-btn'; btn.textContent=currentText||'—';
  const menu = document.createElement('div'); menu.className='dd-menu'; menu.hidden=true;
  Array.from(selectEl.options).forEach(opt=>{
    const it=document.createElement('button'); it.type='button'; it.className='dd-item'; it.textContent=opt.text;
    it.addEventListener('click', ()=>{
      selectEl.value = opt.value;
      btn.textContent = opt.text;
      menu.hidden = true;
      selectEl.dispatchEvent(new Event('change', {bubbles:true}));
    });
    menu.appendChild(it);
  });
  btn.addEventListener('click', ()=>{
    document.querySelectorAll('.dd-menu').forEach(m=>{ if(m!==menu) m.hidden=true; });
    menu.hidden = !menu.hidden;
  });
  document.addEventListener('click', e=>{ if(!wrap.contains(e.target)) menu.hidden=true; });
  wrap.appendChild(btn); wrap.appendChild(menu);
  selectEl.insertAdjacentElement('afterend', wrap);
  selectEl.style.display='none'; selectEl.dataset.ddBuilt="1";
}
function initAllDropdowns(){
  const ids = ["mese","anno","meseInizioTarget","annoInizioTarget","meseTarget","annoTarget","meseAnnuale","annoAnnuale","meseMensile","annoMensile"];
  ids.forEach(id=> buildDropdownForSelect(document.getElementById(id)));
  // Pair in rows
  const pairs = [["mese","anno"],["meseInizioTarget","annoInizioTarget"],["meseTarget","annoTarget"],["meseAnnuale","annoAnnuale"],["meseMensile","annoMensile"]];
  pairs.forEach(([mId,aId])=>{
    const mSel=document.getElementById(mId), aSel=document.getElementById(aId);
    if(!mSel||!aSel) return;
    const mDD=mSel.nextElementSibling, aDD=aSel.nextElementSibling;
    if(!mDD||!aDD) return;
    if(!(mDD.parentElement && mDD.parentElement.classList.contains('dd-row'))){
      const row=document.createElement('div'); row.className='dd-row';
      mDD.parentElement.insertBefore(row, mDD); // before first dropdown
      row.appendChild(mDD); row.appendChild(aDD);
    }
  });
}

/* =========================
   INIT & UI aggregator
   ========================= */
function aggiornaUI(){
  updateHeader();
  updateLists();
  updateSaldoBox();
  renderPremium();
  lockMensileByCumulativo();
  aggiornaCumulativoUI();
}

function azzeraTutto(){
  if(confirm("Vuoi davvero azzerare tutti i dati?")){
    localStorage.clear();
    datiPerPeriodo={}; obiettivoCumulativo=null; speseAnnuali=[]; speseMensili=[];
    caricaDati(); popolaSelectMesiEAnni(); initAllDropdowns(); aggiornaUI();
    alert("✅ Dati azzerati con successo!");
  }
}

function init(){
  caricaDati();
  popolaSelectMesiEAnni();
  initAllDropdowns();
  aggiornaUI();
  // aforisma random
  const af = document.getElementById("aforisma");
  const afs = [
    "✨ Ogni euro risparmiato è un mattone della tua libertà finanziaria.",
    "🚀 La disciplina batte la motivazione: 1% al giorno cambia tutto.",
    "🌱 Piccoli importi, grandi abitudini: la ricchezza cresce nel tempo."
  ];
  if(af) af.innerText = afs[new Date().getDate() % afs.length];
}
window.addEventListener("DOMContentLoaded", init);
/* =========================
   VEDI MOVIMENTI (Modal)
   ========================= */
function apriModalMovimenti(){
  const modal = document.getElementById("modalMovimenti");
  if(!modal) return;
  // Dati del mese corrente
  const m = periodoCorrente.mese, a = periodoCorrente.anno;
  const d = getPeriodoData(m, a);

  // Liste
  const ULent = modal.querySelector("#vm-lista-entrate");
  const ULspe = modal.querySelector("#vm-lista-spese");
  const esc = s => String(s||"").replace(/[&<>]/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;'}[c]));

  if(ULent) ULent.innerHTML = d.entrate.map(it =>
  `<li>
    <span>➕ ${esc(it.descrizione)}
      <small class="vm-when">${fmtDateTime(it.ts)}</small>
    </span>
    <span class="importo-verde">${fmt(it.importo)}</span>
  </li>`
).join("");

if(ULspe) ULspe.innerHTML = d.spese.map(it =>
  `<li>
    <span>➖ ${esc(it.descrizione)}
      <small class="vm-when">${fmtDateTime(it.ts)}</small>
    </span>
    <span class="importo-rosso">-${fmt(Math.abs(it.importo))}</span>
  </li>`
).join("");
  // Totali e saldo netto
  const totEntr = d.entrate.reduce((s,e)=>s+Number(e.importo||0),0);
  const totSpe  = d.spese.reduce((s,e)=>s+Number(e.importo||0),0);
  const saldo   = saldoDisponibileOfNome(m, a); // include eventuali spese Premium

  const elME = modal.querySelector("#vm-meseanno");
  const elTE = modal.querySelector("#vm-tot-entrate");
  const elTS = modal.querySelector("#vm-tot-spese");
  const elSN = modal.querySelector("#vm-saldo");

  if(elME) elME.textContent = cap(m) + " " + a;
  if(elTE) elTE.textContent = fmt(totEntr);
  if(elTS) elTS.textContent = fmt(totSpe);
  if(elSN) elSN.textContent = (saldo>=0? fmt(saldo) : `-${fmt(Math.abs(saldo))}`);

  // Apri modal
  modal.classList.add("is-open");
  const title = modal.querySelector("#vm-title");
  if(title) title.focus();
}

function chiudiModalMovimenti(){
  const modal = document.getElementById("modalMovimenti");
  if(!modal) return;
  modal.classList.remove("is-open");
}

// Wiring al load (lasciamo intatto il tuo init)
window.addEventListener("DOMContentLoaded", ()=>{
  const btn = document.getElementById("btnVediMovimenti");
  if(btn) btn.addEventListener("click", apriModalMovimenti);

  const modal = document.getElementById("modalMovimenti");
  if(modal){
    modal.addEventListener("click", (ev)=>{
      const t = ev.target;
      if(t && t.getAttribute("data-close")) chiudiModalMovimenti();
    });
  }

  // Chiudi con ESC
  document.addEventListener("keydown", (ev)=>{
    if(ev.key === "Escape") chiudiModalMovimenti();
  });
});
function fmtDateTime(ts){
  try{
    if(!ts) return "";
    const d = new Date(ts);
    const dd = String(d.getDate()).padStart(2,'0');
    const mm = String(d.getMonth()+1).padStart(2,'0');
    const yyyy = d.getFullYear();
    const hh = String(d.getHours()).padStart(2,'0');
    const mi = String(d.getMinutes()).padStart(2,'0');
    return `${dd}/${mm}/${yyyy} ${hh}:${mi}`;
  }catch(e){ return ""; }
}


