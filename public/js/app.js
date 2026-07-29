"use strict";
/* ===================== Dictionnaire ===================== */
let WORDS=[];
function lb(t){let lo=0,hi=WORDS.length;while(lo<hi){const m=(lo+hi)>>1;if(WORDS[m]<t)lo=m+1;else hi=m;}return lo;}
function isWord(s){const i=lb(s);return i<WORDS.length&&WORDS[i]===s;}
function isPrefix(s){const i=lb(s);return i<WORDS.length&&WORDS[i].startsWith(s);}
async function loadDict(){
  // Le dictionnaire est un .gz externe. On le récupère puis on le décompresse
  // dans le navigateur. Certains hébergeurs servent .gz déjà décompressé
  // (Content-Encoding: gzip) : on gère les deux cas.
  const buf=await (await fetch('data/dict.txt.gz')).arrayBuffer();
  const isGzip=buf.byteLength>1&&new Uint8Array(buf)[0]===0x1f&&new Uint8Array(buf)[1]===0x8b;
  let text;
  if(isGzip){
    if(!('DecompressionStream' in window)) throw new Error('nods');
    const stream=new Blob([buf]).stream().pipeThrough(new DecompressionStream('gzip'));
    text=await new Response(stream).text();
  }else{
    text=new TextDecoder().decode(buf);
  }
  WORDS=text.split('\n');
}

/* ===================== Valeurs & barème ===================== */
const LV={a:1,e:1,i:1,l:1,n:1,o:1,r:1,s:1,t:1,u:1,d:2,g:2,m:2,b:3,c:3,p:3,f:4,h:4,v:4,j:6,q:6,k:7,w:7,x:7,y:7,z:7};
function tileValue(letters){let v=0;for(const c of letters)v+=LV[c]||0;return v;}
const MULT={3:0.8,4:1.4,5:1.8,6:2.3,7:2.9,8:3.6,9:4.4};
function lenMult(n){return n>=10?5.2:(MULT[n]||0);}

/* ===================== RNG déterministe ===================== */
function hashStr(s){let h=2166136261>>>0;for(let i=0;i<s.length;i++){h^=s.charCodeAt(i);h=Math.imul(h,16777619);}return h>>>0;}
function mulberry32(a){return function(){a|=0;a=a+0x6D2B79F5|0;let t=Math.imul(a^a>>>15,1|a);t=t+Math.imul(t^t>>>7,61|t)^t;return((t^t>>>14)>>>0)/4294967296;};}
function pick(rng,arr){return arr[Math.floor(rng()*arr.length)];}
function weighted(rng,pairs){let tot=0;for(const p of pairs)tot+=p[1];let r=rng()*tot;for(const p of pairs){r-=p[1];if(r<0)return p[0];}return pairs[pairs.length-1][0];}

/* ===================== Génération de grille ===================== */
const VOWELS=[["e",30],["a",16],["i",15],["o",11],["u",13]];
const CONS=[["s",12],["n",11],["r",11],["t",12],["l",9],["d",6],["c",5],["m",5],["p",5],["v",3],["f",2],["b",2],["g",2],["h",2],["j",1],["x",1],["y",2],["z",1],["k",1],["w",1]];
const DIGRAPHS=["qu","ch","ou","on","en","in","ai","eu","an","ss","te","re"];
function buildAdj(size){const adj=[],n=size*size;for(let i=0;i<n;i++){const r=Math.floor(i/size),c=i%size,list=[];for(let dr=-1;dr<=1;dr++)for(let dc=-1;dc<=1;dc++){if(!dr&&!dc)continue;const nr=r+dr,nc=c+dc;if(nr>=0&&nr<size&&nc>=0&&nc<size)list.push(nr*size+nc);}adj.push(list);}return adj;}
let SIZE=5, N=25, ADJ=buildAdj(5);
function makeGridLetters(rng){
  const nV=Math.max(2,Math.round(N*0.4)-1+Math.floor(rng()*3));
  const cells=[];
  for(let i=0;i<nV;i++)cells.push(weighted(rng,VOWELS));
  for(let i=nV;i<N;i++)cells.push(weighted(rng,CONS));
  for(let i=cells.length-1;i>0;i--){const j=Math.floor(rng()*(i+1));[cells[i],cells[j]]=[cells[j],cells[i]];}
  const nDg=N>=30?2:1;
  for(let d=0;d<nDg;d++)if(rng()<0.8){const dg=rng()<0.5?"qu":pick(rng,DIGRAPHS);cells[Math.floor(rng()*N)]=dg;}
  return cells.map(l=>({letters:l}));
}
function scoreOf(path,board){let base=0,chars=0,bonus=1;for(const idx of path){base+=tileValue(board.tiles[idx].letters);chars+=board.tiles[idx].letters.length;if(idx===board.bonus)bonus=2;}return{score:Math.round(base*lenMult(chars)*bonus),chars,mult:lenMult(chars),bonus};}
function solveBoard(board,minLen){
  const res=new Map();const visited=new Array(N).fill(false);const tiles=board.tiles;
  function dfs(i,prefix,path){const cur=prefix+tiles[i].letters;if(!isPrefix(cur))return;visited[i]=true;path.push(i);
    if(cur.length>=minLen&&isWord(cur)){const s=scoreOf(path,board).score;const p=res.get(cur);if(!p||s>p.score)res.set(cur,{score:s,path:path.slice()});}
    if(cur.length<9)for(const j of ADJ[i])if(!visited[j])dfs(j,cur,path);visited[i]=false;path.pop();}
  for(let i=0;i<N;i++)dfs(i,"",[]);
  return res;
}
function genBoard(baseSeed,round){
  const THR=SIZE<=4?18:SIZE===5?70:130;let best=null;
  for(let k=0;k<12;k++){const rng=mulberry32(hashStr(baseSeed+":"+round+":"+k+":s"+SIZE));const tiles=makeGridLetters(rng);const bonus=Math.floor(rng()*N);const board={tiles,bonus};const sol=solveBoard(board,3);board.solution=sol;if(!best||sol.size>best.solution.size)best=board;if(sol.size>=THR)return board;}
  return best;
}

