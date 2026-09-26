const PROJECT_PAGE_MAX=300;
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
applyDisplayMode();

// Explicit editor DOM references; do not rely on legacy window.<id> globals.
const pages=document.getElementById("pages");
const range=document.getElementById("range");
const navPage=document.getElementById("navPage");
const prev=document.getElementById("prev");
const next=document.getElementById("next");
const startPageInput=document.getElementById("startPageInput");
const endPageInput=document.getElementById("endPageInput");
const totalPageLabel=document.getElementById("totalPageLabel");

let stages=[...DEFAULT_STAGES];
let totalPages=48,startPage=1,currentView=0,progress=createProgress(48);
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
function backFromProject(){
  if(window.history.state?.fillio){window.history.back();return}
  const fid=projectParentFolderId(currentProjectId);
  if(fid)showFolderView(fid);
  else showProjectHome();
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
    if(currentProjectId===id) updateSummary();
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
    app:"manga-progress",
    version:5,
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
  // v5: 全作品バックアップ
  if(data&&data.type==="multi-project"&&data.projects&&typeof data.projects==="object"){
    const restored={};
    Object.entries(data.projects).forEach(([id,p])=>{
      if(p&&Array.isArray(p.progress))restored[id]=normalizeProjectData(p);
    });
    if(!Object.keys(restored).length)throw new Error("invalid");
    projectStore={
      version:2,
      activeProjectId:null,
      projects:restored,
      projectOrder:Array.isArray(data.projectOrder)?data.projectOrder:[],
      folders:(data.folders&&typeof data.folders==="object")?data.folders:{},
      rootOrder:Array.isArray(data.rootOrder)?data.rootOrder:[]
    };
    persistProjectStore();
    showProjectHome();
    return "all";
  }
  // v4以前: 1作品バックアップは新しいプロジェクトとして追加
  if(!data||!Number.isInteger(data.totalPages)||data.totalPages<1||data.totalPages>500||!Array.isArray(data.progress))throw new Error("invalid");
  const id=newProjectId();
  projectStore.projects[id]=normalizeProjectData(data);
  projectStore.activeProjectId=id;
  persistProjectStore();
  openProject(id);
  return "single";
}
function resizeProgress(n){
  n=Math.max(1,Math.min(500,Number(n)||48));
  const old=progress;
  progress=Array.from({length:n},(_,p)=>old[p]?[...old[p]]:Array(stages.length).fill(0));
  totalPages=n;currentView=Math.min(currentView,Math.max(0,Math.ceil(n/12)-1));
  save();render();
}
function updateSummary(){
  const f=progress.flat(),st=f.filter(v=>v>0).length,dn=f.filter(v=>v===2).length,t=Math.max(1,totalPages*stages.length);
  const sp=Math.round(st/t*100),dp=Math.round(dn/t*100);
  startedPercent.textContent=sp+"%";donePercent.textContent=dp+"%";
  const overallRing=document.getElementById("overallRing");
  if(overallRing){
    overallRing.style.background=`conic-gradient(var(--done) 0 ${dp}%,var(--started) ${dp}% ${sp}%,#eceef1 ${sp}% 100%)`;
  }
  const completedPageCount=progress.filter(r=>r.every(v=>v===2)).length;
  completePages.textContent=languageSettings?.language==="en" ? `Completed ${completedPageCount} / ${totalPages} pages` : `完成 ${completedPageCount} / ${totalPages}P`;
  renderStages();renderHistory();
}

