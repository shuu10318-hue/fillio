const STORAGE_KEY="manga-progress-v1"; // 旧版データ。移行元として残す
const PROJECTS_KEY="manga-progress-projects-v2";
const VIEW_STATE_KEY="manga-progress-view-state-v1";
const APP_SETTINGS_KEY="manga-progress-app-settings-v1";
let appSettings=null;
let languageSettings={language:"ja"};
let projectDefaults={startPage:1,endPage:48,stages:[]};
let projectStore={version:2,activeProjectId:null,projects:{}};
let currentProjectId=null;
const DEFAULT_STAGES=["ネーム","ペン","背景","トーン","写植"];
const MAX_STAGES=100;

const UI_TEXT={
 ja:{home:"Library",newProject:"＋ 新しい作品",settings:"アプリ設定",language:"言語",defaults:"新規作品のデフォルト",pages:"制作ページ",stages:"工程",addStage:"＋ 工程を追加",cancel:"キャンセル",save:"保存",note:"新しい作品を作るときの初期値です。作品ごとに変更できます。",folderAdd:"＋ フォルダ",memo:"メモ一覧",backProjects:"作品一覧"},
 en:{home:"Library",newProject:"+ New Project",settings:"App Settings",language:"Language",defaults:"New Project Defaults",pages:"Pages",stages:"Stages",addStage:"+ Add Stage",cancel:"Cancel",save:"Save",note:"These are the initial values for new projects. Each project can be changed separately.",folderAdd:"+ Folder",memo:"Notes",backProjects:"Projects"}
};
function normalizeAppSettings(raw){
 const lang=raw?.language==="en"?"en":"ja";
 let a=Math.max(1,Math.min(500,Number(raw?.defaultStartPage)||1));
 let b=Math.max(a,Math.min(500,Number(raw?.defaultEndPage)||48));
 if(b-a+1>500)b=a+499;
 let ss=Array.isArray(raw?.defaultStages)?raw.defaultStages.map(x=>String(x||"").trim()).filter(Boolean).slice(0,MAX_STAGES):[];
 if(!ss.length)ss=[...DEFAULT_STAGES];
 const allowedColors=["#222222","#d9788d","#6e9fd0","#70ad98","#9a83c6","#dc9878"];
 const legacyThemeMap={"#4f6bed":"#6e9fd0","#3f8f6b":"#70ad98","#7a5cc7":"#9a83c6","#c7663d":"#dc9878"};
 const rawTheme=raw?.themeColor ?? appSettings?.themeColor;
 const requested=legacyThemeMap[rawTheme]||rawTheme;
 const themeColor=allowedColors.includes(requested)?requested:"#222222";
 return {language:lang,defaultStartPage:a,defaultEndPage:b,defaultStages:ss,themeColor};
}
function syncSplitSettings(){
 languageSettings={language:appSettings?.language==="en"?"en":"ja"};
 projectDefaults={
   startPage:appSettings?.defaultStartPage||1,
   endPage:appSettings?.defaultEndPage||48,
   stages:[...(appSettings?.defaultStages||DEFAULT_STAGES)]
 };
}
function loadAppSettings(){
 try{appSettings=normalizeAppSettings(JSON.parse(localStorage.getItem(APP_SETTINGS_KEY)||"null"))}
 catch(e){appSettings=normalizeAppSettings(null)}
 syncSplitSettings();
}
function persistAppSettings(){
 syncSplitSettings();
 localStorage.setItem(APP_SETTINGS_KEY,JSON.stringify(appSettings));
}
function applyThemeColor(color=appSettings?.themeColor||"#222222"){
 document.documentElement.style.setProperty("--accent",color);
 document.documentElement.dataset.theme=color==="#222222"?"mono":"color";
 const meta=document.querySelector('meta[name="theme-color"]');
 if(meta) meta.content=color==="#222222"?"#f6f6f6":`color-mix(in srgb, ${color} 8%, #f8f8f8)`;
 document.querySelectorAll(".theme-color-option").forEach(b=>{
   const on=b.dataset.themeColor===color;b.classList.toggle("selected",on);b.setAttribute("aria-checked",on?"true":"false");
 });
}
function applyLanguage(){
 const t=UI_TEXT[languageSettings.language]||UI_TEXT.ja;
 document.documentElement.lang=languageSettings.language;
 const set=(id,s)=>{const e=document.getElementById(id);if(e)e.textContent=s};
 set("homeTitle",t.home); set("newProjectButton",t.newProject); set("settingsTitle",t.settings);
 set("settingsLanguageLabel",t.language);set("settingsDefaultsTitle",t.defaults);set("settingsPagesLabel",t.pages);
 set("settingsStagesLabel",t.stages);set("defaultStageAdd",t.addStage);set("settingsCancel",t.cancel);set("settingsSave",t.save);set("settingsNote",t.note);
 set("folderAdd",t.folderAdd);set("memoListButton",t.memo);set("backToProjects",t.backProjects);
}
let defaultStageDraft=[];
function renderDefaultStageEditor(){
 const box=document.getElementById("defaultStageList"); if(!box)return; box.innerHTML="";
 defaultStageDraft.forEach((name,i)=>{
   const row=document.createElement("div");row.className="stage-editor-row";
   row.innerHTML=`<input type="text" maxlength="12"><button type="button" class="stage-mini-button" data-act="up">↑</button><button type="button" class="stage-mini-button" data-act="down">↓</button><button type="button" class="stage-mini-button danger" data-act="del">×</button>`;
   const input=row.querySelector("input");input.value=name;input.oninput=()=>defaultStageDraft[i]=input.value;
   row.querySelector('[data-act="up"]').onclick=()=>{if(i){[defaultStageDraft[i-1],defaultStageDraft[i]]=[defaultStageDraft[i],defaultStageDraft[i-1]];renderDefaultStageEditor()}};
   row.querySelector('[data-act="down"]').onclick=()=>{if(i<defaultStageDraft.length-1){[defaultStageDraft[i+1],defaultStageDraft[i]]=[defaultStageDraft[i],defaultStageDraft[i+1]];renderDefaultStageEditor()}};
   row.querySelector('[data-act="del"]').onclick=()=>{if(defaultStageDraft.length<=1)return;defaultStageDraft.splice(i,1);renderDefaultStageEditor()};
   box.appendChild(row);
 });
 document.getElementById("defaultStageAdd").disabled=false;
}

loadAppSettings();
applyThemeColor();
let stages=[...DEFAULT_STAGES];
let totalPages=48,startPage=1,currentView=0,progress=createProgress(48);
let history={day:"",baselineDone:0,days:{}};
let pageNotes={};

function createProgress(n,stageCount=stages.length){return Array.from({length:n},()=>Array(stageCount).fill(0))}
function localDate(d=new Date()){
  const y=d.getFullYear(),m=String(d.getMonth()+1).padStart(2,"0"),day=String(d.getDate()).padStart(2,"0");
  return `${y}-${m}-${day}`;
}
function doneCount(){return progress.flat().filter(v=>v===2).length}
function weightedCount(){return progress.flat().reduce((sum,v)=>sum+(v===2?1:v===1?0.5:0),0)}
function addDays(dateStr,n){
  const [y,m,d]=dateStr.split("-").map(Number);
  const x=new Date(y,m-1,d); x.setDate(x.getDate()+n); return localDate(x);
}
function normalizeHistory(h){
  const today=localDate();
  if(!h||typeof h!=="object") return {day:today,baselineDone:doneCount(),baselineWeighted:weightedCount(),weightedDays:{},days:{}};
  return {
    day:typeof h.day==="string"&&h.day?h.day:today,
    baselineDone:Number.isFinite(h.baselineDone)?h.baselineDone:doneCount(),
    baselineWeighted:Number.isFinite(h.baselineWeighted)?h.baselineWeighted:weightedCount(),
    weightedDays:h.weightedDays&&typeof h.weightedDays==="object"?h.weightedDays:{},
    days:h.days&&typeof h.days==="object"?h.days:{}
  };
}
function rollHistory(){
  const today=localDate();
  history=normalizeHistory(history);
  if(history.day===today)return;
  // The last known day ends at the current saved state.
  history.days[history.day]=doneCount()-history.baselineDone;
  history.weightedDays[history.day]=weightedCount()-history.baselineWeighted;
  // Missing calendar days had no recorded changes.
  let d=addDays(history.day,1);
  while(d<today){ if(history.days[d]===undefined)history.days[d]=0; d=addDays(d,1); }
  history.day=today;
  history.baselineDone=doneCount();
  history.baselineWeighted=weightedCount();
}
function todayDelta(){rollHistory();return doneCount()-history.baselineDone}
function todayWeightedDelta(){rollHistory();return weightedCount()-history.baselineWeighted}
function makeProjectData(){
  rollHistory();
  return {
    title:document.getElementById("title").value,
    creationStartDate:document.getElementById("creationStartDateInput").value||"",
    deadline:document.getElementById("deadlineInput").value||"",
    totalPages,startPage,
    progress:progress.map(r=>[...r]),
    stages:[...stages],
    history:JSON.parse(JSON.stringify(history)),
    pageNotes:JSON.parse(JSON.stringify(pageNotes))
  };
}
function freshProjectData(title="新しい作品",sp=1,ep=1){
  const n=Math.max(1,Math.min(500,ep-sp+1));
  const p=createProgress(n);
  return {
    title,creationStartDate:"",deadline:"",totalPages:n,startPage:sp,progress:p,stages:[...DEFAULT_STAGES],folderId:null,
    history:{day:localDate(),baselineDone:0,baselineWeighted:0,weightedDays:{},days:{}},
    pageNotes:{}
  };
}
function newProjectId(){
  return "p_"+Date.now().toString(36)+"_"+Math.random().toString(36).slice(2,8);
}
function persistProjectStore(){
  localStorage.setItem(PROJECTS_KEY,JSON.stringify(projectStore));
}
function save(){
  if(!currentProjectId)return;
  const oldProject=projectStore.projects[currentProjectId]||{};
  const nextProject=makeProjectData();
  nextProject.folderId=oldProject.folderId||null;
  if(oldProject.trashedAt)nextProject.trashedAt=oldProject.trashedAt;
  projectStore.projects[currentProjectId]=nextProject;
  projectStore.activeProjectId=currentProjectId;
  persistProjectStore();
  const m=document.getElementById("saveMessage");
  m.textContent=languageSettings?.language==="en"?"Saved ✓":"保存しました ✓";
  clearTimeout(save.timer);
  save.timer=setTimeout(()=>m.textContent=languageSettings?.language==="en"?"Changes are saved automatically":"変更は自動保存されます",1200);
}
function normalizeProjectData(s){
  let n=Number.isInteger(s?.totalPages)&&s.totalPages>0?Math.min(500,s.totalPages):48;
  let sp=Number.isInteger(s?.startPage)&&s.startPage>0?s.startPage:1;
const projectStages=Array.isArray(s?.stages)&&s.stages.length
    ? s.stages.map(x=>String(x??"").trim()).slice(0,MAX_STAGES)
    : [...DEFAULT_STAGES];
  let pg=Array.from({length:n},(_,p)=>Array.from({length:projectStages.length},(_,i)=>[0,1,2].includes(s?.progress?.[p]?.[i])?s.progress[p][i]:0));
  return {
    title:typeof s?.title==="string"?s.title:"",
    stages:projectStages,
    creationStartDate:typeof s?.creationStartDate==="string"?s.creationStartDate:"",
    deadline:typeof s?.deadline==="string"?s.deadline:"",
    totalPages:n,startPage:sp,progress:pg,
    folderId:typeof s?.folderId==="string"&&s.folderId?s.folderId:null,
    trashedAt:Number.isFinite(Number(s?.trashedAt))&&Number(s.trashedAt)>0?Number(s.trashedAt):null,
    history:s?.history&&typeof s.history==="object"?s.history:null,
    pageNotes:s?.pageNotes&&typeof s.pageNotes==="object"?s.pageNotes:{}
  };
}
function migrateLegacyIfNeeded(){
  if(localStorage.getItem(PROJECTS_KEY))return;
  let legacy=null;
  try{ legacy=JSON.parse(localStorage.getItem(STORAGE_KEY)); }catch(e){}
  projectStore={version:2,activeProjectId:null,projects:{}};
  if(legacy&&Array.isArray(legacy.progress)){
    const id=newProjectId();
    const p=normalizeProjectData(legacy);
    // 履歴は作品を開いた時に現在の進捗に合わせて正規化する
    projectStore.projects[id]=p;
    projectStore.activeProjectId=id;
  }
  persistProjectStore();
}
function loadProjectStore(){
  migrateLegacyIfNeeded();
  try{
    const raw=JSON.parse(localStorage.getItem(PROJECTS_KEY));
    if(raw&&raw.projects&&typeof raw.projects==="object"){
      projectStore={
        version:2,
        activeProjectId:raw.activeProjectId||null,
        projects:{},
        projectOrder:Array.isArray(raw.projectOrder)?raw.projectOrder:[],
        folders:(raw.folders&&typeof raw.folders==="object")?raw.folders:{},
        rootOrder:Array.isArray(raw.rootOrder)?raw.rootOrder:[]
      };
      Object.entries(raw.projects).forEach(([id,p])=>{
        if(p&&Array.isArray(p.progress))projectStore.projects[id]=normalizeProjectData(p);
      });
      if(!projectStore.projects[projectStore.activeProjectId])projectStore.activeProjectId=null;
      return;
    }
  }catch(e){}
  projectStore={version:2,activeProjectId:null,projects:{},projectOrder:[],folders:{},rootOrder:[]};
  persistProjectStore();
}
function applyProjectData(s){
  const p=normalizeProjectData(s);
  totalPages=p.totalPages;
  startPage=p.startPage;
  progress=p.progress;
  stages=[...(p.stages||DEFAULT_STAGES)];
  pageNotes=p.pageNotes;
  document.getElementById("title").value=p.title;
  const currentTitleEl=document.getElementById("currentProjectTitle");
  if(currentTitleEl)currentTitleEl.textContent=p.title;
  document.getElementById("creationStartDateInput").value=p.creationStartDate||"";
  document.getElementById("deadlineInput").value=p.deadline||"";
  history=p.history?normalizeHistory(p.history):{day:localDate(),baselineDone:doneCount(),baselineWeighted:weightedCount(),weightedDays:{},days:{}};
  rollHistory();
  currentView=0;
  syncRangeUI();
}

