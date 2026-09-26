function clampPageCount(v){return Math.max(1,Math.min(PROJECT_PAGE_MAX,Number(v)||1))}
function setupPageStepper(inputId){
 const input=document.getElementById(inputId); if(!input)return;
 const wrap=input.closest(".page-stepper"); if(!wrap)return;
 const set=v=>{input.value=String(clampPageCount(v));input.dispatchEvent(new Event("input",{bubbles:true}))};
 wrap.querySelectorAll(".page-step-button").forEach(btn=>{
   let timer=null,repeat=null,started=0;
   const stop=()=>{clearTimeout(timer);clearInterval(repeat);timer=repeat=null};
   btn.addEventListener("pointerdown",e=>{
     e.preventDefault();
     // A stepper action must never summon/retain the numeric keyboard.
     // Blur the page input (or any other focused field) before changing the value.
     if(document.activeElement instanceof HTMLElement)document.activeElement.blur();
     input.blur();
     const d=Number(btn.dataset.step)||0; set(Number(input.value)+d); started=Date.now();
     timer=setTimeout(()=>{repeat=setInterval(()=>{const held=Date.now()-started;const jump=held>2200?5:1;set(Number(input.value)+d*jump)},heldInterval())},420);
     function heldInterval(){return 75}
     btn.setPointerCapture?.(e.pointerId);
   });
   ["pointerup","pointercancel","pointerleave"].forEach(t=>btn.addEventListener(t,stop));
 });
 input.addEventListener("change",()=>set(input.value));
}
loadAppSettings();
applyThemeColor();
applyCellShape();
applyDisplayMode();

// Explicit editor DOM references; do not rely on implicit window.<id> globals.
const pages=document.getElementById("pages");
const range=document.getElementById("range");

let stages=cloneStages(DEFAULT_STAGES);
let totalPages=48,progress=createProgress(48);
let history={day:"",baselineDone:0,days:{}};
let pageNotes={};

function createProgress(n,stageCount=stages.length){return Array.from({length:n},()=>Array(stageCount).fill(0))}


/* Browser/PWA navigation history: enables Android back-swipe without changing saved project data. */
let fillioHistoryReady=false;
let fillioHandlingPop=false;
function fillioNavState(view,extra={}){
  return {fillio:true,view,...extra};
}
function currentFillioNavState(){
  if(currentProjectId)return fillioNavState("project",{projectId:currentProjectId});
  if(currentFolderId)return fillioNavState("folder",{folderId:currentFolderId});
  return fillioNavState("root");
}
function syncFillioHistory(mode="push"){
  if(fillioHandlingPop)return;
  const state=currentFillioNavState();
  const method=(mode==="replace"||!fillioHistoryReady)?"replaceState":"pushState";
  window.history[method](state,"");
  fillioHistoryReady=true;
}
function restoreFillioHistoryState(state){
  fillioHandlingPop=true;
  try{
    if(state?.view==="project"&&state.projectId&&projectStore.projects[state.projectId])openProject(state.projectId);
    else if(state?.view==="folder"&&state.folderId&&projectStore.folders?.[state.folderId])showFolderView(state.folderId);
    else showProjectHome();
  }finally{fillioHandlingPop=false}
}
window.addEventListener("popstate",e=>{
  restoreFillioHistoryState(e.state?.fillio?e.state:fillioNavState("root"));
});

function renderRootBreadcrumb(){
  const head=document.getElementById("folderHead");
  const title=document.getElementById("folderHeadTitle");
  if(!head||!title||currentFolderId)return;
  head.style.display="";
  title.innerHTML=`<span class="crumb-current">${"Library"}</span>`;
  const rename=document.getElementById("folderRename");
  const del=document.getElementById("folderDelete");
  if(rename)rename.style.display="none";
  if(del)del.style.display="none";
}

function projectParentFolderId(id){
  const p=projectStore.projects[id];
  const fid=p?.folderId||null;
  return fid&&projectStore.folders?.[fid]?fid:null;
}
function renderProjectBreadcrumb(){
  const el=document.getElementById("projectBreadcrumb");
  if(!el||!currentProjectId)return;
  const p=projectStore.projects[currentProjectId];
  const fid=projectParentFolderId(currentProjectId);
  const esc=s=>String(s??"").replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;","\"":"&quot;","'":"&#39;"}[c]));
  const rawProjectName=p?.title||"";
  const projectName=esc(rawProjectName||(languageSettings?.language==="en"?"Untitled":"無題"));
  const rootLabel="Library";
  if(fid){
    el.innerHTML=`<button type="button" class="crumb-link" data-nav="root">${rootLabel}</button><span class="crumb-sep">›</span><button type="button" class="crumb-link" data-nav="folder" data-folder-id="${esc(fid)}">${esc(projectStore.folders[fid].name)}</button><span class="crumb-sep">›</span><span class="crumb-current" data-user-text="1">${projectName}</span>`;
  }else{
    el.innerHTML=`<button type="button" class="crumb-link" data-nav="root">${rootLabel}</button><span class="crumb-sep">›</span><span class="crumb-current" data-user-text="1">${projectName}</span>`;
  }
}
function showFolderView(folderId,historyMode="push"){
  if(!folderId||!projectStore.folders?.[folderId]){showProjectHome();return}
  if(currentProjectId)save();
  currentProjectId=null;
  currentFolderId=folderId;
  document.getElementById("editorApp").style.display="none";
  document.getElementById("projectHome").style.display="";
  document.body.style.overflowY="auto";
  document.body.style.overflowX="hidden";
  renderProjectList();
  renderFoldersAndFilter();
  saveViewState("folder");
  syncFillioHistory(historyMode);
}
function openProject(id,historyMode="push"){
  if(!projectStore.projects[id])return;
  currentProjectId=id;
  projectStore.activeProjectId=id;
  applyProjectData(projectStore.projects[id]);
  persistProjectStore();
  document.getElementById("projectHome").style.display="none";
  document.getElementById("editorApp").style.display="";
  render();
  renderProjectBreadcrumb();
  saveViewState("project");
  syncFillioHistory(historyMode);
  // Android/Chrome: restored project data can finish binding after the first paint.
  // Re-sync only the visual summary on the next frame; storage/touch logic is untouched.
  requestAnimationFrame(()=>{

  });
}
function showProjectHome(historyMode="push"){
  if(currentProjectId)save();
  currentProjectId=null;
  document.getElementById("editorApp").style.display="none";
  document.getElementById("projectHome").style.display="";
  document.body.style.overflowY="auto";
  document.body.style.overflowX="hidden";
  // Resolve the destination before rendering so Library never paints folder-only cards.
  currentFolderId=null;
  renderProjectList();
  renderFoldersAndFilter();
  renderRootBreadcrumb();
  const rootHead=document.getElementById("folderHead");
  rootHead?.classList.remove("show");
  saveViewState("root");
  syncFillioHistory(historyMode);
}
document.addEventListener("click",e=>{
  const homeLogo=e.target.closest?.(".fillio-home-link");
  if(homeLogo){
    e.preventDefault();
    showProjectHome();
    return;
  }
  const crumb=e.target.closest?.(".crumb-link");
  if(!crumb)return;
  e.preventDefault();
  e.stopPropagation();
  if(crumb.dataset.nav==="root"){
    showProjectHome();
    renderFoldersAndFilter();
    return;
  }
  if(crumb.dataset.nav==="folder"){
    showFolderView(crumb.dataset.folderId);
  }
});





