const floors=[{id:2,label:'2º andar'},{id:1,label:'1º andar'},{id:0,label:'Térreo'},{id:-1,label:'Subsolo'}];
const seedRooms=[
{id:'throne',name:'Sala do Trono',x:55,y:48,w:38,h:32,floor:2},{id:'corridor',name:'Corredor Norte',x:7,y:18,w:36,h:22,floor:2},{id:'study',name:'Escritório',x:7,y:49,w:36,h:30,floor:2},{id:'hall',name:'Grande Hall',x:12,y:19,w:76,h:58,floor:1},{id:'kitchen',name:'Cozinha',x:6,y:18,w:27,h:28,floor:0},{id:'tavern',name:'Salão da Taverna',x:38,y:15,w:55,h:62,floor:0}
];
const seedTokens={2:[{id:'carlos',emoji:'🧙',name:'Carlos',x:67,y:62,color:'#8b7cff',type:'Jogador',hp:'42 / 48'},{id:'lyra',emoji:'🧝',name:'Lyra',x:77,y:68,color:'#6ee7b7',type:'Jogador',hp:'37 / 40'},{id:'guard',emoji:'🛡️',name:'Guarda',x:89,y:55,color:'#e8c986',type:'NPC',hp:'20 / 20'}],1:[{id:'kael',emoji:'🧙‍♂️',name:'Kael',x:55,y:48,color:'#7dd3fc',type:'Jogador',hp:'31 / 31'}],0:[{id:'marta',emoji:'👵',name:'Dona Marta',x:57,y:45,color:'#f3a8ca',type:'NPC',hp:'—'}],'-1':[{id:'goblin',emoji:'👾',name:'Goblin',x:51,y:52,color:'#fb7185',type:'Criatura',hp:'8 / 8'}]};
const key='rpg-hub-world-v1'; let state=JSON.parse(localStorage.getItem(key)||'null')||{rooms:seedRooms,tokens:seedTokens,floor:2,selected:null,tool:'move'};
const $=id=>document.getElementById(id); const floorById=id=>floors.find(f=>f.id===id); const allTokens=()=>Object.values(state.tokens).flat();
function persist(){localStorage.setItem(key,JSON.stringify(state));}
function toast(msg){const el=$('toast');el.textContent='✓ '+msg;el.classList.add('show');clearTimeout(window.__t);window.__t=setTimeout(()=>el.classList.remove('show'),1700)}
function renderFloors(){ $('floorSwitch').innerHTML=floors.map(f=>`<button class="${state.floor===f.id?'chosen':''}" onclick="changeFloor(${f.id})">${f.label}</button>`).join(''); $('floorName').textContent=floorById(state.floor).label.toUpperCase(); $('contextFloor').textContent=floorById(state.floor).label; }
function renderRooms(){const rooms=state.rooms.filter(r=>r.floor===state.floor);$('roomLayer').innerHTML=rooms.map(r=>`<div class="room" style="left:${r.x}%;top:${r.y}%;width:${r.w}%;height:${r.h}%" onclick="roomToast('${escapeHtml(r.name)}')"><span>${escapeHtml(r.name)}</span><i></i><i></i><i></i><i></i></div>`).join('');$('roomList').innerHTML=rooms.map(r=>`<button class="roomItem" onclick="roomToast('${escapeHtml(r.name)}')"><span class="roomIcon">▧</span><div><b>${escapeHtml(r.name)}</b><small>Estrutura salva</small></div><span>›</span></button>`).join('')||'<div class="emptySelect">Nenhum cômodo neste andar.</div>';}
function renderTokens(){const tokens=state.tokens[state.floor]||[];$('entityCount').textContent=tokens.length;$('tokenLayer').innerHTML=tokens.map(t=>`<div class="tokenBig ${state.selected===t.id?'selected':''}" draggable="true" data-id="${t.id}" style="left:${t.x}%;top:${t.y}%;--token-color:${t.color}"><div>${t.emoji}</div><span>${escapeHtml(t.name)}</span></div>`).join('');$('entityList').innerHTML=tokens.map(t=>`<button class="entityItem ${state.selected===t.id?'entityChosen':''}" onclick="selectToken('${t.id}')"><span class="entityAvatar" style="background:${t.color}">${t.emoji}</span><div><b>${escapeHtml(t.name)}</b><small>${t.type}</small></div><span>${state.selected===t.id?'●':'○'}</span></button>`).join('')||'<div class="emptySelect">Nenhuma entidade neste andar.</div>'; bindDrags(); renderSelected();}
function renderSelected(){const t=allTokens().find(x=>x.id===state.selected); if(!t){$('selectedCard').innerHTML='<div class="emptySelect">Selecione uma entidade na mesa para ver detalhes.</div>';return;} const current=floors.find(f=>state.tokens[f.id]?.some(x=>x.id===t.id));$('selectedCard').innerHTML=`<div class="eyebrow">SELECIONADO</div><div class="selectedRow"><div class="selectedEmoji">${t.emoji}</div><div><h3>${escapeHtml(t.name)}</h3><p>Posição persistente · ${current?current.label:'—'}</p></div></div><div class="statGrid"><div><span>STATUS</span><b>Ativo</b></div><div><span>HP</span><b>${t.hp}</b></div></div>`}
function bindDrags(){document.querySelectorAll('.tokenBig').forEach(el=>{el.addEventListener('click',e=>{e.stopPropagation();selectToken(el.dataset.id)});el.addEventListener('dragstart',e=>{e.dataTransfer.setData('text/plain',el.dataset.id);state.dragging=el.dataset.id});});$('board').ondragover=e=>{if(state.tool==='move')e.preventDefault()};$('board').ondrop=e=>{if(state.tool!=='move')return;e.preventDefault();const id=e.dataTransfer.getData('text/plain')||state.dragging;if(!id)return;const r=$('board').getBoundingClientRect();const x=Math.max(4,Math.min(96,((e.clientX-r.left)/r.width)*100));const y=Math.max(6,Math.min(94,((e.clientY-r.top)/r.height)*100));state.tokens[state.floor]=(state.tokens[state.floor]||[]).map(t=>t.id===id?{...t,x,y}:t);persist();renderTokens();toast('Posição atualizada');};}
function selectToken(id){state.selected=id;persist();renderTokens();}
function changeFloor(id){state.floor=id;state.selected=null;persist();renderAll();toast('Andar alterado')}
function roomToast(name){toast(name+' · estrutura salva')}
function addRoom(){const name=prompt('Nome do novo cômodo','Novo cômodo');if(!name?.trim())return;state.rooms.push({id:crypto.randomUUID(),name:name.trim(),x:46,y:24,w:34,h:30,floor:state.floor});persist();renderAll();toast(name.trim()+' criado')}
function escapeHtml(s){return String(s).replace(/[&<>"']/g,m=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[m]))}
function renderAll(){renderFloors();renderRooms();renderTokens();}

let drawStart=null;
$('board').addEventListener('pointerdown',e=>{if(state.tool!=='draw')return;const r=$('board').getBoundingClientRect();drawStart={x:e.clientX-r.left,y:e.clientY-r.top}});
$('board').addEventListener('pointerup',e=>{if(state.tool!=='draw'||!drawStart)return;const r=$('board').getBoundingClientRect();const x2=e.clientX-r.left,y2=e.clientY-r.top;const x=Math.min(drawStart.x,x2)/r.width*100,y=Math.min(drawStart.y,y2)/r.height*100,w=Math.max(12,Math.abs(x2-drawStart.x)/r.width*100),h=Math.max(12,Math.abs(y2-drawStart.y)/r.height*100);drawStart=null;const name=prompt('Nome do novo cômodo','Novo cômodo');if(!name?.trim())return;state.rooms.push({id:crypto.randomUUID(),name:name.trim(),x,y,w,h,floor:state.floor});persist();state.tool='move';$('moveBtn').classList.add('chosen');$('structureBtn').classList.remove('chosen');renderAll();toast(name.trim()+' criado');});
$('newRoom').addEventListener('click',addRoom);$('saveBtn').addEventListener('click',()=>{persist();toast('Mundo salvo')});$('discordBtn').addEventListener('click',()=>toast('Abrindo Discord…'));$('discordTop').addEventListener('click',()=>toast('Abrindo Discord…'));$('moveBtn').addEventListener('click',()=>{state.tool='move';$('moveBtn').classList.add('chosen');$('structureBtn').classList.remove('chosen');toast('Modo mover ativo')});$('structureBtn').addEventListener('click',()=>{state.tool='draw';$('structureBtn').classList.add('chosen');$('moveBtn').classList.remove('chosen');toast('Modo estrutura preparado')});renderAll();window.changeFloor=changeFloor;window.selectToken=selectToken;window.roomToast=roomToast;

/* ===== RPG HUB interaction refinement ===== */
(function(){
  state.zoom=state.zoom||100;
  const roomModal=$('roomModal');
  const worldModal=$('worldModal');

  function openRoomModal(pending){
    window.__pendingRoom=pending||null;
    roomModal.classList.add('open');
    roomModal.setAttribute('aria-hidden','false');
    $('roomNameInput').focus();
  }
  function closeRoomModal(){
    roomModal.classList.remove('open');
    roomModal.setAttribute('aria-hidden','true');
    $('roomNameInput').value='';
    $('roomDescriptionInput').value='';
    window.__pendingRoom=null;
  }
  function createRoomFromModal(){
    const name=$('roomNameInput').value.trim();
    const description=$('roomDescriptionInput').value.trim();
    if(!name){toast('Informe um nome para o cômodo');$('roomNameInput').focus();return}
    const base=window.__pendingRoom||null;
    const rooms=state.rooms.filter(r=>r.floor===state.floor);
    const offset=rooms.length%3;
    const room={
      id:crypto.randomUUID(),
      name,
      description,
      x:base?base.x:43+offset*4,
      y:base?base.y:23+offset*4,
      w:base?base.w:33,
      h:base?base.h:29,
      floor:state.floor
    };
    state.rooms.push(room);
    persist();
    closeRoomModal();
    renderAll();
    toast(name+' criado');
  }

  const oldNewRoom=$('newRoom');
  if(oldNewRoom){
    const clean=oldNewRoom.cloneNode(true);
    oldNewRoom.replaceWith(clean);
    clean.addEventListener('click',()=>openRoomModal());
  }
  $('confirmRoom').addEventListener('click',createRoomFromModal);
  $('closeRoomModal').addEventListener('click',closeRoomModal);
  $('cancelRoom').addEventListener('click',closeRoomModal);
  roomModal.addEventListener('click',e=>{if(e.target===roomModal)closeRoomModal()});

  function enhanceTokens(){
    document.querySelectorAll('.tokenBig').forEach(el=>{
      el.draggable=false;
      if(el.dataset.refinedDrag)return;
      el.dataset.refinedDrag='1';
      el.addEventListener('pointerdown',e=>{
        if(state.tool!=='move')return;
        e.preventDefault();
        e.stopPropagation();
        const id=el.dataset.id;
        const board=$('board');
        const rect=board.getBoundingClientRect();
        el.classList.add('dragging');
        const move=ev=>{
          const x=Math.max(4,Math.min(96,((ev.clientX-rect.left)/rect.width)*100));
          const y=Math.max(7,Math.min(94,((ev.clientY-rect.top)/rect.height)*100));
          state.tokens[state.floor]=(state.tokens[state.floor]||[]).map(t=>t.id===id?Object.assign({},t,{x:x,y:y}):t);
          el.style.left=x+'%';
          el.style.top=y+'%';
        };
        const up=()=>{
          document.removeEventListener('pointermove',move);
          el.classList.remove('dragging');
          persist();
          renderTokens();
          toast('Posição atualizada');
        };
        document.addEventListener('pointermove',move);
        document.addEventListener('pointerup',up,{once:true});
      });
    });
  }

  const oldRenderTokens=window.renderTokens;
  window.renderTokens=function(){
    oldRenderTokens();
    enhanceTokens();
  };

  function applyZoom(){
    $('zoomValue').textContent=state.zoom+'%';
    $('board').style.setProperty('--board-zoom',String(state.zoom/100));
  }
  $('zoomIn').addEventListener('click',()=>{state.zoom=Math.min(125,state.zoom+10);applyZoom();persist()});
  $('zoomOut').addEventListener('click',()=>{state.zoom=Math.max(80,state.zoom-10);applyZoom();persist()});

  const board=$('board');
  let drawStart=null;
  board.addEventListener('pointerdown',e=>{
    if(state.tool!=='draw')return;
    if(e.target.closest('.tokenBig')||e.target.closest('.room')||e.target.closest('.staircase'))return;
    const r=board.getBoundingClientRect();
    drawStart={x:e.clientX-r.left,y:e.clientY-r.top};
    board.classList.add('drawing');
  },true);

  board.addEventListener('pointerup',e=>{
    if(state.tool!=='draw'||!drawStart)return;
    e.preventDefault();
    e.stopImmediatePropagation();
    const r=board.getBoundingClientRect();
    const x2=e.clientX-r.left,y2=e.clientY-r.top;
    const x=Math.min(drawStart.x,x2)/r.width*100;
    const y=Math.min(drawStart.y,y2)/r.height*100;
    const w=Math.max(10,Math.abs(x2-drawStart.x)/r.width*100);
    const h=Math.max(10,Math.abs(y2-drawStart.y)/r.height*100);
    drawStart=null;
    board.classList.remove('drawing');
    if(w<4||h<4)return;
    openRoomModal({x:x,y:y,w:w,h:h});
  },true);

  function openWorld(){
    const rows=floors.map(f=>{
      const rooms=state.rooms.filter(r=>r.floor===f.id).length;
      const tokens=(state.tokens[f.id]||[]).length;
      return '<button class="worldFloor" data-floor="'+f.id+'"><span class="worldFloorName">'+escapeHtml(f.label)+'</span><span>'+rooms+' cômodos · '+tokens+' entidades</span><b>›</b></button>';
    }).join('');
    $('worldSummary').innerHTML='<div class="worldHero"><div><div class="eyebrow">MUNDO PERSISTENTE</div><h4>Castelo de Arken</h4><p>Cada andar mantém seus cômodos e posições entre as cenas.</p></div><div class="worldIcon">🏰</div></div>'+rows;
    document.querySelectorAll('.worldFloor').forEach(btn=>btn.addEventListener('click',()=>{closeWorld();changeFloor(Number(btn.dataset.floor))}));
    worldModal.classList.add('open');
    worldModal.setAttribute('aria-hidden','false');
  }
  function closeWorld(){
    worldModal.classList.remove('open');
    worldModal.setAttribute('aria-hidden','true');
  }
  $('worldBtn').addEventListener('click',openWorld);
  $('closeWorldModal').addEventListener('click',closeWorld);
  worldModal.addEventListener('click',e=>{if(e.target===worldModal)closeWorld()});

  document.querySelectorAll('.rollDie').forEach(btn=>btn.addEventListener('click',()=>{
    const die=Number(btn.dataset.die);
    const result=Math.floor(Math.random()*die)+1;
    $('rollResult').innerHTML='<span>1d'+die+'</span><b>'+result+'</b>';
    $('rollResult').classList.remove('rollPulse');
    void $('rollResult').offsetWidth;
    $('rollResult').classList.add('rollPulse');
    toast('d'+die+' rolado');
  }));

  const oldSetTool=window.setTool;
  function setToolRefined(tool){
    state.tool=tool;
    $('moveBtn').classList.toggle('chosen',tool==='move');
    $('structureBtn').classList.toggle('chosen',tool==='draw');
    $('boardHint').textContent=tool==='move'?'Arraste um personagem para reposicionar':'Clique e arraste na mesa para desenhar um novo cômodo';
    toast(tool==='move'?'Modo mover ativo':'Modo estrutura ativo');
  }
  const moveClean=$('moveBtn').cloneNode(true);
  $('moveBtn').replaceWith(moveClean);
  moveClean.addEventListener('click',()=>setToolRefined('move'));
  const structureClean=$('structureBtn').cloneNode(true);
  $('structureBtn').replaceWith(structureClean);
  structureClean.addEventListener('click',()=>setToolRefined('draw'));

  $('saveBtn').addEventListener('click',()=>{persist();toast('Mundo salvo')});
  $('board').addEventListener('wheel',e=>{
    if(!e.ctrlKey)return;
    e.preventDefault();
    state.zoom=Math.max(80,Math.min(125,state.zoom+(e.deltaY<0?5:-5)));
    applyZoom();
  },{passive:false});

  document.addEventListener('keydown',e=>{
    if(e.key==='Escape'){closeRoomModal();closeWorld()}
    if(e.key.toLowerCase()==='m')setToolRefined('move');
    if(e.key.toLowerCase()==='r')setToolRefined('draw');
    if(e.key.toLowerCase()==='q'){state.zoom=Math.max(80,state.zoom-10);applyZoom()}
    if(e.key.toLowerCase()==='e'){state.zoom=Math.min(125,state.zoom+10);applyZoom()}
  });

  applyZoom();
  enhanceTokens();
})();
