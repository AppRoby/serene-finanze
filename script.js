/* =========================
   SERENI FINANZE - LOGICA
   ========================= */

const MESI = [
  "gennaio","febbraio","marzo","aprile","maggio","giugno",
  "luglio","agosto","settembre","ottobre","novembre","dicembre"
];

let datiPerPeriodo = {}; // chiave: "mese-anno"
let periodoCorrente = { mese: "", anno: 0 };

// obiettivo cumulativo salvato a parte
// { amount:Number, meseTargetIdx:Number(0..11), annoTarget:Number }
let obiettivoCumulativo = null;

/* ---------- UTIL ---------- */
const cap = s => s.charAt(0).toUpperCase() + s.slice(1);
const keyPeriodo = (mese, anno) => `${mese}-${anno}`;
const now = new Date();

function idxMese(m){ return MESI.indexOf(m); }

/* ---------- STORAGE ---------- */
function caricaDati() {
  const raw = localStorage.getItem("sereniFinanze_v2");
  if (raw) datiPerPeriodo = JSON.parse(raw);
  const rawCum = localStorage.getItem("sereniFinanze_cumulativo_v1");
  if (rawCum) obiettivoCumulativo = JSON.parse(rawCum);

  periodoCorrente.mese = MESI[now.getMonth()];
  periodoCorrente.anno = now.getFullYear();
}

function salvaDati() {
  localStorage.setItem("sereniFinanze_v2", JSON.stringify(datiPerPeriodo));
}
function salvaCumulativo() {
  localStorage.setItem("sereniFinanze_cumulativo_v1", JSON.stringify(obiettivoCumulativo));
}

/* ---------- INIT SELECTS ---------- */
function popolaSelectMesi(selectEl, valore) {
  selectEl.innerHTML = "";
  MESI.forEach((m) => {
    const opt = document.createElement("option");
    opt.value = m;
    opt.textContent = cap(m);
    if (valore && valore === m) opt.selected = true;
    selectEl.appendChild(opt);
  });
}
function popolaSelectAnni(selectEl, valore) {
  selectEl.innerHTML = "";
  const annoStart = now.getFullYear() - 1;
  const annoEnd = now.getFullYear() + 3;
  for (let a = annoStart; a <= annoEnd; a++) {
    const opt = document.createElement("option");
    opt.value = String(a);
    opt.textContent = a;
    if (valore && Number(valore) === a) opt.selected = true;
    selectEl.appendChild(opt);
  }
}

/* ---------- CALCOLI ---------- */
function getPeriodoData(mese, anno) {
  const k = keyPeriodo(mese, anno);
  return datiPerPeriodo[k] || { entrate: [], spese: [], obiettivoMensile: null };
}

function saldoDisponibileOf(mese, anno) {
  const d = getPeriodoData(mese, anno);
  const totEntr = d.entrate.reduce((s, e) => s + e.importo, 0);
  const totSpes = d.spese.reduce((s, e) => s + e.importo, 0);
  return totEntr - totSpes;
}

// somma i risparmi (Saldo Disponibile) da Gennaio a un mese specifico (incluso) per un certo anno
function sommaDaGennaioA(meseIdxIncluso, anno) {
  let sum = 0;
  for (let i = 0; i <= meseIdxIncluso; i++) {
    sum += saldoDisponibileOf(MESI[i], anno);
  }
  return sum;
}

// calcolo suggerimento obiettivo mensile quando esiste obiettivo cumulativo
function calcolaObiettivoMensileSuggerito() {
  if (!obiettivoCumulativo) return null;

  const mIdxCorr = idxMese(periodoCorrente.mese);
  const { amount, meseTargetIdx, annoTarget } = obiettivoCumulativo;

  // auto-calcolo solo se l'anno visualizzato è quello del target
  if (periodoCorrente.anno !== annoTarget) return null;

  // se siamo oltre il target, nessun auto (già chiuso)
  if (mIdxCorr > meseTargetIdx) return 0;

  const cumulatoFinoraPrimaDelCorrente =
    mIdxCorr === 0 ? 0 : sommaDaGennaioA(mIdxCorr - 1, annoTarget);

  const restante = Math.max(0, amount - cumulatoFinoraPrimaDelCorrente);

  // mesi rimasti = dal mese corrente fino al target inclusi
  const mesiRimasti = (meseTargetIdx - mIdxCorr) + 1;
  if (mesiRimasti <= 0) return restante; // fallback

  return restante / mesiRimasti;
}