const expandedStageDetails=new Set();




function load(){
  loadProjectStore();
}
function makeBackup(){
  if(currentProjectId){
    const oldProject=projectStore.projects[currentProjectId]||{};
    const snap=makeProjectData();
    snap.folderId=oldProject.folderId||null;
    projectStore.projects[currentProjectId]=snap;
  }
  persistProjectStore();
  return {
    app:"fillio",
    version:BACKUP_VERSION,
    type:"multi-project",
    exportedAt:new Date().toISOString(),
    projects:projectStore.projects,
    activeProjectId:projectStore.activeProjectId,
    projectOrder:Array.isArray(projectStore.projectOrder)?projectStore.projectOrder:[],
    folders:(projectStore.folders&&typeof projectStore.folders==="object")?projectStore.folders:{},
    rootOrder:Array.isArray(projectStore.rootOrder)?projectStore.rootOrder:[]
  };
}
function showBackupStatus(message){
  const box=document.getElementById("backupStatus");box.style.display="block";box.innerHTML=message;
}
function exportBackup(){
  try{
    const data=makeBackup(),date=localDate();
    const fileName=`fillio-backup-${date}.json`;
    const blob=new Blob([JSON.stringify(data,null,2)],{type:"application/json;charset=utf-8"});
    const url=URL.createObjectURL(blob),link=document.createElement("a");
    link.href=url;link.download=fileName;link.style.display="none";
    document.body.appendChild(link);link.click();link.remove();
    setTimeout(()=>URL.revokeObjectURL(url),5000);
    showBackupStatus(`✅ 全作品のバックアップを保存しました。<br><b>${fileName}</b><br><span style="color:var(--muted)">Chromeのダウンロード一覧または端末の「Downloads」を確認してください。</span>`);
  }catch(err){
    showBackupStatus(`❌ バックアップを保存できませんでした。<br><span style="color:var(--muted)">${String(err.message||err)}</span>`);
  }
}
function restoreBackup(data){
  if(!data||data.app!=="fillio"||data.version!==BACKUP_VERSION||data.type!=="multi-project"||!data.projects||typeof data.projects!=="object"||Array.isArray(data.projects))throw new Error("invalid");
  const restored={};
  Object.entries(data.projects).forEach(([id,p])=>{
    if(typeof id!=="string"||!id||!p||!Array.isArray(p.progress))throw new Error("invalid");
    restored[id]=normalizeProjectData(p);
  });
  if(!Object.keys(restored).length)throw new Error("invalid");
  projectStore={
    version:DATA_VERSION,
    activeProjectId:(typeof data.activeProjectId==="string"&&restored[data.activeProjectId])?data.activeProjectId:null,
    projects:restored,
    projectOrder:Array.isArray(data.projectOrder)?data.projectOrder.filter(id=>typeof id==="string"&&restored[id]):[],
    folders:(data.folders&&typeof data.folders==="object"&&!Array.isArray(data.folders))?data.folders:{},
    rootOrder:Array.isArray(data.rootOrder)?data.rootOrder.filter(x=>typeof x==="string"):[]
  };
  ensureFolders();
  if(!persistProjectStore())throw new Error("save-failed");
  showProjectHome();
  return "all";
}

let stickyPage=null,stickyColor="",stickyTodos=[];
function openSticky(page){
  stickyPage=page;
  const n=pageNotes[String(page)]||{text:"",color:""};
  stickyColor=n.color||"";
  stickyTodos=Array.isArray(n.todos)?n.todos.map((t,i)=>({id:t.id||(`${Date.now()}-${i}`),text:String(t.text||""),done:!!t.done})):[];
  document.getElementById("stickyTitle").textContent=uiLang()==="en"?`Page ${page} note`:`${page}P 付箋`;
  document.getElementById("stickyLabel").value=String(n.label||"").slice(0,6);
  document.getElementById("stickyText").value=n.text||"";
  document.getElementById("stickyTodoInput").value="";
  renderStickyTodos();
  document.querySelectorAll(".color-pick").forEach(b=>b.classList.toggle("selected",b.dataset.color===stickyColor));
  document.getElementById("stickyModal").classList.add("open");
}

function renderStickyTodos(){
  const list=document.getElementById("stickyTodoList");
  const count=document.getElementById("stickyTodoCount");
  if(!list||!count)return;
  list.innerHTML="";
  const done=stickyTodos.filter(t=>t.done).length;
  count.textContent=`${done}/${stickyTodos.length}`;
  stickyTodos.forEach((todo,i)=>{
    const row=document.createElement("div"); row.className="sticky-todo-item"+(todo.done?" done":"");
    const check=document.createElement("input"); check.type="checkbox"; check.checked=todo.done; check.setAttribute("aria-label",uiLang()==="en"?"Complete TODO":"TODO完了");
    check.onchange=()=>{stickyTodos[i].done=check.checked;renderStickyTodos();};
    const text=document.createElement("span"); text.textContent=todo.text;
    const del=document.createElement("button"); del.type="button";del.className="sticky-todo-remove";del.textContent="×";del.setAttribute("aria-label",uiLang()==="en"?"Delete TODO":"TODOを削除");
    del.onclick=()=>{stickyTodos.splice(i,1);renderStickyTodos();};
    row.append(check,text,del);list.appendChild(row);
  });
}
function addStickyTodo(){
  const input=document.getElementById("stickyTodoInput");
  const text=(input?.value||"").trim();if(!text)return;
  stickyTodos.push({id:`${Date.now()}-${Math.random().toString(36).slice(2,7)}`,text,done:false});
  input.value="";renderStickyTodos();input.focus();
}
document.getElementById("stickyTodoAdd").onclick=addStickyTodo;
document.getElementById("stickyTodoInput").addEventListener("keydown",e=>{if(e.key==="Enter"){e.preventDefault();addStickyTodo();}});

document.querySelectorAll(".color-pick").forEach(b=>b.onclick=()=>{
  stickyColor=b.dataset.color||"";
  document.querySelectorAll(".color-pick").forEach(x=>x.classList.toggle("selected",x===b));
});
document.getElementById("stickyClose").onclick=()=>document.getElementById("stickyModal").classList.remove("open");
document.getElementById("stickyModal").onclick=e=>{if(e.target.id==="stickyModal")e.currentTarget.classList.remove("open")};
document.getElementById("stickyDelete").onclick=()=>{
  if(stickyPage===null)return;
  const deleteMessage=uiLang()==="en"?"Delete this note?":"この付箋を削除しますか？";
  if(!confirm(deleteMessage))return;
  delete pageNotes[String(stickyPage)];
  stickyColor="";stickyTodos=[];
  document.getElementById("stickyLabel").value="";
  document.getElementById("stickyText").value="";
  renderStickyTodos();
  save();
  document.getElementById("stickyModal").classList.remove("open");
  renderPages();
};
document.getElementById("stickySave").onclick=()=>{
  const stickyText=document.getElementById("stickyText");
  const text=stickyText.value.trim();
  const stickyLabel=document.getElementById("stickyLabel");
  const label=(stickyLabel?.value||"").trim().slice(0,6);
  stickyText.blur();
  stickyLabel?.blur();
  pageNotes[String(stickyPage)]={text,color:stickyColor,label,todos:stickyTodos.map(t=>({id:t.id,text:t.text,done:!!t.done}))};
  save();
  document.getElementById("stickyModal").classList.remove("open");
  renderPages();
};

