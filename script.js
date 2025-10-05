/* SERENI FINANZE - script.js (v23 - PREMIUM ONLY - Error Fixed) */
/* Logica: Saldo per Periodo + Obiettivo Cumulativo/Mensile */

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

let datiPerPeriodo = {};              // { "gennaio-2025": {entrate:[],spese:[],obiettivoMensileManuale:Number} }
let obiettivoCumulativo = null;       // {name, target, start, monthlyGoal (calcolato/suggerito)}
let statoAbbonamento = {
    versione: 'premium', // FORZATO A PREMIUM
    dataAttivazione: new Date().toISOString(),
    giorniProvaRimanenti: 30 
};

let periodoCorrente = null; 

/* =========================
   Inizializzazione e Caricamento Dati
   ========================= */
function init() {
    // Carica tutti i dati
    datiPerPeriodo = JSON.parse(localStorage.getItem(STORE_MAIN)) || {};
    obiettivoCumulativo = JSON.parse(localStorage.getItem(STORE_CUM)) || null;
    
    // Imposta l'obiettivo cumulativo di default se non esiste, per evitare errori.
    if (!obiettivoCumulativo) {
        obiettivoCumulativo = {
            name: 'Viaggio dei Sogni',
            target: 5000,
            start: new Date().toISOString(),
            monthlyGoal: 100 // Quota di default
        };
        salvaDati();
    }

    // Imposta il periodo iniziale su quello attuale
    const today = new Date();
    const currentPeriodNum = periodToNum(today.getMonth(), today.getFullYear());
    periodoCorrente = numToPeriod(currentPeriodNum);

    renderApp();
}

function salvaDati() {
    localStorage.setItem(STORE_MAIN, JSON.stringify(datiPerPeriodo));
    localStorage.setItem(STORE_CUM, JSON.stringify(obiettivoCumulativo));
    localStorage.setItem(STORE_ABO, JSON.stringify(statoAbbonamento));
}

/* =========================
   Abbonamento (Semplificato a solo Premium)
   ========================= */
function attivaPremium() {
    statoAbbonamento.versione = 'premium';
    statoAbbonamento.giorniProvaRimanenti = 0; 
    salvaDati();
    renderApp();
    alert("Versione Premium Attivata!");
}

function calcolaStatoProva() {
    const dataAttivazione = new Date(statoAbbonamento.dataAttivazione);
    const today = new Date();
    const diffTime = Math.abs(today - dataAttivazione);
    const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24)); 
    const giorniIniziali = 30; // 30 giorni di prova

    if (statoAbbonamento.versione === 'premium' && statoAbbonamento.giorniProvaRimanenti > 0) {
        return Math.max(0, giorniIniziali - diffDays);
    }
    return 0;
}

/* =========================
   Logica Obiettivo e Saldo
   ========================= */

function getDatiMese(mIdx, anno) {
    const key = `${MESI[mIdx]}-${anno}`;
    if (!datiPerPeriodo[key]) {
        datiPerPeriodo[key] = {
            entrate: [],
            spese: [],
            obiettivoMensileManuale: null
        };
    }
    return datiPerPeriodo[key];
}

function calcolaSaldoPerMese(mIdx, anno) {
    const dati = getDatiMese(mIdx, anno);
    const totEntrate = dati.entrate.reduce((sum, e) => sum + e.amount, 0);
    const totSpese = dati.spese.reduce((sum, s) => sum + s.amount, 0);
    return { totEntrate, totSpese, saldo: totEntrate - totSpese };
}

function calcolaSaldoCumulativoFino(mIdx, anno) {
    let saldoCumulativo = 0;
    const periodNumFine = periodToNum(mIdx, anno);

    for (const key in datiPerPeriodo) {
        const [meseStr, annoStr] = key.split('-');
        const currentMIdx = idxMeseFromName(meseStr);
        const currentAnno = parseInt(annoStr);
        const currentPeriodNum = periodToNum(currentMIdx, currentAnno);

        if (currentPeriodNum <= periodNumFine) {
            const { saldo } = calcolaSaldoPerMese(currentMIdx, currentAnno);
            saldoCumulativo += saldo;
        }
    }
    return saldoCumulativo;
}