/* ===================== Sudoku : génération ===================== */
function sBoxOf(r,c){return (((r/3)|0)*3)+((c/3)|0);}
function genFullSudoku(rng){
  const g=new Int8Array(81);
  const rows=new Array(9).fill(0),cols=new Array(9).fill(0),boxes=new Array(9).fill(0);
  function tryFill(pos){
    if(pos===81)return true;
    const r=(pos/9)|0,c=pos%9,b=sBoxOf(r,c);
    const cand=[];
    for(let d=1;d<=9;d++){const bit=1<<d;if(!(rows[r]&bit)&&!(cols[c]&bit)&&!(boxes[b]&bit))cand.push(d);}
    for(let i=cand.length-1;i>0;i--){const j=Math.floor(rng()*(i+1));const t=cand[i];cand[i]=cand[j];cand[j]=t;}
    for(const d of cand){
      const bit=1<<d;g[pos]=d;rows[r]|=bit;cols[c]|=bit;boxes[b]|=bit;
      if(tryFill(pos+1))return true;
      g[pos]=0;rows[r]&=~bit;cols[c]&=~bit;boxes[b]&=~bit;
    }
    return false;
  }
  tryFill(0);
  return g;
}
function sCountSolutions(gIn,limit){
  const g=Int8Array.from(gIn);
  const rows=new Array(9).fill(0),cols=new Array(9).fill(0),boxes=new Array(9).fill(0);
  for(let i=0;i<81;i++)if(g[i]){const r=(i/9)|0,c=i%9,b=sBoxOf(r,c),bit=1<<g[i];rows[r]|=bit;cols[c]|=bit;boxes[b]|=bit;}
  let count=0;
  function solve(){
    if(count>=limit)return;
    let best=-1,bestCands=null,bestLen=10;
    for(let i=0;i<81;i++){
      if(g[i])continue;
      const r=(i/9)|0,c=i%9,b=sBoxOf(r,c);const cands=[];
      for(let d=1;d<=9;d++){const bit=1<<d;if(!(rows[r]&bit)&&!(cols[c]&bit)&&!(boxes[b]&bit))cands.push(d);}
      if(cands.length===0)return;
      if(cands.length<bestLen){bestLen=cands.length;best=i;bestCands=cands;if(bestLen===1)break;}
    }
    if(best===-1){count++;return;}
    const r=(best/9)|0,c=best%9,b=sBoxOf(r,c);
    for(const d of bestCands){
      if(count>=limit)return;
      const bit=1<<d;g[best]=d;rows[r]|=bit;cols[c]|=bit;boxes[b]|=bit;
      solve();
      g[best]=0;rows[r]&=~bit;cols[c]&=~bit;boxes[b]&=~bit;
      if(count>=limit)return;
    }
  }
  solve();
  return count;
}
function sDig(full,targetClues,rng){
  const g=Int8Array.from(full);
  const order=[...Array(81).keys()];
  for(let i=order.length-1;i>0;i--){const j=Math.floor(rng()*(i+1));const t=order[i];order[i]=order[j];order[j]=t;}
  let clues=81;
  for(const pos of order){
    if(clues<=targetClues)break;
    if(g[pos]===0)continue;
    const saved=g[pos];g[pos]=0;
    if(sCountSolutions(g,2)!==1){g[pos]=saved;}else{clues--;}
  }
  return g;
}
const S_UNITS=(()=>{
  const u=[];
  for(let r=0;r<9;r++){const a=[];for(let c=0;c<9;c++)a.push(r*9+c);u.push(a);}
  for(let c=0;c<9;c++){const a=[];for(let r=0;r<9;r++)a.push(r*9+c);u.push(a);}
  for(let b=0;b<9;b++){const br=((b/3)|0)*3,bc=(b%3)*3;const a=[];for(let r=0;r<3;r++)for(let c=0;c<3;c++)a.push((br+r)*9+(bc+c));u.push(a);}
  return u;
})();
function sSolveSingles(gIn){
  const g=Int8Array.from(gIn);
  const rows=new Array(9).fill(0),cols=new Array(9).fill(0),boxes=new Array(9).fill(0);
  for(let i=0;i<81;i++)if(g[i]){const r=(i/9)|0,c=i%9,b=sBoxOf(r,c),bit=1<<g[i];rows[r]|=bit;cols[c]|=bit;boxes[b]|=bit;}
  function candsOf(i){if(g[i])return null;const r=(i/9)|0,c=i%9,b=sBoxOf(r,c);const cands=[];for(let d=1;d<=9;d++){const bit=1<<d;if(!(rows[r]&bit)&&!(cols[c]&bit)&&!(boxes[b]&bit))cands.push(d);}return cands;}
  let progress=true;
  while(progress){
    progress=false;
    for(let i=0;i<81;i++){
      if(g[i])continue;
      const cands=candsOf(i);
      if(cands.length===1){const d=cands[0],r=(i/9)|0,c=i%9,b=sBoxOf(r,c),bit=1<<d;g[i]=d;rows[r]|=bit;cols[c]|=bit;boxes[b]|=bit;progress=true;}
    }
    for(const unit of S_UNITS){
      for(let d=1;d<=9;d++){
        let where=-1,n=0;
        for(const i of unit){if(g[i])continue;const cands=candsOf(i);if(cands.includes(d)){n++;where=i;if(n>1)break;}}
        if(n===1){const r=(where/9)|0,c=where%9,b=sBoxOf(r,c),bit=1<<d;g[where]=d;rows[r]|=bit;cols[c]|=bit;boxes[b]|=bit;progress=true;}
      }
    }
  }
  let filled=0;for(let i=0;i<81;i++)if(g[i])filled++;
  return {solved:filled===81,filled};
}
function genSudoku(baseSeed,round,diff){
  const targets={facile:38,moyen:30,difficile:26};
  const target=targets[diff]||30;
  const maxTries=12;let candidate=null;
  for(let k=0;k<maxTries;k++){
    const rng=mulberry32(hashStr(baseSeed+':sud:'+round+':'+k+':'+diff));
    const full=genFullSudoku(rng);
    const given=sDig(full,target,rng);
    const singlesOk=sSolveSingles(given).solved;
    const wantOk=(diff==='difficile')?!singlesOk:singlesOk;
    if(!candidate)candidate={given,solution:full};
    if(wantOk){candidate={given,solution:full};break;}
  }
  return candidate;
}

/* ===================== Helpers UI ===================== */
const $=id=>document.getElementById(id);
let currentScreen='home';
function show(id){currentScreen=id;document.querySelectorAll('.screen').forEach(s=>s.classList.toggle('on',s.id===id));window.scrollTo(0,0);}
function cssVar(v){return getComputedStyle(document.documentElement).getPropertyValue(v).trim();}
function toast(msg){const t=$('toast');t.textContent=msg;t.classList.add('on');clearTimeout(toast._t);toast._t=setTimeout(()=>t.classList.remove('on'),1800);}

/* ===================== Réseau (Trystero) ===================== */
const selfId = window.Trystero ? window.Trystero.selfId : 'local';
let room=null, act={}, netReady=false;
let ME={name:'Joueur',t:0};
let peers={};
let cfg={size:5,time:90,rounds:3,min:3,public:false,name:'',game:'words',diff:'moyen'};
let curRoomId='', curRoomName='', curPassword='';
let seedBase=null, curRound=0;
let live={};
let roundData={};
let finished=new Set();
let totals={};
let shownRound=-1;
let finishTimeout=null;

function rosterIds(){return [selfId,...Object.keys(peers)].sort();}
function joinT(id){return id===selfId?ME.t:((peers[id]&&peers[id].t!=null)?peers[id].t:Infinity);}
function hostId(){
  const ids=rosterIds();let best=ids[0];
  for(const id of ids){const t=joinT(id),bt=joinT(best);if(t<bt||(t===bt&&id<best))best=id;}
  return best;
}
function isHost(){return hostId()===selfId;}
function nameFor(id){return id===selfId?ME.name:(peers[id]&&peers[id].name)||'Joueur';}

function joinNet(code,password){
  if(!window.Trystero){toast("Réseau P2P indisponible ici");return;}
  const conf={appId:'liane-p2p-v1'};if(password)conf.password=password;
  room=window.Trystero.joinRoom(conf,'room:'+code);
  act.prof=room.makeAction('prof');
  act.cfg =room.makeAction('cfg');
  act.go  =room.makeAction('go');
  act.scr =room.makeAction('scr');
  act.fin =room.makeAction('fin');
  act.end =room.makeAction('end');
  act.rmz =room.makeAction('rmz');
  act.pz  =room.makeAction('pz');

  act.prof.onMessage=(p,{peerId})=>{peers[peerId]=peers[peerId]||{};if(p&&typeof p==='object'){peers[peerId].name=String(p.name||'Joueur').slice(0,14);if(p.t!=null)peers[peerId].t=p.t;}else{peers[peerId].name=String(p).slice(0,14);}refreshRoster();};
  act.cfg.onMessage =(c,{peerId})=>{if(peerId===hostId()&&!isHost()){cfg=Object.assign({},cfg,c);if(currentScreen==='lobby')renderLobby();else reflectSettings();}};
  act.go.onMessage  =(d,{peerId})=>{if(peerId===hostId())startRoundNet(d.round,d.seed);};
  act.scr.onMessage =(d,{peerId})=>{if(!d||d.round!==curRound)return;live[peerId]={score:+d.score||0,count:+d.count||0};updateScoreboard();};
  act.fin.onMessage =(d,{peerId})=>{
    if(!d||d.round!==curRound)return;
    if(d.g==='sudoku'){
      const st=String(d.status||'');const time=(d.time==null)?null:(+d.time||0);
      if(st==='won'&&sudokuWinner===null){sudokuWinner=peerId;if(currentScreen==='splay'&&!sSettled)showSudWinnerOverlay(peerId);}
      sudokuResults[peerId]={status:st,time};
      renderSudokuStatus();checkAllFinished();
      return;
    }
    const ws=Array.isArray(d.words)?d.words.slice(0,400).map(w=>({word:String((w&&w.w)||'').slice(0,24),score:+((w&&w.s))||0,bonus:!!(w&&w.b)})):[];
    roundData[peerId]={words:ws,total:+d.total||0};finished.add(peerId);updateScoreboard();checkAllFinished();
  };
  act.end.onMessage =(d,{peerId})=>{if(peerId===hostId())showResults();};
  act.rmz.onMessage =(d,{peerId})=>{if(peerId===hostId()){totals={};toast("L'hôte relance une partie");}};
  act.pz.onMessage  =(d)=>{setPaused(!!d.p,d.who);};

  room.onPeerJoin=id=>{peers[id]=peers[id]||{name:'Joueur'};if(act.prof)act.prof.send({name:ME.name,t:ME.t},{target:id});if(isHost()&&act.cfg)act.cfg.send(cfg,{target:id});refreshRoster();};
  room.onPeerLeave=id=>{delete peers[id];delete live[id];refreshRoster();checkAllFinished();};

  pollReady();
}
function leaveNet(){try{if(room)room.leave();}catch(e){}room=null;act={};peers={};live={};roundData={};finished=new Set();totals={};curRound=0;shownRound=-1;netReady=false;}