function renderHistory(){
  rollHistory();
  const today=localDate(),values=[];
  for(let i=-6;i<=0;i++){
    const date=addDays(today,i);
    values.push({date,value:date===today?todayDelta():Number(history.days[date]||0)});
  }
  const total=values.reduce((a,x)=>a+x.value,0);
  const avg=total/7;
  const td=todayDelta();
  todayWork.textContent=(td>=0?"+":"")+td;
  weekWork.textContent=total;
  avgWork.textContent=avg.toFixed(1);

  const max=Math.max(1,...values.map(x=>Math.abs(x.value)));
  historyChart.innerHTML="";
  values.forEach((x,i)=>{
    const el=document.createElement("div");el.className="history-day";
    const h=x.value===0?2:Math.max(6,Math.round(Math.abs(x.value)/max*72));
    const label=i===6?"今日":`${Number(x.date.slice(5,7))}/${Number(x.date.slice(8,10))}`;
    el.innerHTML=`<div class="history-value">${x.value>0?"+":""}${x.value}</div><div class="history-bar" style="height:${h}px;${x.value<0?"opacity:.35":""}"></div><div class="history-label">${label}</div>`;
    historyChart.appendChild(el);
  });

  const weightedValues=[];
  for(let i=-6;i<=0;i++){
    const date=addDays(today,i);
    weightedValues.push(date===today?todayWeightedDelta():Number(history.weightedDays?.[date]||0));
  }
  const weightedAvg=weightedValues.reduce((a,v)=>a+v,0)/7;
  const remaining=totalPages*stages.length-weightedCount();
  if(remaining<=0){
    forecastDate.innerHTML=`完成！<br><span style="font-size:10px;color:var(--muted);font-weight:400">全工程完了</span>`;
  }else if(weightedAvg>0){
    const days=Math.ceil(remaining/weightedAvg),d=new Date();d.setDate(d.getDate()+days);
    forecastDate.innerHTML=`${d.getMonth()+1}/${d.getDate()}<br><span style="font-size:10px;color:var(--muted);font-weight:400">あと約${days}日</span>`;
  }else{
    forecastDate.innerHTML=`—<br><span style="font-size:10px;color:var(--muted);font-weight:400">データ収集中</span>`;
  }

  // 締切予定日と完成予想の差分
  const deadlineEl=document.getElementById("deadlineStatus");
  if(deadlineEl){
    const active=projectStore?.projects?.[projectStore.activeProjectId];
    const deadline=active?.deadline||document.getElementById("deadlineInput")?.value||"";
    const isEnglish=languageSettings?.language==="en";
    if(!deadline){
      deadlineEl.textContent="";
    }else if(doneCount()===totalPages*stages.length){
      deadlineEl.textContent=isEnglish
        ? `Deadline ${deadline.replaceAll("-","/")} · Completed`
        : "締切 "+deadline.replaceAll("-","/")+" ・ 完成済み";
    }else{
      const dl=new Date(deadline+"T00:00:00");
      const todayDate=new Date(localDate()+"T00:00:00");
      const msDay=86400000;
      const daysToDeadline=Math.round((dl-todayDate)/msDay);
      const remWeighted=Math.max(0,totalPages*stages.length-weightedCount());
      const needPerDay=daysToDeadline>=0 ? remWeighted/Math.max(1,daysToDeadline+1) : null;

      let forecastDiff="";
      if(weightedAvg>0){
        const forecastDays=Math.ceil(remWeighted/weightedAvg);
        const forecastDate=new Date(todayDate);
        forecastDate.setDate(forecastDate.getDate()+forecastDays);
        const diff=Math.round((dl-forecastDate)/msDay);
        if(diff>0) forecastDiff=`完成予想は締切より ${diff}日早いペース`;
        else if(diff<0) forecastDiff=`完成予想は締切より ${Math.abs(diff)}日超過するペース`;
        else forecastDiff="完成予想は締切予定日と同日";
      }else{
        forecastDiff="完成予想との差分は、作業履歴がたまると表示";
      }

      const deadlineLabel=daysToDeadline>=0
        ? `締切まで あと${daysToDeadline}日`
        : `締切を ${Math.abs(daysToDeadline)}日超過`;

      const paceLabel=needPerDay===null
        ? ""
        : ` ・ 必要ペース 1日${needPerDay.toFixed(1)}工程`;

      if(isEnglish){
        const deadlineLabelEn=daysToDeadline>=0
          ? `${daysToDeadline} days until deadline`
          : `${Math.abs(daysToDeadline)} days past deadline`;
        let forecastDiffEn="";
        if(weightedAvg>0){
          const forecastDays=Math.ceil(remWeighted/weightedAvg);
          const forecastDateEn=new Date(todayDate);
          forecastDateEn.setDate(forecastDateEn.getDate()+forecastDays);
          const diffEn=Math.round((dl-forecastDateEn)/msDay);
          if(diffEn>0) forecastDiffEn=`Forecast is ${diffEn} days before deadline`;
          else if(diffEn<0) forecastDiffEn=`Forecast is ${Math.abs(diffEn)} days after deadline`;
          else forecastDiffEn="Forecast matches the deadline";
        }else{
          forecastDiffEn="The forecast comparison appears after enough work history is collected.";
        }
        const paceLabelEn=needPerDay===null ? "" : ` · Required pace: ${needPerDay.toFixed(1)} stages/day`;
        deadlineEl.textContent=`${deadlineLabelEn} · ${forecastDiffEn}${paceLabelEn}`;
      }else{
        deadlineEl.textContent=`${deadlineLabel} ・ ${forecastDiff}${paceLabel}`;
      }
    }
  }

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
    const actualPage=startPage+p, note=pageNotes[String(actualPage)]||{text:"",color:""};
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
      b.classList.toggle("state-started",progress[p][s]===1);
      b.classList.toggle("state-done",progress[p][s]===2);
      b.onclick=()=>{
        if(Date.now()<suppressCellClickUntil)return;
        progress[p][s]=(progress[p][s]+1)%3;
        setCellVisual(b,progress[p][s]);
        fillioHaptic(8);
        save();
        requestAnimationFrame(()=>updateSummary());
      };
      row.appendChild(b);
    }
    pages.appendChild(row);
  }
  pages.classList.add("prototype-all-pages");
  range.textContent=languageSettings?.language==="en" ? `${totalPages} pages` : `全${totalPages}P`;
  navPage.textContent="";
  prev.disabled=true; next.disabled=true;
}

