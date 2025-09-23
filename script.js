/* SERENI FINANZE - script.js (v17) */
/* Premium lock cumulativo + badge contabile + UX boost */

/* =========================
   Costanti e utilità
   ========================= */
const MESI = [
  "gennaio","febbraio","marzo","aprile","maggio","giugno",
  "luglio","agosto","settembre","ottobre","novembre","dicembre"
];
const up = s => s.toLocaleUpperCase?.("it-IT") || s.toUpperCase();
const cap = s => s.charAt(0).toUpperCase() + s.slice(1);
const idxMeseFromName = m => MESI.indexOf(m);
const fmt = n => `€${Number(n).toFixed(2)}`;

// storage keys
const STORE_MAIN   = "sereniFinanze_v8";
const STORE_CUM    = "sereniFinanze_cumulativo_v8";
const STORE_ABO    = "sereniFinanze_abbonamento_v1";
const STORE_PREM_A = "sereniFinanze_premiumAnnuali";
const STORE_PREM_M = "sereniFinanze_premiumMensili";

/* =========================
   Stato in memoria
   ========================= */
let datiPerPeriodo = {};
let periodoCorrente = { mese: "", anno: 0 };
let obiettivoCumulativo = null;
let statoAbbonamento = { versione: "base", giorniProva: 30 };
let speseAnnuali = [];
let speseMensili = [];

/* =========================
   Storage
   ========================= */