function renderPages(){
  pages.innerHTML="";
  const start=0,end=totalPages;
  for(let p=start;p<end;p++){
    const row=document.createElement("div");row.className="page-row";
    const num=document.createElement("div");num.className="page-number";
    const actualPage=p+1, note=pageNotes[String(actualPage)]||{text:"",color:""};
    const pageLabel=String(note.label||"").trim();
    num.textContent=pageLabel||actualPage;
    num.classList.toggle("has-page-label",!!pageLabel);
    if(pageLabel.length>=6)num.classList.add("page-label-long");
    else if(pageLabel.length>=4)num.classList.add("page-label-medium");
    if(note.color)num.style.setProperty("background",note.color,"important");
    num.onclick=()=>openSticky(actualPage);
    row.appendChild(num);
    for(let s=0;s<stages.length;s++){
      const b=document.createElement("button");b.className="progress-cell state"+progress[p][s];
      b.textContent="";
      b.dataset.pageIndex=String(p);
      b.dataset.stageIndex=String(s);
      b.onclick=()=>{
        if(Date.now()<suppressCellClickUntil)return;
        progress[p][s]=(progress[p][s]+1)%3;
        setCellVisual(b,progress[p][s]);
        fillioHaptic(8);
        save();
      };
      row.appendChild(b);
    }
    pages.appendChild(row);
  }
  pages.classList.add("all-pages");
  range.textContent=languageSettings?.language==="en" ? `${totalPages} pages` : `全${totalPages}P`;
}

function render(){renderDynamicTableHead();renderPages()}
document.getElementById("exportBackup").addEventListener("click",exportBackup);
document.getElementById("importBackup").addEventListener("click",()=>document.getElementById("backupFile").click());
document.getElementById("backupFile").addEventListener("change",async e=>{
  const file=e.target.files?.[0];if(!file)return;
  try{
    const data=JSON.parse(await file.text());
    restoreBackup(data);
    showBackupStatus(`✅ 全作品のバックアップを復元しました。<br><b>${file.name}</b>`);
  }catch(err){showBackupStatus("❌ このバックアップファイルは読み込めませんでした。")}
  e.target.value="";
});


// メモ一覧表示中は、背面の工程表へタッチ操作を伝えない
const memoOverlay=document.getElementById("memoListModal");
["touchstart","touchmove","touchend"].forEach(type=>{
  memoOverlay.addEventListener(type,e=>e.stopPropagation(),{passive:true});
});

let memoListFilter="all";
function renderMemoList(){
  const body=document.getElementById("memoListBody");
  body.innerHTML="";
  const entries=Object.entries(pageNotes||{})
    .map(([key,note])=>{
      const page=Number(key);
      const index=page-1;
      return {index,page,note};
    })
    .filter(x=>Number.isInteger(x.page)&&x.index>=0&&x.index<totalPages&&x.note&&typeof x.note==="object")
    .filter(x=>memoListFilter==="all"||(memoListFilter==="none"?!x.note.color:x.note.color===memoListFilter))
    .sort((a,b)=>a.page-b.page);
  if(!entries.length){
    body.innerHTML=`<div class="memo-empty">${uiLang()==="en"?"No matching notes.":"該当するメモはありません。"}</div>`;
    return;
  }
  entries.forEach(({index,page,note})=>{
    const row=document.createElement("div");
    row.className="memo-item";
    const pg=document.createElement("div");
    pg.className="memo-page";
    if(note.color)pg.style.background=note.color;else pg.classList.add("no-color");
    const pageLabel=String(note.label||"").trim();
    pg.textContent=pageLabel||(page+"P");
    pg.classList.toggle("has-page-label",!!pageLabel);
    const content=document.createElement("div");
    content.className="memo-content";
    const tx=document.createElement("div");
    tx.className="memo-text";
    tx.textContent=(note.text||"").trim()||(uiLang()==="en"?"(No note text)":"（メモ本文なし）");
    content.appendChild(tx);
    const todos=Array.isArray(note.todos)?note.todos:[];
    if(todos.length){
      const todoBox=document.createElement("div");todoBox.className="memo-todos";
      todos.forEach((todo,todoIndex)=>{
        const item=document.createElement("label");item.className="memo-todo-item"+(todo.done?" done":"");
        const check=document.createElement("input");check.type="checkbox";check.checked=!!todo.done;
        check.setAttribute("aria-label",uiLang()==="en"?"Toggle TODO":"TODOを切り替え");
        const label=document.createElement("span");label.textContent=String(todo.text||"");
        check.onchange=()=>{
          note.todos[todoIndex].done=check.checked;item.classList.toggle("done",check.checked);
          save();renderMemoList();
        };
        item.append(check,label);todoBox.appendChild(item);
      });
      const done=todos.filter(t=>t.done).length;
      const summary=document.createElement("div");summary.className="memo-todo-summary";
      summary.textContent=`TODO ${done}/${todos.length}`;
      content.append(todoBox,summary);
    }
    const jump=document.createElement("button");
    jump.className="memo-jump";
    jump.textContent=uiLang()==="en"?"Go":"移動";
    jump.onclick=()=>{
      if(index<0||index>=totalPages)return;
      document.getElementById("memoListModal").classList.remove("open");
      document.body.style.overflow="";
      render();
      const pages=document.getElementById("pages");
      const targetRow=pages?.children?.[index];
      if(targetRow)targetRow.scrollIntoView({behavior:"smooth",block:"center"});
    };
    const actions=document.createElement("div");
    actions.className="memo-actions";
    const del=document.createElement("button");
    del.className="memo-delete";
    del.type="button";
    del.innerHTML='<svg class="icon-line" viewBox="0 0 24 24" aria-hidden="true"><path d="M4 7h16M9 7V4h6v3M7 7l1 13h8l1-13M10 11v5M14 11v5"/></svg>';
    del.setAttribute("aria-label",uiLang()==="en"?"Delete note":"付箋を削除");
    del.title=uiLang()==="en"?"Delete note":"付箋を削除";
    del.onclick=()=>{
      const deleteMessage=uiLang()==="en"?"Delete this note?":"この付箋を削除しますか？";
      if(!confirm(deleteMessage))return;
      delete pageNotes[String(page)];
      save();
      renderPages();
      renderMemoList();
    };
    actions.append(jump,del);
    row.append(pg,content,actions);
    body.appendChild(row);
  });
}
document.getElementById("memoListButton").onclick=()=>{
  memoListFilter="all";
  document.querySelectorAll(".memo-filter").forEach(b=>b.classList.toggle("active",b.dataset.filter==="all"));
  renderMemoList();
  document.getElementById("memoListModal").classList.add("open");
  document.body.style.overflow="hidden";
};
document.getElementById("closeMemoList").onclick=()=>{
  document.getElementById("memoListModal").classList.remove("open");
  document.body.style.overflow="";
};
document.getElementById("memoListModal").onclick=e=>{
  if(e.target.id==="memoListModal"){
    e.currentTarget.classList.remove("open");
    document.body.style.overflow="";
  }
};
document.querySelectorAll(".memo-filter").forEach(btn=>btn.onclick=()=>{
  memoListFilter=btn.dataset.filter;
  document.querySelectorAll(".memo-filter").forEach(b=>b.classList.toggle("active",b===btn));
  renderMemoList();
});


