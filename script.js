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
function numToPeriod(n){ return { mIdx: n % 12, anno: Math.floor(n/12) }

/* === Helpers: obiettivo mensile manuale & quota cumulativo per mese === */
function getObiettivoMensileManuale(d) {
  // Backward compatibility: some data may still be in d.obiettivoMensile
  if (d && typeof d.obiettivoMensileManuale === "number") return Number(d.obiettivoMensileManuale);
  if (d && typeof d.obiettivoMensile === "number") return Number(d.obiettivoMensile);
  return 0;
}
function setObiettivoMensileManuale(d, val) {
  if (!d) return;
  d.obiettivoMensileManuale = Number(val);
  // keep old field for backward-compat but no longer used in calcolo
  d.obiettivoMensile = Number(val);
}
function quotaCumulativoPerMese(meseNome, anno) {
  if (!obiettivoCumulativo) return 0;
  const startN = periodToNum(obiettivoCumulativo.meseInizioIdx, obiettivoCumulativo.annoInizio);
  const endN   = periodToNum(obiettivoCumulativo.meseTargetIdx, obiettivoCumulativo.annoTarget);
  const curN   = periodToNum(idxMeseFromName(meseNome), anno);
  if (curN < startN || curN > endN) return 0;
  const mesiRim = (endN - startN + 1);
  if (mesiRim <= 0) return 0;
  return Number(obiettivoCumulativo.amount) / mesiRim;
}
; }

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
  const isPrem = (statoAbbonamento && statoAbbonamento.versione === 'premium');
  const spePrem = isPrem ? calcolaSpesePremiumMese(meseNome, anno) : 0;
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
  setObiettivoMensileManuale(d, val);
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
  aggiornaUI();
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
   Month Picker (mobile) – auto-injected
   ========================= */
function initMonthPicker(){
  try{
    const sel = document.getElementById('mese');
    if(!sel) return;

    // evita doppioni
    if(document.getElementById('mp-open')) return;

    // wrapper + pulsante + griglia
    const wrapper = document.createElement('div');
    wrapper.className = 'mp'; wrapper.id = 'mp';

    const btn = document.createElement('button');
    btn.type = 'button'; btn.id = 'mp-open'; btn.className = 'mp-btn';
    btn.textContent = `${cap(periodoCorrente.mese)} ▾`;

    const grid = document.createElement('div');
    grid.id = 'mp-grid'; grid.className = 'mp-grid'; grid.hidden = true;

    const SHORT = {
      gennaio:'Gen', febbraio:'Feb', marzo:'Mar', aprile:'Apr',
      maggio:'Mag', giugno:'Giu', luglio:'Lug', agosto:'Ago',
      settembre:'Set', ottobre:'Ott', novembre:'Nov', dicembre:'Dic'
    };

    MESI.forEach(full=>{
      const b = document.createElement('button');
      b.type = 'button';
      b.setAttribute('data-m', full);
      b.textContent = SHORT[full] || full.slice(0,3);
      b.addEventListener('click', ()=>{
        sel.value = full;
        periodoCorrente.mese = full;
        btn.textContent = `${cap(full)} ▾`;
        grid.hidden = true;
        cambiaPeriodo();
      });
      grid.appendChild(b);
    });

    btn.addEventListener('click', ()=>{ grid.hidden = !grid.hidden; });

    document.addEventListener('click', (e)=>{
      if(!wrapper.contains(e.target)) grid.hidden = true;
    });

    sel.addEventListener('change', ()=>{
      btn.textContent = `${cap(sel.value)} ▾`;
    });

    sel.insertAdjacentElement('afterend', wrapper);
    wrapper.appendChild(btn);
    wrapper.appendChild(grid);
  }catch(e){ console.warn('MonthPicker init error', e); }
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
  aggiornaUI();
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

/* ==== DROPDOWN Mese/Anno – MOBILE HARD HIDE (FIX) ==== */
(function() {
  function buildDropdown(id, items, currentText, onPick) {
    const wrap = document.createElement('div');
    wrap.className = 'dd'; wrap.id = id;

    const btn = document.createElement('button');
    btn.type = 'button'; btn.className = 'dd-btn'; btn.id = id+'-btn';
    btn.textContent = currentText + ' ▾';

    const menu = document.createElement('div');
    menu.className = 'dd-menu'; menu.hidden = true;

    items.forEach(it => {
      const b = document.createElement('button');
      b.type = 'button';
      b.textContent = it.text;
      b.addEventListener('click', () => {
        onPick(it.value);
        btn.textContent = it.text + ' ▾';
        menu.hidden = true;
      });
      menu.appendChild(b);
    });

    btn.addEventListener('click', () => { menu.hidden = !menu.hidden; });
    document.addEventListener('click', (e) => { if (!wrap.contains(e.target)) menu.hidden = true; });

    wrap.appendChild(btn); wrap.appendChild(menu);
    return wrap;
  }

  function initPeriodDropdowns() {
    if (!window.matchMedia('(max-width: 600px)').matches) return;

    const box = document.getElementById('periodo') || document.querySelector('.periodo'); // <-- FIX
    const selM = document.getElementById('mese');
    const selA = document.getElementById('anno');
    if (!box || !selM || !selA) return;

    if (document.querySelector('.picker-row')) return;

    const mesi = Array.from(selM.options).map(o => ({ value:o.value, text:o.text }));
    const anni = Array.from(selA.options).map(o => ({ value:o.value, text:o.text }));

    const row = document.createElement('div');
    row.className = 'picker-row';

    const ddM = buildDropdown(
      'dd-mese',
      mesi,
      selM.options[selM.selectedIndex]?.text || 'Mese',
      (val) => {
        selM.value = val;
        if (window.periodoCorrente) window.periodoCorrente.mese = val;
        if (typeof window.cambiaPeriodo === 'function') window.cambiaPeriodo();
      }
    );

    const ddA = buildDropdown(
      'dd-anno',
      anni,
      selA.options[selA.selectedIndex]?.text || 'Anno',
      (val) => {
        selA.value = val;
        if (window.periodoCorrente) window.periodoCorrente.anno = Number(val);
        if (typeof window.cambiaPeriodo === 'function') window.cambiaPeriodo();
      }
    );

    row.appendChild(ddM);
    row.appendChild(ddA);
    box.appendChild(row);

    const labM = document.querySelector('.periodo label[for="mese"]');
    const labA = document.querySelector('.periodo label[for="anno"]');
    if (labM) labM.classList.add('hidden-dd');
    if (labA) labA.classList.add('hidden-dd');
    selM.style.display = 'none';
    selA.style.display = 'none';

    document.body.classList.add('js-dd-ready');
  }

  function waitForSelects(){
    const selM = document.getElementById('mese');
    const selA = document.getElementById('anno');
    if (!selM || !selA || selM.options.length===0 || selA.options.length===0) {
      setTimeout(waitForSelects, 50);
      return;
    }
    initPeriodDropdowns();
  }
  window.addEventListener('DOMContentLoaded', waitForSelects);
})();
