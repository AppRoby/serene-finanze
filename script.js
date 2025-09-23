const MESI=["gennaio","febbraio","marzo","aprile","maggio","giugno","luglio","agosto","settembre","ottobre","novembre","dicembre"];
const cap=s=>s.charAt(0).toUpperCase()+s.slice(1);

let datiPerPeriodo={},periodoCorrente={mese:"",anno:0};
function caricaDati(){
  const now=new Date();
  periodoCorrente.mese=MESI[now.getMonth()];
  periodoCorrente.anno=now.getFullYear();
}
function ensurePeriodo(mese,anno){
  const key=`${mese}-${anno}`;
  if(!datiPerPeriodo[key]) datiPerPeriodo[key]={entrate:[],spese:[],obiettivoMensile:null};
  return datiPerPeriodo[key];
}
function cambiaPeriodo(){
  periodoCorrente.mese=document.getElementById("mese").value;
  periodoCorrente.anno=Number(document.getElementById("anno").value);
  aggiornaUI();
}
function popolaSelectMesiEAnni(){
  const annoNow=new Date().getFullYear();
  const anni=[];for(let y=annoNow-2;y<=annoNow+5;y++)anni.push(y);
  const mesiSelect=["mese","meseInizioTarget","meseTarget","meseAnnuale","meseMensile"];
  mesiSelect.forEach(id=>{
    const sel=document.getElementById(id);if(!sel)return;
    sel.innerHTML="";MESI.forEach(m=>{const opt=document.createElement("option");opt.value=m;opt.text=cap(m);sel.appendChild(opt);});
  });
  const anniSelect=["anno","annoInizioTarget","annoTarget","annoAnnuale","annoMensile"];
  anniSelect.forEach(id=>{
    const sel=document.getElementById(id);if(!sel)return;
    sel.innerHTML="";anni.forEach(y=>{const opt=document.createElement("option");opt.value=y;opt.text=y;sel.appendChild(opt);});
  });
  document.getElementById("mese").value=periodoCorrente.mese;
  document.getElementById("anno").value=periodoCorrente.anno;
}
function aggiornaUI(){
  document.getElementById("labelPeriodo").innerText=`${cap(periodoCorrente.mese)} ${periodoCorrente.anno}`;
  document.getElementById("meseObiettivo").innerText=`${cap(periodoCorrente.mese)} ${periodoCorrente.anno}`;
}
function aggiungiEntrata(){/* logica aggiunta entrate */}
function aggiungiSpesa(){/* logica aggiunta spese */}
function salvaObiettivoMensile(){}
function salvaObiettivoCumulativo(){}

function init(){caricaDati();popolaSelectMesiEAnni();aggiornaUI();}
window.addEventListener("DOMContentLoaded",init);