["defaultPages","newProjectPages","editProjectPages"].forEach(setupPageStepper);

function closeAppSettings(){
  document.getElementById("appSettingsModal").classList.remove("open");
  unlockPageScroll();
}

document.getElementById("settingsCancel").onclick=closeAppSettings;
document.getElementById("appSettingsModal").onclick=e=>{if(e.target.id==="appSettingsModal")closeAppSettings()};
document.getElementById("defaultStageAdd").onclick=()=>{if(defaultStageDraft.length>=MAX_STAGES){alert(languageSettings?.language==="en"?`Up to ${MAX_STAGES} stages.`:`工程は最大${MAX_STAGES}個までです。`);return}defaultStageDraft.push({name:""});renderDefaultStageEditor()};




load();




// Library help
const libraryHelpButton=document.getElementById("libraryHelpButton");
const libraryHelpModal=document.getElementById("libraryHelpModal");
const libraryHelpClose=document.getElementById("libraryHelpClose");
function openLibraryHelp(){lockPageScroll();libraryHelpModal.classList.add("open");libraryHelpModal.setAttribute("aria-hidden","false")}
function closeLibraryHelp(){libraryHelpModal.classList.remove("open");libraryHelpModal.setAttribute("aria-hidden","true");unlockPageScroll()}
libraryHelpButton?.addEventListener("click",openLibraryHelp);
libraryHelpClose?.addEventListener("click",closeLibraryHelp);
libraryHelpModal?.addEventListener("click",e=>{if(e.target===libraryHelpModal)closeLibraryHelp()});

// 使い方ヘルプ
const helpButton=document.getElementById("helpButton");
const helpModal=document.getElementById("helpModal");
const helpClose=document.getElementById("helpClose");
function openHelp(){
  helpModal.classList.add("open");
  helpModal.setAttribute("aria-hidden","false");
  document.body.style.overflow="hidden";
}
function closeHelp(){
  helpModal.classList.remove("open");
  helpModal.setAttribute("aria-hidden","true");
  document.body.style.overflow="";
}
helpButton.addEventListener("click",openHelp);
helpClose.addEventListener("click",closeHelp);
helpModal.addEventListener("click",e=>{if(e.target===helpModal)closeHelp()});
["touchstart","touchmove","touchend"].forEach(type=>{
  helpModal.addEventListener(type,e=>e.stopPropagation(),{passive:true});
});


// Library drag/reorder lives in app-library-drag.js.

// フォルダ：1階層のみ
let currentFolderId=null;
function ensureFolders(){
 if(!projectStore.folders||typeof projectStore.folders!=="object")projectStore.folders={};
 Object.values(projectStore.projects||{}).forEach(p=>{
   if(!("folderId" in p))p.folderId=null;
   // A stale/malformed backup may reference a folder that no longer exists.
   // Recover only that orphaned project to Library root; valid trashed folders stay intact.
   if(p.folderId&&!projectStore.folders[p.folderId])p.folderId=null;
 });
 if(!Array.isArray(projectStore.rootOrder))projectStore.rootOrder=[];
 const keys=[];
 Object.keys(projectStore.folders).forEach(id=>{if(!projectStore.folders[id]?.trashedAt)keys.push("f:"+id)});
 (projectStore.projectOrder||[]).forEach(id=>{
   if(projectStore.projects[id]&&!projectStore.projects[id].trashedAt&&!projectStore.projects[id].folderId)keys.push("p:"+id);
 });
 Object.keys(projectStore.projects||{}).forEach(id=>{
   if(!projectStore.projects[id].trashedAt&&!projectStore.projects[id].folderId)keys.push("p:"+id);
 });
 const valid=[...new Set(keys)];
 projectStore.rootOrder=projectStore.rootOrder.filter(k=>valid.includes(k));
 valid.forEach(k=>{if(!projectStore.rootOrder.includes(k))projectStore.rootOrder.push(k)});
}
function folderCount(fid){return Object.values(projectStore.projects||{}).filter(p=>p.folderId===fid&&!p.trashedAt).length}

// Folder UI operations live in app-folder.js.

// 既存renderProjectHome後にフォルダ表示を重ねる
let folderRendering=false;
const folderObserver=new MutationObserver(()=>{
 if(window.__mixedRootDragging||window.__libraryStageDragging||reorderDragging||folderRendering)return;
 clearTimeout(window.__folderRenderTimer);
 window.__folderRenderTimer=setTimeout(()=>{
   if(!window.__mixedRootDragging&&!window.__libraryStageDragging&&!reorderDragging&&!folderRendering)renderFoldersAndFilter();
 },0);
});
const folderList=document.getElementById("projectList");
if(folderList)folderObserver.observe(folderList,{childList:true});

// Library drag/drop handlers live in app-library-drag.js.

ensureFolders();
applyLanguage();

// Restore the saved view only after the complete app shell has loaded.
// This keeps project restoration out of the startup race between split scripts,
// language refreshes and the browser/PWA's first paint.
let initialViewRestored=false;
function restoreInitialView(){
  if(initialViewRestored)return;
  initialViewRestored=true;
  const last=loadViewState();

  if(last?.view==="project" && last.projectId && projectStore.projects[last.projectId]){
    openProject(last.projectId,"replace");
    return;
  }
  if(last?.view==="folder" && last.folderId && projectStore.folders?.[last.folderId]){
    showFolderView(last.folderId,"replace");
    return;
  }
  showProjectHome("replace");
}
if(document.readyState==="complete")restoreInitialView();
else window.addEventListener("load",restoreInitialView,{once:true});