/* ---------- UI ---------- */
function aggiornaUI() {
  // label periodo
  document.getElementById("labelPeriodo").innerText =
    `${cap(periodoCorrente.mese)} ${periodoCorrente.anno}`;
  document.getElementById("meseObiettivo").innerText =
    `${cap(periodoCorrente.mese)} ${periodoCorrente.anno}`;

  // dati periodo corrente
  const d = getPeriodoData(periodoCorrente.mese, periodoCorrente.anno);
  const listaEntrate = document.getElementById("listaEntrate");
  const listaSpese = document.getElementById("listaSpese");
  listaEntrate.innerHTML = "";
  listaSpese.innerHTML = "";

  let totEntr = 0, totSpes = 0;
  d.entrate.forEach(item => {
    listaEntrate.innerHTML += `<li>+ ${item.descrizione.toUpperCase()}: €${item.importo.toFixed(2)}</li>`;
    totEntr += item.importo;
  });
  d.spese.forEach(item => {
    listaSpese.innerHTML += `<li>- ${item.descrizione.toUpperCase()}: €${item.importo.toFixed(2)}</li>`;
    totSpes += item.importo;
  });

  const saldoDisp = totEntr - totSpes;
  const objMensileSalvato = Number(d.obiettivoMensile) || null;

  // calcolo auto se c'è cumulativo valido
  const suggerito = calcolaObiettivoMensileSuggerito();

  // valore obiettivo effettivo (per la verifica mensile)
  const obiettivoEff = (suggerito !== null) ? suggerito : (objMensileSalvato || 0);

  // aggiornamento UI del campo mensile (disabilitazione se auto)
  const inputMensile = document.getElementById("obiettivoMensile");
  const btnMensile = document.getElementById("btnSalvaObiettivoMensile");
  const notaAuto = document.getElementById("notaAuto");

  if (suggerito !== null) {
    inputMensile.value = obiettivoEff.toFixed(2);
    inputMensile.disabled = true;
    btnMensile.disabled = true;
    notaAuto.textContent = "Calcolo automatico attivo perché hai un Obiettivo Cumulativo impostato.";
  } else {
    inputMensile.disabled = false;
    btnMensile.disabled = false;
    notaAuto.textContent = "";
    inputMensile.value = objMensileSalvato ? Number(objMensileSalvato).toFixed(2) : "";
  }

  const saldoContabile = saldoDisp - obiettivoEff;
  document.getElementById("saldo").innerHTML =
    `<strong>Saldo Disponibile:</strong> €${saldoDisp.toFixed(2)}<br/>
     <strong>Saldo Contabile:</strong> €${saldoContabile.toFixed(2)}`;

  // verifica obiettivo mensile (giallo)
  const messMens = document.getElementById("messaggioObiettivo");
  const diffMens = document.getElementById("differenzaObiettivo");
  if (obiettivoEff > 0) {
    const diff = saldoDisp - obiettivoEff;
    if (saldoDisp >= obiettivoEff) {
      messMens.className = "verde";
      messMens.innerText = "✅ Obiettivo mensile raggiunto! Bravo! Continua così 💪";
      diffMens.innerText = `Hai superato l'obiettivo mensile di €${Math.abs(diff).toFixed(2)}.`;
    } else {
      messMens.className = "neutro";
      messMens.innerText = "⚠️ Obiettivo mensile non raggiunto.";
      diffMens.innerText = `Ti mancano €${Math.abs(diff).toFixed(2)} per raggiungerlo.`;
    }
  } else {
    messMens.className = "muted";
    messMens.innerText = "Nessun obiettivo mensile impostato.";
    diffMens.innerText = "";
  }

  // verifica cumulativa (verde)
  aggiornaCumulativoUI();
}

function aggiornaCumulativoUI() {
  const msg = document.getElementById("messaggioCumulativo");
  const det = document.getElementById("dettaglioCumulativo");

  if (!obiettivoCumulativo || !obiettivoCumulativo.amount) {
    msg.className = "muted";
    msg.innerText = "🔔 Hai un obiettivo cumulativo? Impostalo a sinistra.";
    det.innerText = "";
    return;
  }

  const amount = Number(obiettivoCumulativo.amount);
  const meseTargetIdx = obiettivoCumulativo.meseTargetIdx;
  const annoTarget = obiettivoCumulativo.annoTarget;

  // cumulato fino al mese TARGET (incluso) dell'anno target
  const cumulatoTarget = sommaDaGennaioA(meseTargetIdx, annoTarget);

  const diff = cumulatoTarget - amount;
  const labelTarget = `${cap(MESI[meseTargetIdx])} ${annoTarget}`;

  if (cumulatoTarget >= amount) {
    msg.className = "verde";
    msg.innerText = `🏆 Obiettivo cumulativo raggiunto entro ${labelTarget}!`;
    det.innerText = `Hai superato l'obiettivo di €${Math.abs(diff).toFixed(2)} (Totale risparmiato: €${cumulatoTarget.toFixed(2)} su €${amount.toFixed(2)}).`;
  } else {
    msg.className = "neutro";
    msg.innerText = `⏳ Verifica cumulativa: obiettivo entro ${labelTarget}.`;
    det.innerText = `Mancano €${Math.abs(diff).toFixed(2)} per arrivare a €${amount.toFixed(2)}. Totale risparmiato finora: €${cumulatoTarget.toFixed(2)}.`;
  }
}