function saveViewState(view){
  const state={view};
  if(view==="project"&&currentProjectId)state.projectId=currentProjectId;
  if(view==="folder"&&currentFolderId)state.folderId=currentFolderId;
  localStorage.setItem(VIEW_STATE_KEY,JSON.stringify(state));
}
function loadViewState(){
  try{return JSON.parse(localStorage.getItem(VIEW_STATE_KEY)||"null")}catch(e){return null}
}


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
  renderProjectList();
  currentFolderId=null;
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

function projectPercent(p){
  const vals=(p.progress||[]).flat();
  if(!vals.length)return 0;
  return Math.round(vals.filter(v=>v===2).length/vals.length*100);
}

function projectDashboardStats(p){
  const rows=Array.isArray(p?.progress)?p.progress:[];
  const vals=rows.flat();
  const total=Math.max(1,vals.length);
  const started=vals.filter(v=>v>0).length;
  const done=vals.filter(v=>v===2).length;
  const weighted=vals.reduce((sum,v)=>sum+(v===2?1:v===1?0.5:0),0);
  const today=localDate();
  const h=p?.history&&typeof p.history==="object"?p.history:{};
  const todayDone=h.day===today ? done-Number(h.baselineDone||0) : Number(h.days?.[today]||0);
  let weekDone=0,weekWeighted=0;
  for(let i=-6;i<=0;i++){
    const d=addDays(today,i);
    if(d===today&&h.day===today){
      weekDone+=todayDone;
      weekWeighted+=weighted-Number(h.baselineWeighted||0);
    }else{
      weekDone+=Number(h.days?.[d]||0);
      weekWeighted+=Number(h.weightedDays?.[d]||0);
    }
  }
  const avgWeighted=weekWeighted/7;
  const remaining=Math.max(0,total-weighted);
  let forecast="—";
  if(remaining<=0) forecast=languageSettings?.language==="en"?"Completed":"完成";
  else if(avgWeighted>0){
    const days=Math.ceil(remaining/avgWeighted),d=new Date(); d.setDate(d.getDate()+days);
    forecast=`${d.getFullYear()}/${d.getMonth()+1}/${d.getDate()}`;
  }
  return {startedPct:Math.round(started/total*100),donePct:Math.round(done/total*100),todayDone,weekDone,forecast};
}

const expandedStageDetails=new Set();
function projectStageStats(p){
  const rows=Array.isArray(p?.progress)?p.progress:[];
  const names=Array.isArray(p?.stages)&&p.stages.length?p.stages:DEFAULT_STAGES;
  return names.map((name,stageIndex)=>{
    const vals=rows.map(row=>Array.isArray(row)?Number(row[stageIndex]||0):0);
    const total=Math.max(1,vals.length);
    const started=vals.filter(v=>v>0).length;
    const done=vals.filter(v=>v===2).length;
    return {name:String(name||""),startedPct:Math.round(started/total*100),pct:Math.round(done/total*100)};
  });
}