/* Full-app UI language layer. User-entered titles, folder names, notes and custom stage names are never translated. */
const FULL_I18N={
 en:{
 "作品一覧":"Projects","プロジェクト":"Projects","＋ プロジェクト":"+ Project","＋ 新しいプロジェクト":"+ New Project","＋ フォルダ":"+ Folder","名前変更":"Rename","削除":"Delete",
 "メモ一覧":"Notes","作品名":"Project title","制作ページ数":"Pages","制作ページ":"Pages",
 "作業開始日":"Start Date","締切予定日":"Deadline","工程表":"Production Table",
"未着手":"Not started","着手中":"In progress","完成済み":"Completed","着手":"Started","完成":"Completed",
 "新しいプロジェクト":"New Project","作品編集":"Edit Project","工程設定":"Stage Settings","工程をカスタマイズ":"Customize Stages",
 "＋ 工程を追加":"+ Add Stage","キャンセル":"Cancel","保存":"Save","作成":"Create","編集":"Edit","この作品を削除":"Delete Project",
 "新しいフォルダ":"New Folder","フォルダ名":"Folder name","フォルダ名を変更":"Rename Folder","フォルダから戻す":"Move out of folder",
 "付箋":"Page Note","付箋を削除":"Delete Note","閉じる":"Close","すべて":"All","赤":"Red","黄":"Yellow","青":"Blue","緑":"Green","移動":"Go",
 "使い方":"Help","工程マスをタップ":"Tap a stage cell","長押し＋スライド":"Long press + slide",
 "ページ番号をタップ":"Tap a page number","マーカー":"Legend",
 "💾 バックアップ":"💾 Backup","📂 復元":"📂 Restore","工程":"Stages","工程名":"Stage name",
 "言語":"Language","アプリ設定":"App Settings","新規プロジェクトのデフォルト":"New Project Defaults","設定":"Settings","Libraryの使い方":"Library Help","フォルダで整理":"Organize with folders","ゴミ箱":"Trash","バックアップ":"Backup","テーマカラー":"Theme Color","完了セルや選択状態などのアクセントカラーに使われます。":"Used for completed cells and selected states.",
 "全工程":"All stages","締切":"Deadline","なし":"None","ページ":"Pages","未設定":"Not set","完了":"Done",
 "データ収集中":"Collecting data","完成！":"Complete!","変更は自動保存されます":"Changes are saved automatically",
 "保存しました ✓":"Saved ✓","該当するメモはありません。":"No matching notes.","（メモ本文なし）":"(No note text)",
 "修正点・忘れたくないことなど":"Corrections, reminders, etc.",
 "工程名の変更・並び替え・追加・削除":"Rename, reorder, add or delete stages.",
 "新しいプロジェクトを作るときの初期値です。プロジェクトごとに変更できます。":"Initial values for new projects. You can change them for each project.",
 "作品ごとの進捗・付箋・作業履歴は端末内に自動保存されます。":"Project progress, notes and work history are saved automatically on this device.",
 "まだ作品がありません。":"No projects yet.","「＋ 新しいプロジェクト」から作成できます。":"Create one with “+ New Project”.",
 
 
 "Chromeのダウンロード一覧または端末の「Downloads」を確認してください。":"Check Chrome downloads or the device Downloads folder.",
 "タップするたびに「未着手 → 着手 → 完了 → 未着手」と切り替わります。":"Each tap cycles: Not started → In progress → Complete → Not started.",
 "工程マスを約0.5秒長押しし、上下または左右になぞると範囲をプレビューできます。指を離すと確定します。振動したら開始です。":"Long-press a stage cell for about 0.5 seconds, then slide vertically or horizontally to preview the range. Release to apply it. It starts when the device vibrates.",
 "そのページに付箋メモを付けられます。赤・黄・青・緑で分類でき、「メモ一覧」から絞り込みやページ移動もできます。":"Add a note to a page and classify it by red, yellow, blue or green. Filter notes and jump to pages from Notes.",
 }};
function translateExactText(root=document){
 if(uiLang()!=="en")return;
 const map=FULL_I18N.en;
 const walker=document.createTreeWalker(root,NodeFilter.SHOW_TEXT);
 const nodes=[];while(walker.nextNode())nodes.push(walker.currentNode);
 nodes.forEach(n=>{
   if(n.parentElement?.closest("input,textarea,option"))return;
   const raw=n.nodeValue,trim=raw.trim();
   if(map[trim])n.nodeValue=raw.replace(trim,map[trim]);
 });
 document.querySelectorAll('input[placeholder]').forEach(el=>{
   const p=el.getAttribute("placeholder");if(map[p])el.setAttribute("placeholder",map[p]);
 });
}
/* ---- i18n helpers ---- */
const I18N_MORE_EN={
 "作品編集":"Edit Project","作品名":"Project title","制作ページ":"Pages","制作ページ数":"Pages",
 "作業開始日":"Start Date","締切予定日":"Deadline","工程設定":"Stage Settings",
 "工程をカスタマイズ":"Customize Stages","工程名":"Stage name",
 "変更しなければ「ネーム・ペン・背景・トーン・写植」で作成されます":"If unchanged, the default stages will be used.",
 "工程名の変更・並び替え・追加・削除":"Rename, reorder, add or delete stages.",
 "変更は自動保存されます":"Changes are saved automatically",
 "完成":"Completed","着手":"Started","全工程":"All stages","締切":"Deadline",
 "ページ":"Pages","未設定":"Not set","無題":"Untitled",
 "この工程":"This stage","全工程完了":"All stages complete",
 "完成予想との差分は、作業履歴がたまると表示":"The forecast comparison appears after enough work history is collected.",
 "新しい工程":"New Stage"
};
Object.assign(FULL_I18N.en,I18N_MORE_EN);

Object.assign(FULL_I18N.en,{
 "制作進捗":"Overall Progress",
 "制作中":"In progress",
 "完成率":"Completion",
 "直近7日間":"Last 7 days",
 "完成予想":"Estimated Completion",
 "締切まで":"Until deadline",
 "必要ペース":"Required pace"
});


function translateUiPatterns(root=document){
 if(uiLang()!=="en")return;
 const els=(root===document?[...document.querySelectorAll("*")]:
   [root,...(root.querySelectorAll?[...root.querySelectorAll("*")]:[])]);
 for(const el of els){
   if(!el || el.children.length || el.matches?.("script,style,input,textarea,option"))continue;
   const raw=el.textContent, s=raw.trim();
   if(!s)continue;
   let x=s;
   if(FULL_I18N.en[x]) x=FULL_I18N.en[x];
   else{
     x=x.replace(/^全(\d+)P$/,"$1 pages")
      .replace(/^(\d+)P\s*\/\s*(\d+)P$/,"$1 / $2 pages")
      .replace(/^(\d+)作品$/,"$1 projects")
       .replace(/^(\d+)–(\d+) \/ 全(\d+)P$/,"$1–$2 / $3 pages")
       .replace(/^完成\s*(\d+)\s*\/\s*(\d+)P$/,"Completed $1 / $2 pages")
       .replace(/^着手\s*(\d+)%\s*・\s*完成\s*(\d+)%$/,"Started $1% · Completed $2%")
       .replace(/^着手\s*(\d+)%$/,"Started $1%")
       .replace(/^完成\s*(\d+)%$/,"Completed $1%")
       .replace(/^全(\d+)工程$/,"$1 stages")
       .replace(/^あと約(\d+)日$/,"About $1 days")
       .replace(/^締切まで\s*あと(\d+)日$/,"$1 days until deadline")
       .replace(/^締切を\s*(\d+)日超過$/,"$1 days past deadline")
       .replace(/^完成予想は締切より\s*(\d+)日早いペース$/,"Forecast: $1 days before deadline")
       .replace(/^完成予想は締切より\s*(\d+)日超過するペース$/,"Forecast: $1 days after deadline")
       .replace(/^完成予想は締切予定日と同日$/,"Forecast matches the deadline")
       .replace(/^必要ペース\s*1日([\d.]+)工程$/,"Required pace: $1 stages/day")
       .replace(/^締切まで\s*あと(\d+)日\s*・\s*完成予想は締切より\s*(\d+)日超過するペース\s*・\s*必要ペース\s*1日([\d.]+)工程$/,"$1 days until deadline · Forecast is $2 days after deadline · Required pace: $3 stages/day")
       .replace(/^締切まで\s*あと(\d+)日\s*・\s*完成予想は締切より\s*(\d+)日早いペース\s*・\s*必要ペース\s*1日([\d.]+)工程$/,"$1 days until deadline · Forecast is $2 days before deadline · Required pace: $3 stages/day")
       .replace(/^(\d+)作品$/,"$1 projects")
       .replace(/^(\d+)P 付箋$/,"Page $1 note");
   }
   if(x!==s)el.textContent=raw.replace(s,x);
 }
 // title/placeholderなど
 document.title="fillio";
 document.querySelectorAll("[placeholder]").forEach(el=>{
   const p=el.getAttribute("placeholder");
   if(p==="作品名")el.setAttribute("placeholder","Project title");
   if(p==="フォルダ名")el.setAttribute("placeholder","Folder name");
   if(p==="修正点・忘れたくないことなど")el.setAttribute("placeholder","Corrections, reminders, etc.");
 });
}