function render(){renderDynamicTableHead();renderPages();updateSummary()}
prev.onclick=()=>{if(currentView>0){currentView--;renderPages()}};
next.onclick=()=>{if(currentView<Math.ceil(totalPages/12)-1){currentView++;renderPages()}};
function syncRangeUI(){
  startPageInput.value=startPage;
  endPageInput.value=startPage+totalPages-1;
  totalPageLabel.textContent=`全${totalPages}P`;
}
function applyPageRange(){
  const oldStart=startPage;
  let a=Math.max(1,Math.min(999,Number(startPageInput.value)||oldStart));
  let b=Math.max(a,Math.min(999,Number(endPageInput.value)||a));
  const old=progress, oldEnd=oldStart+totalPages-1;
  const newProgress=[];
  for(let page=a;page<=b;page++){
    if(page>=oldStart&&page<=oldEnd) newProgress.push([...old[page-oldStart]]);
    else newProgress.push(Array(stages.length).fill(0));
  }
  startPage=a; totalPages=b-a+1; progress=newProgress; currentView=0;
  syncRangeUI(); save(); render();
}
startPageInput.addEventListener("change",applyPageRange);
endPageInput.addEventListener("change",applyPageRange);
document.getElementById("creationStartDateInput").addEventListener("change",save);
document.getElementById("deadlineInput").addEventListener("change",()=>{save();renderHistory();});
document.getElementById("title").addEventListener("input",save);
document.getElementById("exportBackup").addEventListener("click",exportBackup);
document.getElementById("importBackup").addEventListener("click",()=>document.getElementById("backupFile").click());
document.getElementById("backupFile").addEventListener("change",async e=>{
  const file=e.target.files?.[0];if(!file)return;
  try{
    const data=JSON.parse(await file.text());
    const kind=restoreBackup(data);
    showBackupStatus(kind==="all"
      ?`✅ 全作品のバックアップを復元しました。<br><b>${file.name}</b>`
      :`✅ 1作品を新しいプロジェクトとして復元しました。<br><b>${file.name}</b>`);
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
      const index=page-startPage;
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

document.getElementById("appSettingsButton").onclick=()=>{
 document.getElementById("defaultPages").value=clampPageCount(projectDefaults.endPage-projectDefaults.startPage+1);
 defaultStageDraft=[...projectDefaults.stages];renderDefaultStageEditor();
 applyThemeColor(appSettings.themeColor);
 applyDisplayMode(appSettings.displayMode);
 lockPageScroll();
 document.getElementById("appSettingsModal").classList.add("open");
};
document.getElementById("settingsCancel").onclick=closeAppSettings;
document.getElementById("appSettingsModal").onclick=e=>{if(e.target.id==="appSettingsModal")closeAppSettings()};
document.getElementById("defaultStageAdd").onclick=()=>{if(defaultStageDraft.length>=MAX_STAGES){alert(languageSettings?.language==="en"?`Up to ${MAX_STAGES} stages.`:`工程は最大${MAX_STAGES}個までです。`);return}defaultStageDraft.push(languageSettings.language==="en"?"New Stage":"新しい工程");renderDefaultStageEditor()};
document.getElementById("settingsSave").onclick=()=>{
 let a=1;
 let b=clampPageCount(document.getElementById("defaultPages").value);
 const ss=defaultStageDraft.map(x=>String(x||"").trim()).filter(Boolean);
 if(!ss.length)return;
 appSettings=normalizeAppSettings({language:document.getElementById("appLanguage").value,defaultStartPage:a,defaultEndPage:b,defaultStages:ss,themeColor:document.querySelector(".theme-color-option.selected")?.dataset.themeColor||appSettings.themeColor,displayMode:document.querySelector(".display-mode-option.selected")?.dataset.displayMode||appSettings.displayMode});
 persistAppSettings();applyLanguage();applyThemeColor();applyDisplayMode();
 closeAppSettings();
};

document.querySelectorAll(".theme-color-option").forEach(btn=>btn.addEventListener("click",()=>applyThemeColor(btn.dataset.themeColor)));



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


// Library drag/reorder moved to app-library-drag.js (v36).

// フォルダ・プロトタイプ：1階層のみ
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

// Folder UI operations moved to app-folder.js (v34).

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

// Library drag/drop handlers moved to app-library-drag.js (v36).

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

/* ---- extracted script block ---- */

/* Full-app UI language layer. User-entered titles, folder names, notes and custom stage names are never translated. */
const FULL_I18N={
 en:{
 "作品一覧":"Projects","プロジェクト":"Projects","＋ プロジェクト":"+ Project","＋ 新しいプロジェクト":"+ New Project","＋ フォルダ":"+ Folder","← 戻る":"← Back","名前変更":"Rename","削除":"Delete",
 "漫画制作進捗":"Manga Production Tracker","メモ一覧":"Notes","作品名":"Project title","制作ページ数":"Pages","制作ページ":"Pages",
 "作業開始日":"Start Date","締切予定日":"Deadline","総合進捗":"Overall Progress","制作進捗":"Overall Progress","工程別進捗":"Progress by Stage","工程表":"Production Table",
 "作業履歴":"Work History","今日":"Today","直近7日":"Last 7 days","1日平均":"Daily average","完成予想":"Estimated Completion",
 "← 前":"← Prev","次 →":"Next →","未着手":"Not started","着手中":"In progress","完成済み":"Completed","着手":"Started","完成":"Completed",
 "新しいプロジェクト":"New Project","作品編集":"Edit Project","工程設定":"Stage Settings","工程をカスタマイズ":"Customize Stages",
 "＋ 工程を追加":"+ Add Stage","キャンセル":"Cancel","保存":"Save","作成":"Create","編集":"Edit","この作品を削除":"Delete Project",
 "新しいフォルダ":"New Folder","フォルダ名":"Folder name","フォルダ名を変更":"Rename Folder","フォルダから戻す":"Move out of folder",
 "付箋":"Page Note","付箋を削除":"Delete Note","閉じる":"Close","すべて":"All","赤":"Red","黄":"Yellow","青":"Blue","緑":"Green","移動":"Go",
 "使い方":"Help","工程マスをタップ":"Tap a stage cell","長押し＋スライド":"Long press + slide",
 "ページ番号をタップ":"Tap a page number","マーカー":"Legend",
 "💾 バックアップ":"💾 Backup","📂 復元":"📂 Restore","工程":"Stages","工程名":"Stage name","上へ":"Up","下へ":"Down",
 "言語":"Language","アプリ設定":"App Settings","新規プロジェクトのデフォルト":"New Project Defaults","設定":"Settings","Libraryの使い方":"Library Help","作品を作る":"Create a project","フォルダで整理":"Organize with folders","作品を編集":"Edit a project","ゴミ箱":"Trash","バックアップ":"Backup","テーマカラー":"Theme Color","完了セルや選択状態などのアクセントカラーに使われます。":"Used for completed cells and selected states.",
 "全工程":"All stages","締切":"Deadline","なし":"None","ページ":"Pages","未設定":"Not set","完了":"Done","完成工程":"completed stages",
 "データ収集中":"Collecting data","完成！":"Complete!","変更は自動保存されます":"Changes are saved automatically",
 "保存しました ✓":"Saved ✓","該当するメモはありません。":"No matching notes.","（メモ本文なし）":"(No note text)",
 "修正点・忘れたくないことなど":"Corrections, reminders, etc.",
 "工程名の変更・並び替え・追加・削除":"Rename, reorder, add or delete stages.",
 "新しいプロジェクトを作るときの初期値です。プロジェクトごとに変更できます。":"Initial values for new projects. You can change them for each project.",
 "作品ごとの進捗・付箋・作業履歴は端末内に自動保存されます。":"Project progress, notes and work history are saved automatically on this device.",
 "まだ作品がありません。":"No projects yet.","「＋ 新しいプロジェクト」から作成できます。":"Create one with “+ New Project”.",
 "着手=0.5工程として直近7日から算出":"Calculated from the last 7 days, counting in-progress as 0.5 stage.",
 "全作品のページ数・進捗・付箋・作業履歴を1つのJSONに保存します。":"Save all projects, progress, notes and work history in one JSON file.",
 "Chromeのダウンロード一覧または端末の「Downloads」を確認してください。":"Check Chrome downloads or the device Downloads folder.",
 "タップするたびに「未着手 → 着手 → 完了 → 未着手」と切り替わります。":"Each tap cycles: Not started → In progress → Complete → Not started.",
 "工程マスを約0.5秒長押しし、上下または左右になぞると範囲をプレビューできます。指を離すと確定します。振動したら開始です。":"Long-press a stage cell for about 0.5 seconds, then slide vertically or horizontally to preview the range. Release to apply it. It starts when the device vibrates.",
 "そのページに付箋メモを付けられます。赤・黄・青・緑で分類でき、「メモ一覧」から絞り込みやページ移動もできます。":"Add a note to a page and classify it by red, yellow, blue or green. Filter notes and jump to pages from Notes.",
 }};
const JA_STAGE_DEFAULTS=["ネーム","ペン","背景","トーン","写植"];
const EN_STAGE_DEFAULTS=["Storyboard","Line Art","Background","Tone","Lettering"];
function uiLang(){return languageSettings?.language==="en"?"en":"ja"}
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
function translateDynamicEnglish(root=document){
 if(uiLang()!=="en")return;
 translateExactText(root);
 root.querySelectorAll?.("*").forEach(el=>{
   if(el.children.length||el.closest("input,textarea"))return;
   let s=el.textContent;
   s=s.replace(/^全(\d+)P$/,"$1 pages")
      .replace(/^完成 (\d+) \/ (\d+)P$/,"Completed $1 / $2 pages")
      .replace(/^着手 (\d+)% ・ 完成 (\d+)%$/,"Started $1% · Completed $2%")
      .replace(/^あと約(\d+)日$/,"About $1 days")
      .replace(/^締切まで あと(\d+)日$/,"$1 days until deadline")
      .replace(/^締切を (\d+)日超過$/,"$1 days past deadline")
      .replace(/^(\d+)作品$/,"$1 projects")
      .replace(/^(\d+)P 付箋$/,"Page $1 note")
      .replace(/^全工程完了$/,"All stages complete");
   el.textContent=s;
 });
}
const _applyLanguage=applyLanguage;
applyLanguage=function(){
 _applyLanguage();
 translateDynamicEnglish(document);
};
const languageObserver=new MutationObserver(muts=>{
 if(uiLang()!=="en")return;
 muts.forEach(m=>{
   if(m.type==="characterData"){
     const n=m.target, raw=n.nodeValue||"", trim=raw.trim();
     if(FULL_I18N.en[trim])n.nodeValue=raw.replace(trim,FULL_I18N.en[trim]);
   }
   m.addedNodes?.forEach(n=>{if(n.nodeType===1)translateDynamicEnglish(n);else if(n.nodeType===3&&FULL_I18N.en[n.nodeValue.trim()])n.nodeValue=FULL_I18N.en[n.nodeValue.trim()]});
 });
});
languageObserver.observe(document.body,{subtree:true,childList:true,characterData:true});

/* Legacy settings-save i18n wrapper removed; final settings handler is authoritative. */

/* ---- extracted script block ---- */

/* ---- i18n completion patch ---- */
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

function refreshWholeLanguage(){
 applyLanguage();
 if(uiLang()==="en"){
   translateExactText(document);
   translateUiPatterns(document);
 }
}

// Legacy settings-save language wrapper removed; final settings handler is authoritative.

// 動的再描画後の翻訳漏れも拾う
const fullLanguageObserver=new MutationObserver(()=>{
 if(uiLang()==="en"){
   clearTimeout(window.__fullLangTimer);
   window.__fullLangTimer=setTimeout(()=>translateUiPatterns(document),0);
 }
});
fullLanguageObserver.observe(document.body,{childList:true,subtree:true,characterData:true});

setTimeout(refreshWholeLanguage,0);

/* ---- extracted script block ---- */

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
  if(currentProjectId && projectStore.projects[currentProjectId])updateSummary();
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

function handleLanguageOptionClick(btn){
 const selected=btn.dataset.lang;
 const old=languageSettings.language;
 if(selected===old)return;
 let ss=[...projectDefaults.stages];
 const jaDefault=ss.length===JA_STAGE_DEFAULTS.length&&ss.every((x,i)=>x===JA_STAGE_DEFAULTS[i]);
 const enDefault=ss.length===EN_STAGE_DEFAULTS.length&&ss.every((x,i)=>x===EN_STAGE_DEFAULTS[i]);
 if(selected==="en"&&jaDefault)ss=[...EN_STAGE_DEFAULTS];
 if(selected==="ja"&&enDefault)ss=[...JA_STAGE_DEFAULTS];
 appSettings=normalizeAppSettings({
   language:selected,
   defaultStartPage:projectDefaults.startPage,
   defaultEndPage:projectDefaults.endPage,
   defaultStages:ss
 });
 persistAppSettings();
 document.getElementById("appLanguage").value=selected;
 updateLanguageButtons();

 // Preserve the original order: request the clean reload first, then queue the
 // same maintenance callbacks that the former wrappers queued afterwards.
 location.reload();
 setTimeout(refreshSettingsLanguage,0);
 setTimeout(()=>{
   translateDefaultStageNames(languageSettings.language);
   localizeDefaultsSettingsUi();
   if(document.getElementById("appSettingsModal").classList.contains("open")){
     defaultStageDraft=[...projectDefaults.stages];
     renderDefaultStageEditor();
   }
   folderRendering=false;
   if(!currentProjectId){
     renderProjectList();
     renderFoldersAndFilter();
   }
 },0);

}
document.querySelectorAll(".language-option").forEach(btn=>{
 btn.onclick=()=>handleLanguageOptionClick(btn);
});

/* Settings gear now saves ONLY new-project defaults. Language is untouched. */
document.getElementById("appSettingsButton").onclick=()=>{
 refreshSettingsLanguage();
 document.getElementById("defaultPages").value=clampPageCount(projectDefaults.endPage-projectDefaults.startPage+1);
 defaultStageDraft=[...projectDefaults.stages];
 renderDefaultStageEditor();
 localizeDefaultsSettingsUi();
 lockPageScroll();
 document.getElementById("appSettingsModal").classList.add("open");
};
document.getElementById("settingsSave").onclick=()=>{
 let a=1;
 let b=clampPageCount(document.getElementById("defaultPages").value);
 if(b-a+1>500){alert(uiLang()==="en"?"Up to 500 pages per project.":"1作品500ページまでです。");return}
 const ss=defaultStageDraft.map(x=>String(x||"").trim()).filter(Boolean);
 if(!ss.length)return;
 appSettings=normalizeAppSettings({
   language:languageSettings.language,
   defaultStartPage:a,
   defaultEndPage:b,
   defaultStages:ss
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
   defaultStageDraft=[...(en?EN_STAGE_DEFAULTS:JA_STAGE_DEFAULTS)];
   renderDefaultStageEditor();
 };
}


/* ---- extracted script block ---- */

/* ---- Persistence + default-settings language patch ---- */
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
function stockStageSet(arr,set){return arr.length===set.length&&arr.every((x,i)=>x===set[i])}
function syncStockDefaultsToLanguage(){
 let ss=[...projectDefaults.stages];
 if(languageSettings.language==="en"&&stockStageSet(ss,JA_STAGE_DEFAULTS))ss=[...EN_STAGE_DEFAULTS];
 if(languageSettings.language==="ja"&&stockStageSet(ss,EN_STAGE_DEFAULTS))ss=[...JA_STAGE_DEFAULTS];
 if(!stockStageSet(ss,projectDefaults.stages)){
   appSettings=normalizeAppSettings({
     language:languageSettings.language,
     defaultStartPage:projectDefaults.startPage,
     defaultEndPage:projectDefaults.endPage,
     defaultStages:ss
   });
   persistAppSettings();
 }
}
function refreshSettingsLanguage(){
 syncStockDefaultsToLanguage();
 localizeDefaultsSettingsUi();
 if(document.getElementById("appSettingsModal").classList.contains("open")){
   defaultStageDraft=[...projectDefaults.stages];
   renderDefaultStageEditor();
 }
}
setTimeout(()=>{syncStockDefaultsToLanguage();localizeDefaultsSettingsUi()},0);

/* ---- extracted script block ---- */

/* ---- reload folder render race fix + localized default stage names ---- */
const DEFAULT_STAGE_NAME_MAP={
 jaToEn:{
   "ネーム":"Storyboard",
   "下書き":"Sketch",
   "ペン":"Line Art",
   "線画":"Line Art",
   "背景":"Background",
   "トーン":"Tone",
   "写植":"Lettering",
   "仕上げ":"Finishing",
   "カラー":"Color"
 },
 enToJa:{
   "Storyboard":"ネーム",
   "Sketch":"下書き",
   "Line Art":"ペン",
   "Background":"背景",
   "Tone":"トーン",
   "Lettering":"写植",
   "Finishing":"仕上げ",
   "Color":"カラー"
 }
};
function translateDefaultStageNames(targetLang){
 const map=targetLang==="en"?DEFAULT_STAGE_NAME_MAP.jaToEn:DEFAULT_STAGE_NAME_MAP.enToJa;
 const translated=projectDefaults.stages.map(name=>map[name]||name);
 if(translated.some((x,i)=>x!==projectDefaults.stages[i])){
   appSettings=normalizeAppSettings({
     language:targetLang,
     defaultStartPage:projectDefaults.startPage,
     defaultEndPage:projectDefaults.endPage,
     defaultStages:translated
   });
   persistAppSettings();
 }
}
/* Language option maintenance is consolidated in handleLanguageOptionClick(). */

/* After startup/reload, force one final folder-aware render after all language
   initialization has finished. This does not change folderId data. */
setTimeout(()=>{
 folderRendering=false;
 if(!currentProjectId){
   renderProjectList();
   renderFoldersAndFilter();
 }
},40);

/* ---- extracted script block ---- */

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

/* ---- extracted script block ---- */

(function(){
 const list=document.getElementById("projectList");if(!list)return;
 list.addEventListener("contextmenu",e=>{
   if(e.target.closest(".folder-item,.project-item"))e.preventDefault();
 });
 list.addEventListener("selectstart",e=>{
   if(e.target.closest(".folder-item,.project-item"))e.preventDefault();
 });
})();
/* App-wide data-management labels. Kept separate from backup behavior. */
(function(){
  const oldApply = window.applyCurrentLanguage;
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
try{ languageObserver.disconnect(); }catch(e){}
try{ fullLanguageObserver.disconnect(); }catch(e){}

const CLEAN_EN_EXACT = {
 "全体":"OVERALL",
 "作品一覧":"Projects","プロジェクト":"Projects","メモ一覧":"Notes","総合進捗":"Overall Progress","制作進捗":"Overall Progress",
 "制作中":"In progress","完成率":"Completion","工程別進捗":"Progress by Stage","工程表":"Production Table",
 "作業履歴":"Work History","今日":"Today","直近7日":"Last 7 days","直近7日間":"Last 7 days",
 "1日平均":"Daily average","完成予想":"Estimated Completion","変更は自動保存されます":"Changes are saved automatically",
 "着手中":"In progress","完成済み":"Completed","着手":"Started","完成":"Completed",
 "← 前":"← Prev","次 →":"Next →","閉じる":"Close","言語":"Language","アプリ設定":"App Settings",
 "新規プロジェクトのデフォルト":"New Project Defaults","制作ページ":"Pages","工程":"Stages",
 "＋ 工程を追加":"+ Add Stage","キャンセル":"Cancel","保存":"Save","データ管理":"Data Management","ページ":"Pages","全工程":"All stages","締切":"Deadline","未設定":"Not set","編集":"Edit","この作品を削除":"Delete this project","作品":"projects",
 "着手=0.5工程として直近7日から算出":"Calculated from the last 7 days, counting in-progress as 0.5 stage."
};
const CLEAN_USER_TEXT_SELECTOR = [
 ".project-title",".project-name",".folder-name",
 "#stageProgress .stage-name","#pages .stage-name",".memo-text",".memo-list",
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
     defaultStartPage:projectDefaults.startPage,
     defaultEndPage:projectDefaults.endPage,
     defaultStages:[...projectDefaults.stages]
   });
   persistAppSettings();
   location.reload();
 };
});
/* ===== /I18N CLEAN AUTHORITY ===== */


/* ---- Modal/list i18n consistency patch ---- */
function localizeNoColorSwatch(){
 const el=document.querySelector(".color-pick-none");
 if(!el)return;
 const label=uiLang()==="en"?"No color":"色なし";
 el.setAttribute("aria-label",label);
 el.setAttribute("title",label);
}
function localizeOpenUi(){
 localizeNoColorSwatch();
 const en=uiLang()==="en";
 const set=(sel,ja,enText)=>{const el=document.querySelector(sel);if(el)el.textContent=en?enText:ja};
 const ph=(sel,ja,enText)=>{const el=document.querySelector(sel);if(el)el.placeholder=en?enText:ja};
 set("#memoListModal .memo-head h2","メモ一覧","Notes");
 {const el=document.querySelector("#closeMemoList");if(el){el.textContent="×";el.setAttribute("aria-label",en?"Close":"閉じる");}}
 const filters=[["all","すべて","All"],["none","無色","No color"],["#f4a6a6","赤","Red"],["#f4dc8a","黄","Yellow"],["#9ec8f4","青","Blue"],["#a9ddb0","緑","Green"]];
 filters.forEach(([key,ja,enText])=>{const el=document.querySelector(`.memo-filter[data-filter="${key}"]`);if(el)el.textContent=en?enText:ja});
 set("#stickyLabelCaption","ラベル","Label");
 ph("#stickyLabel","表紙・扉・あとがき など","Cover, Title, After, etc.");
 ph("#stickyText","修正点・忘れたくないことなど","Corrections, reminders, etc.");
 ph("#stickyTodoInput","チェック項目を追加","Add checklist item");
 set("#stickyDelete","付箋を削除","Delete Note");
 set("#stickySave","保存","Save");
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


/* ===== Dynamic UI i18n audit patch 2026-09-23 =====
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
/* ===== /Dynamic UI i18n audit patch ===== */


/* Library trash-drop compatibility moved to app-library-drag.js (v36). */

/* ===== Home controls v2: unified create menu ===== */
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
   toggle.setAttribute("aria-label",isEn()?"Create":"作成");
   trashBtn?.setAttribute("aria-label",isEn()?"Trash":"ゴミ箱");
   const p=projectBtn.querySelector("span"),f=folderBtn.querySelector("span");
   if(p)p.textContent=isEn()?"New Project":"新しいプロジェクト";
   if(f)f.textContent=isEn()?"New Folder":"新しいフォルダ";
   // One-level folder model: creating another folder while inside one is not available.
   folderBtn.style.display=(typeof currentFolderId!=="undefined"&&currentFolderId)?"none":"flex";
 };
 toggle.addEventListener("click",e=>{e.stopPropagation();syncLabels();const open=!menu.classList.contains("open");menu.classList.toggle("open",open);toggle.setAttribute("aria-expanded",String(open))});
 menu.addEventListener("click",e=>e.stopPropagation());
 projectBtn.addEventListener("click",closeMenu);
 folderBtn.addEventListener("click",closeMenu);
 document.addEventListener("click",closeMenu);
 document.addEventListener("keydown",e=>{if(e.key==="Escape")closeMenu()});
 const mo=new MutationObserver(syncLabels);mo.observe(document.documentElement,{attributes:true,attributeFilter:["lang"]});
 syncLabels();
})();
/* ===== /Home controls v2 ===== */
