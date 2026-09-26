// Fillio project data, persistence, and history helpers.
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
function makeProjectData(){
  rollHistory();
  const current=projectStore.projects[currentProjectId]||{};
  return {
    title:typeof current.title==="string"?current.title:"",
    creationStartDate:current.creationStartDate||localDate(),
    deadline:current.deadline||"",
    totalPages,
    progress:progress.map(r=>[...r]),
    stages:cloneStages(stages),
    history:JSON.parse(JSON.stringify(history)),
    pageNotes:JSON.parse(JSON.stringify(pageNotes))
  };
}
function freshProjectData(title="新しいプロジェクト",pages=1){
  const n=Math.max(1,Math.min(PROJECT_PAGE_MAX,pages));
  return {
    title,creationStartDate:localDate(),deadline:"",totalPages:n,progress:createProgress(n),stages:cloneStages(DEFAULT_STAGES),folderId:null,
    history:{day:localDate(),baselineDone:0,baselineWeighted:0,weightedDays:{},days:{}},
    pageNotes:{}
  };
}
function newProjectId(){
  return "p_"+Date.now().toString(36)+"_"+Math.random().toString(36).slice(2,8);
}
function persistProjectStore(){return safeStorageSet(PROJECTS_KEY,JSON.stringify(projectStore))}
function save(){
  if(!currentProjectId)return;
  const oldProject=projectStore.projects[currentProjectId]||{};
  const nextProject=makeProjectData();
  nextProject.folderId=oldProject.folderId||null;
  if(oldProject.trashedAt)nextProject.trashedAt=oldProject.trashedAt;
  projectStore.projects[currentProjectId]=nextProject;
  projectStore.activeProjectId=currentProjectId;
  const saved=persistProjectStore();
  const m=document.getElementById("saveMessage");
  if(!saved)return false;
  m.textContent=t("save.saved");
  clearTimeout(save.timer);
  save.timer=setTimeout(()=>m.textContent=t("save.auto"),1200);
  return true;
}
function normalizeProjectData(s){
  let n=Number.isInteger(s?.totalPages)&&s.totalPages>0?Math.min(PROJECT_PAGE_MAX,s.totalPages):48;
const projectStages=normalizeStages(s?.stages);
  let pg=Array.from({length:n},(_,p)=>Array.from({length:projectStages.length},(_,i)=>[0,1,2].includes(s?.progress?.[p]?.[i])?s.progress[p][i]:0));
  return {
    title:typeof s?.title==="string"?s.title:"",
    stages:projectStages,
    creationStartDate:typeof s?.creationStartDate==="string"&&s.creationStartDate?s.creationStartDate:localDate(),
    deadline:typeof s?.deadline==="string"?s.deadline:"",
    totalPages:n,progress:pg,
    folderId:typeof s?.folderId==="string"&&s.folderId?s.folderId:null,
    trashedAt:Number.isFinite(Number(s?.trashedAt))&&Number(s.trashedAt)>0?Number(s.trashedAt):null,
    history:s?.history&&typeof s.history==="object"?s.history:null,
    pageNotes:s?.pageNotes&&typeof s.pageNotes==="object"?s.pageNotes:{}
  };
}
function loadProjectStore(){
  try{
    const raw=JSON.parse(localStorage.getItem(PROJECTS_KEY));
    if(raw&&raw.projects&&typeof raw.projects==="object"){
      projectStore={
        version:DATA_VERSION,
        activeProjectId:raw.activeProjectId||null,
        projects:{},
        projectOrder:Array.isArray(raw.projectOrder)?raw.projectOrder:[],
        folders:(raw.folders&&typeof raw.folders==="object")?raw.folders:{},
        rootOrder:Array.isArray(raw.rootOrder)?raw.rootOrder:[]
      };
      Object.entries(raw.projects).forEach(([id,p])=>{
        if(p&&Array.isArray(p.progress)){
          projectStore.projects[id]=normalizeProjectData(p);
        }
      });
      if(!projectStore.projects[projectStore.activeProjectId])projectStore.activeProjectId=null;
      return;
    }
  }catch(e){}
  projectStore={version:DATA_VERSION,activeProjectId:null,projects:{},projectOrder:[],folders:{},rootOrder:[]};
  persistProjectStore();
}
function applyProjectData(s){
  const p=normalizeProjectData(s);
  totalPages=p.totalPages;
  progress=p.progress;
  stages=cloneStages(p.stages||DEFAULT_STAGES);
  pageNotes=p.pageNotes;
  const currentTitleEl=document.getElementById("currentProjectTitle");
  if(currentTitleEl)currentTitleEl.textContent=p.title;
  history=p.history?normalizeHistory(p.history):{day:localDate(),baselineDone:doneCount(),baselineWeighted:weightedCount(),weightedDays:{},days:{}};
  rollHistory();
}

function saveViewState(view){
  const state={view};
  if(view==="project"&&currentProjectId)state.projectId=currentProjectId;
  if(view==="folder"&&currentFolderId)state.folderId=currentFolderId;
  safeStorageSet(VIEW_STATE_KEY,JSON.stringify(state));
}
function loadViewState(){
  try{return JSON.parse(localStorage.getItem(VIEW_STATE_KEY)||"null")}catch(e){return null}
}