/* ---- Deterministic runtime language switch ----
   Keep user-authored project/folder/stage/note text untouched.
   Re-render first, then localize fixed/dynamic UI in one direction. */
const JA_STATIC_BY_ID={
  memoListButton:"メモ一覧",
  settingsTitle:"アプリ設定",
  settingsDefaultsTitle:"新規プロジェクトのデフォルト",
  settingsPagesLabel:"制作ページ",
  settingsStagesLabel:"工程",
  defaultStageAdd:"＋ 工程を追加",
  settingsNote:"新しいプロジェクトを作るときの初期値です。プロジェクトごとに変更できます。",
  settingsCancel:"キャンセル",settingsSave:"保存"
};
function restoreKnownJapaneseUi(){
  Object.entries(JA_STATIC_BY_ID).forEach(([id,txt])=>{const el=document.getElementById(id);if(el)el.textContent=txt});
  document.title="fillio";
  document.documentElement.lang="ja";
}
function rerenderCurrentViewForLanguage(){
  try{
    if(currentProjectId && projectStore.projects[currentProjectId]){
      render();
      renderProjectBreadcrumb();
    }else{
      renderProjectList();
      if(typeof renderFoldersAndFilter==="function")renderFoldersAndFilter();
    }
  }catch(e){}
}
function applyCurrentLanguageNow(){
  syncSplitSettings();
  rerenderCurrentViewForLanguage();
  if(languageSettings.language==="en"){
    applyLanguage();
    translateExactText(document);
    translateUiPatterns(document);
  }else{
    // The current view was already re-rendered above. Rendering it a second
    // time here races with renderFoldersAndFilter()'s frame guard: in a
    // folder view renderProjectList() rebuilt every card, then the guarded
    // filter skipped, making the UI temporarily look like Library root until
    // reload. Only restore fixed Japanese labels here.
    restoreKnownJapaneseUi();
  }
}
/* ---- Separate Language UI and Project Defaults UI ---- */
function updateLanguageButtons(){
 document.querySelectorAll(".language-option").forEach(b=>b.classList.toggle("active",b.dataset.lang===languageSettings.language));
 const cancel=document.getElementById("languageCancel");
 if(cancel){cancel.textContent="×";cancel.setAttribute("aria-label",languageSettings.language==="en"?"Close":"閉じる");}
}
document.getElementById("languageButton").onclick=()=>{
 updateLanguageButtons();
 document.getElementById("languageModal").classList.add("open");
};
document.getElementById("languageCancel").onclick=()=>document.getElementById("languageModal").classList.remove("open");
document.getElementById("languageModal").onclick=e=>{if(e.target.id==="languageModal")e.currentTarget.classList.remove("open")};

document.getElementById("appSettingsButton").onclick=()=>{
 refreshSettingsLanguage();
 document.getElementById("defaultPages").value=clampPageCount(projectDefaults.pages);
 defaultStageDraft=cloneStages(projectDefaults.stages);
 renderDefaultStageEditor();
 localizeDefaultsSettingsUi();
 lockPageScroll();
 document.getElementById("appSettingsModal").classList.add("open");
};
document.getElementById("settingsSave").onclick=()=>{
 const b=clampPageCount(document.getElementById("defaultPages").value);
 const ss=defaultStageDraft.map(normalizeStage);
 if(!ss.length)return;
 appSettings=normalizeAppSettings({
   language:languageSettings.language,
   defaultPages:b,
   defaultStages:cloneStages(ss)
 });
 persistAppSettings();
 document.getElementById("appSettingsModal").classList.remove("open");
 unlockPageScroll();
 applyCurrentLanguageNow();
};
document.getElementById("appLanguage").value=languageSettings.language;
updateLanguageButtons();

/* Reset ONLY the stage list used as defaults for newly-created projects.
   Existing projects and their progress are never touched. */
const defaultStageReset=document.getElementById("defaultStageReset");
if(defaultStageReset){
 const updateDefaultStageResetLabel=()=>{
   defaultStageReset.textContent=languageSettings.language==="en"?"Reset Stages":"工程を初期設定に戻す";
 };
 updateDefaultStageResetLabel();
 defaultStageReset.onclick=()=>{
   const en=languageSettings.language==="en";
   const ok=confirm(en
     ?"Reset the default stages for new projects?\nExisting projects will not be affected."
     :"新規プロジェクト用の工程を初期設定に戻しますか？\n既存の作品には影響しません。");
   if(!ok)return;
   defaultStageDraft=cloneStages(DEFAULT_STAGES);
   renderDefaultStageEditor();
 };
}




/* ---- Persistence + default-settings language ---- */
function localizeDefaultsSettingsUi(){
 const en=languageSettings.language==="en";
 const set=(id,ja,enText)=>{const el=document.getElementById(id);if(el)el.textContent=en?enText:ja};
 set("settingsTitle","アプリ設定","Default Settings");
 set("settingsDefaultsTitle","新規プロジェクトのデフォルト","New Project Defaults");
 set("settingsPagesLabel","制作ページ","Pages");
 set("settingsStagesLabel","工程","Stages");
 set("defaultStageAdd","＋ 工程を追加","+ Add Stage");
 set("defaultStageReset","工程を初期設定に戻す","Reset Stages");
 set("settingsNote","新しいプロジェクトを作るときの初期値です。プロジェクトごとに変更できます。","These initial values are used when creating a new project. You can change them per project.");
 set("settingsCancel","キャンセル","Cancel");
 set("settingsSave","保存","Save");
}
function refreshSettingsLanguage(){
 localizeDefaultsSettingsUi();
 if(document.getElementById("appSettingsModal").classList.contains("open")){
   defaultStageDraft=cloneStages(projectDefaults.stages);
   renderDefaultStageEditor();
 }
}
setTimeout(()=>localizeDefaultsSettingsUi(),0);


/* ---- Folder rendering + localized default stage names ---- */
/* After startup/reload, force one final folder-aware render after all language
   initialization has finished. This does not change folderId data. */
setTimeout(()=>{
 folderRendering=false;
 if(!currentProjectId){
   renderProjectList();
   renderFoldersAndFilter();
 }
},40);



/* Visible project title */
function refreshCurrentProjectTitle(){
 if(!currentProjectId)return;
 const p=projectStore.projects[currentProjectId];
 const el=document.getElementById("currentProjectTitle");
 if(el&&p)el.textContent=p.title||"";
 const lab=document.getElementById("currentProjectTitleLabel");
 if(lab)lab.textContent=languageSettings.language==="en"?"Project":"作品";
}
document.addEventListener("click",()=>setTimeout(refreshCurrentProjectTitle,0),true);
setTimeout(refreshCurrentProjectTitle,0);