function calcolaGoalStatus(saldoCumulativo) {
    if (!obiettivoCumulativo || !obiettivoCumulativo.target) {
        return {
            progresso: 0, percent: 0, mancanti: 0, target: 0, nome: 'Non Impostato', mesiMancanti: 0, quotaMensile: 0
        };
    }
    
    const { target } = obiettivoCumulativo;
    const giaRisparmiato = saldoCumulativo;
    
    const rimanente = Math.max(0, target - giaRisparmiato);
    const percent = Math.min(100, (giaRisparmiato / target) * 100);
    const quotaMensile = obiettivoCumulativo.monthlyGoal || 100; 
    
    let mesiMancanti = 0;
    if (rimanente > 0 && quotaMensile > 0) {
        mesiMancanti = Math.ceil(rimanente / quotaMensile);
    }

    return {
        progresso: giaRisparmiato,
        percent: percent,
        mancanti: rimanente,
        target: target,
        mesiMancanti: mesiMancanti,
        quotaMensile: quotaMensile,
        nome: obiettivoCumulativo.name
    };
}


/* =========================
   Render della UI
   ========================= */

function renderSaldo() {
    const { mIdx, anno } = periodoCorrente;
    const { saldo } = calcolaSaldoPerMese(mIdx, anno);
    const saldoEl = document.getElementById('saldo');

    document.getElementById('labelPeriodo').textContent = `${cap(MESI[mIdx])} ${anno}`;

    if (saldoEl) {
        saldoEl.innerHTML = `<span class="${saldo >= 0 ? 'positivo' : 'negativo'}">${(saldo >= 0 ? '' : '') + fmt(Math.abs(saldo))}</span>`;
    }
}

function renderObiettivo() {
    const { mIdx, anno } = periodoCorrente;
    const saldoCumulativo = calcolaSaldoCumulativoFino(mIdx, anno);
    const goalStatus = calcolaGoalStatus(saldoCumulativo);
    const obiettivoEl = document.getElementById('obiettivo');
    const goalTitleEl = document.getElementById('goalTitle');
    const inputMensile = document.getElementById('obiettivoMensileManuale');

    if (obiettivoEl && obiettivoCumulativo) {
        goalTitleEl.textContent = `💰 Obiettivo: ${goalStatus.nome}`;
            
        let infoMesi = '';
        if (goalStatus.mesiMancanti > 0) {
             infoMesi = `| Mancano: <span class="goal-months">${goalStatus.mesiMancanti} mesi</span>`;
        } else if (goalStatus.progresso >= goalStatus.target) {
             infoMesi = `| <span class="goal-months" style="color: var(--success-green);">OBIETTIVO RAGGIUNTO! 🎉</span>`;
        }

        obiettivoEl.innerHTML = `
            <div class="goal-status">
                <p style="font-size: 1.1rem; font-weight: 700;">Progresso: ${fmt(goalStatus.progresso)} / ${fmt(goalStatus.target)}</p>
                <div class="goal-bar-container">
                    <div class="goal-bar" style="width: ${goalStatus.percent}%;"></div>
                </div>
                <div class="goal-info">
                    <span>${Math.round(goalStatus.percent)}% completato</span>
                    <span>Risparmio Mensile: <strong style="color: var(--primary-blue)">${fmt(goalStatus.quotaMensile)}</strong> ${infoMesi}</span>
                </div>
            </div>
        `;
            
        // Se c'è un dato salvato manualmente per il mese corrente, usalo. Altrimenti, usa la quota calcolata dal cumulativo.
        const datiMese = getDatiMese(mIdx, anno);
        inputMensile.value = datiMese.obiettivoMensileManuale !== null ? datiMese.obiettivoMensileManuale : goalStatus.quotaMensile;

    } else if (obiettivoEl) {
        // Render quando l'obiettivo cumulativo NON è ancora impostato
        obiettivoEl.innerHTML = `
            <span class="text-secondary">Nessun obiettivo impostato.</span>
            <p style="font-size: 0.9rem; font-weight: 500; margin-top: 10px;">Imposta il tuo obiettivo mensile per definire il target cumulativo.</p>
        `;
        goalTitleEl.textContent = '🎯 Imposta il Tuo Obiettivo';
        if (inputMensile) inputMensile.value = ''; // Pulisci se non c'è obiettivo
    }
}