/* ---------- HANDLERS UI ---------- */
function cambiaPeriodo() {
  periodoCorrente.mese = document.getElementById("mese").value;
  periodoCorrente.anno = Number(document.getElementById("anno").value);
  aggiornaUI();
}

function aggiungiEntrata() {
  const desc = document.getElementById("descrizioneEntrata").value.trim();
  const imp = parseFloat(document.getElementById("importoEntrata").value);

  if (!desc || isNaN(imp)) { alert("Inserisci una descrizione e un importo valido."); return; }

  const k = keyPeriodo(periodoCorrente.mese, periodoCorrente.anno);
  if (!datiPerPeriodo[k]) datiPerPeriodo[k] = { entrate: [], spese: [], obiettivoMensile: null };
  datiPerPeriodo[k].entrate.push({ descrizione: desc, importo: imp });

  document.getElementById("descrizioneEntrata").value = "";
  document.getElementById("importoEntrata").value = "";

  salvaDati();
  aggiornaUI();
}

function aggiungiSpesa() {
  const desc = document.getElementById("descrizioneSpesa").value.trim();
  const imp = parseFloat(document.getElementById("importoSpesa").value);

  if (!desc || isNaN(imp)) { alert("Inserisci una descrizione e un importo valido."); return; }

  const k = keyPeriodo(periodoCorrente.mese, periodoCorrente.anno);
  if (!datiPerPeriodo[k]) datiPerPeriodo[k] = { entrate: [], spese: [], obiettivoMensile: null };
  datiPerPeriodo[k].spese.push({ descrizione: desc, importo: imp });

  document.getElementById("descrizioneSpesa").value = "";
  document.getElementById("importoSpesa").value = "";

  salvaDati();
  aggiornaUI();
}

function salvaObiettivoMensile() {
  // se è in auto, non salviamo niente (è calcolato)
  if (calcolaObiettivoMensileSuggerito() !== null) return;

  const val = parseFloat(document.getElementById("obiettivoMensile").value);
  if (isNaN(val)) { alert("Inserisci un numero valido per l'obiettivo mensile!"); return; }

  const k = keyPeriodo(periodoCorrente.mese, periodoCorrente.anno);
  if (!datiPerPeriodo[k]) datiPerPeriodo[k] = { entrate: [], spese: [], obiettivoMensile: null };
  datiPerPeriodo[k].obiettivoMensile = val;

  salvaDati();
  aggiornaUI();
}

/* ---------- OBIETTIVO CUMULATIVO ---------- */
function salvaObiettivoCumulativo() {
  const imp = parseFloat(document.getElementById("importoCumulativo").value);
  const meseT = document.getElementById("meseTarget").value;      // nome
  const annoT = Number(document.getElementById("annoTarget").value);

  if (isNaN(imp) || imp <= 0) { alert("Inserisci un importo cumulativo valido (>0)."); return; }

  obiettivoCumulativo = {
    amount: imp,
    meseTargetIdx: MESI.indexOf(meseT),
    annoTarget: annoT
  };
  salvaCumulativo();
  aggiornaUI(); // aggiorna anche l'auto mensile
}

/* ---------- RESET ---------- */
function azzeraTutto() {
  const conferma = confirm("⚠️ Sei sicuro di voler azzerare tutti i dati? Questa operazione è irreversibile.");
  if (!conferma) return;

  localStorage.removeItem("sereniFinanze_v2");
  localStorage.removeItem("sereniFinanze_cumulativo_v1");
  datiPerPeriodo = {};
  obiettivoCumulativo = null;
  aggiornaUI();
  alert("Tutti i dati sono stati cancellati.");
}

/* ---------- ON LOAD ---------- */
window.onload = () => {
  caricaDati();

  // Popola i select (mese/anno di lavoro)
  popolaSelectMesi(document.getElementById("mese"), periodoCorrente.mese);
  popolaSelectAnni(document.getElementById("anno"), periodoCorrente.anno);

  // Popola i select per l’obiettivo cumulativo (target)
  popolaSelectMesi(document.getElementById("meseTarget"), MESI[now.getMonth()]);
  popolaSelectAnni(document.getElementById("annoTarget"), now.getFullYear());

  aggiornaUI();
};