/* ---- Découverte : salon P2P partagé qui sert d'annuaire ---- */
let salon=null, salonAct={}, rooms={};
function slug(s){return (s||'').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g,'').replace(/[^a-z0-9]+/g,'-').replace(/^-+|-+$/g,'').slice(0,24);}
function escapeHtml(s){return (s||'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));}
function joinSalon(){
  if(salon||!window.Trystero)return;
  salon=window.Trystero.joinRoom({appId:'liane-p2p-v1'},'lobby:v1');
  salonAct.ann=salon.makeAction('ann');
  salonAct.ann.onMessage=(d)=>{
    if(!d||!d.id)return;
    if(d.gone){delete rooms[d.id];}
    else rooms[d.id]={id:d.id,name:d.name||d.id,count:d.count||1,locked:!!d.locked,playing:!!d.playing,host:d.host||null,seen:Date.now()};
    if(currentScreen==='home')renderRoomList();
  };
  salon.onPeerJoin=id=>{if(amPublicHost())sendAnnounce(id);};
  salon.onPeerLeave=pid=>{
    let ch=false;
    for(const k in rooms){if(rooms[k].host&&rooms[k].host===pid){delete rooms[k];ch=true;}}
    if(ch&&currentScreen==='home')renderRoomList();
  };
  // rafraîchissement + expiration de secours des rooms muettes
  setInterval(()=>{
    if(amPublicHost())sendAnnounce();
    const now=Date.now();let ch=false;
    for(const k in rooms){if(now-rooms[k].seen>6000){delete rooms[k];ch=true;}}
    if(ch&&currentScreen==='home')renderRoomList();
  },2000);
  // statut réseau accueil
  let tries=0;const iv=setInterval(()=>{tries++;let open=false;
    try{const s=window.Trystero.getRelaySockets();open=Object.values(s).some(w=>w&&w.readyState===1);}catch(e){}
    const st=$('home-status');
    if(open){st.className='status ok';$('home-status-txt').textContent='En ligne';clearInterval(iv);}
    else if(tries>=25){st.className='status bad';$('home-status-txt').textContent='Réseau indisponible';clearInterval(iv);}
  },1000);
}
function amPublicHost(){return !!(room&&isHost()&&cfg.public&&curRoomId);}
function sendAnnounce(target){
  if(!salon||!salonAct.ann||!curRoomId)return;
  const p={id:curRoomId,name:cfg.name||curRoomName||curRoomId,count:rosterIds().length,locked:!!curPassword,playing:curRound>0,host:selfId};
  if(target)salonAct.ann.send(p,{target});else salonAct.ann.send(p);
}
function announceGone(){if(salon&&salonAct.ann&&curRoomId&&cfg.public){try{salonAct.ann.send({id:curRoomId,gone:true});}catch(e){}}}
function renderRoomList(){
  const box=$('room-list');if(!box)return;
  const list=Object.values(rooms).sort((a,b)=>(a.playing-b.playing)||(b.count-a.count)||a.name.localeCompare(b.name));
  if(!list.length){box.innerHTML='<div class="rl-empty">Aucune room publique en ligne pour l’instant.<br>Crée-en une, ou rejoins par code.</div>';return;}
  box.innerHTML=list.map(r=>`<button class="rl-item" data-id="${escapeHtml(r.id)}" data-name="${escapeHtml(encodeURIComponent(r.name))}" data-locked="${r.locked?1:0}">
    <span class="rl-name">${escapeHtml(r.name)}</span>
    <span class="rl-meta">${r.locked?'<span class="lk">privé</span> · ':''}${r.count} joueur${r.count>1?'s':''}${r.playing?' · en jeu':''}</span></button>`).join('');
  [...box.querySelectorAll('.rl-item')].forEach(el=>el.addEventListener('click',()=>tapRoom(el.dataset.id,decodeURIComponent(el.dataset.name),el.dataset.locked==='1')));
}
function tapRoom(id,name,locked){
  if(!ensureName())return;
  if(locked)openPasswordModal(id,name);
  else enterRoom(id,name,'');
}

function pollReady(){
  let tries=0;
  const iv=setInterval(()=>{
    tries++;let open=false;
    try{const s=window.Trystero.getRelaySockets();open=Object.values(s).some(w=>w&&w.readyState===1);}catch(e){}
    if(open&&!netReady){netReady=true;setStatus('ok','En ligne — partage le code');}
    updateLobbyButtons();
    if(tries>=25)clearInterval(iv);
  },1000);
}
function setStatus(kind,txt){const s=$('status');s.className='status'+(kind?' '+kind:'');$('status-txt').textContent=txt;}

function refreshRoster(){
  if(amPublicHost())sendAnnounce();
  if(currentScreen==='lobby')renderLobby();
  else if(currentScreen==='correction')renderCorrection();
  else if(currentScreen==='results')renderResults();
  if(currentScreen==='play'||currentScreen==='waiting')updateScoreboard();
  updateLobbyButtons();
}

/* ===================== Accueil ===================== */
function ensureName(){const n=($('name').value||'').trim().slice(0,14);if(n)ME.name=n;if(!ME.name){toast('Choisis un pseudo');try{$('name').focus();}catch(e){}return false;}return true;}

function enterRoom(id,name,password){
  if(!ensureName())return;
  leaveNet();
  ME.t=Date.now();
  curRoomId=id;curRoomName=name;curPassword=password||'';
  cfg.name=name;cfg.public=false; // sera écrasé par la config de l'hôte si on rejoint
  joinNet(id,password);
  totals={};
  renderLobby();
  setStatus('','Connexion au réseau…');
  show('lobby');
}
function createRoom(name,isPublic,password){
  if(!ensureName())return;
  name=(name||'').trim().slice(0,24)||'Room de '+ME.name;
  const base=slug(name)||'room';
  const id=isPublic?(base+'-'+Math.random().toString(36).slice(2,6)):base;
  leaveNet();
  ME.t=Date.now();
  curRoomId=id;curRoomName=name;curPassword=password||'';
  joinNet(id,password);
  cfg.name=name;cfg.public=isPublic;
  if(act.cfg)act.cfg.send(cfg);
  if(amPublicHost())sendAnnounce();
  totals={};
  renderLobby();
  setStatus('','Connexion au réseau…');
  show('lobby');
}

function openCreateModal(){
  if(!ensureName())return;
  openModal('Créer une room',body=>{
    body.innerHTML=`
      <label class="modal-lab">Nom de la room</label>
      <input id="cr-name" class="modal-search" type="text" maxlength="24" placeholder="ex : Soirée mardi" autocomplete="off">
      <label class="modal-lab">Visibilité</label>
      <div class="modal-seg" id="cr-vis">
        <button data-v="1" aria-pressed="true">Publique</button>
        <button data-v="0">Privée</button>
      </div>
      <label class="modal-lab">Mot de passe (optionnel)</label>
      <input id="cr-pass" class="modal-search" type="text" placeholder="laisse vide si pas besoin" autocomplete="off" autocapitalize="off" spellcheck="false">
      <p class="modal-note" id="cr-note" style="margin:2px 0 14px"></p>
      <button class="btn" id="cr-go">Créer la room</button>`;
    let pub=1;
    const note=body.querySelector('#cr-note');
    function setNote(){note.innerHTML=pub?'<b>Publique</b> : visible dans la liste, tout le monde peut la voir et la rejoindre (le mot de passe protège quand même l’entrée).':'<b>Privée</b> : invisible dans la liste. Rejoignable seulement avec son code, que tu partages toi-même.';}
    setNote();
    body.querySelectorAll('#cr-vis button').forEach(b=>b.addEventListener('click',()=>{pub=+b.dataset.v;body.querySelectorAll('#cr-vis button').forEach(x=>x.setAttribute('aria-pressed',x===b));setNote();}));
    body.querySelector('#cr-go').addEventListener('click',()=>{
      const nm=body.querySelector('#cr-name').value;
      const pw=body.querySelector('#cr-pass').value.trim();
      closeModal();createRoom(nm,!!pub,pw);
    });
    setTimeout(()=>{try{body.querySelector('#cr-name').focus();}catch(e){}},60);
  });
}
function openJoinCodeModal(){
  if(!ensureName())return;
  openModal('Rejoindre par code',body=>{
    body.innerHTML=`
      <p class="modal-note">Entre le code d’une room privée (ou publique) que quelqu’un t’a partagé.</p>
      <label class="modal-lab">Code de la room</label>
      <input id="jc-code" class="modal-search" type="text" placeholder="ex : soiree-mardi" autocomplete="off" autocapitalize="off" spellcheck="false">
      <label class="modal-lab">Mot de passe (optionnel)</label>
      <input id="jc-pass" class="modal-search" type="text" placeholder="laisse vide si pas besoin" autocomplete="off" autocapitalize="off" spellcheck="false">
      <button class="btn" id="jc-go">Rejoindre</button>`;
    body.querySelector('#jc-go').addEventListener('click',()=>{
      const raw=body.querySelector('#jc-code').value;
      const id=slug(raw);
      if(!id){toast('Entre un code');return;}
      const pw=body.querySelector('#jc-pass').value.trim();
      closeModal();enterRoom(id,raw.trim()||id,pw);
    });
    setTimeout(()=>{try{body.querySelector('#jc-code').focus();}catch(e){}},60);
  });
}
function openPasswordModal(id,name){
  openModal('Room protégée',body=>{
    body.innerHTML=`
      <p class="modal-note">« ${escapeHtml(name)} » demande un mot de passe.</p>
      <label class="modal-lab">Mot de passe</label>
      <input id="pw-in" class="modal-search" type="text" autocomplete="off" autocapitalize="off" spellcheck="false">
      <button class="btn" id="pw-go">Rejoindre</button>`;
    body.querySelector('#pw-go').addEventListener('click',()=>{
      const pw=body.querySelector('#pw-in').value.trim();
      if(!pw){toast('Entre le mot de passe');return;}
      closeModal();enterRoom(id,name,pw);
    });
    setTimeout(()=>{try{body.querySelector('#pw-in').focus();}catch(e){}},60);
  });
}
$('btn-create').addEventListener('click',openCreateModal);
$('btn-joincode').addEventListener('click',openJoinCodeModal);
function goHome(){announceGone();leaveNet();renderRoomList();show('home');}

/* ---- QR & lien de partage ---- */
function buildJoinLink(id,pw){
  const base=location.href.split('#')[0];
  let h='#j='+encodeURIComponent(id);
  if(pw)h+='&pw='+encodeURIComponent(pw);
  return base+h;
}
function openQrModal(){
  const link=buildJoinLink(curRoomId,curPassword);
  const local=(location.protocol==='file:');
  openModal('Rejoindre en scannant',body=>{
    let svg='';
    try{const qr=window.QR(0,'M');qr.addData(link);qr.make();svg=qr.createSvgTag({scalable:true,margin:0});}catch(e){svg='';}
    body.innerHTML=`<p class="modal-note">Fais scanner ce QR à tes amis : il ouvre LIANE et rejoint directement « ${escapeHtml(cfg.name||curRoomName||curRoomId)} »${curPassword?' (mot de passe inclus)':''}.</p>
      <div class="qr-wrap">
        <div class="qr-card">${svg||'<div style="color:var(--accent);font-size:13px;text-align:center">QR indisponible</div>'}</div>
        <div class="qr-code-txt">code : ${escapeHtml(curRoomId)}</div>
      </div>
      ${local?'<p class="modal-note" style="margin-top:14px;color:var(--accent)">Attention — page ouverte en local (file://). Le QR ne marchera que si tu héberges la page sur une URL HTTPS accessible aux autres appareils.</p>':''}`;
  });
}
$('qrbtn').addEventListener('click',openQrModal);

/* ---- arrivée via lien QR ---- */
function parseJoinHash(){
  const h=location.hash||'';const m=h.match(/[#&]j=([^&]+)/);if(!m)return null;
  const id=decodeURIComponent(m[1]);const mp=h.match(/[#&]pw=([^&]+)/);
  return {id:id,pw:mp?decodeURIComponent(mp[1]):''};
}
function openJoinFromLink(id,pw){
  openModal('Rejoindre la room',body=>{
    body.innerHTML=`<p class="modal-note">Tu es invité·e à rejoindre la room « <b>${escapeHtml(id)}</b> ».</p>
      <label class="modal-lab">Ton pseudo</label>
      <input id="lk-name" class="modal-search" type="text" maxlength="14" placeholder="ton nom" autocomplete="off">
      ${pw?'':'<label class="modal-lab">Mot de passe (si demandé)</label><input id="lk-pass" class="modal-search" type="text" autocomplete="off" autocapitalize="off" spellcheck="false">'}
      <button class="btn" id="lk-go">Rejoindre</button>`;
    const nm=body.querySelector('#lk-name');nm.value=ME.name||($('name').value||'');
    body.querySelector('#lk-go').addEventListener('click',()=>{
      const name=(nm.value||'').trim().slice(0,14);
      if(!name){toast('Choisis un pseudo');return;}
      $('name').value=name;ME.name=name;
      const pwEl=body.querySelector('#lk-pass');
      const password=pw||((pwEl&&pwEl.value)||'').trim();
      closeModal();enterRoom(id,id,password);
    });
    setTimeout(()=>{try{nm.focus();}catch(e){}},60);
  });
}

/* ===================== Lobby ===================== */
function renderLobby(){
  const ids=rosterIds();
  const rn=$('room-name');if(rn)rn.textContent=cfg.name||curRoomName||curRoomId;
  const rc=$('room-code');if(rc)rc.textContent=curRoomId;
  $('pcount').textContent=ids.length;
  const box=$('plist');box.innerHTML='';
  ids.forEach((id,ix)=>{
    const it=document.createElement('div');it.className='pitem'+(id===selfId?' me':'');
    const num=document.createElement('span');num.className='idx';num.textContent=ix+1;
    const nm=document.createElement('span');nm.className='nm';nm.textContent=nameFor(id)+(id===selfId?' (toi)':'');
    it.appendChild(num);it.appendChild(nm);
    if(id===hostId()){const b=document.createElement('span');b.className='badge';b.textContent='hôte';it.appendChild(b);}
    box.appendChild(it);
  });
  reflectSettings();
  updateLobbyButtons();
}
const S_TIME_OPTS={
  words:[[60,'1min'],[90,'1min30'],[120,'2min'],[180,'3min']],
  sudoku:[[180,'3min'],[300,'5min'],[480,'8min'],[720,'12min'],[0,'SANS']]
};
function applyGameUI(){
  const isSud=cfg.game==='sudoku';
  $('words-settings').style.display=isSud?'none':'';
  $('sudoku-settings').style.display=isSud?'':'none';
  const opts=S_TIME_OPTS[isSud?'sudoku':'words'];
  const seg=$('s-time');
  const curVals=[...seg.children].map(b=>+b.dataset.v).join(',');
  const wantVals=opts.map(o=>o[0]).join(',');
  if(curVals!==wantVals)seg.innerHTML=opts.map(o=>`<button data-v="${o[0]}"${o[0]===cfg.time?' aria-pressed="true"':''}>${o[1]}</button>`).join('');
}
function reflectSettings(){
  applyGameUI();
  const numMap={'s-size':cfg.size,'s-rounds':cfg.rounds,'s-min':cfg.min,'s-time':cfg.time};
  for(const segId in numMap){const seg=$(segId);if(!seg)continue;seg.classList.toggle('ro',!isHost());[...seg.children].forEach(b=>b.setAttribute('aria-pressed',(+b.dataset.v)===numMap[segId]));}
  const strMap={'s-game':cfg.game,'s-diff':cfg.diff};
  for(const segId in strMap){const seg=$(segId);if(!seg)continue;seg.classList.toggle('ro',!isHost());[...seg.children].forEach(b=>b.setAttribute('aria-pressed',b.dataset.v===strMap[segId]));}
  $('set-title').textContent=isHost()?"Réglages (tu es l'hôte)":"Réglages (définis par l'hôte)";
}
function updateLobbyButtons(){
  if(currentScreen!=='lobby')return;
  const host=isHost();
  $('startgame').style.display=host?'block':'none';
  let msg='';
  if(host){
    if(!netReady)msg="Réseau non connecté — tu peux lancer en local, mais héberge la page en HTTPS pour jouer à plusieurs.";
    else if(rosterIds().length<=1)msg="Tu es seul·e ici pour l'instant — partage le code ou le QR pour que tes amis rejoignent.";
  }else{msg="En attente que l'hôte lance la partie…";}
  $('lobby-wait').textContent=msg;
}
function segSet(segId,key,cb,keepStr){
  $(segId).addEventListener('click',e=>{
    const b=e.target.closest('button');if(!b||!isHost())return;
    cfg[key]=keepStr?b.dataset.v:+b.dataset.v;
    [...$(segId).children].forEach(x=>x.setAttribute('aria-pressed',x===b));
    if(act.cfg)act.cfg.send(cfg);
    cb&&cb();
  });
}
segSet('s-size','size');segSet('s-time','time');segSet('s-rounds','rounds');segSet('s-min','min');
segSet('s-game','game',()=>{cfg.time=(cfg.game==='sudoku')?300:90;applyGameUI();reflectSettings();if(act.cfg)act.cfg.send(cfg);},true);
segSet('s-diff','diff',null,true);

$('copy').addEventListener('click',()=>{const c=curRoomId;if(navigator.clipboard)navigator.clipboard.writeText(c);toast('Code copié : '+c);});
$('leave1').addEventListener('click',goHome);
$('startgame').addEventListener('click',()=>{if(!isHost())return;seedBase='g'+Math.floor(Math.random()*1e9)+Date.now().toString(36);totals={};curRound=0;if(act.go)act.go.send({round:1,seed:seedBase});startRoundNet(1,seedBase);if(amPublicHost())sendAnnounce();});

/* ===================== Manche (simultanée) ===================== */
let PLAY={path:[],active:false,timer:null};
let clock={secs:90,end:0,iv:null,paused:false,remaining:0};
let myResult={words:[],seen:new Set(),total:0};
let finishedSelf=false;

/* --- état Sudoku --- */
let SUD=null, sCells=null, sLocked=null, sSel=-1;
let sStart=0, sPenaltyMs=0, sTickIv=null, sSettled=false, sMyStatus=null;
let sudokuResults={}, sudokuWinner=null;

function startRoundNet(round,seed){
  curRound=round;seedBase=seed;
  if(cfg.game==='sudoku'){startSudokuRound(round,seed);return;}
  SIZE=cfg.size;N=SIZE*SIZE;ADJ=buildAdj(SIZE);
  window.G={board:genBoard(seed,round)};
  live={};roundData={};finished=new Set();finishedSelf=false;
  myResult={words:[],seen:new Set(),total:0};
  $('pl-round').textContent='Manche '+round+'/'+cfg.rounds;
  show('play');
  renderBoard();updatePreview();renderChips();updateScoreboard();
  requestAnimationFrame(fitTiles);
  startTimer(cfg.time);
}
function startTimer(secs){
  PLAY.active=true;
  clock.secs=secs;clock.paused=false;clock.remaining=secs*1000;clock.end=performance.now()+secs*1000;
  $('pause-ov').classList.remove('on');
  $('timerbar').classList.remove('low');$('timerfill').style.width='100%';
  clearInterval(clock.iv);clock.iv=setInterval(tickClock,100);tickClock();
}
function tickClock(){
  if(clock.paused)return;
  const rem=Math.max(0,clock.end-performance.now());
  $('timerfill').style.width=(rem/(clock.secs*1000)*100)+'%';
  $('pl-clock').textContent=Math.ceil(rem/1000)+'s';
  if(rem<=10000)$('timerbar').classList.add('low');
  if(rem<=0){clearInterval(clock.iv);finishSelf();}
}
function setPaused(p,who){
  if(clock.paused===p)return;
  clock.paused=p;
  if(p){
    clock.remaining=Math.max(0,clock.end-performance.now());
    PLAY.active=false;clearPath();
    $('pause-who').textContent=who?('En pause — '+who):'En pause';
    $('pause-ov').classList.add('on');
  }else{
    clock.end=performance.now()+clock.remaining;
    PLAY.active=(currentScreen==='play'&&!finishedSelf);
    $('pause-ov').classList.remove('on');
  }
}
function renderBoard(){
  const grid=$('grid');grid.innerHTML='';
  grid.style.setProperty('--cols',SIZE);
  // interstice large entre jetons : c'est lui qui rend le tracé lisible (README §grille)
  grid.style.setProperty('--gap',SIZE>=6?'clamp(8px,2.2vw,12px)':SIZE<=4?'clamp(14px,4.4vw,22px)':'clamp(11px,3.4vw,16px)');
  window.G.board.tiles.forEach((t,i)=>{const el=document.createElement('div');el.className='tile'+(i===window.G.board.bonus?' bonus':'');el.dataset.idx=i;const L=t.letters;const letter=L.length>1?L[0].toUpperCase()+'<span class="sub">'+L.slice(1)+'</span>':L.toUpperCase();el.innerHTML=letter+'<span class="val">'+tileValue(L)+'</span>';grid.appendChild(el);});
  fitTiles();clearPath();
}
function fitTiles(){const grid=$('grid');const t=grid.children[0];if(!t)return;grid.style.setProperty('--tsize',Math.min(t.clientWidth*0.42,38)+'px');}
function tileEl(i){return $('grid').children[i];}

const boardEl=$('board');
function idxFromPoint(x,y){
  const el=document.elementFromPoint(x,y);if(!el)return -1;
  const t=el.closest('.tile');if(!t)return -1;
  // Les cases sont carrées et collées : on n'active que le cœur de la case
  // (disque central), pas les coins. Un tracé en diagonale traverse ainsi
  // le coin partagé « dans le vide » sans accrocher les cases orthogonales,
  // comme le faisaient les anciennes tuiles rondes espacées.
  const r=t.getBoundingClientRect();
  const dx=x-(r.left+r.width/2), dy=y-(r.top+r.height/2);
  const rad=Math.min(r.width,r.height)*0.44;
  if(dx*dx+dy*dy>rad*rad)return -1;
  return +t.dataset.idx;
}
function addIdx(i){
  if(i<0||!PLAY.active)return;const path=PLAY.path;
  if(path.length&&path[path.length-1]===i)return;
  if(path.length>=2&&path[path.length-2]===i){path.pop();paintPath();return;}
  if(path.includes(i))return;
  if(path.length&&!ADJ[path[path.length-1]].includes(i))return;
  path.push(i);paintPath();
}
function paintPath(){
  document.querySelectorAll('.tile.on,.tile.last').forEach(t=>t.classList.remove('on','last'));
  const n=PLAY.path.length;
  PLAY.path.forEach((i,k)=>{const el=tileEl(i);el.classList.add('on');if(k===n-1)el.classList.add('last');});
  drawRibbon();updatePreview();
}
function clearPath(){PLAY.path=[];document.querySelectorAll('.tile.on,.tile.last').forEach(t=>t.classList.remove('on','last'));drawRibbon();updatePreview();}
function drawRibbon(){
  // Une seule polyligne, tracée DERRIÈRE les jetons opaques : seule la portion
  // qui passe dans l'interstice est visible. Épaisseur ≈ interstice pour égaliser
  // liaisons droites et diagonales (README §Le tracé). Pas de segments séparés,
  // stroke-linejoin round pour éviter les encoches aux sommets.
  const svg=$('ribbon'),grid=$('grid');svg.setAttribute('viewBox',`0 0 ${grid.clientWidth} ${grid.clientHeight}`);
  if(PLAY.path.length<2){svg.innerHTML='';return;}
  const pts=PLAY.path.map(i=>{const el=tileEl(i);return[el.offsetLeft+el.offsetWidth/2,el.offsetTop+el.offsetHeight/2];});
  let gap=14;
  if(grid.children.length>1){const a=grid.children[0],b=grid.children[1];gap=Math.max(8,b.offsetLeft-(a.offsetLeft+a.offsetWidth));}
  const col=cssVar('--accent');
  svg.innerHTML=`<polyline points="${pts.map(p=>p.join(',')).join(' ')}" fill="none" stroke="${col}" stroke-width="${gap}" stroke-linecap="round" stroke-linejoin="round" stroke-opacity="0.92"/>`;
}
function currentWord(){return PLAY.path.map(i=>window.G.board.tiles[i].letters).join('');}
function updatePreview(){
  const pv=$('preview'),w=currentWord();
  if(!w){pv.innerHTML='<span class="pv-meta">glisse pour tracer</span>';return;}
  const {score,chars,mult,bonus}=scoreOf(PLAY.path,window.G.board);
  const ok=chars>=cfg.min&&isWord(w);
  pv.innerHTML=`<span class="pv-word${ok?'':' no'}">${w.toUpperCase()}</span><span class="pv-meta${ok?' ok':''}">${chars} lettres · ×${mult}${bonus>1?' · ×2':''} · <b>${ok?'+'+score+' pts':'—'}</b></span>`;
}
function submitWord(){
  const w=currentWord(),path=PLAY.path.slice();clearPath();if(!w)return;
  const {score,chars,bonus}=scoreOf(path,window.G.board);
  if(chars<cfg.min){flash('trop court',false,path);return;}
  if(!isWord(w)){flash('inconnu',false,path);return;}
  if(myResult.seen.has(w)){flash('déjà trouvé',false,path);return;}
  myResult.seen.add(w);myResult.words.push({word:w,score,bonus:bonus>1});myResult.total+=score;
  flash('+'+score,true,path);renderChips();
  live[selfId]={score:myResult.total,count:myResult.words.length};updateScoreboard();
  if(act.scr)act.scr.send({round:curRound,score:myResult.total,count:myResult.words.length});
}
function flash(txt,good,path){
  const f=$('flash');f.textContent=txt;f.style.color=good?cssVar('--good'):cssVar('--bad');
  f.classList.remove('go');void f.offsetWidth;f.classList.add('go');
  (path||[]).forEach(i=>{const el=tileEl(i);if(!el)return;el.classList.remove('good','bad');void el.offsetWidth;el.classList.add(good?'good':'bad');setTimeout(()=>el.classList.remove('good','bad'),520);});
}
function renderChips(){
  const box=$('chips');box.innerHTML='';
  [...myResult.words].reverse().forEach(w=>{const c=document.createElement('span');c.className='chip'+(w.bonus?' b':'');c.innerHTML=w.word.toUpperCase()+'<b>+'+w.score+'</b>';box.appendChild(c);});
  $('found-count').textContent=myResult.words.length+(myResult.words.length>1?' mots':' mot');
  $('found-total').textContent=myResult.total+' pts';
}
function scoreboardHTML(){
  const ids=rosterIds();
  return ids.map(id=>{
    const sc=Number(id===selfId?myResult.total:((live[id]&&live[id].score)||(roundData[id]&&roundData[id].total)||0))||0;
    const fin=finished.has(id);
    return `<span class="sb${id===selfId?' me':''}"><span class="nm">${escapeHtml(nameFor(id))}</span><b>${sc}</b>${fin?'<span class="fin">✓</span>':''}</span>`;
  }).join('');
}
function updateScoreboard(){const h=scoreboardHTML();const sb=$('scoreboard');if(sb)sb.innerHTML=h;const wsb=$('wait-sb');if(wsb&&currentScreen==='waiting')wsb.innerHTML=h;}

boardEl.addEventListener('pointerdown',e=>{if(!PLAY.active)return;e.preventDefault();boardEl.setPointerCapture(e.pointerId);clearPath();addIdx(idxFromPoint(e.clientX,e.clientY));});
boardEl.addEventListener('pointermove',e=>{if(!PLAY.active||!PLAY.path.length)return;e.preventDefault();addIdx(idxFromPoint(e.clientX,e.clientY));});
boardEl.addEventListener('pointerup',e=>{e.preventDefault();if(PLAY.path.length)submitWord();});
boardEl.addEventListener('pointercancel',()=>clearPath());
window.addEventListener('resize',()=>{if(currentScreen==='play'){fitTiles();drawRibbon();}});

$('endturn').addEventListener('click',finishSelf);
$('quit').addEventListener('click',()=>{if(confirm('Quitter la partie ?')){clearInterval(clock.iv);clock.paused=false;$('pause-ov').classList.remove('on');PLAY.active=false;goHome();}});
$('pausebtn').addEventListener('click',()=>{if(currentScreen!=='play')return;const p=!clock.paused;setPaused(p,p?ME.name:null);if(act.pz)act.pz.send({p:p,who:ME.name});});
$('resumebtn').addEventListener('click',()=>{setPaused(false);if(act.pz)act.pz.send({p:false,who:ME.name});});

/* ===================== Sudoku : jeu ===================== */
function fmtMMSS(totalSec){totalSec=Math.max(0,Math.floor(totalSec||0));const m=(totalSec/60)|0,s=totalSec%60;return (m<10?'0':'')+m+':'+(s<10?'0':'')+s;}
function startSudokuRound(round,seed){
  SUD=genSudoku(seed,round,cfg.diff||'moyen');
  sCells=Int8Array.from(SUD.given);
  sLocked=new Array(81);for(let i=0;i<81;i++)sLocked[i]=SUD.given[i]!==0;
  sSel=-1;sSettled=false;sMyStatus=null;sPenaltyMs=0;
  sudokuResults={};sudokuWinner=null;
  $('s-round').textContent='Manche '+round+'/'+cfg.rounds;
  $('sudwin-ov').classList.remove('on');
  show('splay');
  renderSudokuGrid();renderNumpad();renderSudokuStatus();
  sStart=performance.now();
  clearInterval(sTickIv);sTickIv=setInterval(sTick,200);sTick();
}
function renderSudokuGrid(){
  const grid=$('sudoku-grid');grid.innerHTML='';
  for(let i=0;i<81;i++){
    const r=(i/9)|0,c=i%9;
    const el=document.createElement('div');
    el.className='scell'+(sLocked[i]?' given':'')+((c%3===2&&c!==8)?' bR':'')+((r%3===2&&r!==8)?' bB':'');
    el.textContent=sCells[i]?sCells[i]:'';
    el.addEventListener('click',()=>selectSCell(i));
    grid.appendChild(el);
  }
}
function selectSCell(i){
  if(sSettled||sLocked[i])return;
  sSel=i;
  [...$('sudoku-grid').children].forEach((el,idx)=>el.classList.toggle('sel',idx===i));
}
function renderNumpad(){
  const box=$('numpad');box.innerHTML='';
  for(let d=1;d<=9;d++){const b=document.createElement('button');b.textContent=String(d);b.addEventListener('click',()=>numInput(d));box.appendChild(b);}
  const era=document.createElement('button');era.className='era';era.textContent='EFF.';era.addEventListener('click',()=>numInput(0));box.appendChild(era);
}
function numInput(d){
  if(sSettled||sSel<0||sLocked[sSel])return;
  sCells[sSel]=d;
  $('sudoku-grid').children[sSel].textContent=d?String(d):'';
}
function sElapsedMs(){return (performance.now()-sStart)+sPenaltyMs;}
function sTick(){
  if(sSettled)return;
  const ms=sElapsedMs();
  $('s-clock').textContent=fmtMMSS(ms/1000);
  if(cfg.time>0&&ms/1000>=cfg.time)settleSudoku('dnf',null);
}
function settleSudoku(status,timeSec){
  if(sSettled)return;sSettled=true;
  clearInterval(sTickIv);
  sMyStatus=status;
  sudokuResults[selfId]={status,time:timeSec};
  if(act.fin)act.fin.send({round:curRound,g:'sudoku',status,time:timeSec});
  $('sudwin-ov').classList.remove('on');
  renderSudokuStatus();
  show('waiting');
  clearTimeout(finishTimeout);finishTimeout=setTimeout(()=>showCorrection(),9000);
  checkAllFinished();
}
function openSudokuFinishModal(){
  if(sSettled)return;
  openModal('Valider ta grille ?',body=>{
    body.innerHTML=`<p class="modal-note">Une fois validée, si ta grille contient une erreur ou n'est pas complète, tu gardes la main mais tu reçois <b>+1 minute</b> de pénalité sur ton temps final.</p>
      <div class="home-2">
        <button class="btn ghost small" id="sf-cancel">Annuler</button>
        <button class="btn small" id="sf-go">Valider</button>
      </div>`;
    body.querySelector('#sf-cancel').addEventListener('click',closeModal);
    body.querySelector('#sf-go').addEventListener('click',()=>{closeModal();attemptFinishSudoku();});
  });
}
function attemptFinishSudoku(){
  if(sSettled)return;
  let complete=true;
  for(let i=0;i<81;i++)if(!sCells[i]){complete=false;break;}
  let correct=complete;
  if(complete)for(let i=0;i<81;i++)if(sCells[i]!==SUD.solution[i]){correct=false;break;}
  if(!complete||!correct){sPenaltyMs+=60000;toast('Il y a des erreurs — +1 min de pénalité');return;}
  const t=sElapsedMs()/1000;
  const status=sudokuWinner===null?'won':'finished';
  if(status==='won')sudokuWinner=selfId;
  settleSudoku(status,t);
}
function passSudoku(skipConfirm){
  if(sSettled)return;
  if(!skipConfirm&&!confirm('Passer cette manche ?'))return;
  settleSudoku('passed',null);
}
function showSudWinnerOverlay(winnerId){
  if(currentScreen!=='splay'||sSettled)return;
  $('sudwin-who').textContent=nameFor(winnerId)+' a gagné cette manche !';
  $('sudwin-ov').classList.add('on');
}
function sudokuStatusHTML(){
  const ids=rosterIds();
  return ids.map(id=>{
    const r=sudokuResults[id];
    let label='…';
    if(r){
      if(r.status==='won')label='✓ '+fmtMMSS(r.time);
      else if(r.status==='finished')label=fmtMMSS(r.time);
      else if(r.status==='passed')label='passé';
      else if(r.status==='dnf')label='non fini';
    }
    const cls='sud-mini'+(r&&r.status==='won'?' gold':'');
    const dotc=r?'var(--valid)':'var(--muted)';
    return `<span class="${cls}"><span class="dot" style="color:${dotc}"></span><span class="nm">${escapeHtml(nameFor(id))}</span><b>${label}</b></span>`;
  }).join('');
}
function renderSudokuStatus(){
  const h=sudokuStatusHTML();
  const s=$('s-status');if(s)s.innerHTML=h;
  const w=$('wait-sb');if(w&&currentScreen==='waiting'&&cfg.game==='sudoku')w.innerHTML=h;
}
const S_PLACE_PTS=[100,80,65,55,45,35,25,15,10,5];
function sudokuPlacementPoints(){
  const ids=rosterIds();
  const withTime=ids.filter(id=>sudokuResults[id]&&sudokuResults[id].time!=null).sort((a,b)=>sudokuResults[a].time-sudokuResults[b].time);
  const others=ids.filter(id=>!withTime.includes(id));
  const order=[...withTime,...others];
  const pts={};order.forEach((id,i)=>{pts[id]=S_PLACE_PTS[i]!=null?S_PLACE_PTS[i]:0;});
  return pts;
}
function renderMiniSudoku(target,solution){
  target.className='sudoku-grid mini';target.innerHTML='';
  for(let i=0;i<81;i++){
    const r=(i/9)|0,c=i%9;
    const el=document.createElement('div');
    el.className='scell given'+((c%3===2&&c!==8)?' bR':'')+((r%3===2&&r!==8)?' bB':'');
    el.textContent=String(solution[i]);
    target.appendChild(el);
  }
}
function renderCorrectionSudoku(){
  $('corr-sub').textContent='Manche '+curRound+' / '+cfg.rounds;
  renderMiniSudoku($('corr-grid'),SUD.solution);
  const box=$('corr-players');box.innerHTML='';
  const pts=sudokuPlacementPoints();
  const ids=rosterIds();
  const withTime=ids.filter(id=>sudokuResults[id]&&sudokuResults[id].time!=null).sort((a,b)=>sudokuResults[a].time-sudokuResults[b].time);
  const others=ids.filter(id=>!withTime.includes(id));
  [...withTime,...others].forEach(id=>{
    const r=sudokuResults[id];
    let statusTxt='non terminé';
    if(r){
      if(r.status==='won')statusTxt='gagnant · '+fmtMMSS(r.time);
      else if(r.status==='finished')statusTxt='terminé · '+fmtMMSS(r.time);
      else if(r.status==='passed')statusTxt='a passé';
      else if(r.status==='dnf')statusTxt='non fini (temps écoulé)';
    }
    const card=document.createElement('div');card.className='pcard card';
    card.innerHTML=`<div class="ph"><span class="dot" style="color:var(--muted)"></span>${escapeHtml(nameFor(id))}${id===selfId?' (toi)':''}<span class="rt">${statusTxt} · +${pts[id]||0} pts · total ${Number(totals[id])||0}</span></div>`;
    box.appendChild(card);
  });
  const bestSec=document.querySelector('.best');if(bestSec)bestSec.style.display='none';
  const host=isHost(),last=curRound>=cfg.rounds;
  $('corr-next').style.display=host?'block':'none';
  $('corr-next').textContent=last?'Voir les résultats':'Manche suivante';
  $('corr-wait').textContent=host?'':"En attente de l'hôte…";
}
$('squit').addEventListener('click',()=>{if(confirm('Quitter la partie ?')){clearInterval(sTickIv);sSettled=true;$('sudwin-ov').classList.remove('on');goHome();}});
$('s-finish').addEventListener('click',openSudokuFinishModal);
$('s-pass').addEventListener('click',()=>passSudoku(false));
$('sudwin-continue').addEventListener('click',()=>{$('sudwin-ov').classList.remove('on');});
$('sudwin-pass').addEventListener('click',()=>{$('sudwin-ov').classList.remove('on');passSudoku(true);});

function finishSelf(){
  if(finishedSelf)return;finishedSelf=true;
  PLAY.active=false;clearInterval(clock.iv);clock.paused=false;$('pause-ov').classList.remove('on');clearPath();
  roundData[selfId]={words:myResult.words.slice(),total:myResult.total};
  finished.add(selfId);
  if(act.fin)act.fin.send({round:curRound,words:myResult.words.map(w=>({w:w.word,s:w.score,b:w.bonus})),total:myResult.total});
  show('waiting');updateScoreboard();
  clearTimeout(finishTimeout);finishTimeout=setTimeout(()=>showCorrection(),9000);
  checkAllFinished();
}
function checkAllFinished(){
  if(currentScreen!=='play'&&currentScreen!=='splay'&&currentScreen!=='waiting')return;
  const ids=rosterIds();
  if(cfg.game==='sudoku'){if(ids.every(id=>sudokuResults[id]))showCorrection();}
  else{if(ids.every(id=>finished.has(id)))showCorrection();}
}

/* ===================== Correction ===================== */
function renderMiniGrid(target,board){
  target.innerHTML='';target.style.setProperty('--cols',SIZE);target.style.setProperty('--tsize',(SIZE>=6?11:SIZE<=4?16:14)+'px');
  const mini=target.closest('.board-mini');if(mini)mini.style.maxWidth=(SIZE>=6?260:SIZE<=4?180:220)+'px';
  board.tiles.forEach((t,i)=>{const el=document.createElement('div');el.className='tile'+(i===board.bonus?' bonus':'');const L=t.letters;el.innerHTML=L.length>1?L[0].toUpperCase()+'<span class="sub">'+L.slice(1)+'</span>':L.toUpperCase();target.appendChild(el);});
}
function showCorrection(){
  if(shownRound===curRound){renderCorrection();return;}
  shownRound=curRound;clearTimeout(finishTimeout);
  if(cfg.game==='sudoku'){
    const pts=sudokuPlacementPoints();
    rosterIds().forEach(id=>{totals[id]=(totals[id]||0)+(pts[id]||0);});
  }else{
    rosterIds().forEach(id=>{totals[id]=(totals[id]||0)+((roundData[id]&&roundData[id].total)||0);});
  }
  renderCorrection();show('correction');
}
function renderCorrection(){
  if(cfg.game==='sudoku'){renderCorrectionSudoku();return;}
  const bestSec=document.querySelector('.best');if(bestSec)bestSec.style.display='';
  $('corr-sub').textContent='Manche '+curRound+' / '+cfg.rounds;
  renderMiniGrid($('corr-grid'),window.G.board);
  const box=$('corr-players');box.innerHTML='';
  rosterIds().forEach(id=>{
    const r=roundData[id];
    const card=document.createElement('div');card.className='pcard card';
    let chips='<span class="empty">'+(r?'aucun mot trouvé':'…')+'</span>';
    if(r&&r.words.length)chips=r.words.slice().sort((a,b)=>b.score-a.score).map(w=>`<span class="chip${w.bonus?' b':''}">${escapeHtml(w.word.toUpperCase())}<b>+${Number(w.score)||0}</b></span>`).join('');
    card.innerHTML=`<div class="ph"><span class="dot" style="color:var(--muted)"></span>${escapeHtml(nameFor(id))}${id===selfId?' (toi)':''}<span class="rt">${r?(Number(r.total)||0):0} pts · total ${Number(totals[id])||0}</span></div><div class="chips" style="max-height:none">${chips}</div>`;
    box.appendChild(card);
  });
  const best=[...window.G.board.solution.values()].sort((a,b)=>b.score-a.score).slice(0,12);
  $('corr-best').innerHTML=best.map(b=>{const w=b.path.map(i=>window.G.board.tiles[i].letters).join('');return `<span class="chip">${w.toUpperCase()}<b>+${b.score}</b></span>`;}).join('')+`<button class="chip" style="border-style:dashed;color:var(--ink);cursor:pointer" onclick="openWordsModal()">Voir les ${window.G.board.solution.size} mots</button>`;
  const host=isHost(),last=curRound>=cfg.rounds;
  $('corr-next').style.display=host?'block':'none';
  $('corr-next').textContent=last?'Voir les résultats':'Manche suivante';
  $('corr-wait').textContent=host?'':"En attente de l'hôte…";
}
$('corr-next').addEventListener('click',()=>{
  if(!isHost())return;
  if(curRound<cfg.rounds){const nr=curRound+1;if(act.go)act.go.send({round:nr,seed:seedBase});startRoundNet(nr,seedBase);}
  else{if(act.end)act.end.send({t:Date.now()});showResults();}
});

/* ===================== Résultats ===================== */
function showResults(){renderResults();show('results');}
function renderResults(){
  const ids=rosterIds();
  const order=ids.map(id=>({id,s:totals[id]||0})).sort((a,b)=>b.s-a.s);
  const solo=ids.length<=1;
  const win=order[0];
  // Le résultat se dit en écart, jamais en superlatif (charte de copy).
  const margin=order.length>1?win.s-order[1].s:0;
  $('res-title').textContent=solo?'Terminé':nameFor(win.id);
  $('res-sub').textContent=solo?((totals[selfId]||0)+' points')
    :(margin>0?('gagne de '+margin+' point'+(margin>1?'s':'')):"l'emporte à égalité");
  const lead=$('res-lead');lead.innerHTML='';
  order.forEach((o,rk)=>{const row=document.createElement('div');row.className='lrow'+(rk===0&&!solo?' win':'');row.innerHTML=`<span class="rk">${rk+1}</span><span class="nm">${escapeHtml(nameFor(o.id))}${o.id===selfId?' (toi)':''}</span><span class="sc">${o.s}</span>`;lead.appendChild(row);});
  const host=isHost();
  $('res-replay').style.display=host?'block':'none';
  $('res-wait').textContent=host?'':"En attente que l'hôte relance…";
}
$('res-replay').addEventListener('click',()=>{
  if(!isHost())return;
  totals={};seedBase='g'+Math.floor(Math.random()*1e9)+Date.now().toString(36);curRound=0;shownRound=-1;
  if(act.rmz)act.rmz.send({t:Date.now()});
  if(act.go)act.go.send({round:1,seed:seedBase});
  startRoundNet(1,seedBase);
});
$('res-menu').addEventListener('click',goHome);

/* ===================== Modales (règles, dico, mots) ===================== */
function normWord(s){return (s||'').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g,'').replace(/[^a-z]/g,'');}
function openModal(title,build){$('modal-title').textContent=title;const body=$('modal-body');body.innerHTML='';build(body);body.scrollTop=0;$('modal').classList.add('on');}
function closeModal(){$('modal').classList.remove('on');}
$('modal-bg').addEventListener('click',closeModal);
$('modal-close').addEventListener('click',closeModal);

function buildRules(body){
  const groups={};for(const c in LV){(groups[LV[c]]=groups[LV[c]]||[]).push(c.toUpperCase());}
  const gk=Object.keys(groups).map(Number).sort((a,b)=>a-b);
  const letterRows=gk.map(v=>`<div class="rrow"><span class="rk">${v} pt${v>1?'s':''}</span><span class="rv">${groups[v].sort().join(' ')}</span></div>`).join('');
  const multRows=[3,4,5,6,7,8,9].map(n=>`<div class="rrow"><span class="rk">${n} lettres</span><span class="rv">×${MULT[n]}</span></div>`).join('')+`<div class="rrow"><span class="rk">10 et +</span><span class="rv">×5.2</span></div>`;
  body.innerHTML=`
   <div class="rsec"><h3>Le but</h3><p>Relie des lettres <b>voisines</b> (côtés et diagonales) pour former des mots français. Chaque tuile ne sert qu'une fois par mot. Plus tu trouves de mots, et plus ils sont longs, plus tu marques.</p></div>
   <div class="rsec"><h3>Le calcul des points</h3><p>Points d'un mot = <b>(somme des valeurs des lettres)</b> × <b>(multiplicateur de longueur)</b> × <b>bonus ×2</b>, arrondi.</p></div>
   <div class="rsec"><h3>Plus c'est long, plus ça paie</h3><div class="rtable">${multRows}</div></div>
   <div class="rsec"><h3>Valeur des lettres</h3><div class="rtable">${letterRows}</div></div>
   <div class="rsec"><h3>La tuile ×2</h3><p>Un mot qui passe par la tuile bonus voit <b>tout son score doublé</b> (×2). C'est là que se font les gros scores.</p></div>
   <div class="rsec"><h3>Bon à savoir</h3><p>Les digrammes (<b>QU</b>, <b>CH</b>, <b>OU</b>…) comptent comme leurs lettres, pour la longueur comme pour la valeur. Vise les mots longs qui passent par la tuile ×2 et par les lettres chères (K, W, X, Y, Z, J, Q). Le dictionnaire retenu : mots de 3 à 9 lettres, sans accents.</p></div>`;
}
function buildDict(body){
  body.innerHTML=`<p class="modal-note">Dictionnaire du jeu : ${WORDS.length.toLocaleString('fr-FR')} mots français de 3 à 9 lettres, sans accents ni tirets. Tape le début d'un mot pour vérifier s'il est accepté.</p>
    <input id="dict-q" class="modal-search" type="text" placeholder="ex : cha…" autocomplete="off" autocapitalize="off" spellcheck="false">
    <div class="modal-count" id="dict-count">Tape au moins 2 lettres.</div>
    <div class="wordgrid" id="dict-res"></div>`;
  const q=body.querySelector('#dict-q'),res=body.querySelector('#dict-res'),cnt=body.querySelector('#dict-count');
  function run(){
    const v=normWord(q.value);
    if(v.length<2){res.innerHTML='';cnt.textContent='Tape au moins 2 lettres.';return;}
    let total=0;const out=[];
    for(let i=lb(v);i<WORDS.length&&WORDS[i].startsWith(v);i++){total++;if(out.length<500)out.push(WORDS[i]);}
    cnt.textContent=total?(total+' mot'+(total>1?'s':'')+' commençant par « '+v+' »'+(total>out.length?' — 500 affichés':'')):('aucun mot commençant par « '+v+' »');
    res.innerHTML=out.map(w=>`<span class="wchip">${w}</span>`).join('');
  }
  q.addEventListener('input',run);setTimeout(()=>{try{q.focus();}catch(e){}},60);
}
function openRules(){openModal('Règles & points',buildRules);}
function openDict(){openModal('Dictionnaire',buildDict);}
function openWordsModal(){
  if(!window.G||!window.G.board)return;
  const sol=[...window.G.board.solution.entries()].map(([w,v])=>({w:w,s:v.score}));
  sol.sort((a,b)=>b.s-a.s||a.w.localeCompare(b.w));
  openModal('Tous les mots — '+sol.length,body=>{
    body.innerHTML=`<p class="modal-note">Tous les mots trouvables sur cette grille, triés par points. Filtre pour retrouver un mot précis.</p>
      <input id="w-q" class="modal-search" type="text" placeholder="filtrer…" autocomplete="off" autocapitalize="off" spellcheck="false">
      <div class="wordgrid" id="w-res"></div>`;
    const res=body.querySelector('#w-res'),qq=body.querySelector('#w-q');
    function draw(f){const list=f?sol.filter(x=>x.w.includes(f)):sol;res.innerHTML=list.map(x=>`<span class="wchip">${x.w.toUpperCase()}<b>${x.s}</b></span>`).join('');}
    draw('');qq.addEventListener('input',()=>draw(normWord(qq.value)));
  });
}
$('btn-rules').addEventListener('click',openRules);
$('btn-dict').addEventListener('click',openDict);

/* ===================== Boot ===================== */
loadDict().then(()=>{
  $('loading').classList.add('hide');
  renderRoomList();
  joinSalon();
  const pj=parseJoinHash();
  if(pj&&pj.id){try{history.replaceState(null,'',location.pathname+location.search);}catch(e){}openJoinFromLink(pj.id,pj.pw);}
}).catch(()=>{$('loading').innerHTML='<div style="max-width:300px;text-align:center;color:var(--ink-dim);padding:20px;line-height:1.6">Ton navigateur ne supporte pas la décompression du dictionnaire.<br>Essaie Chrome, Edge ou Safari récent.</div>';});
window.addEventListener('beforeunload',()=>{try{announceGone();}catch(e){}});