function renderAbbonamento() {
    const versioneAttiva = document.getElementById('versioneAttiva');
    const btnAttiva = document.querySelector('.notice .pro');

    if (statoAbbonamento.versione === 'premium') {
        const giorniRimanenti = calcolaStatoProva();
        
        if (giorniRimanenti > 0) {
             versioneAttiva.innerHTML = `⏳ Periodo di prova: <span id="giorniProva">${giorniRimanenti}</span> giorni rimanenti`;
             versioneAttiva.style.backgroundColor = 'var(--action-orange)';
             if (btnAttiva) btnAttiva.textContent = 'Attiva Ora';
        } else {
             versioneAttiva.textContent = '✅ Versione Premium attiva';
             versioneAttiva.style.backgroundColor = 'var(--success-green)';
             if (btnAttiva) btnAttiva.style.display = 'none'; // Nascondi se Premium è attiva
        }
    } else {
         // Stato teorico ma non raggiungibile in questa implementazione (dovrebbe essere sempre Premium)
         versioneAttiva.textContent = '⚠ Errore Stato';
         versioneAttiva.style.backgroundColor = 'var(--danger-red)';
    }
}

function renderApp() {
    renderAbbonamento();
    renderSaldo();
    renderObiettivo();
}

/* =========================
   Gestione Eventi Utente
   ========================= */

function changePeriod(delta) {
    const currentNum = periodToNum(periodoCorrente.mIdx, periodoCorrente.anno);
    const newNum = currentNum + delta;
    periodoCorrente = numToPeriod(newNum);
    renderApp();
}

function toggleForm(tipo) {
    document.querySelectorAll('.form-section').forEach(form => {
        form.classList.add('hidden');
    });
    const formId = (tipo === 'entrata') ? 'formEntrata' : 'formSpesa';
    document.getElementById(formId).classList.remove('hidden');
}

function salvaMovimento(tipo) {
    const { mIdx, anno } = periodoCorrente;
    const dati = getDatiMese(mIdx, anno);
    let amount, desc, cat = null;

    if (tipo === 'entrata') {
        amount = parseFloat(document.getElementById('entrataImporto').value);
        desc = document.getElementById('entrataDesc').value;
    } else {
        amount = parseFloat(document.getElementById('spesaImporto').value);
        desc = document.getElementById('spesaDesc').value;
        cat = document.getElementById('spesaCat').value;
    }

    if (isNaN(amount) || amount <= 0 || !desc) {
        alert("Inserisci un importo valido e una descrizione.");
        return;
    }

    const nuovoMovimento = {
        amount: amount,
        desc: desc,
        cat: cat,
        timestamp: Date.now()
    };

    if (tipo === 'entrata') {
        dati.entrate.push(nuovoMovimento);
    } else {
        dati.spese.push(nuovoMovimento);
    }

    // Pulisci i form e nascondili
    document.getElementById('formEntrata').classList.add('hidden');
    document.getElementById('formSpesa').classList.add('hidden');
    document.getElementById('entrataImporto').value = '';
    document.getElementById('entrataDesc').value = '';
    document.getElementById('spesaImporto').value = '';
    document.getElementById('spesaDesc').value = '';

    salvaDati();
    renderApp();
}