function caricaDati() {
  try { const raw = localStorage.getItem(STORE_MAIN); if (raw) datiPerPeriodo = JSON.parse(raw); }
  catch { datiPerPeriodo = {}; }

  try { const rawCum = localStorage.getItem(STORE_CUM); if (rawCum) obiettivoCumulativo = JSON.parse(rawCum); }
  catch { obiettivoCumulativo = null; }

  try { const rawAbo = localStorage.getItem(STORE_ABO); if (rawAbo) statoAbbonamento = JSON.parse(rawAbo); }
  catch { /* default */ }

  try { const rawA = localStorage.getItem(STORE_PREM_A); if (rawA) speseAnnuali = JSON.parse(rawA); }
  catch { speseAnnuali=[]; }

  try { const rawM = localStorage.getItem(STORE_PREM_M); if (rawM) speseMensili = JSON.parse(rawM); }
  catch { speseMensili=[]; }

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
   Periodi (utility)
   ========================= */
function ensurePeriodo(mese, anno){
  const key = `${mese}-${anno}`;
  if(!datiPerPeriodo[key]) datiPerPeriodo[key] = { entrate: [], spese: [], obiettivoMensile: null };
  return datiPerPeriodo[key];
}
function getPeriodoData(mese, anno){
  const key = `${mese}-${anno}`;
  return datiPerPeriodo[key] || { entrate: [], spese: [], obiettivoMensile: null };
}
function periodToNum(mIdx, year){ return year*12 + mIdx; }
function numToPeriod(n){ return { mIdx: n % 12, anno: Math.floor(n/12) }; }

/* Somma i saldi disponibili dal periodo A (incluso) al periodo B (incluso) */
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
/* “Finora” = min(oggi, fine). Null se non ancora iniziato */
function progressEndWithin(startIdx, startYear, endIdx, endYear){
  const curIdx = idxMeseFromName(periodoCorrente.mese);
  const curYear = periodoCorrente.anno;
  const curN  = periodToNum(curIdx, curYear);
  const endN  = periodToNum(endIdx, endYear);
  const startN= periodToNum(startIdx, startYear);
  const progN = Math.min(curN, endN);
  if (progN < startN) return null;
  return numToPeriod(progN);
}

/* =========================
   Calcoli
   ========================= */
function saldoDisponibileOfNome(meseNome, anno){
  const d = getPeriodoData(meseNome, anno);
  const entr = d.entrate.reduce((s,e)=>s+Number(e.importo),0);
  const spe  = d.spese.reduce((s,e)=>s+Number(e.importo),0);
  const spePrem = calcolaSpesePremiumMese(meseNome, anno); // Premium
  return entr - (spe + spePrem);
}
function saldoTotaleFinoA(mIdxLimite, annoLimite){
  let tot = 0;
  for(const k in datiPerPeriodo){
    const [mNome, aStr] = k.split("-");
    const a = Number(aStr);
    const idx = idxMeseFromName(mNome);
    if(a < annoLimite || (a === annoLimite && idx <= mIdxLimite)){
      tot += saldoDisponibileOfNome(mNome, a);
    }
  }
  return tot;
}

/* =========================
   Entrate / Spese manuali
   ========================= */
function aggiungiEntrata(){
  const desc = document.getElementById("descrizioneEntrata").value.trim();
  const imp  = parseFloat(document.getElementById("importoEntrata").value);
  if(!desc || !isFinite(imp) || imp<=0){ alert("⚠️ Inserisci descrizione e importo valido (>0)."); return; }
  const d = ensurePeriodo(periodoCorrente.mese, periodoCorrente.anno);
  d.entrate.push({descrizione:desc, importo:imp});
  document.getElementById("descrizioneEntrata").value="";
  document.getElementById("importoEntrata").value="";
  salvaDati(); aggiornaUI();
}
function aggiungiSpesa(){
  const desc = document.getElementById("descrizioneSpesa").value.trim();
  const imp  = parseFloat(document.getElementById("importoSpesa").value);
  if(!desc || !isFinite(imp) || imp<=0){ alert("⚠️ Inserisci descrizione e importo valido (>0)."); return; }
  const d = ensurePeriodo(periodoCorrente.mese, periodoCorrente.anno);
  d.spese.push({descrizione:desc, importo:imp});
  document.getElementById("descrizioneSpesa").value="";
  document.getElementById("importoSpesa").value="";
  salvaDati(); aggiornaUI();
}

/* =========================
   Obiettivo Mensile
   ========================= */
function salvaObiettivoMensile(){
  const raw = document.getElementById("obiettivoMensile").value;
  const val = parseFloat(raw);
  if (!isFinite(val) || val < 0) { alert("Inserisci un numero valido per l'obiettivo mensile."); return; }
  const d = ensurePeriodo(periodoCorrente.mese, periodoCorrente.anno);
  d.obiettivoMensile = val;   // numero
  salvaDati(); aggiornaUI();
}

/* =========================
   Obiettivo Cumulativo
   ========================= */
function salvaObiettivoCumulativo(){
  const imp = parseFloat(document.getElementById("importoCumulativo").value);
  const meseInizio = document.getElementById("meseInizioTarget").value;
  const annoInizio = Number(document.getElementById("annoInizioTarget").value);
  const meseFine   = document.getElementById("meseTarget").value;
  const annoFine   = Number(document.getElementById("annoTarget").value);

  if(!isFinite(imp) || imp<=0){ alert("Inserisci un importo cumulativo valido (>0)."); return; }

  const startIdx = idxMeseFromName(meseInizio);
  const endIdx   = idxMeseFromName(meseFine);
  const mesiRim  = (annoFine-annoInizio)*12 + (endIdx-startIdx) + 1;
  if(mesiRim<=0){ alert("Periodo non valido. Scegli date corrette."); return; }

  obiettivoCumulativo = {
    amount: imp,
    meseInizioIdx: startIdx, annoInizio: annoInizio,
    meseTargetIdx: endIdx,   annoTarget: annoFine
  };
  salvaCumulativo();

  // ripartizione automatica della quota mensile nel range
  const quota = imp / mesiRim;
  for(let i=0;i<mesiRim;i++){
    const idx = startIdx + i;
    const y   = annoInizio + Math.floor(idx/12);
    const mIdx= idx % 12;
    const mNo = MESI[mIdx];
    const d = ensurePeriodo(mNo, y);
    d.obiettivoMensile = quota;
  }
  salvaDati();
  aggiornaUI();
  lockMensileByCumulativo();   // Base: blocca mensile se cumulativo attivo
  lockCumulativoByPremium();   // Premium: blocca cumulativo fino a scadenza
}

/* =========================
   Premium: Spese ricorrenti
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
  if(!ULann||!ULmen) return;
  ULann.innerHTML=""; ULmen.innerHTML="";
  speseAnnuali.forEach((s,i)=>{
    ULann.innerHTML+=`<li><span>${s.desc} — ${fmt(s.imp)} divisi in ${s.mesi} mesi (da ${cap(s.meseStart)} ${s.annoStart})</span>
      <button onclick="rimuoviAnnuale(${i})">✖</button></li>`;
  });
  speseMensili.forEach((s,i)=>{
    ULmen.innerHTML+=`<li><span>${s.desc} — ${fmt(s.imp)} (da ${cap(s.meseStart)} ${s.annoStart})</span>
      <button onclick="rimuoviMensile(${i})">✖</button></li>`;
  });
}

/* Calcolo spese Premium attive in un mese */
function calcolaSpesePremiumMese(mese, anno){
  let totale = 0;
  const idxM = idxMeseFromName(mese);

  // annuali
  speseAnnuali.forEach(s=>{
    const startIdx=idxMeseFromName(s.meseStart);
    const startY=s.annoStart;
    const quota=s.imp/s.mesi;
    for(let i=0;i<s.mesi;i++){
      const y=startY+Math.floor((startIdx+i)/12);
      const mIdx=(startIdx+i)%12;
      if(y===anno && mIdx===idxM) totale+=quota;
    }
  });

  // mensili
  speseMensili.forEach(s=>{
    if(!s.attiva) return;
    const idxStart=idxMeseFromName(s.meseStart);
    if(anno>s.annoStart || (anno===s.annoStart && idxM>=idxStart)){
      totale+=s.imp;
    }
  });

  return totale;
}

/* =========================
   UI – funzioni modulari
   ========================= */
function updateHeader(){
  const m = periodoCorrente.mese; 
  const a = periodoCorrente.anno; 
  const labelPeriodo = document.getElementById("labelPeriodo");
  const labelMeseObj = document.getElementById("meseObiettivo");
  if (labelPeriodo) labelPeriodo.innerText = `${up(m)} ${a}`;
  if (labelMeseObj) labelMeseObj.innerText = `${up(m)} ${a}`;

  // abbonamento
  const giorniProvaEl = document.getElementById("giorniProva");
  if (giorniProvaEl) giorniProvaEl.innerText = String(statoAbbonamento.giorniProva);
  const verEl = document.getElementById("versioneAttiva");
  if (verEl) verEl.innerText = (statoAbbonamento.versione === "premium" ? "🌟 Versione Premium attiva" : "✅ Versione Base attiva");
}

function updateLists(){
  const m = periodoCorrente.mese; 
  const a = periodoCorrente.anno; 
  const d = getPeriodoData(m,a);
  const ULent = document.getElementById("listaEntrate");
  const ULspe = document.getElementById("listaSpese");
  if (ULent) ULent.innerHTML="";
  if (ULspe) ULspe.innerHTML="";

  d.entrate.forEach(it=>{
    if (ULent) ULent.innerHTML += `
      <li>
        <span class="title">➕ ${it.descrizione.toUpperCase()}</span>
        <span class="importo-verde">${fmt(it.importo)}</span>
      </li>`;
  });
  d.spese.forEach(it=>{
    if (ULspe) ULspe.innerHTML += `
      <li>
        <span class="title">➖ ${it.descrizione.toUpperCase()}</span>
        <span class="importo-rosso">-${fmt(Math.abs(it.importo))}</span>
      </li>`;
  });
}

function updateSaldoBox(){
  const m = periodoCorrente.mese; 
  const a = periodoCorrente.anno; 
  const mIdx = idxMeseFromName(m);
  const d = getPeriodoData(m,a);

  const saldoDisp = saldoDisponibileOfNome(m,a);
  const obMes = (d.obiettivoMensile !== null && d.obiettivoMensile !== undefined && isFinite(Number(d.obiettivoMensile)))
    ? Number(d.obiettivoMensile) : 0;
  const saldoCont = saldoDisp - obMes;
  const saldoTot  = saldoTotaleFinoA(mIdx,a);

  const clsCont = saldoCont < 0 ? "importo-rosso" : (saldoCont === 0 ? "" : "importo-verde");
  const clsDisp = saldoDisp < 0 ? "importo-rosso" : "importo-verde";
  const saldoBox = document.getElementById("saldo");
  const lockedObj = isCumulativoLockedForPremium();
  const lockBadgeHTML = lockedObj.locked ? ` <span class="badge" title="Cumulativo bloccato fino a ${lockedObj.labelEnd}">🔒 fino a ${lockedObj.labelEnd}</span>` : "";

  if (saldoBox) {
    saldoBox.innerHTML = `
      <div class="rowline">
        <span class="title">💸 Disponibile mensile</span>
        <span class="${clsDisp}">${fmt(saldoDisp)}</span>
      </div>
      <div class="rowline">
        <span class="title">📘 Contabile mensile</span>
        <span class="${clsCont}">${fmt(saldoCont)}</span>
      </div>
      <div class="rowline">
        <span class="title">💰 Totale</span>
        <span class="${saldoTot<0?'importo-rosso':'importo-verde'}">${fmt(saldoTot)}</span>
      </div>
      ${lockBadgeHTML}
    `;
  }
}

function updateMensileUI(){
  const m = periodoCorrente.mese; 
  const a = periodoCorrente.anno; 
  const d = getPeriodoData(m,a);
  const saldoDisp = saldoDisponibileOfNome(m,a);
  const obMes = (d.obiettivoMensile !== null && d.obiettivoMensile !== undefined && isFinite(Number(d.obiettivoMensile)))
    ? Number(d.obiettivoMensile) : 0;

  const mm = document.getElementById("messMens");
  const df = document.getElementById("diffMens");
  if (!mm || !df) return;

  const diff = saldoDisp - obMes;
  df.textContent = "";
  if (obMes > 0) {
    if (diff >= 0) {
      mm.className = "verde";
      mm.textContent = `✅ Obiettivo di ${fmt(obMes)} RAGGIUNTO a ${up(m)} ${a}. Grande! 💪`;
      if (diff > 0) df.innerHTML = `Hai superato di <strong>${fmt(diff)}</strong>. Continua così!`;
      const badge = document.getElementById("badgeMensile");
      if (badge) { badge.classList.remove("hidden"); badge.setAttribute("aria-hidden","false"); }
    } else {
      mm.className = "rosso";
      mm.textContent = `❗ Hai sforato di ${fmt(Math.abs(diff))} a ${up(m)} ${a}.`;
      df.innerHTML = `Niente panico: riduci piccole spese ricorrenti e punta a recuperare <strong>${fmt(Math.ceil(Math.abs(diff)))}</strong> entro la prossima settimana. 🔄`;
      const badge = document.getElementById("badgeMensile");
      if (badge) { badge.classList.add("hidden"); badge.setAttribute("aria-hidden","true"); }
    }
  } else {
    mm.className = "muted";
    mm.textContent = "Nessun obiettivo mensile impostato.";
    const badge = document.getElementById("badgeMensile");
    if (badge) { badge.classList.add("hidden"); badge.setAttribute("aria-hidden","true"); }
  }
}

function aggiornaCumulativoUI(){
  const msg = document.getElementById("messaggioCumulativo");
  const det = document.getElementById("dettaglioCumulativo");
  const bar = document.getElementById("progressBar");
  const badge = document.getElementById("badgeCumulativo");
  if(!msg || !det) return;

  if(!obiettivoCumulativo){
    msg.className="muted";
    msg.innerText="🔔 Hai un obiettivo cumulativo? Impostalo a sinistra.";
    det.innerText="";
    if(bar){ bar.style.width="0%"; bar.setAttribute("aria-valuenow","0"); }
    if(badge){ badge.classList.add("hidden"); badge.setAttribute("aria-hidden","true"); }
    return;
  }

  const amount = Number(obiettivoCumulativo.amount) || 0;
  const sIdx = obiettivoCumulativo.meseInizioIdx;
  const sY   = obiettivoCumulativo.annoInizio;
  const eIdx = obiettivoCumulativo.meseTargetIdx;
  const eY   = obiettivoCumulativo.annoTarget;

  const labelStart = `${up(MESI[sIdx])} ${sY}`;
  const labelEnd   = `${up(MESI[eIdx])} ${eY}`;

  const progEnd = progressEndWithin(sIdx, sY, eIdx, eY);
  if (progEnd === null){
    msg.className="neutro";
    msg.innerText = `⏳ L'obiettivo non è ancora iniziato. Partirà da ${labelStart}.`;
    det.innerText = `Target: ${fmt(amount)} entro ${labelEnd}.`;
    if(bar){ bar.style.width="0%"; bar.setAttribute("aria-valuenow","0"); }
    if(badge){ badge.classList.add("hidden"); badge.setAttribute("aria-hidden","true"); }
    return;
  }

  const cumulato = saldoTotaleTra(sIdx, sY, progEnd.mIdx, progEnd.anno);
  const percent = amount > 0 ? Math.max(0, Math.min(100, (cumulato / amount) * 100)) : 100;
  const diff = cumulato - amount;

  if(bar){
    bar.style.width = `${percent}%`;
    bar.setAttribute("aria-valuenow", percent.toFixed(0));
  }

  if(badge){ badge.classList.add("hidden"); badge.setAttribute("aria-hidden","true"); }

  const currentN = periodToNum(idxMeseFromName(periodoCorrente.mese), periodoCorrente.anno);
  const endN     = periodToNum(eIdx, eY);
  const isPastEnd= currentN > endN;

  if (cumulato > amount){
    msg.className="verde";
    msg.innerText = isPastEnd ? "🏁 Obiettivo superato (dopo la scadenza)!" : "🚀 Obiettivo cumulativo superato!";
    det.innerText = `Hai risparmiato ${fmt(cumulato)}, cioè ${fmt(Math.abs(diff))} in più del target di ${fmt(amount)} entro ${labelEnd}.`;
    if(badge){ badge.classList.remove("hidden"); badge.setAttribute("aria-hidden","false"); }
  } else if (Math.abs(cumulato - amount) < 0.005) {
    msg.className="verde";
    msg.innerText = "🏆 Obiettivo cumulativo raggiunto!";
    det.innerText = `Hai centrato ${fmt(amount)} entro ${labelEnd}. Grandioso!`;
    if(badge){ badge.classList.remove("hidden"); badge.setAttribute("aria-hidden","false"); }
  } else {
    msg.className="neutro";
    msg.innerText = "⏳ Obiettivo cumulativo in corso...";
    det.innerText = `Hai risparmiato finora ${fmt(cumulato)} (${percent.toFixed(0)}%). Mancano ${fmt(amount - cumulato)} per arrivare a ${fmt(amount)} entro ${labelEnd}.`;
  }
}

/* =========================
   🔒 Lock mensile in Base (se c'è cumulativo)
   ========================= */
function lockMensileByCumulativo() {
  const input = document.getElementById("obiettivoMensile");
  const btn   = document.getElementById("btnSalvaObiettivoMensile");
  const nota  = document.getElementById("notaAuto");
  if (!input || !btn || !nota) return;

  const isBase = (statoAbbonamento && statoAbbonamento.versione === "base");
  const hasCum = !!obiettivoCumulativo;

  if (isBase && hasCum) {
    input.disabled = true;
    btn.disabled   = true;
    nota.textContent = "🔒 In Versione Base l'obiettivo mensile è calcolato automaticamente dall'obiettivo cumulativo.";
    const d = getPeriodoData(periodoCorrente.mese, periodoCorrente.anno);
    if (d && typeof d.obiettivoMensile === "number") input.value = d.obiettivoMensile;
  } else {
    input.disabled = false;
    btn.disabled   = false;
    nota.textContent = "";
  }
}

/* =========================
   🔒 Lock cumulativo in Premium (nuovo)
   ========================= */
// ritorna { locked: boolean, labelEnd: 'Mese Anno' }
function isCumulativoLockedForPremium(){
  if (!obiettivoCumulativo) return { locked:false, labelEnd:"" };
  const isPrem = (statoAbbonamento && statoAbbonamento.versione === "premium");
  if (!isPrem) return { locked:false, labelEnd:"" };

  const eIdx = obiettivoCumulativo.meseTargetIdx;
  const eY   = obiettivoCumulativo.annoTarget;
  const endN = periodToNum(eIdx, eY);
  const curN = periodToNum(idxMeseFromName(periodoCorrente.mese), periodoCorrente.anno);
  const locked = curN <= endN; // fino a fine mese target incluso
  const labelEnd = `${cap(MESI[eIdx])} ${eY}`;
  return { locked, labelEnd };
}

function lockCumulativoByPremium(){
  const imp = document.getElementById("importoCumulativo");
  const mi  = document.getElementById("meseInizioTarget");
  const ai  = document.getElementById("annoInizioTarget");
  const mf  = document.getElementById("meseTarget");
  const af  = document.getElementById("annoTarget");
  const btn = document.querySelector("button[onclick='salvaObiettivoCumulativo()']");

  if(!imp || !mi || !ai || !mf || !af || !btn) return;

  const info = isCumulativoLockedForPremium();
  if (info.locked) {
    imp.disabled = true; mi.disabled = true; ai.disabled = true; mf.disabled = true; af.disabled = true; btn.disabled = true;
    imp.title = mi.title = ai.title = mf.title = af.title = btn.title =
      `🔒 Cumulativo bloccato in Premium fino a ${info.labelEnd}`;
  } else {
    imp.disabled = false; mi.disabled = false; ai.disabled = false; mf.disabled = false; af.disabled = false; btn.disabled = false;
    imp.removeAttribute("title"); mi.removeAttribute("title"); ai.removeAttribute("title");
    mf.removeAttribute("title"); af.removeAttribute("title"); btn.removeAttribute("title");
  }
}

/* =========================
   Cambio periodo e select
   ========================= */
function cambiaPeriodo(){
  periodoCorrente.mese = document.getElementById("mese").value;
  periodoCorrente.anno = Number(document.getElementById("anno").value);
  aggiornaUI();
}
function popolaSelectMesiEAnni(){
  const annoNow = new Date().getFullYear();
  const anni = [];
  for(let y=annoNow-2; y<=annoNow+5; y++) anni.push(y);

  const mesiSelectIds = ["mese","meseInizioTarget","meseTarget","meseAnnuale","meseMensile"];
  mesiSelectIds.forEach(id=>{
    const sel = document.getElementById(id); if(!sel) return;
    sel.innerHTML="";
    MESI.forEach(m=>{
      const opt=document.createElement("option");
      opt.value=m; opt.text=cap(m);
      sel.appendChild(opt);
    });
  });

  const anniSelectIds = ["anno","annoInizioTarget","annoTarget","annoAnnuale","annoMensile"];
  anniSelectIds.forEach(id=>{
    const sel = document.getElementById(id); if(!sel) return;
    sel.innerHTML="";
    anni.forEach(y=>{
      const opt=document.createElement("option");
      opt.value=y; opt.text=y;
      sel.appendChild(opt);
    });
  });

  const selM = document.getElementById("mese");
  const selA = document.getElementById("anno");
  if (selM) selM.value = periodoCorrente.mese;
  if (selA) selA.value = String(periodoCorrente.anno);
}

/* =========================
   Azzeramento dati
   ========================= */
function azzeraTutto(){
  if(confirm("Vuoi davvero azzerare tutti i dati?")){
    localStorage.clear();
    datiPerPeriodo={}; obiettivoCumulativo=null; speseAnnuali=[]; speseMensili=[];
    caricaDati(); popolaSelectMesiEAnni(); aggiornaUI();
    alert("✅ Dati azzerati con successo!");
  }
}

/* =========================
   Versioni
   ========================= */
function attivaBase() {
  statoAbbonamento.versione = "base"; salvaAbbonamento();
  const el = document.getElementById("versioneAttiva");
  if (el) el.innerText = "✅ Versione Base attiva";
  lockMensileByCumulativo();
  lockCumulativoByPremium();
}
function attivaPremium() {
  statoAbbonamento.versione = "premium"; salvaAbbonamento();
  const el = document.getElementById("versioneAttiva");
  if (el) el.innerText = "🌟 Versione Premium attiva";
  lockMensileByCumulativo();
  lockCumulativoByPremium();
}

/* =========================
   Onboarding (facoltativo)
   ========================= */
const steps = [
  "📆 Imposta il <strong>mese e anno</strong> dal menu in alto.",
  "➕ Aggiungi le <strong>entrate</strong> e ➖ le <strong>spese</strong>.",
  "🎯 Imposta un <strong>obiettivo mensile</strong>.",
  "🏁 Definisci un <strong>obiettivo cumulativo</strong>.",
  "🌟 Usa le <strong>spese ricorrenti Premium</strong> per automatizzare il tutto!"
];
let stepIndex=0;
function showOnboarding(){
  const seen=localStorage.getItem("sereniFinanze_onboardingDone"); if(seen) return;
  const box=document.getElementById("onboarding"); if(!box) return;
  const txt=document.getElementById("onboardingText"); if(txt) txt.innerHTML=steps[0];
  box.classList.remove("hidden");
}
function nextStep(){
  const txt=document.getElementById("onboardingText");
  if(stepIndex<steps.length-1){ stepIndex++; if(txt) txt.innerHTML=steps[stepIndex]; }
  else{ const box=document.getElementById("onboarding"); if(box) box.classList.add("hidden"); localStorage.setItem("sereniFinanze_onboardingDone","1"); }
}
function prevStep(){
  const txt=document.getElementById("onboardingText");
  if(stepIndex>0){ stepIndex--; if(txt) txt.innerHTML=steps[stepIndex]; }
}

/* =========================
   INIT
   ========================= */
function aggiornaUI(){
  updateHeader();
  updateLists();
  updateSaldoBox();
  lockMensileByCumulativo();
  lockCumulativoByPremium();
  renderPremium();
  aggiornaCumulativoUI();
}

function init(){
  caricaDati();
  popolaSelectMesiEAnni();
  initAllDropdowns(); aggiornaUI();
  initMonthPicker();
  showOnboarding && showOnboarding();

  // aforisma dinamico (se presente)
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
   Custom Dropdowns (Single-tap) – universal (mobile & desktop)
   ========================= */
function buildDropdownForSelect(selectEl, onPick){
  if(!selectEl) return null;
  if(selectEl.dataset.ddBuilt==="1") return selectEl.nextElementSibling; // avoid duplicates

  const currentText = selectEl.options[selectEl.selectedIndex]?.text || "";
  const wrap = document.createElement('div');
  wrap.className = 'dd';

  const btn = document.createElement('button');
  btn.type = 'button';
  btn.className = 'dd-btn';
  btn.textContent = currentText;

  const menu = document.createElement('div');
  menu.className = 'dd-menu';
  menu.hidden = true;

  Array.from(selectEl.options).forEach(opt => {
    const it = document.createElement('button');
    it.type = 'button';
    it.className = 'dd-item';
    it.textContent = opt.text;
    it.addEventListener('click', () => {
      selectEl.value = opt.value;
      btn.textContent = opt.text;
      menu.hidden = true;
      // Dispatch change so existing logic (cambiaPeriodo, ecc.) rimane intatta
      selectEl.dispatchEvent(new Event('change', {bubbles:true}));
      if(typeof onPick === 'function') onPick(opt.value, opt.text);
    });
    menu.appendChild(it);
  });

  btn.addEventListener('click', () => { 
    // close other open menus
    document.querySelectorAll('.dd-menu').forEach(m => { if(m!==menu) m.hidden = true; });
    menu.hidden = !menu.hidden; 
  });
  document.addEventListener('click', (e) => { if(!wrap.contains(e.target)) menu.hidden = true; });

  wrap.appendChild(btn);
  wrap.appendChild(menu);

  // insert after select
  selectEl.insertAdjacentElement('afterend', wrap);
  selectEl.style.display = 'none';
  selectEl.dataset.ddBuilt = "1";
  return wrap;
}

function initAllDropdowns(){
  // Ensure selects are already populated
  const ids = [
    "mese","anno",
    "meseInizioTarget","annoInizioTarget",
    "meseTarget","annoTarget",
    "meseAnnuale","annoAnnuale",
    "meseMensile","annoMensile"
  ];
  ids.forEach(id => {
    const el = document.getElementById(id);
    if(!el) return;
    buildDropdownForSelect(el, (val) => {
      // For mese/anno principali, cambiare periodo è già gestito via 'change' listener
    });
  });

  // For layout: group in rows (month+year pairs) if not grouped yet
  const pairGroups = [
    ["mese","anno"],
    ["meseInizioTarget","annoInizioTarget"],
    ["meseTarget","annoTarget"],
    ["meseAnnuale","annoAnnuale"],
    ["meseMensile","annoMensile"],
  ];
  pairGroups.forEach(([mId, aId]) => {
    const mSel = document.getElementById(mId);
    const aSel = document.getElementById(aId);
    if(!mSel || !aSel) return;
    const mDD = mSel.nextElementSibling && mSel.nextElementSibling.classList.contains('dd') ? mSel.nextElementSibling : null;
    const aDD = aSel.nextElementSibling && aSel.nextElementSibling.classList.contains('dd') ? aSel.nextElementSibling : null;
    if(!mDD || !aDD) return;

    // Create a row wrapper once
    if(!(mDD.parentElement && mDD.parentElement.classList && mDD.parentElement.classList.contains('dd-row'))){
      const row = document.createElement('div'); row.className='dd-row';
      // place row right after the second select (year) or after the first dropdown
      const anchor = aDD;
      anchor.parentElement.insertBefore(row, anchor);
      row.appendChild(mDD);
      row.appendChild(aDD);
    }
  });
}