(function(){
 const list=document.getElementById("projectList");if(!list)return;
 list.addEventListener("contextmenu",e=>{
   if(e.target.closest(".folder-item,.project-item"))e.preventDefault();
 });
 list.addEventListener("selectstart",e=>{
   if(e.target.closest(".folder-item,.project-item"))e.preventDefault();
 });
})();
/* Data management labels. */
(function(){
  function localizeDataManagement(){
    const lang=(typeof languageSettings!=="undefined" && languageSettings?.language==="en")?"en":"ja";
    const set=(id,ja,en)=>{const el=document.getElementById(id);if(el)el.textContent=lang==="en"?en:ja};
    set("dataManagementTitle","データ管理","Data Management");
    set("dataManagementNote",
      "全作品・フォルダ・進捗・付箋・作業履歴を1つのJSONに保存します。",
      "Save all projects, folders, progress, notes and work history in one JSON file.");
  }
  localizeDataManagement();
  document.querySelectorAll(".language-option").forEach(btn=>{
    btn.addEventListener("click",()=>setTimeout(localizeDataManagement,0));
  });
  document.getElementById("appSettingsButton")?.addEventListener("click",localizeDataManagement);
})();


/* ===== I18N CLEAN AUTHORITY =====
   One runtime authority. Japanese HTML/render output is the source of truth.
   English is applied as a presentation layer. User-authored project/folder/stage/note
   text is excluded. Language changes persist once, then reload once. */
const CLEAN_EN_EXACT = {
 "全体":"OVERALL",
 "作品一覧":"Projects","プロジェクト":"Projects","メモ一覧":"Notes","総合進捗":"Overall Progress","制作進捗":"Overall Progress",
 "制作中":"In progress","完成率":"Completion","工程表":"Production Table",
 "変更は自動保存されます":"Changes are saved automatically",
 "着手中":"In progress","完成済み":"Completed","着手":"Started","完成":"Completed",
"閉じる":"Close","言語":"Language","アプリ設定":"App Settings",
 "新規プロジェクトのデフォルト":"New Project Defaults","制作ページ":"Pages","工程":"Stages",
 "＋ 工程を追加":"+ Add Stage","キャンセル":"Cancel","保存":"Save","データ管理":"Data Management","ページ":"Pages","全工程":"All stages","締切":"Deadline","未設定":"Not set","編集":"Edit","この作品を削除":"Delete this project","作品":"projects",
};
const CLEAN_USER_TEXT_SELECTOR = [
 ".project-title",".project-name",".folder-name",
"#pages .stage-name",".memo-text",".memo-list",
 "input[type=text]","textarea","[data-user-text]"
].join(",");

function cleanEnglishPass(root=document){
 if(languageSettings?.language!=="en")return;
 document.documentElement.lang="en";
 document.title="fillio";
 const walker=document.createTreeWalker(root,NodeFilter.SHOW_TEXT);
 const nodes=[]; while(walker.nextNode())nodes.push(walker.currentNode);
 for(const n of nodes){
   const el=n.parentElement;
   if(!el || el.closest("script,style,option") || el.closest(CLEAN_USER_TEXT_SELECTOR))continue;
   const raw=n.nodeValue||"", s=raw.trim(); if(!s)continue;
   let x=CLEAN_EN_EXACT[s]||FULL_I18N?.en?.[s]||s;
   x=x.replace(/^締切まで\s*あと(\d+)日\s*・\s*完成予想は締切より\s*(\d+)日超過するペース\s*・\s*必要ペース\s*1日([\d.]+)工程$/,"$1 days until deadline · Forecast is $2 days after deadline · Required pace: $3 stages/day")
      .replace(/^締切まで\s*あと(\d+)日\s*・\s*完成予想は締切より\s*(\d+)日早いペース\s*・\s*必要ペース\s*1日([\d.]+)工程$/,"$1 days until deadline · Forecast is $2 days before deadline · Required pace: $3 stages/day")
      .replace(/^締切まで\s*あと(\d+)日\s*・\s*完成予想は締切予定日と同日\s*・\s*必要ペース\s*1日([\d.]+)工程$/,"$1 days until deadline · Forecast matches the deadline · Required pace: $2 stages/day")
      .replace(/^全(\d+)P$/,"$1 pages")
      .replace(/^(\d+)–(\d+)\s*\/\s*全(\d+)P$/,"$1–$2 / $3 pages")
      .replace(/^完成\s*(\d+)\s*\/\s*(\d+)P$/,"Completed $1 / $2 pages")
      .replace(/^着手\s*(\d+)%\s*・\s*完成\s*(\d+)%$/,"Started $1% · Completed $2%")
      .replace(/^あと約(\d+)日$/,"About $1 days")
      .replace(/^締切まで\s*あと(\d+)日$/,"$1 days until deadline")
      .replace(/^締切を\s*(\d+)日超過$/,"$1 days past deadline")
      .replace(/^完成予想は締切より\s*(\d+)日超過するペース$/,"Forecast is $1 days after deadline")
      .replace(/^完成予想は締切より\s*(\d+)日早いペース$/,"Forecast is $1 days before deadline")
      .replace(/^必要ペース\s*1日([\d.]+)工程$/,"Required pace: $1 stages/day");
   if(x!==s)n.nodeValue=raw.replace(s,x);
 }
}

let cleanI18nTimer=0;
const cleanI18nObserver=new MutationObserver((mutations)=>{
 if(languageSettings?.language!=="en")return;
 const roots=new Set();
 for(const m of mutations){
   const el=m.target?.nodeType===Node.TEXT_NODE ? m.target.parentElement : m.target;
   if(el && el.nodeType===Node.ELEMENT_NODE) roots.add(el);
 }
 clearTimeout(cleanI18nTimer);
 cleanI18nTimer=setTimeout(()=>{
   for(const el of roots){
     if(el.isConnected)cleanEnglishPass(el);
   }
 },0);
});
if(languageSettings?.language==="en"){
 cleanI18nObserver.observe(document.body,{subtree:true,childList:true,characterData:true});
 setTimeout(()=>cleanEnglishPass(document),80);
}else{
 document.documentElement.lang="ja";
 document.title="fillio";
}

document.querySelectorAll(".language-option").forEach(btn=>{
 btn.onclick=()=>{
   const selected=btn.dataset.lang==="en"?"en":"ja";
   if(selected===languageSettings.language){
     document.getElementById("languageModal")?.classList.remove("open");
     return;
   }
   appSettings=normalizeAppSettings({
     language:selected,
     defaultPages:projectDefaults.pages,
     defaultStages:cloneStages(projectDefaults.stages)
   });
   persistAppSettings();
   location.reload();
 };
});
/* ===== /I18N CLEAN AUTHORITY ===== */