function renderProjectList(){
  const list=document.getElementById("projectList");
  list.innerHTML="";
  const ids=Object.keys(projectStore.projects).filter(id=>!projectStore.projects[id]?.trashedAt);
  const savedOrder=Array.isArray(projectStore.projectOrder)?projectStore.projectOrder:[];
  const orderedIds=savedOrder.filter(id=>ids.includes(id));
  ids.forEach(id=>{if(!orderedIds.includes(id))orderedIds.push(id)});
  projectStore.projectOrder=orderedIds;
  const entries=orderedIds.map(id=>[id,projectStore.projects[id]]);
  if(!entries.length){
    list.innerHTML='<div class="project-empty">まだ作品がありません。<br>「＋ 新しい作品」から作成できます。</div>';
    return;
  }
  entries.forEach(([id,p])=>{
    const item=document.createElement("div");
    item.className="project-item";
    item.dataset.projectId=id; item.dataset.orderKey="p:"+id;
    const donePages=(p.progress||[]).filter(r=>Array.isArray(r)&&r.every(v=>v===2)).length;
    const dash=projectDashboardStats(p);
    const isEn=languageSettings?.language==="en";
    const donePct=projectPercent(p);
    const stageStats=projectStageStats(p);
    const expanded=expandedStageDetails.has(id);
    const title=p.title||(isEn?"Untitled":"無題");
    const detailRows=stageStats.map(st=>`<div class="project-stage-row"><span class="project-stage-name"></span><div class="project-stage-track dual"><i class="started" style="width:${st.startedPct}%"></i><i class="done" style="width:${st.pct}%"></i></div><b>${st.pct}%</b></div>`).join("");
    item.innerHTML=`<div class="project-item-main">
      <div style="min-width:0">
        <button class="project-open-title" type="button" aria-label="${isEn?"Open input page":"入力ページを開く"}" title="${isEn?"Open input page":"入力ページを開く"}"><svg class="icon-line" viewBox="0 0 24 24" aria-hidden="true"><path d="M4 20h4l11-11-4-4L4 16z"/><path d="M13.5 6.5l4 4"/></svg><span class="project-item-title" data-user-text="1"></span></button>
        ${donePages>=p.totalPages ? `
<div class="project-summary project-summary-complete">
  <div class="project-summary-main"><b>${donePages} / ${p.totalPages}P</b><strong>✓ ${isEn?"Completed":"完成"}</strong></div>
  <div class="project-progress-track dual"><i class="started" style="width:100%"></i><i class="done" style="width:100%"></i></div>
  <div class="project-complete-meta"><span>${isEn?"Progress":"全工程"}</span><b>100%</b></div>
</div>` : `
<div class="project-summary">
  <div class="project-summary-main"><b>${donePages} / ${p.totalPages}P</b><strong>${donePct}%</strong></div>
  <div class="project-progress-track dual"><i class="started" style="width:${dash.startedPct}%"></i><i class="done" style="width:${donePct}%"></i></div>
  <div class="project-plan-row">
    <div><span>${isEn?"Deadline":"締切"}</span><b>${p.deadline?p.deadline.replaceAll("-","/"):(isEn?"None":"未設定")}</b></div>
    <div><span>${isEn?"Forecast":"完成予想"}</span><b>${dash.forecast}</b></div>
  </div>
  <div class="project-dashboard-strip project-dashboard-compact">
    <div><span>${isEn?"Started":"着手"}</span><b>${dash.startedPct}%</b></div>
    <div><span>${isEn?"Today":"今日"}</span><b>${dash.todayDone>=0?"+":""}${dash.todayDone}</b></div>
    <div><span>${isEn?"7 days":"7日"}</span><b>${dash.weekDone}</b></div>
  </div>
</div>`}
      </div>
      <div class="project-item-actions">
        <button class="project-edit-button project-icon-button" type="button" aria-label="${isEn?"Project settings":"プロジェクト設定"}" title="${isEn?"Project settings":"プロジェクト設定"}"><svg class="icon-line" viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.7 1.7 0 0 0 .34 1.88l.06.06-2.83 2.83-.06-.06A1.7 1.7 0 0 0 15 19.4a1.7 1.7 0 0 0-1 .6 1.7 1.7 0 0 0-.4 1.1V21h-4v-.09A1.7 1.7 0 0 0 8.6 19.4a1.7 1.7 0 0 0-1.88.34l-.06.06-2.83-2.83.06-.06A1.7 1.7 0 0 0 4.6 15a1.7 1.7 0 0 0-.6-1 1.7 1.7 0 0 0-1.1-.4H3v-4h.09A1.7 1.7 0 0 0 4.6 8.6a1.7 1.7 0 0 0-.34-1.88l-.06-.06 2.83-2.83.06.06A1.7 1.7 0 0 0 9 4.6a1.7 1.7 0 0 0 1-.6 1.7 1.7 0 0 0 .4-1.1V3h4v.09A1.7 1.7 0 0 0 15.4 4.6a1.7 1.7 0 0 0 1.88-.34l.06-.06 2.83 2.83-.06.06A1.7 1.7 0 0 0 19.4 9c.13.37.35.7.64.96.3.27.68.42 1.08.44H21v4h-.09A1.7 1.7 0 0 0 19.4 15z"/></svg></button>
      </div>
    </div>
    <button class="project-stage-toggle" type="button" aria-expanded="${expanded}"><span>${isEn?"Stage details":"工程別"}</span><svg class="icon-line" viewBox="0 0 24 24" aria-hidden="true"><path d="M7 10l5 5 5-5"/></svg></button>
    <div class="project-stage-details${expanded?" open":""}">${detailRows}</div>`;
    item.querySelector(".project-item-title").textContent=title;
    item.querySelectorAll(".project-stage-name").forEach((el,i)=>{el.textContent=stageStats[i]?.name||(isEn?"New stage":"新しい工程")});
    item.querySelector(".project-open-title").onclick=e=>{e.stopPropagation();openProject(id)};
    item.querySelector(".project-edit-button").onclick=e=>{e.stopPropagation();openProjectEdit(id)};
    item.querySelector(".project-stage-toggle").onclick=e=>{
      e.stopPropagation();
      if(expandedStageDetails.has(id))expandedStageDetails.delete(id);else expandedStageDetails.add(id);
      const details=item.querySelector(".project-stage-details");
      const btn=e.currentTarget;
      const open=expandedStageDetails.has(id);
      details.classList.toggle("open",open);btn.setAttribute("aria-expanded",String(open));
    };
    list.appendChild(item);
  });
}

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
function safeFileName(name){return (name||"漫画制作進捗").replace(/[\/:*?"<>|]/g,"_").trim()||"漫画制作進捗"}
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
  // v4以前: 1作品バックアップは新しい作品として追加
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
function renderStages(){
  stageProgress.innerHTML="";
  stages.forEach((name,s)=>{
    const st=progress.filter(r=>r[s]>0).length,dn=progress.filter(r=>r[s]===2).length;
    const sp=Math.round(st/totalPages*100),dp=Math.round(dn/totalPages*100);
    const d=document.createElement("div");d.className="stage";
    const stageStats=languageSettings?.language==="en" ? `Started ${sp}% · Completed ${dp}%` : `着手 ${sp}% ・ 完成 ${dp}%`;
    d.innerHTML=`<div class="stage-info"><span>${displayStageName(name,s)}</span><span>${stageStats}</span></div><div class="dual-bar"><div class="started-bar" style="width:${sp}%"></div><div class="done-bar" style="width:${dp}%"></div></div>`;
    stageProgress.appendChild(d);
  });
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
  delete pageNotes[String(stickyPage)];
  stickyColor="";stickyTodos=[];
  document.getElementById("stickyText").value="";
  renderStickyTodos();
  save();
  document.getElementById("stickyModal").classList.remove("open");
  renderPages();
};
document.getElementById("stickySave").onclick=()=>{
  const text=document.getElementById("stickyText").value.trim();
  if(!stickyColor)stickyColor="#f4dc8a";
  pageNotes[String(stickyPage)]={text,color:stickyColor,todos:stickyTodos.map(t=>({id:t.id,text:t.text,done:!!t.done}))};
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
    num.textContent=actualPage;
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
        progress[p][s]=(progress[p][s]+1)%3;setCellVisual(b,progress[p][s]);save();requestAnimationFrame(()=>updateSummary())
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

// 長押しスライド：最初の移動方向で縦/横を固定し、範囲プレビュー後に指を離して確定する
let suppressCellClickUntil=0;
let suppressPageSwipeUntil=0;
let paintHoldTimer=null;
let paintMode=false;
let paintAxis=null;
let paintStartX=0,paintStartY=0;
let paintStage=-1,paintValue=0;
let paintSourcePage=-1;
let paintSourceCell=null;
let paintPreviewCells=new Set();
let paintLastX=0,paintLastY=0;
let paintScrollRaf=0;
const PAINT_HOLD_MS=480;
const PAINT_CANCEL_MOVE=12;
const PAINT_AXIS_LOCK_MOVE=10;
const PAINT_SCROLL_EDGE=72;
const PAINT_SCROLL_MAX=12;

function setCellVisual(cell,value){
  cell.classList.remove("state0","state1","state2","state-started","state-done");
  cell.classList.add("state"+value);
  cell.classList.toggle("state-started",value===1);
  cell.classList.toggle("state-done",value===2);
}
function cancelPaintHold(){
  if(paintHoldTimer){clearTimeout(paintHoldTimer);paintHoldTimer=null}
}
function paintKey(p,s){return `${p}:${s}`}
function getPaintCell(p,s){
  return pages.querySelector(`.progress-cell[data-page-index="${p}"][data-stage-index="${s}"]`);
}
function restorePaintPreview(){
  for(const key of paintPreviewCells){
    const [p,s]=key.split(":").map(Number);
    const cell=getPaintCell(p,s);
    if(cell)setCellVisual(cell,progress[p][s]);
  }
  paintPreviewCells.clear();
}
function showPaintPreview(endPage,endStage){
  if(!paintMode)return;
  const next=new Set();
  if(paintAxis==="vertical"){
    endPage=Math.max(0,Math.min(totalPages-1,endPage));
    const lo=Math.min(paintSourcePage,endPage),hi=Math.max(paintSourcePage,endPage);
    for(let p=lo;p<=hi;p++)next.add(paintKey(p,paintStage));
  }else if(paintAxis==="horizontal"){
    endStage=Math.max(0,Math.min(stages.length-1,endStage));
    const lo=Math.min(paintStage,endStage),hi=Math.max(paintStage,endStage);
    for(let s=lo;s<=hi;s++)next.add(paintKey(paintSourcePage,s));
  }else{
    next.add(paintKey(paintSourcePage,paintStage));
  }
  for(const key of paintPreviewCells){
    if(!next.has(key)){
      const [p,s]=key.split(":").map(Number);
      const cell=getPaintCell(p,s);
      if(cell)setCellVisual(cell,progress[p][s]);
    }
  }
  for(const key of next){
    const [p,s]=key.split(":").map(Number);
    const cell=getPaintCell(p,s);
    if(cell)setCellVisual(cell,paintValue);
  }
  paintPreviewCells=next;
}
function updatePaintPoint(x,y){
  paintLastX=x;paintLastY=y;
  if(!paintAxis){
    const dx=x-paintStartX,dy=y-paintStartY;
    if(Math.max(Math.abs(dx),Math.abs(dy))>=PAINT_AXIS_LOCK_MOVE){
      paintAxis=Math.abs(dx)>Math.abs(dy)?"horizontal":"vertical";
    }
  }
  const el=document.elementFromPoint(x,y);
  const cell=el?.closest?.('.progress-cell');
  if(!cell || !pages.contains(cell))return;
  const p=Number(cell.dataset.pageIndex),s=Number(cell.dataset.stageIndex);
  if(!Number.isInteger(p)||!Number.isInteger(s))return;
  if(paintAxis==="vertical")showPaintPreview(p,paintStage);
  else if(paintAxis==="horizontal")showPaintPreview(paintSourcePage,s);
}
function paintAutoScrollStep(){
  paintScrollRaf=0;
  if(!paintMode)return;
  let dx=0,dy=0;
  if(paintAxis==="vertical"){
    const scroller=document.getElementById("stageTableScroll");
    if(scroller){
      const r=scroller.getBoundingClientRect();
      // Excel型では縦方向も工程表自身がスクロールする。長押し中も同じ領域を動かす。
      const topEdge=Math.max(r.top,0);
      const bottomEdge=Math.min(r.bottom,window.innerHeight);
      if(paintLastY<topEdge+PAINT_SCROLL_EDGE){
        const strength=(topEdge+PAINT_SCROLL_EDGE-paintLastY)/PAINT_SCROLL_EDGE;
        dy=-Math.max(1,Math.round(PAINT_SCROLL_MAX*Math.min(1,strength)));
      }else if(paintLastY>bottomEdge-PAINT_SCROLL_EDGE){
        const strength=(paintLastY-(bottomEdge-PAINT_SCROLL_EDGE))/PAINT_SCROLL_EDGE;
        dy=Math.max(1,Math.round(PAINT_SCROLL_MAX*Math.min(1,strength)));
      }
      if(dy)scroller.scrollTop+=dy;
    }
  }else if(paintAxis==="horizontal"){
    const scroller=document.getElementById("stageTableScroll");
    if(scroller){
      const r=scroller.getBoundingClientRect();
      // 左端は固定ページ番号の幅を除外し、見えているセル領域の端で自動スクロールする。
      const pageCol=parseFloat(getComputedStyle(document.documentElement).getPropertyValue("--progress-page-col"))||28;
      const leftEdge=r.left+pageCol;
      const rightEdge=r.right;
      if(paintLastX<leftEdge+PAINT_SCROLL_EDGE){
        const strength=(leftEdge+PAINT_SCROLL_EDGE-paintLastX)/PAINT_SCROLL_EDGE;
        dx=-Math.max(1,Math.round(PAINT_SCROLL_MAX*Math.min(1,strength)));
      }else if(paintLastX>rightEdge-PAINT_SCROLL_EDGE){
        const strength=(paintLastX-(rightEdge-PAINT_SCROLL_EDGE))/PAINT_SCROLL_EDGE;
        dx=Math.max(1,Math.round(PAINT_SCROLL_MAX*Math.min(1,strength)));
      }
      if(dx)scroller.scrollLeft+=dx;
    }
  }
  if(dx||dy)updatePaintPoint(paintLastX,paintLastY);
  paintScrollRaf=requestAnimationFrame(paintAutoScrollStep);
}
function startPaintAutoScroll(){
  if(!paintScrollRaf)paintScrollRaf=requestAnimationFrame(paintAutoScrollStep);
}
function stopPaintAutoScroll(){
  if(paintScrollRaf){cancelAnimationFrame(paintScrollRaf);paintScrollRaf=0}
}
function endPaint(commit){
  cancelPaintHold();
  stopPaintAutoScroll();
  const wasPaintMode=paintMode;
  paintMode=false;
  paintAxis=null;
  if(paintSourceCell)paintSourceCell.classList.remove('paint-source');
  paintSourceCell=null;
  if(!wasPaintMode){paintPreviewCells.clear();return}
  suppressCellClickUntil=Date.now()+500;
  suppressPageSwipeUntil=Date.now()+500;
  if(commit){
    for(const key of paintPreviewCells){
      const [p,s]=key.split(":").map(Number);
      progress[p][s]=paintValue;
    }
    paintPreviewCells.clear();
    save();
    updateSummary();
  }else{
    restorePaintPreview();
  }
}
pages.addEventListener('touchstart',e=>{
  if(e.touches.length!==1)return;
  const cell=e.target.closest?.('.progress-cell');
  if(!cell)return;
  cancelPaintHold();
  stopPaintAutoScroll();
  paintMode=false;
  paintAxis=null;
  paintPreviewCells.clear();
  paintStartX=paintLastX=e.touches[0].clientX;
  paintStartY=paintLastY=e.touches[0].clientY;
  paintSourceCell=cell;
  paintHoldTimer=setTimeout(()=>{
    const p=Number(cell.dataset.pageIndex),s=Number(cell.dataset.stageIndex);
    if(!Number.isInteger(p)||!Number.isInteger(s))return;
    paintMode=true;
    paintStage=s;
    paintValue=progress[p][s];
    paintSourcePage=p;
    paintPreviewCells=new Set([paintKey(p,s)]);
    cell.classList.add('paint-source');
    suppressCellClickUntil=Date.now()+1000;
    suppressPageSwipeUntil=Date.now()+1000;
    if(navigator.vibrate)navigator.vibrate(28);
    startPaintAutoScroll();
  },PAINT_HOLD_MS);
},{passive:true});

pages.addEventListener('touchmove',e=>{
  if(e.touches.length!==1)return;
  const t=e.touches[0];
  paintLastX=t.clientX;paintLastY=t.clientY;
  if(!paintMode){
    if(Math.hypot(t.clientX-paintStartX,t.clientY-paintStartY)>PAINT_CANCEL_MOVE)cancelPaintHold();
    return;
  }
  // 長押し開始後は最初の移動方向へ固定。斜めにぶれても縦/横の範囲だけを変更する。
  e.preventDefault();
  suppressPageSwipeUntil=Date.now()+500;
  updatePaintPoint(t.clientX,t.clientY);
},{passive:false});

pages.addEventListener('touchend',()=>endPaint(true),{passive:true});
pages.addEventListener('touchcancel',()=>endPaint(false),{passive:true});

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
    .filter(x=>memoListFilter==="all"||x.note.color===memoListFilter)
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
    pg.style.background=note.color||"#f4dc8a";
    pg.textContent=page+"P";
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
    row.append(pg,content,jump);
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


let newProjectStageDraft=[...DEFAULT_STAGES];
function renderNewProjectStageEditor(){
  const box=document.getElementById("newStageEditorList"); if(!box)return;
  box.innerHTML="";
  newProjectStageDraft.forEach((name,i)=>{
    const row=document.createElement("div");row.className="stage-editor-row";
    row.innerHTML=`<input type="text" maxlength="12" value="${escapeStageHtml(name)}" aria-label="工程名">
      <button type="button" class="stage-mini-button" data-act="up">↑</button>
      <button type="button" class="stage-mini-button" data-act="down">↓</button>
      <button type="button" class="stage-mini-button danger" data-act="del">×</button>`;
    const input=row.querySelector("input");
    input.addEventListener("input",()=>newProjectStageDraft[i]=input.value);
    row.querySelector('[data-act="up"]').onclick=()=>{
      if(!i)return;
      [newProjectStageDraft[i-1],newProjectStageDraft[i]]=[newProjectStageDraft[i],newProjectStageDraft[i-1]];
      renderNewProjectStageEditor();
    };
    row.querySelector('[data-act="down"]').onclick=()=>{
      if(i>=newProjectStageDraft.length-1)return;
      [newProjectStageDraft[i+1],newProjectStageDraft[i]]=[newProjectStageDraft[i],newProjectStageDraft[i+1]];
      renderNewProjectStageEditor();
    };
    row.querySelector('[data-act="del"]').onclick=()=>{
      if(newProjectStageDraft.length<=1){alert("工程は1つ以上必要です。");return}
      newProjectStageDraft.splice(i,1);renderNewProjectStageEditor();
    };
    box.appendChild(row);
  });
  document.getElementById("newStageAddButton").disabled=false;
}
function resetNewProjectStages(){
  newProjectStageDraft=[...DEFAULT_STAGES];
  renderNewProjectStageEditor();
  document.getElementById("newStagePanel").classList.remove("open");
  document.getElementById("newStageToggle").classList.remove("open");
}
document.getElementById("newStageToggle").addEventListener("click",()=>{
  document.getElementById("newStagePanel").classList.toggle("open");
  document.getElementById("newStageToggle").classList.toggle("open");
});
document.getElementById("newStageAddButton").addEventListener("click",()=>{
  if(newProjectStageDraft.length>=MAX_STAGES){alert(languageSettings?.language==="en"?`Up to ${MAX_STAGES} stages.`:`工程は最大${MAX_STAGES}個までです。`);return}
  newProjectStageDraft.push("");
  renderNewProjectStageEditor();
});


function populatePageSelect(selectId){
  const select=document.getElementById(selectId);
  if(!select||select.options.length)return;
  const frag=document.createDocumentFragment();
  for(let page=1;page<=500;page++){
    const option=document.createElement("option");
    option.value=String(page);
    option.textContent=String(page);
    frag.appendChild(option);
  }
  select.appendChild(frag);
}
["defaultStartPage","defaultEndPage","newProjectStart","newProjectEnd"].forEach(populatePageSelect);

let modalPageScrollY=0;
function lockPageScroll(){
  if(document.body.dataset.modalScrollLocked==="1")return;
  modalPageScrollY=window.scrollY||document.documentElement.scrollTop||0;
  document.body.dataset.modalScrollLocked="1";
  document.body.style.position="fixed";
  document.body.style.top=`-${modalPageScrollY}px`;
  document.body.style.left="0";
  document.body.style.right="0";
  document.body.style.width="100%";
  document.body.style.overflow="hidden";
}
function unlockPageScroll(){
  if(document.body.dataset.modalScrollLocked!=="1")return;
  delete document.body.dataset.modalScrollLocked;
  document.body.style.position="";
  document.body.style.top="";
  document.body.style.left="";
  document.body.style.right="";
  document.body.style.width="";
  document.body.style.overflow="";
  window.scrollTo(0,modalPageScrollY);
}
function closeAppSettings(){
  document.getElementById("appSettingsModal").classList.remove("open");
  unlockPageScroll();
}

document.getElementById("appSettingsButton").onclick=()=>{
 document.getElementById("defaultStartPage").value=projectDefaults.startPage;
 document.getElementById("defaultEndPage").value=projectDefaults.endPage;
 defaultStageDraft=[...projectDefaults.stages];renderDefaultStageEditor();
 applyThemeColor(appSettings.themeColor);
 lockPageScroll();
 document.getElementById("appSettingsModal").classList.add("open");
};
document.getElementById("settingsCancel").onclick=closeAppSettings;
document.getElementById("appSettingsModal").onclick=e=>{if(e.target.id==="appSettingsModal")closeAppSettings()};
document.getElementById("defaultStageAdd").onclick=()=>{if(defaultStageDraft.length>=MAX_STAGES){alert(languageSettings?.language==="en"?`Up to ${MAX_STAGES} stages.`:`工程は最大${MAX_STAGES}個までです。`);return}defaultStageDraft.push(languageSettings.language==="en"?"New Stage":"新しい工程");renderDefaultStageEditor()};
document.getElementById("settingsSave").onclick=()=>{
 let a=Math.max(1,Math.min(500,Number(document.getElementById("defaultStartPage").value)||1));
 let b=Math.max(a,Math.min(500,Number(document.getElementById("defaultEndPage").value)||a));
 if(b-a+1>500){alert(appSettings.language==="en"?"Up to 500 pages per project.":"1作品500ページまでです。");return}
 const ss=defaultStageDraft.map(x=>String(x||"").trim()).filter(Boolean);
 if(!ss.length)return;
 appSettings=normalizeAppSettings({language:document.getElementById("appLanguage").value,defaultStartPage:a,defaultEndPage:b,defaultStages:ss,themeColor:document.querySelector(".theme-color-option.selected")?.dataset.themeColor||appSettings.themeColor});
 persistAppSettings();applyLanguage();applyThemeColor();
 closeAppSettings();
};

document.querySelectorAll(".theme-color-option").forEach(btn=>btn.addEventListener("click",()=>applyThemeColor(btn.dataset.themeColor)));

document.getElementById("newProjectButton").onclick=()=>{
  document.getElementById("newProjectTitle").value="";
  document.getElementById("newProjectStart").value=projectDefaults.startPage;
  document.getElementById("newProjectEnd").value=projectDefaults.endPage;
  document.getElementById("newProjectCreationStartDate").value="";
  document.getElementById("newProjectDeadline").value="";
  document.getElementById("newProjectTotal").textContent=`全${projectDefaults.endPage-projectDefaults.startPage+1}P`;
  newProjectStageDraft=[...projectDefaults.stages];
  renderNewProjectStageEditor();
  document.getElementById("newStagePanel").classList.remove("open");
  document.getElementById("newStageToggle").classList.remove("open");
  lockPageScroll();
  document.getElementById("projectModal").classList.add("open");
  // Do not auto-focus: opening the create sheet should not summon the mobile keyboard.
};
function closeNewProjectModal(){
  document.getElementById("projectModal").classList.remove("open");
  unlockPageScroll();
}
document.getElementById("cancelNewProject").onclick=closeNewProjectModal;
document.getElementById("projectModal").onclick=e=>{if(e.target.id==="projectModal")closeNewProjectModal()};
function updateNewProjectTotal(){
  let a=Math.max(1,Math.min(500,Number(document.getElementById("newProjectStart").value)||1));
  let b=Math.max(a,Math.min(500,Number(document.getElementById("newProjectEnd").value)||a));
  document.getElementById("newProjectTotal").textContent=`全${b-a+1}P`;
}
document.getElementById("newProjectStart").addEventListener("change",updateNewProjectTotal);
document.getElementById("newProjectEnd").addEventListener("change",updateNewProjectTotal);
document.getElementById("createNewProject").onclick=()=>{
  const title=document.getElementById("newProjectTitle").value.trim();
  let a=Math.max(1,Math.min(500,Number(document.getElementById("newProjectStart").value)||1));
  let b=Math.max(a,Math.min(500,Number(document.getElementById("newProjectEnd").value)||a));
  if(b-a+1>500){alert("1作品500ページまでです。");return;}
  const id=newProjectId();
  projectStore.projects[id]=freshProjectData(title,a,b);
  // フォルダ内から作成した場合は、そのフォルダに所属させる
  projectStore.projects[id].folderId=currentFolderId||null;
  const newStages=newProjectStageDraft.map(x=>String(x??"").trim());
  projectStore.projects[id].stages=newStages;
  projectStore.projects[id].progress=Array.from({length:b-a+1},()=>Array(newStages.length).fill(0));
  projectStore.projects[id].creationStartDate=document.getElementById("newProjectCreationStartDate").value||"";
  projectStore.projects[id].deadline=document.getElementById("newProjectDeadline").value||"";
  projectStore.projectOrder=[id,...(Array.isArray(projectStore.projectOrder)?projectStore.projectOrder:[]).filter(x=>x!==id)];
  if(!Array.isArray(projectStore.rootOrder))projectStore.rootOrder=[];
  // ルートで作成した作品だけ rootOrder に追加する
  if(!currentFolderId){
    projectStore.rootOrder=["p:"+id,...projectStore.rootOrder.filter(k=>k!=="p:"+id)];
  }else{
    projectStore.rootOrder=projectStore.rootOrder.filter(k=>k!=="p:"+id);
  }
  projectStore.activeProjectId=id;
  persistProjectStore();
  closeNewProjectModal();
  openProject(id);
};

load();


// --- 工程カスタマイズ prototype ---
let stageDraft=[];
let stageDraftMeta=[];
function escapeStageHtml(s){
  return String(s).replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
}
function initStageDraft(p){
  const arr=Array.isArray(p?.stages)&&p.stages.length?p.stages:DEFAULT_STAGES;
  stageDraft=[...arr];
  stageDraftMeta=arr.map((_,i)=>({originalIndex:i}));
}
function renderStageEditor(){
  const box=document.getElementById("stageEditorList"); if(!box)return;
  box.innerHTML="";
  stageDraft.forEach((name,i)=>{
    const row=document.createElement("div"); row.className="stage-editor-row";
    row.innerHTML=`<input type="text" maxlength="12" value="${escapeStageHtml(name)}" aria-label="工程名">
      <button type="button" class="stage-mini-button" data-act="up" title="上へ">↑</button>
      <button type="button" class="stage-mini-button" data-act="down" title="下へ">↓</button>
      <button type="button" class="stage-mini-button danger" data-act="del" title="削除">×</button>`;
    const input=row.querySelector("input");
    input.addEventListener("input",()=>stageDraft[i]=input.value);
    row.querySelector('[data-act="up"]').onclick=()=>{
      if(!i)return;
      [stageDraft[i-1],stageDraft[i]]=[stageDraft[i],stageDraft[i-1]];
      [stageDraftMeta[i-1],stageDraftMeta[i]]=[stageDraftMeta[i],stageDraftMeta[i-1]];
      renderStageEditor();
    };
    row.querySelector('[data-act="down"]').onclick=()=>{
      if(i>=stageDraft.length-1)return;
      [stageDraft[i+1],stageDraft[i]]=[stageDraft[i],stageDraft[i+1]];
      [stageDraftMeta[i+1],stageDraftMeta[i]]=[stageDraftMeta[i],stageDraftMeta[i+1]];
      renderStageEditor();
    };
    row.querySelector('[data-act="del"]').onclick=()=>{
      if(stageDraft.length<=1){alert("工程は1つ以上必要です。");return}
      if(!confirm(`「${stageDraft[i]||"この工程"}」を削除しますか？\nこの工程の全ページの進捗も削除されます。`))return;
      stageDraft.splice(i,1); stageDraftMeta.splice(i,1); renderStageEditor();
    };
    box.appendChild(row);
  });
  const add=document.getElementById("stageAddButton");
  if(add)add.disabled=false;
}
document.getElementById("stageAddButton")?.addEventListener("click",()=>{
  if(stageDraft.length>=MAX_STAGES){alert(languageSettings?.language==="en"?`Up to ${MAX_STAGES} stages.`:`工程は最大${MAX_STAGES}個までです。`);return}
  stageDraft.push("");
  stageDraftMeta.push({originalIndex:null});
  renderStageEditor();
});
function displayStageName(name,index){
  const value=String(name??"").trim();
  if(value)return value;
  return languageSettings?.language==="en"?"New Stage":"新しい工程";
}
function renderDynamicTableHead(){
  const head=document.getElementById("tableHead"); if(!head)return;
  document.documentElement.style.setProperty("--stage-count",String(stages.length));
  head.innerHTML=`<div class="table-head-corner"></div>${stages.map((n,i)=>`<div class="head">${escapeStageHtml(displayStageName(n,i))}</div>`).join("")}`;
  requestAnimationFrame(updateInitialTableCellSize);
}

// 横方向は工程名とセルを同じスクロール領域に置き、ブラウザのネイティブスクロールだけで動かす。
// JSは工程ヘッダーの「縦方向」の追従だけを担当する。
function updateInitialTableCellSize(){
  const scroller=document.getElementById("stageTableScroll");
  if(!scroller)return;
  const root=getComputedStyle(document.documentElement);
  const pageCol=parseFloat(root.getPropertyValue("--progress-page-col"))||28;
  const gap=parseFloat(root.getPropertyValue("--progress-grid-gap"))||3;
  // 初期5工程 + ページ番号が、端数なく表示幅に収まるサイズ。
  const visibleStages=5;
  const scrollerStyle=getComputedStyle(scroller);
  const sidePadding=(parseFloat(scrollerStyle.paddingLeft)||0)+(parseFloat(scrollerStyle.paddingRight)||0);
  const available=scroller.clientWidth-sidePadding-pageCol-gap*visibleStages;
  if(available>0){
    document.documentElement.style.setProperty("--progress-cell-size",`${available/visibleStages}px`);
  }
  // 縦方向もセルの途中で切れない高さに丸める。
  requestAnimationFrame(updateInitialTableViewportHeight);
}
function updateInitialTableViewportHeight(){
  const scroller=document.getElementById("stageTableScroll");
  const anchor=document.getElementById("tableHeadAnchor");
  if(!scroller||!anchor)return;
  const header=Math.ceil(anchor.getBoundingClientRect().height);
  const firstRow=scroller.querySelector("#pages .page-row");
  if(!firstRow)return;
  const rowStyle=getComputedStyle(firstRow);
  const rowHeight=Math.ceil(firstRow.getBoundingClientRect().height);
  const rowGap=parseFloat(rowStyle.marginBottom)||0;
  const rowOuter=rowHeight+rowGap;
  const scrollerStyle=getComputedStyle(scroller);
  const padTop=parseFloat(scrollerStyle.paddingTop)||0;
  const padBottom=parseFloat(scrollerStyle.paddingBottom)||0;
  const cap=Math.min(window.innerHeight*0.72,760);
  const rows=Math.max(3,Math.floor((cap-header-padTop-padBottom)/rowOuter));
  // ヘッダー + 完全な行だけで表示高を構成し、次の行が途中で見えないようにする。
  const exact=Math.ceil(header+padTop+padBottom+rows*rowOuter);
  document.documentElement.style.setProperty("--stage-grid-height",`${exact}px`);
}

// Excel-style grid: vertical and horizontal header following are native CSS sticky.
// No scroll-position synchronization is required.
(function setupNativeGridSizing(){
  const scroller=document.getElementById("stageTableScroll");
  if(!scroller)return;
  const resize=()=>updateInitialTableCellSize();
  window.addEventListener("resize",resize,{passive:true});
  if(window.ResizeObserver)new ResizeObserver(resize).observe(scroller);
  resize();
})();

let editingProjectId=null;
function updateEditProjectTotal(){
  const a=Math.max(1,Number(document.getElementById("editProjectStart").value)||1);
  const b=Math.max(a,Number(document.getElementById("editProjectEnd").value)||a);
  document.getElementById("editProjectTotal").textContent=`全${b-a+1}P`;
}
function openProjectEdit(id){
  const p=projectStore.projects[id]; if(!p)return;
  editingProjectId=id;
  initStageDraft(p);
  renderStageEditor();
  document.getElementById("editProjectTitle").value=p.title||"";
  document.getElementById("editProjectStart").value=p.startPage||1;
  document.getElementById("editProjectEnd").value=(p.startPage||1)+(p.totalPages||1)-1;
  document.getElementById("editProjectCreationStartDate").value=p.creationStartDate||"";
  document.getElementById("editProjectDeadline").value=p.deadline||"";
  updateEditProjectTotal();
  document.getElementById("editProjectModal").classList.add("open");
  document.body.style.overflow="hidden";
}
function closeProjectEdit(){
  document.getElementById("editProjectModal").classList.remove("open");
  document.body.style.overflow="";
  editingProjectId=null;
}
["editProjectStart","editProjectEnd"].forEach(id=>document.getElementById(id).addEventListener("input",updateEditProjectTotal));
document.getElementById("cancelEditProject").addEventListener("click",closeProjectEdit);
document.getElementById("editProjectModal").addEventListener("click",e=>{if(e.target.id==="editProjectModal")closeProjectEdit();});
document.getElementById("saveEditProject").addEventListener("click",()=>{
  if(!editingProjectId)return;
  const p=projectStore.projects[editingProjectId];
  const newStart=Math.max(1,Number(document.getElementById("editProjectStart").value)||1);
  const newEnd=Math.max(newStart,Number(document.getElementById("editProjectEnd").value)||newStart);
  const newTotal=newEnd-newStart+1;
  const oldStart=p.startPage||1, oldProgress=Array.isArray(p.progress)?p.progress:[];
  const oldStages=Array.isArray(p.stages)&&p.stages.length?[...p.stages]:[...DEFAULT_STAGES];
  const cleanedStages=stageDraft.map(x=>String(x??"").trim());
  // Each draft item carries its original column index, so rename/reorder preserves the exact progress column.
  const mapping=stageDraftMeta.map(x=>x.originalIndex);
  p.stages=cleanedStages;
  p.progress=Array.from({length:newTotal},(_,i)=>{
    const oldIndex=(newStart+i)-oldStart;
    if(oldIndex<0||oldIndex>=oldProgress.length)return Array(p.stages.length).fill(0);
    const oldRow=oldProgress[oldIndex]||[];
    return mapping.map(oi=>oi===null?0:(oldRow[oi]??0));
  });
  p.title=document.getElementById("editProjectTitle").value.trim();
  p.startPage=newStart; p.totalPages=newTotal;
  p.creationStartDate=document.getElementById("editProjectCreationStartDate").value||"";
  p.deadline=document.getElementById("editProjectDeadline").value||"";
  persistProjectStore();
  closeProjectEdit();
  renderProjectList();
});


const editOverlay=document.getElementById("editProjectModal");
["touchstart","touchmove","touchend"].forEach(type=>{
  editOverlay.addEventListener(type,e=>e.stopPropagation(),{passive:true});
});


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


// 作品一覧：スマホ向け長押しドラッグ（Touch Events版）
let reorderDragging=null,reorderHoldTimer=null,reorderStartX=0,reorderStartY=0,reorderLastX=0,reorderLastY=0;
const REORDER_HOLD_MS=480,REORDER_CANCEL_MOVE=12;
function saveProjectOrderFromDOM(){
 const list=document.getElementById("projectList");if(!list){folderRendering=false;return;}
 projectStore.projectOrder=[...list.querySelectorAll(".project-item[data-project-id]")].map(el=>el.dataset.projectId);
 persistProjectStore();
}
function clearReorderMarks(){document.querySelectorAll(".project-item.reorder-over").forEach(x=>x.classList.remove("reorder-over"))}
function finishReorder(){
 clearTimeout(reorderHoldTimer);reorderHoldTimer=null;
 if(!reorderDragging)return;
 reorderDragging.classList.remove("reorder-dragging");clearReorderMarks();reorderDragging=null;
 document.querySelectorAll(".folder-item.drag-over").forEach(x=>x.classList.remove("drag-over"));
 
 saveProjectOrderFromDOM();
 setTimeout(renderFoldersAndFilter,0);
}
function moveReorderAt(x,y){
 if(!reorderDragging)return;
 const list=document.getElementById("projectList");
 const over=document.elementFromPoint(x,y)?.closest?.(".project-item[data-project-id]");
 clearReorderMarks();
 if(!over||over===reorderDragging)return;
 over.classList.add("reorder-over");
 const r=over.getBoundingClientRect();
 const items=[...list.querySelectorAll(".project-item[data-project-id]")];
 const beforeRects=new Map(items.map(el=>[el,el.getBoundingClientRect()]));
 list.insertBefore(reorderDragging,y<r.top+r.height/2?over:over.nextSibling);
 items.forEach(el=>{
   if(el===reorderDragging)return;
   const before=beforeRects.get(el),after=el.getBoundingClientRect();
   const dy=before.top-after.top;
   if(Math.abs(dy)<1)return;
   el.style.transition="none";
   el.style.transform=`translateY(${dy}px)`;
   requestAnimationFrame(()=>requestAnimationFrame(()=>{
     el.style.transition="transform .20s cubic-bezier(.2,.8,.2,1)";
     el.style.transform="";
   }));
 });
}
const reorderList=document.getElementById("projectList");
if(reorderList){
 reorderList.addEventListener("touchstart",e=>{
  if(e.touches.length!==1||e.target.closest("button,a,input,textarea,select,label"))return;
  const item=e.target.closest(".project-item[data-project-id]");if(!item)return;
  const t=e.touches[0];
  reorderStartX=reorderLastX=t.clientX;reorderStartY=reorderLastY=t.clientY;
  clearTimeout(reorderHoldTimer);
  reorderHoldTimer=setTimeout(()=>{
   reorderDragging=item;item.classList.add("reorder-dragging");
   if(navigator.vibrate)navigator.vibrate(28);
  },REORDER_HOLD_MS);
 },{passive:true});
 reorderList.addEventListener("touchmove",e=>{
  if(e.touches.length!==1)return;
  const t=e.touches[0];reorderLastX=t.clientX;reorderLastY=t.clientY;
  if(!reorderDragging){
   if(Math.hypot(t.clientX-reorderStartX,t.clientY-reorderStartY)>REORDER_CANCEL_MOVE){
    clearTimeout(reorderHoldTimer);reorderHoldTimer=null;
   }
   return;
  }
  e.preventDefault();
  moveReorderAt(t.clientX,t.clientY);
 },{passive:false});
 reorderList.addEventListener("touchend",finishReorder,{passive:true});
 reorderList.addEventListener("touchcancel",finishReorder,{passive:true});

 // PCでも確認できるようマウス操作も対応
 reorderList.addEventListener("mousedown",e=>{
  if(e.button!==0||e.target.closest("button,a,input,textarea,select,label"))return;
  const item=e.target.closest(".project-item[data-project-id]");if(!item)return;
  reorderStartX=e.clientX;reorderStartY=e.clientY;
  clearTimeout(reorderHoldTimer);
  reorderHoldTimer=setTimeout(()=>{reorderDragging=item;item.classList.add("reorder-dragging")},REORDER_HOLD_MS);
 });
 window.addEventListener("mousemove",e=>{
  if(!reorderDragging)return;
  e.preventDefault();moveReorderAt(e.clientX,e.clientY);
 });
 window.addEventListener("mouseup",finishReorder);
}


// フォルダ・プロトタイプ：1階層のみ
let currentFolderId=null;
function ensureFolders(){
 if(!projectStore.folders||typeof projectStore.folders!=="object")projectStore.folders={};
 Object.values(projectStore.projects||{}).forEach(p=>{if(!("folderId" in p))p.folderId=null});
 if(!Array.isArray(projectStore.rootOrder))projectStore.rootOrder=[];
 const keys=[];
 Object.keys(projectStore.folders).forEach(id=>{if(!projectStore.folders[id]?.trashedAt)keys.push("f:"+id)});
 (projectStore.projectOrder||[]).forEach(id=>{
   if(projectStore.projects[id]&&!projectStore.projects[id].folderId)keys.push("p:"+id);
 });
 Object.keys(projectStore.projects||{}).forEach(id=>{
   if(!projectStore.projects[id].folderId)keys.push("p:"+id);
 });
 const valid=[...new Set(keys)];
 projectStore.rootOrder=projectStore.rootOrder.filter(k=>valid.includes(k));
 valid.forEach(k=>{if(!projectStore.rootOrder.includes(k))projectStore.rootOrder.push(k)});
}
function folderCount(fid){return Object.values(projectStore.projects||{}).filter(p=>p.folderId===fid&&!p.trashedAt).length}
function renderFoldersAndFilter(){
 if(folderRendering)return;
 folderRendering=true;
 ensureFolders();
 const list=document.getElementById("projectList");if(!list)return;
 list.querySelectorAll(".folder-item").forEach(x=>x.remove());
 const head=document.getElementById("folderHead"),toolbar=document.getElementById("folderToolbar");
 if(currentFolderId&&projectStore.folders[currentFolderId]){
   head?.classList.add("show");if(toolbar)toolbar.style.display="none";
   document.getElementById("folderHeadTitle").innerHTML=`<button type="button" class="crumb-link" data-nav="root">${"Library"}</button><span class="crumb-sep">›</span><span class="crumb-current">${String(projectStore.folders[currentFolderId].name).replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;","\"":"&quot;","'":"&#39;"}[c]))}</span>`;
 const renameBtn=document.getElementById("folderRename");
 const deleteBtn=document.getElementById("folderDelete");
 if(renameBtn)renameBtn.style.display="";
 if(deleteBtn){deleteBtn.style.display="";deleteBtn.textContent=languageSettings?.language==="en"?"Remove":"解除";}
 }else{
   currentFolderId=null;head?.classList.remove("show");if(toolbar)toolbar.style.display="flex";
   const renameBtn=document.getElementById("folderRename");
   const deleteBtn=document.getElementById("folderDelete");
   if(renameBtn)renameBtn.style.display="none";
   if(deleteBtn)deleteBtn.style.display="none";
 }
 [...list.querySelectorAll(".project-item[data-project-id]")].forEach(el=>{
   const p=projectStore.projects[el.dataset.projectId];
   el.style.display=((p?.folderId||null)===currentFolderId)?"":"none";
 });
 if(currentFolderId){
   // フォルダ内の各作品に「フォルダから戻す」を表示
   [...list.querySelectorAll(".project-item[data-project-id]")].forEach(item=>{
     const pid=item.dataset.projectId;
     const p=projectStore.projects[pid];
     if(!p||p.folderId!==currentFolderId)return;
     if(item.querySelector(".folder-eject"))return;
     const actions=item.querySelector(".project-item-actions")||item;
     const btn=document.createElement("button");
     btn.type="button";
     btn.className="folder-eject project-icon-button";
     btn.setAttribute("aria-label",languageSettings?.language==="en"?"Remove from folder":"フォルダから解除");
     btn.title=languageSettings?.language==="en"?"Remove from folder":"フォルダから解除";
     btn.innerHTML='<svg class="icon-line" viewBox="0 0 24 24" aria-hidden="true"><path d="M9 7l-5 5 5 5"/><path d="M4 12h10a6 6 0 0 1 6 6v1"/></svg>';
     btn.addEventListener("click",e=>{
       e.stopPropagation();
       p.folderId=null;
       persistProjectStore();
       renderFoldersAndFilter();
     });
     actions.append(btn);
   });
 }
 if(!currentFolderId){
   Object.entries(projectStore.folders).filter(([,f])=>!f?.trashedAt).forEach(([fid,f])=>{
     const el=document.createElement("div");el.className="folder-item";el.dataset.folderId=fid;el.dataset.orderKey="f:"+fid;
     el.innerHTML=`<div class="folder-row"><div><div class="folder-name"><span class="folder-icon"><svg class="icon-line" viewBox="0 0 24 24" aria-hidden="true"><path d="M3 6h7l2 2h9v11H3z"/></svg></span><span data-user-text="1">${String(f.name).replace(/[&<>"\']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;","\"":"&quot;","\'":"&#39;"}[c]))}</span></div><div class="folder-meta">${folderCount(fid)}${languageSettings?.language==="en"?" projects":"作品"}</div></div></div>`;
     const openFolder=()=>{ showFolderView(fid); };
     // カード本体の短いタップでも開く。長押しドラッグ直後のclickは既存の抑制を尊重。
     el.addEventListener("click",e=>{
       if(e.target.closest("button,a,input,textarea,select,label"))return;
       if(Date.now()<(window.__suppressMixedClickUntil||0))return;
       if(window.__mixedRootDragging)return;
       openFolder();
     });
     list.append(el);
   });
   const rank=new Map(projectStore.rootOrder.map((k,i)=>[k,i]));
   const mixed=[...list.querySelectorAll(".folder-item[data-folder-id],.project-item[data-project-id]")]
     .filter(el=>el.classList.contains("folder-item")||!projectStore.projects[el.dataset.projectId]?.folderId);
   mixed.sort((a,b)=>(rank.get(a.dataset.orderKey)??999999)-(rank.get(b.dataset.orderKey)??999999));
   mixed.forEach(el=>list.append(el));
 }
 if(!currentFolderId)renderRootBreadcrumb();
 requestAnimationFrame(()=>{folderRendering=false});
}
function createFolder(){
 const input=document.getElementById("folderNameInput"),name=input.value.trim();if(!name)return;
 ensureFolders();const id="folder-"+Date.now();
 projectStore.folders[id]={name,createdAt:new Date().toISOString()};
 if(!Array.isArray(projectStore.rootOrder))projectStore.rootOrder=[];
 projectStore.rootOrder=["f:"+id,...projectStore.rootOrder.filter(k=>k!=="f:"+id)];
 persistProjectStore();input.value="";document.getElementById("folderModal").classList.remove("open");document.body.style.overflow="";
 renderFoldersAndFilter();
}
document.getElementById("folderAdd")?.addEventListener("click",()=>{document.getElementById("folderModal").classList.add("open");document.body.style.overflow="hidden";});
document.getElementById("folderCancel")?.addEventListener("click",()=>{document.getElementById("folderModal").classList.remove("open");document.body.style.overflow=""});
document.getElementById("folderCreate")?.addEventListener("click",createFolder);
// Android/file://でも確実に反応する予備の委譲ハンドラ
document.addEventListener("click",e=>{
 if(e.target?.id==="folderCreate"){e.preventDefault();createFolder()}
 if(e.target?.id==="folderCancel"){
   e.preventDefault();
   document.getElementById("folderModal")?.classList.remove("open");
   document.body.style.overflow="";
 }
});
document.getElementById("folderNameInput")?.addEventListener("keydown",e=>{if(e.key==="Enter")createFolder()});
document.getElementById("folderBack")?.addEventListener("click",e=>{
  e.preventDefault();e.stopPropagation();
  if(window.history.state?.fillio&&currentFolderId){window.history.back();return}
  showProjectHome();
});
document.getElementById("folderRename")?.addEventListener("click",()=>{
 if(!currentFolderId)return;
 const f=projectStore.folders?.[currentFolderId];if(!f)return;
 const modal=document.getElementById("folderRenameModal"),input=document.getElementById("folderRenameInput");
 input.value=f.name||"";modal.classList.add("open");document.body.style.overflow="hidden";
 setTimeout(()=>{input.focus();input.select();},50);
});
function closeFolderRename(){
 document.getElementById("folderRenameModal")?.classList.remove("open");
 document.body.style.overflow="";
}
function saveFolderRename(){
 if(!currentFolderId)return closeFolderRename();
 const f=projectStore.folders?.[currentFolderId];if(!f)return closeFolderRename();
 const name=document.getElementById("folderRenameInput").value.trim();
 if(!name)return;
 f.name=name;persistProjectStore();closeFolderRename();renderFoldersAndFilter();saveViewState("folder");
}
document.getElementById("folderRenameCancel")?.addEventListener("click",closeFolderRename);
document.getElementById("folderRenameSave")?.addEventListener("click",saveFolderRename);
document.getElementById("folderRenameInput")?.addEventListener("keydown",e=>{if(e.key==="Enter")saveFolderRename()});
document.getElementById("folderRenameModal")?.addEventListener("click",e=>{if(e.target.id==="folderRenameModal")closeFolderRename()});
document.getElementById("folderDelete")?.addEventListener("click",()=>{
 if(!currentFolderId)return;
 const f=projectStore.folders[currentFolderId];if(!f)return;
 if(!confirm(languageSettings?.language==="en"?`Remove folder “${f.name}”?\nProjects inside will return to Projects.`:`「${f.name}」を解除しますか？\n中の作品は作品一覧へ戻ります。`))return;
 const deletedFolderId=currentFolderId;
 Object.values(projectStore.projects).forEach(p=>{if(p.folderId===deletedFolderId)p.folderId=null});
 delete projectStore.folders[deletedFolderId];
 if(Array.isArray(projectStore.rootOrder))projectStore.rootOrder=projectStore.rootOrder.filter(k=>k!=="f:"+deletedFolderId);
 currentFolderId=null;
 persistProjectStore();
 // 削除後は既存のルート一覧遷移を通す。
 // 旧コードの renderProjectHome() は存在しない関数名で、ここで例外になり
 // DOMだけ削除前のフォルダ画面に残っていた。
 showProjectHome();
});


// フォルダ操作は委譲でも受ける。再描画後のボタンでも確実に動作。
document.addEventListener("click",e=>{
  const back=e.target.closest?.("#folderBack");
  if(back){
    e.preventDefault();e.stopPropagation();
    currentFolderId=null;
    renderFoldersAndFilter();
    saveViewState("root");
    return;
  }
  const eject=e.target.closest?.(".folder-eject");
  if(eject){
    e.preventDefault();e.stopPropagation();
    const item=eject.closest(".project-item[data-project-id]");
    const p=item&&projectStore.projects[item.dataset.projectId];
    if(p){
      p.folderId=null;
      persistProjectStore();
      renderFoldersAndFilter();
    }
  }
},true);

// 既存renderProjectHome後にフォルダ表示を重ねる
let folderRendering=false;
const folderObserver=new MutationObserver(()=>{
 if(window.__mixedRootDragging||reorderDragging||folderRendering)return;
 clearTimeout(window.__folderRenderTimer);
 window.__folderRenderTimer=setTimeout(()=>{
   if(!window.__mixedRootDragging&&!reorderDragging&&!folderRendering)renderFoldersAndFilter();
 },0);
});
const folderList=document.getElementById("projectList");
if(folderList)folderObserver.observe(folderList,{childList:true});

// 長押しドラッグ中、ルート一覧ではフォルダ上で離すと格納。
// フォルダ内では「←戻る」上で離すと一覧へ戻す。
let folderDropTarget=null;
document.addEventListener("touchmove",e=>{
 if(window.__mixedRootDragging||!reorderDragging||e.touches.length!==1)return;
 const t=e.touches[0];
 let nextTarget=null;

 // 指の座標とフォルダの実座標で判定する。
 // elementFromPointだと掴んでいる作品カード自身が前面に来て
 // フォルダを拾えないことがあるため。
 if(!currentFolderId){
   const folders=[...document.querySelectorAll(".folder-item[data-folder-id]")];
   const folder=folders.find(el=>{
     const r=el.getBoundingClientRect();
     return t.clientX>=r.left-8&&t.clientX<=r.right+8&&
            t.clientY>=r.top-8&&t.clientY<=r.bottom+8;
   });
   if(folder)nextTarget={type:"folder",id:folder.dataset.folderId};
 }else{
   const back=document.getElementById("folderBack");
   if(back){
     const r=back.getBoundingClientRect();
     if(t.clientX>=r.left-8&&t.clientX<=r.right+8&&
        t.clientY>=r.top-8&&t.clientY<=r.bottom+8){
       nextTarget={type:"root"};
     }
   }
 }

 // 対象が変わった時だけ見た目を更新。重なっている間は状態を固定する。
 const sameTarget=folderDropTarget&&nextTarget&&folderDropTarget.type===nextTarget.type&&folderDropTarget.id===nextTarget.id;
 const bothEmpty=!folderDropTarget&&!nextTarget;
 if(!sameTarget&&!bothEmpty){
   document.querySelectorAll(".folder-item.drag-over").forEach(x=>x.classList.remove("drag-over"));
   
   folderDropTarget=nextTarget;
   if(folderDropTarget?.type==="folder"){
     const targetFolder=document.querySelector(`.folder-item[data-folder-id="${CSS.escape(folderDropTarget.id)}"]`);
     targetFolder?.classList.add("drag-over");
     
   }
 }
},{passive:true});
document.addEventListener("touchend",()=>{
 if(window.__mixedRootDragging||!reorderDragging||!folderDropTarget)return;
 const pid=reorderDragging.dataset.projectId,p=projectStore.projects[pid];
 if(p){
   p.folderId=folderDropTarget.type==="folder"?folderDropTarget.id:null;
   persistProjectStore();
 }
 document.querySelectorAll(".folder-item.drag-over").forEach(x=>x.classList.remove("drag-over"));
 
 folderDropTarget=null;
 setTimeout(renderFoldersAndFilter,0);
},{capture:true,passive:true});


// フォルダ＋作品 共通並び替え（ルート一覧）
(function(){
 const list=document.getElementById("projectList"); if(!list)return;
 let drag=null,hold=null,sx=0,sy=0,dropFolderId=null,dragGhost=null,trashOver=false;
 const HOLD=480,CANCEL=12;
 const visibleItems=()=>[...list.querySelectorAll(":scope > .folder-item,:scope > .project-item")]
   .filter(el=>el.classList.contains("folder-item")||el.style.display!=="none");
 function saveOrder(){
   if(currentFolderId)return;
   projectStore.rootOrder=visibleItems().map(el=>el.dataset.orderKey).filter(Boolean);
   // 互換用の作品順も維持
   projectStore.projectOrder=projectStore.rootOrder.filter(k=>k.startsWith("p:")).map(k=>k.slice(2));
   persistProjectStore();
 }
 function removeGhost(){if(dragGhost){dragGhost.remove();dragGhost=null}}
 function updateGhost(t){if(!dragGhost)return;dragGhost.style.left=t.clientX+"px";dragGhost.style.top=t.clientY+"px"}
 function setTrashState(t){
   const zone=document.getElementById("dragTrashZone");
   if(!zone)return;
   zone.classList.add("show");
   const r=zone.getBoundingClientRect();
   trashOver=!!(drag&&t.clientX>=r.left-10&&t.clientX<=r.right+10&&t.clientY>=r.top-28&&t.clientY<=r.bottom+18);
   zone.classList.toggle("over",trashOver);
 }
 function finish(){
   clearTimeout(hold);hold=null;
   if(!drag)return;
   const pid=drag.dataset.projectId;
   const fid=drag.dataset.folderId;
   if(trashOver&&fid&&projectStore.folders?.[fid]){
     projectStore.folders[fid].trashedAt=Date.now();
     projectStore.rootOrder=(projectStore.rootOrder||[]).filter(k=>k!=="f:"+fid);
     persistProjectStore();
   }else if(trashOver&&pid&&projectStore.projects[pid]){
     const p=projectStore.projects[pid];p.trashedAt=Date.now();p.folderId=null;
     projectStore.rootOrder=(projectStore.rootOrder||[]).filter(k=>k!=="p:"+pid);
     projectStore.projectOrder=(projectStore.projectOrder||[]).filter(id=>id!==pid);
     persistProjectStore();
   }else if(dropFolderId&&pid&&projectStore.projects[pid]){
     projectStore.projects[pid].folderId=dropFolderId;
     projectStore.rootOrder=(projectStore.rootOrder||[]).filter(k=>k!=="p:"+pid);
     persistProjectStore();
   }else{
     saveOrder();
   }
   drag.classList.remove("mixed-root-dragging");
   document.querySelectorAll(".folder-item.drag-over").forEach(x=>x.classList.remove("drag-over"));
   const trashZone=document.getElementById("dragTrashZone");trashZone?.classList.remove("show","over");
   removeGhost();
   drag=null;dropFolderId=null;trashOver=false;window.__mixedRootDragging=false;
   setTimeout(renderFoldersAndFilter,0);
 }
 list.addEventListener("touchstart",e=>{
   if(currentFolderId||e.touches.length!==1)return;
   const item=e.target.closest(".folder-item,.project-item"); if(!item)return;
   // 操作ボタン上では長押しドラッグを開始しない。
   // フォルダの「開く」を押した時にバイブが鳴るのを防ぐ。
   if(e.target.closest("button,a,input,textarea,select,label"))return;
   const t=e.touches[0];sx=t.clientX;sy=t.clientY;
   clearTimeout(hold);
   hold=setTimeout(()=>{
     drag=item; dropFolderId=null; trashOver=false; item.classList.add("mixed-root-dragging");
     dragGhost=item.cloneNode(true);dragGhost.classList.remove("mixed-root-dragging");dragGhost.classList.add("drag-ghost");
     dragGhost.querySelectorAll("button").forEach(b=>b.setAttribute("tabindex","-1"));document.body.appendChild(dragGhost);updateGhost(t);
     document.getElementById("dragTrashZone")?.classList.add("show");
     window.__mixedRootDragging=true;
     window.__suppressMixedClickUntil=Date.now()+800;
     // 既存の作品ドラッグ処理とは排他的にする
     if(typeof reorderHoldTimer!=="undefined"){clearTimeout(reorderHoldTimer);reorderHoldTimer=null}
     if(typeof reorderDragging!=="undefined"&&reorderDragging){
       reorderDragging.classList.remove("reorder-dragging");reorderDragging=null;
     }
     folderDropTarget=null;
     document.querySelectorAll(".folder-item.drag-over").forEach(x=>x.classList.remove("drag-over"));
     if(navigator.vibrate)navigator.vibrate(28);
   },HOLD);
 },{capture:true,passive:true});
 list.addEventListener("touchmove",e=>{
   if(currentFolderId||e.touches.length!==1)return;
   const t=e.touches[0];
   if(!drag){
     if(Math.hypot(t.clientX-sx,t.clientY-sy)>CANCEL){
       clearTimeout(hold);hold=null;
       if(typeof reorderHoldTimer!=="undefined"){clearTimeout(reorderHoldTimer);reorderHoldTimer=null}
     }
     return;
   }
   e.preventDefault(); e.stopImmediatePropagation();
   updateGhost(t);setTrashState(t);
   if(trashOver){dropFolderId=null;document.querySelectorAll(".folder-item.drag-over").forEach(x=>x.classList.remove("drag-over"));return;}
   const others=visibleItems().filter(x=>x!==drag);
   if(!others.length)return;

   // 作品をフォルダ中央へ重ねた時だけ「格納」扱い。
   dropFolderId=null;
   document.querySelectorAll(".folder-item.drag-over").forEach(x=>x.classList.remove("drag-over"));
   
   if(drag.classList.contains("project-item")){
     const folder=others.find(el=>{
       if(!el.classList.contains("folder-item"))return false;
       const r=el.getBoundingClientRect();
       const inset=Math.min(18,r.height*.22);
       return t.clientX>=r.left&&t.clientX<=r.right&&
              t.clientY>=r.top+inset&&t.clientY<=r.bottom-inset;
     });
     if(folder){
       dropFolderId=folder.dataset.folderId;
       folder.classList.add("drag-over");
       
       return;
     }
   }

   // それ以外は通常の並び替え。
   let target=null;
   for(const el of others){
     const r=el.getBoundingClientRect();
     if(t.clientY < r.top+r.height/2){target=el;break}
   }
   if(target) list.insertBefore(drag,target);
   else list.append(drag);
 },{capture:true,passive:false});
 list.addEventListener("touchend",e=>{
   clearTimeout(hold);hold=null;
   if(!drag)return;
   e.stopImmediatePropagation(); finish();
 },{capture:true,passive:true});
 list.addEventListener("touchcancel",e=>{
   clearTimeout(hold);hold=null;
   finish();
 },{capture:true,passive:true});
 window.addEventListener("touchend",()=>{if(!drag)window.__mixedRootDragging=false},{passive:true});
 list.addEventListener("click",e=>{
   if(Date.now()<(window.__suppressMixedClickUntil||0)){
     e.preventDefault();e.stopImmediatePropagation();
   }
 },true);
})();

ensureFolders();
applyLanguage();

// 全イベント・フォルダ機能の初期化が終わってから、前回の表示位置を1回だけ復元する。
setTimeout(()=>{
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
  renderFoldersAndFilter();
},0);

/* ---- extracted script block ---- */

/* Full-app UI language layer. User-entered titles, folder names, notes and custom stage names are never translated. */
const FULL_I18N={
 en:{
 "作品一覧":"Projects","プロジェクト":"Projects","＋ 新しい作品":"+ New Project","＋ フォルダ":"+ Folder","← 戻る":"← Back","名前変更":"Rename","削除":"Delete",
 "漫画制作進捗":"Manga Production Tracker","メモ一覧":"Notes","作品名":"Project title","制作ページ数":"Pages","制作ページ":"Pages",
 "創作開始日":"Start date","締切予定日":"Deadline","総合進捗":"Overall Progress","制作進捗":"Overall Progress","工程別進捗":"Progress by Stage","工程表":"Production Table",
 "作業履歴":"Work History","今日":"Today","直近7日":"Last 7 days","1日平均":"Daily average","完成予想":"Estimated Completion",
 "← 前":"← Prev","次 →":"Next →","未着手":"Not started","着手中":"In progress","完成済み":"Completed","着手":"Started","完成":"Completed",
 "新しい作品":"New Project","作品編集":"Edit Project","工程設定":"Stage Settings","工程をカスタマイズ":"Customize Stages",
 "＋ 工程を追加":"+ Add Stage","キャンセル":"Cancel","保存":"Save","作成":"Create","編集":"Edit","この作品を削除":"Delete Project",
 "新しいフォルダ":"New Folder","フォルダ名":"Folder name","フォルダ名を変更":"Rename Folder","フォルダから戻す":"Move out of folder",
 "付箋":"Page Note","付箋を削除":"Delete Note","閉じる":"Close","すべて":"All","赤":"Red","黄":"Yellow","青":"Blue","緑":"Green","移動":"Go",
 "使い方":"Help","工程マスをタップ":"Tap a stage cell","長押し＋スライド":"Long press + slide",
 "ページ番号をタップ":"Tap a page number","マーカー":"Legend",
 "💾 バックアップ":"💾 Backup","📂 復元":"📂 Restore","工程":"Stages","工程名":"Stage name","上へ":"Up","下へ":"Down",
 "言語":"Language","アプリ設定":"App Settings","新規作品のデフォルト":"New Project Defaults","設定":"Settings","Libraryの使い方":"Library Help","作品を作る":"Create a project","フォルダで整理":"Organize with folders","作品を編集":"Edit a project","ゴミ箱":"Trash","バックアップ":"Backup","テーマカラー":"Theme Color","完了セルや選択状態などのアクセントカラーに使われます。":"Used for completed cells and selected states.",
 "全工程":"All stages","締切":"Deadline","ページ":"Pages","未設定":"Not set","完了":"Done","完成工程":"completed stages",
 "データ収集中":"Collecting data","完成！":"Complete!","変更は自動保存されます":"Changes are saved automatically",
 "保存しました ✓":"Saved ✓","該当するメモはありません。":"No matching notes.","（メモ本文なし）":"(No note text)",
 "修正点・忘れたくないことなど":"Corrections, reminders, etc.",
 "工程名の変更・並び替え・追加・削除":"Rename, reorder, add or delete stages.",
 "新しい作品を作るときの初期値です。作品ごとに変更できます。":"Initial values for new projects. You can change them for each project.",
 "作品ごとの進捗・付箋・作業履歴は端末内に自動保存されます。":"Project progress, notes and work history are saved automatically on this device.",
 "まだ作品がありません。":"No projects yet.","「＋ 新しい作品」から作成できます。":"Create one with “+ New Project”.",
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

/* Localized dialogs without touching user data */
const _alert=window.alert.bind(window),_confirm=window.confirm.bind(window);
window.alert=(msg)=>{
 if(uiLang()==="en"){
   msg=String(msg).replace("1作品500ページまでです。","Up to 500 pages per project.")
    .replace("工程は1つ以上必要です。","At least one stage is required.")
    .replace("フォルダ名を入力してください。","Enter a folder name.")
    .replace("❌ このバックアップファイルは読み込めませんでした。","❌ This backup file could not be read.")
    .replace("❌ バックアップを保存できませんでした。","❌ Backup could not be saved.")
    .replace("✅ 全作品のバックアップを保存しました。","✅ All projects were backed up.")
    .replace("✅ 全作品のバックアップを復元しました。","✅ All projects were restored.")
    .replace("✅ 1作品を新しいプロジェクトとして復元しました。","✅ One project was restored as a new project.");
 }
 return _alert(msg);
};
window.confirm=(msg)=>{
 if(uiLang()==="en"){
   msg=String(msg)
    .replace(/「(.+?)」を削除しますか？\n中の作品は作品一覧へ戻ります。/,'Delete “$1”?\\nProjects inside will be moved back to Projects.')
    .replace(/「(.+?)」を削除しますか？\nこの操作は元に戻せません。/,'Delete “$1”?\\nThis action cannot be undone.');
 }
 return _confirm(msg);
};

/* Legacy settings-save i18n wrapper removed; final settings handler is authoritative. */

/* ---- extracted script block ---- */

/* ---- i18n completion patch ---- */
const I18N_MORE_EN={
 "作品編集":"Edit Project","作品名":"Project title","制作ページ":"Pages","制作ページ数":"Pages",
 "創作開始日":"Start date","締切予定日":"Deadline","工程設定":"Stage Settings",
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
  settingsDefaultsTitle:"新規作品のデフォルト",
  settingsPagesLabel:"制作ページ",
  settingsStagesLabel:"工程",
  defaultStageAdd:"＋ 工程を追加",
  settingsNote:"新しい作品を作るときの初期値です。作品ごとに変更できます。",
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
    restoreKnownJapaneseUi();
    // render() is the Japanese source of truth for all dynamic labels.
    rerenderCurrentViewForLanguage();
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
 document.getElementById("defaultStartPage").value=projectDefaults.startPage;
 document.getElementById("defaultEndPage").value=projectDefaults.endPage;
 defaultStageDraft=[...projectDefaults.stages];
 renderDefaultStageEditor();
 localizeDefaultsSettingsUi();
 lockPageScroll();
 document.getElementById("appSettingsModal").classList.add("open");
};
document.getElementById("settingsSave").onclick=()=>{
 let a=Math.max(1,Math.min(500,Number(document.getElementById("defaultStartPage").value)||1));
 let b=Math.max(a,Math.min(500,Number(document.getElementById("defaultEndPage").value)||a));
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
     :"新規作品用の工程を初期設定に戻しますか？\n既存の作品には影響しません。");
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
 set("settingsDefaultsTitle","新規作品のデフォルト","New Project Defaults");
 set("settingsPagesLabel","制作ページ","Pages");
 set("settingsStagesLabel","工程","Stages");
 set("defaultStageAdd","＋ 工程を追加","+ Add Stage");
 set("defaultStageReset","工程を初期設定に戻す","Reset Stages");
 set("settingsNote","新しい作品を作るときの初期値です。作品ごとに変更できます。","These initial values are used when creating a new project. You can change them per project.");
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
 "新規作品のデフォルト":"New Project Defaults","制作ページ":"Pages","工程":"Stages",
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
function localizeOpenUi(){
 const en=uiLang()==="en";
 const set=(sel,ja,enText)=>{const el=document.querySelector(sel);if(el)el.textContent=en?enText:ja};
 const ph=(sel,ja,enText)=>{const el=document.querySelector(sel);if(el)el.placeholder=en?enText:ja};
 set("#memoListModal .memo-head h2","メモ一覧","Notes");
 {const el=document.querySelector("#closeMemoList");if(el){el.textContent="×";el.setAttribute("aria-label",en?"Close":"閉じる");}}
 const filters=[["all","すべて","All"],["#f4a6a6","赤","Red"],["#f4dc8a","黄","Yellow"],["#9ec8f4","青","Blue"],["#a9ddb0","緑","Green"]];
 filters.forEach(([key,ja,enText])=>{const el=document.querySelector(`.memo-filter[data-filter="${key}"]`);if(el)el.textContent=en?enText:ja});
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
         .replace(/^「＋ 新しい作品」から作成できます。$/,"Create one with “+ New Project”.")
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
    const edit=card.querySelector('.project-edit-button');if(edit)edit.textContent="Edit";
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


/* --- Home design prototype: soft trash + monochrome controls --- */
(function setupSoftTrashPrototype(){
  const zone=document.getElementById("dragTrashZone");
  const modal=document.getElementById("trashModal");
  const list=document.getElementById("trashList");
  const open=document.getElementById("trashOpen");
  const close=document.getElementById("trashClose");
  const empty=document.getElementById("trashEmpty");
  if(!zone||!modal||!list||!open||!close||!empty)return;
  const isEn=()=>languageSettings?.language==="en";
  function renderTrash(){
    list.innerHTML="";
    const folderEntries=Object.entries(projectStore.folders||{}).filter(([,f])=>f?.trashedAt);
    const entries=Object.entries(projectStore.projects||{}).filter(([,p])=>p?.trashedAt);
    if(!entries.length&&!folderEntries.length){list.innerHTML=`<div class="trash-empty">${isEn()?"Trash is empty.":"ゴミ箱は空です。"}</div>`;return;}
    folderEntries.sort((a,b)=>(b[1].trashedAt||0)-(a[1].trashedAt||0)).forEach(([id,f])=>{
      const row=document.createElement("div");row.className="trash-item";
      row.innerHTML=`<div class="trash-item-name" data-user-text="1"></div><div class="trash-item-actions"><button type="button" data-act="restore">${isEn()?"Restore":"元に戻す"}</button><button type="button" class="danger" data-act="delete">${isEn()?"Delete":"完全削除"}</button></div>`;
      row.querySelector(".trash-item-name").textContent=(isEn()?"Folder: ":"フォルダ：")+(f.name||"");
      row.querySelector('[data-act="restore"]').onclick=()=>{delete f.trashedAt;if(!projectStore.rootOrder.includes("f:"+id))projectStore.rootOrder.unshift("f:"+id);persistProjectStore();renderProjectList();renderFoldersAndFilter();renderTrash()};
      row.querySelector('[data-act="delete"]').onclick=()=>{if(!confirm(isEn()?`Permanently delete folder “${f.name}” and all projects inside? This cannot be undone.`:`フォルダ「${f.name}」と中の作品を完全に削除しますか？\nこの操作は元に戻せません。`))return;const childIds=Object.keys(projectStore.projects||{}).filter(pid=>projectStore.projects[pid]?.folderId===id);childIds.forEach(pid=>delete projectStore.projects[pid]);projectStore.projectOrder=(projectStore.projectOrder||[]).filter(pid=>!childIds.includes(pid));projectStore.rootOrder=(projectStore.rootOrder||[]).filter(k=>k!=="f:"+id&&!childIds.some(pid=>k==="p:"+pid));delete projectStore.folders[id];persistProjectStore();renderTrash();renderProjectList();renderFoldersAndFilter()};
      list.appendChild(row);
    });
    entries.sort((a,b)=>(b[1].trashedAt||0)-(a[1].trashedAt||0)).forEach(([id,p])=>{
      const row=document.createElement("div");row.className="trash-item";
      row.innerHTML=`<div class="trash-item-name" data-user-text="1"></div><div class="trash-item-actions"><button type="button" data-act="restore">${isEn()?"Restore":"元に戻す"}</button><button type="button" class="danger" data-act="delete">${isEn()?"Delete":"完全削除"}</button></div>`;
      row.querySelector(".trash-item-name").textContent=p.title||(isEn()?"Untitled":"無題");
      row.querySelector('[data-act="restore"]').onclick=()=>{delete p.trashedAt;p.folderId=null;persistProjectStore();renderProjectList();renderFoldersAndFilter();renderTrash()};
      row.querySelector('[data-act="delete"]').onclick=()=>{const name=p.title||(isEn()?"Untitled":"無題");if(!confirm(isEn()?`Permanently delete “${name}”? This cannot be undone.`:`「${name}」を完全に削除しますか？\nこの操作は元に戻せません。`))return;delete projectStore.projects[id];projectStore.projectOrder=(projectStore.projectOrder||[]).filter(x=>x!==id);projectStore.rootOrder=(projectStore.rootOrder||[]).filter(x=>x!=="p:"+id);if(projectStore.activeProjectId===id)projectStore.activeProjectId=null;persistProjectStore();renderTrash();renderProjectList();renderFoldersAndFilter()};
      list.appendChild(row);
    });
  }
  empty.onclick=()=>{
    const folderIds=Object.keys(projectStore.folders||{}).filter(id=>projectStore.folders[id]?.trashedAt);
    const projectIds=Object.keys(projectStore.projects||{}).filter(id=>projectStore.projects[id]?.trashedAt);
    if(!folderIds.length&&!projectIds.length)return;
    if(!confirm(isEn()?"Permanently delete everything in Trash? This cannot be undone.":"ゴミ箱の中身をすべて完全に削除しますか？\nこの操作は元に戻せません。"))return;
    const childIds=new Set();
    folderIds.forEach(fid=>Object.keys(projectStore.projects||{}).forEach(pid=>{if(projectStore.projects[pid]?.folderId===fid)childIds.add(pid)}));
    const allProjectIds=new Set([...projectIds,...childIds]);
    allProjectIds.forEach(id=>delete projectStore.projects[id]);
    folderIds.forEach(id=>delete projectStore.folders[id]);
    projectStore.projectOrder=(projectStore.projectOrder||[]).filter(id=>!allProjectIds.has(id));
    projectStore.rootOrder=(projectStore.rootOrder||[]).filter(k=>!folderIds.some(id=>k==="f:"+id)&&!allProjectIds.has(k.slice(2)));
    if(allProjectIds.has(projectStore.activeProjectId))projectStore.activeProjectId=null;
    persistProjectStore();renderTrash();renderProjectList();renderFoldersAndFilter();
  };
  open.onclick=()=>{renderTrash();modal.classList.add("open");lockPageScroll()};
  close.onclick=()=>{modal.classList.remove("open");unlockPageScroll()};
  modal.addEventListener("click",e=>{if(e.target===modal)close.click()});
  function setZoneText(){document.getElementById("trashTitle").textContent=isEn()?"Trash":"ゴミ箱";document.getElementById("dragTrashLabel").textContent=isEn()?"Hold to move to Trash":"長押しでゴミ箱へ";open.querySelector("span").textContent=isEn()?"Trash":"ゴミ箱";empty.textContent=isEn()?"Empty Trash":"空にする";close.textContent="×";close.setAttribute("aria-label",isEn()?"Close":"閉じる")}
  setZoneText();
  const langObserver=new MutationObserver(setZoneText);langObserver.observe(document.documentElement,{attributes:true,attributeFilter:["lang"]});

  // Existing long-press drag remains the source of truth. This layer only exposes a trash drop target.
  document.addEventListener("touchmove",e=>{
    const active=(typeof reorderDragging!=="undefined"&&reorderDragging) && !window.__mixedRootDragging;
    if(!active||e.touches.length!==1){zone.classList.remove("show","over");return;}
    zone.classList.add("show");
    const t=e.touches[0],r=zone.getBoundingClientRect();
    zone.classList.toggle("over",t.clientX>=r.left&&t.clientX<=r.right&&t.clientY>=r.top-12&&t.clientY<=r.bottom+12);
  },{passive:true});
  document.addEventListener("touchend",()=>{
    const over=zone.classList.contains("over");
    let el=null;
    if(window.__mixedRootDragging){el=document.querySelector(".project-item.mixed-root-dragging[data-project-id]")}
    if(!el&&typeof reorderDragging!=="undefined"&&reorderDragging?.dataset?.projectId)el=reorderDragging;
    if(over&&el?.dataset?.projectId){
      const id=el.dataset.projectId,p=projectStore.projects[id];
      if(p){p.trashedAt=Date.now();p.folderId=null;projectStore.rootOrder=(projectStore.rootOrder||[]).filter(k=>k!=="p:"+id);persistProjectStore();setTimeout(()=>{renderProjectList();renderFoldersAndFilter()},0)}
    }
    zone.classList.remove("show","over");
  },{capture:true,passive:true});
  document.addEventListener("touchcancel",()=>zone.classList.remove("show","over"),{passive:true});
})();

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
   if(p)p.textContent=isEn()?"New Project":"新しい作品";
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


/* ===== 2026-09-23 robust help/theme/i18n patch ===== */
(function fillioUiFixes(){
  const $=id=>document.getElementById(id);
  function isEn(){return languageSettings?.language==="en"}

  function syncExtraLanguage(){
    const en=isEn();
    const text=(id,ja,enText)=>{const el=$(id);if(el)el.textContent=en?enText:ja};
    text("themeColorTitle","テーマカラー","Theme Color");
    text("themeColorNote","完了セルや選択状態などのアクセントカラーに使われます。","Used as the accent color for completed cells and selected states.");
    text("dataManagementTitle","データ管理","Data Management");
    text("dataManagementNote","全作品・フォルダ・進捗・付箋・作業履歴を1つのJSONに保存します。","Save all projects, folders, progress, notes, and work history in one JSON file.");
    text("exportBackup","💾 バックアップ","💾 Backup");
    text("importBackup","📂 復元","📂 Restore");
    const hp=$("libraryHelpTitle");if(hp)hp.textContent=en?"Using Library":"Libraryの使い方";
    const hb=$("libraryHelpButton");if(hb)hb.setAttribute("aria-label",en?"Library Help":"Libraryの使い方");
    const hc=$("libraryHelpClose");if(hc)hc.setAttribute("aria-label",en?"Close":"閉じる");
    const items=$("libraryHelpModal")?.querySelectorAll(".help-item");
    const ja=[["プロジェクトを作る","右上の「＋」から新しいプロジェクトを作成します。制作ページや工程はプロジェクトごとに設定できます。"],["タップして開く","項目をタップすると、プロジェクトは入力ページ、フォルダはフォルダ内を開きます。"],["長押しで整理","プロジェクトやフォルダを長押しすると、並び替え・フォルダ移動・ゴミ箱への移動ができます。"],["フォルダで整理","「＋」からフォルダを作成できます。プロジェクトをフォルダにまとめて整理できます。"],["プロジェクトを編集","プロジェクトカードの「編集」からプロジェクト名・ページ・日付・工程を変更できます。"],["ゴミ箱","削除したプロジェクトやフォルダはゴミ箱へ移動します。必要なら復元できます。"],["バックアップ","設定の「データ管理」から、Library全体をJSONファイルにバックアップ・復元できます。"]];
    const ee=[["Create a project","Use the + button at the top right to create a project. Pages and stages can be set for each project."],["Tap to open","Tap an item to open a project's input page or enter a folder."],["Press and hold to organize","Press and hold a project or folder to reorder it, move it to a folder, or move it to Trash."],["Organize with folders","Create folders from the + button and organize projects inside them."],["Edit a project","Use Edit on a project card to change its name, pages, dates, and stages."],["Trash","Deleted projects and folders move to Trash and can be restored when needed."],["Backup","Use Data Management in Settings to back up or restore the entire Library as a JSON file."]];
    items?.forEach((it,i)=>{const a=(en?ee:ja)[i];if(!a)return;it.querySelector(".help-item-title").textContent=a[0];it.querySelector(".help-item-text").textContent=a[1]});
    document.querySelectorAll(".theme-color-option").forEach(btn=>{const label=en?btn.dataset.en:btn.dataset.ja;btn.setAttribute("aria-label",label);btn.title=label;btn.querySelector(".theme-option-label").textContent=label});
  }

  const helpBtn=$("libraryHelpButton"), helpModal=$("libraryHelpModal"), helpClose=$("libraryHelpClose");
  const openHelp=()=>{if(!helpModal)return;lockPageScroll();helpModal.classList.add("open");helpModal.setAttribute("aria-hidden","false")};
  const closeHelp=()=>{if(!helpModal)return;helpModal.classList.remove("open");helpModal.setAttribute("aria-hidden","true");unlockPageScroll()};
  helpBtn?.addEventListener("click",e=>{e.preventDefault();e.stopPropagation();openHelp()},{capture:true});
  helpClose?.addEventListener("click",e=>{e.preventDefault();e.stopPropagation();closeHelp()},{capture:true});

  document.querySelectorAll(".theme-color-option").forEach(btn=>btn.addEventListener("click",e=>{
    e.preventDefault();
    const color=btn.dataset.themeColor;
    appSettings.themeColor=color;
    applyThemeColor(color);
    persistAppSettings();
  },{capture:true}));

  const langSelect=$("appLanguage");
  langSelect?.addEventListener("change",()=>{languageSettings.language=langSelect.value==="en"?"en":"ja";syncExtraLanguage()});
  new MutationObserver(syncExtraLanguage).observe(document.documentElement,{attributes:true,attributeFilter:["lang"]});
  syncExtraLanguage();
})();