function salvaObiettivoMensile() {
    const { mIdx, anno } = periodoCorrente;
    const datiMese = getDatiMese(mIdx, anno);
    
    // *** CORREZIONE ERRORE: Controlla che l'elemento esista ***
    const inputElement = document.getElementById('obiettivoMensileManuale');
    if (!inputElement) {
        console.error("Elemento 'obiettivoMensileManuale' non trovato.");
        return;
    }
    
    const obiettivoMensileManuale = parseFloat(inputElement.value);

    if (isNaN(obiettivoMensileManuale) || obiettivoMensileManuale < 0) {
        alert("Inserisci un importo valido per l'obiettivo mensile (es. 100).");
        return;
    }

    datiMese.obiettivoMensileManuale = obiettivoMensileManuale;
    
    // Aggiorna l'obiettivo mensile di riferimento per il calcolo cumulativo (mesi mancanti)
    if (obiettivoCumulativo) {
        obiettivoCumulativo.monthlyGoal = obiettivoMensileManuale;
    } else {
         // Se non esiste, crea un obiettivo cumulativo con un target a 5000 di default
         obiettivoCumulativo = {
            name: 'Obiettivo di Risparmio Iniziale',
            target: 5000,
            start: new Date().toISOString(),
            monthlyGoal: obiettivoMensileManuale
        };
    }


    salvaDati();
    renderApp();
    alert(`Obiettivo di risparmio mensile per ${cap(MESI[mIdx])} ${anno} salvato: ${fmt(obiettivoMensileManuale)}`);
}

// Funzioni del Modal (Mantengono la logica esistente)
function apriModalMovimenti() {
  const modal = document.getElementById("modalMovimenti");
  if(!modal) return;
  
  const { mIdx, anno } = periodoCorrente;
  const dati = getDatiMese(mIdx, anno);
  const { totEntrate, totSpese, saldo } = calcolaSaldoPerMese(mIdx, anno);
  
  const elME = modal.querySelector("#vm-meseanno");
  const elTE = modal.querySelector("#vm-tot-entrate");
  const elTS = modal.querySelector("#vm-tot-spese");
  const elSN = modal.querySelector("#vm-saldo");
  const elListEntrate = modal.querySelector("#vm-lista-entrate");
  const elListSpese = modal.querySelector("#vm-lista-spese");

  elListEntrate.innerHTML = '';
  dati.entrate.sort((a,b) => b.timestamp - a.timestamp).forEach(e => {
    elListEntrate.innerHTML += `<li><strong>${e.desc}</strong>${fmt(e.amount)}</li>`;
  });

  elListSpese.innerHTML = '';
  dati.spese.sort((a,b) => b.timestamp - a.timestamp).forEach(s => {
    // Aggiungi la categoria (cat) al modal
    const catDisplay = s.cat ? ` (${s.cat})` : '';
    elListSpese.innerHTML += `<li><strong>${s.desc}${catDisplay}</strong>${fmt(s.amount)}</li>`;
  });

  if(elME) elME.textContent = cap(MESI[mIdx]) + " " + anno;
  if(elTE) elTE.textContent = fmt(totEntrate);
  if(elTS) elTS.textContent = fmt(totSpese);
  if(elSN) elSN.innerHTML = `<span class="${saldo>=0? 'positivo' : 'negativo'}">${(saldo>=0? '' : '') + fmt(Math.abs(saldo))}</span>`;

  modal.classList.add("is-open");
  const title = modal.querySelector("#vm-title");
  if(title) title.focus();
}

function chiudiModalMovimenti(){
  const modal = document.getElementById("modalMovimenti");
  if(!modal) return;
  modal.classList.remove("is-open");
}

function azzeraTutto() {
    if (confirm("Sei sicuro di voler AZZERARE TUTTI I DATI SALVATI (saldo, obiettivi)? Questa azione è IRREVERSIBILE.")) {
        localStorage.clear();
        alert("Dati azzerati. Ricarica la pagina per ricominciare.");
        window.location.reload();
    }
}


// Wiring al load 
window.addEventListener("DOMContentLoaded", ()=> {
  init();
  
  const btn = document.getElementById("btnVediMovimenti");
  if(btn) btn.addEventListener("click", apriModalMovimenti);

  const modal = document.getElementById("modalMovimenti");
  if(modal){
    modal.addEventListener("click", (ev)=> {
      const t = ev.target;
      if(t && t.getAttribute("data-close")) chiudiModalMovimenti();
    });
  }

  document.addEventListener("keydown", (ev)=> {
    if(ev.key === "Escape") chiudiModalMovimenti();
  });
});