/* ---- Modal/list i18n consistency ---- */
function localizeNoColorSwatch(){
 const el=document.querySelector(".color-pick-none");
 if(!el)return;
 const label=t("color.none");
 el.setAttribute("aria-label",label);
 el.setAttribute("title",label);
}
function localizeOpenUi(){
 localizeNoColorSwatch();
 const en=uiLang()==="en";
 const set=(sel,ja,enText)=>{const el=document.querySelector(sel);if(el)el.textContent=en?enText:ja};
 const ph=(sel,ja,enText)=>{const el=document.querySelector(sel);if(el)el.placeholder=en?enText:ja};
 set("#memoListModal .memo-head h2",t("notes.title"),t("notes.title"));
 {const el=document.querySelector("#closeMemoList");if(el){el.textContent="×";el.setAttribute("aria-label",t("common.close"));}}
 const filters=[["all","すべて","All"],["none","無色","No color"],["#f4a6a6","赤","Red"],["#f4dc8a","黄","Yellow"],["#9ec8f4","青","Blue"],["#a9ddb0","緑","Green"]];
 filters.forEach(([key,ja,enText])=>{const el=document.querySelector(`.memo-filter[data-filter="${key}"]`);if(el)el.textContent=en?enText:ja});
 set("#stickyLabelCaption",t("memo.label"),t("memo.label"));
 ph("#stickyLabel",t("memo.labelPlaceholder"),t("memo.labelPlaceholder"));
 ph("#stickyText",t("memo.textPlaceholder"),t("memo.textPlaceholder"));
 ph("#stickyTodoInput",t("memo.todoPlaceholder"),t("memo.todoPlaceholder"));
 set("#stickyDelete",t("memo.delete"),t("memo.delete"));
 set("#stickySave",t("common.save"),t("common.save"));
 // fixed UI in any currently open JS modal is normalized on every call.
 document.querySelectorAll('.project-modal.open,.folder-modal.open,.memo-modal.open,.sticky-modal.open').forEach(root=>{
   if(en){translateExactText(root);translateUiPatterns(root)}
 });
}
const _openStickyI18n=openSticky;
openSticky=function(page){_openStickyI18n(page);localizeOpenUi();};
const _renderMemoListI18n=renderMemoList;
renderMemoList=function(){_renderMemoListI18n();localizeOpenUi();};
const _applyCurrentLanguageNowI18n=applyCurrentLanguageNow;
applyCurrentLanguageNow=function(){_applyCurrentLanguageNowI18n();localizeOpenUi();};
setTimeout(localizeOpenUi,0);


/* ===== Dynamic UI i18n =====
   Covers UI created/re-rendered by JavaScript. User-authored text is never translated. */
const DYNAMIC_UI_EN={
  "ページ":"Pages","完成":"Completed","全工程":"All stages","編集":"Edit","この作品を削除":"Delete this project",
  "フォルダから戻す":"Move out of folder","移動":"Go","付箋を削除":"Delete Note","保存":"Save","閉じる":"Close",
  "すべて":"All","赤":"Red","黄":"Yellow","青":"Blue","緑":"Green","今日":"Today",
  "全工程完了":"All stages complete","データ収集中":"Collecting data","完成！":"Complete!"
};
function auditDynamicUiLanguage(root=document){
  if(uiLang()!=="en")return;
  const scope=root?.querySelectorAll?root:document;
  const all=(root===document?[...document.querySelectorAll("*")]:[root,...root.querySelectorAll("*")]);
  for(const el of all){
    if(!el || el.matches?.("script,style,input,textarea,option") || el.closest?.("[data-user-text],.memo-text,.sticky-todo-item span,.memo-todo-item span"))continue;
    if(el.children.length===0){
      const raw=el.textContent||"", t=raw.trim();
      let x=DYNAMIC_UI_EN[t]||FULL_I18N?.en?.[t]||t;
      x=x.replace(/^まだ作品がありません。$/,"No projects yet.")
         .replace(/^「＋ 新しいプロジェクト」から作成できます。$/,"Create one with “+ New Project”.")
         .replace(/^全(\d+)P$/,"$1 pages")
         .replace(/^(\d+)P\s*\/\s*(\d+)P$/,"$1 / $2 pages")
         .replace(/^(\d+)作品$/,"$1 projects")
         .replace(/^あと約(\d+)日$/,"About $1 days")
         .replace(/^完成予想は締切より\s*(\d+)日早いペース$/,"Forecast is $1 days before deadline")
         .replace(/^完成予想は締切より\s*(\d+)日超過するペース$/,"Forecast is $1 days after deadline")
         .replace(/^完成予想は締切予定日と同日$/,"Forecast matches the deadline")
         .replace(/^必要ペース\s*1日([\d.]+)工程$/,"Required pace: $1 stages/day");
      if(x!==t)el.textContent=raw.replace(t,x);
    }
  }
  // Dynamic controls inside memo list are intentionally outside the generic text pass
  // because memo bodies are user-authored.
  document.querySelectorAll('#memoList .memo-jump,[data-action="memo-jump"]').forEach(el=>{el.textContent="Go"});
  // Project cards are frequently rebuilt wholesale.
  document.querySelectorAll('.project-item').forEach(card=>{
    const rows=card.querySelectorAll('.project-meta-row span');
    rows.forEach(el=>{const t=el.textContent.trim(); if(DYNAMIC_UI_EN[t])el.textContent=DYNAMIC_UI_EN[t]});
    const del=card.querySelector('.project-delete-button');if(del)del.textContent="Delete this project";
  });
  localizeOpenUi?.();
}
let dynamicAuditTimer=0;
const dynamicAuditObserver=new MutationObserver(muts=>{
  if(uiLang()!=="en")return;
  clearTimeout(dynamicAuditTimer);
  dynamicAuditTimer=setTimeout(()=>auditDynamicUiLanguage(document),0);
});
if(uiLang()==="en")dynamicAuditObserver.observe(document.body,{subtree:true,childList:true,characterData:true});
setTimeout(()=>auditDynamicUiLanguage(document),0);
/* ===== /Dynamic UI i18n ===== */


/* Library trash-drop behavior lives in app-library-drag.js. */

/* ===== Unified create menu ===== */
(function setupUnifiedCreateMenu(){
 const toggle=document.getElementById("createMenuButton");
 const menu=document.getElementById("createMenu");
 const projectBtn=document.getElementById("newProjectButton");
 const folderBtn=document.getElementById("folderAdd");
 const trashBtn=document.getElementById("trashOpen");
 if(!toggle||!menu||!projectBtn||!folderBtn)return;
 const isEn=()=>languageSettings?.language==="en";
 const closeMenu=()=>{menu.classList.remove("open");toggle.setAttribute("aria-expanded","false")};
 const syncLabels=()=>{
   toggle.setAttribute("aria-label",t("create.label"));
   trashBtn?.setAttribute("aria-label",t("trash.title"));
   const p=projectBtn.querySelector("span"),f=folderBtn.querySelector("span");
   if(p)p.textContent=t("create.project");
   if(f)f.textContent=t("create.folder");
   // One-level folder model: creating another folder while inside one is not available.
   folderBtn.style.display=(typeof currentFolderId!=="undefined"&&currentFolderId)?"none":"flex";
 };
 toggle.addEventListener("click",e=>{e.stopPropagation();syncLabels();const open=!menu.classList.contains("open");menu.classList.toggle("open",open);toggle.setAttribute("aria-expanded",String(open))});
 menu.addEventListener("click",e=>e.stopPropagation());
 projectBtn.addEventListener("click",closeMenu);
 folderBtn.addEventListener("click",closeMenu);
 document.addEventListener("click",closeMenu);
 document.addEventListener("keydown",e=>{if(e.key==="Escape")closeMenu()});
 syncLabels();
})();
/* ===== /Unified create menu ===== */
