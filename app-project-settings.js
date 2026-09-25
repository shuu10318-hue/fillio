/* fillio v31: existing project settings/edit module */
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
 const box=document.getElementById("stageEditorList"); if(!box)return; box.innerHTML="";
 stageDraft.forEach((name,i)=>box.appendChild(makeStageRow(name,i,stageDraft,renderStageEditor,stageDraftMeta)));
 const add=document.getElementById("stageAddButton");if(add)add.disabled=false;
}
document.getElementById("stageAddButton")?.addEventListener("click",()=>{
  if(stageDraft.length>=MAX_STAGES){alert(languageSettings?.language==="en"?`Up to ${MAX_STAGES} stages.`:`工程は最大${MAX_STAGES}個までです。`);return}
  stageDraft.push("");
  stageDraftMeta.push({originalIndex:null});
  renderStageEditor();
});

document.getElementById("clearEditProjectDeadline")?.addEventListener("click",()=>{
  document.getElementById("editProjectDeadline").value="";
});

let editingProjectId=null;
function updateEditProjectTotal(){}
function openProjectEdit(id){
  const p=projectStore.projects[id]; if(!p)return;
  editingProjectId=id;
  initStageDraft(p);
  renderStageEditor();
  document.getElementById("editProjectTitle").value=p.title||"";
  document.getElementById("editProjectPages").value=Math.min(PROJECT_PAGE_MAX,p.totalPages||1);
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

document.getElementById("cancelEditProject").addEventListener("click",closeProjectEdit);
document.getElementById("editProjectModal").addEventListener("click",e=>{if(e.target.id==="editProjectModal")closeProjectEdit();});
document.getElementById("saveEditProject").addEventListener("click",()=>{
  if(!editingProjectId)return;
  const p=projectStore.projects[editingProjectId];
  const newStart=p.startPage||1;
  const newTotal=clampPageCount(document.getElementById("editProjectPages").value);
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
  p.creationStartDate=document.getElementById("editProjectCreationStartDate").value||p.creationStartDate||localDate();
  p.deadline=document.getElementById("editProjectDeadline").value||"";
  // Keep the Library context that was active when this settings sheet was opened.
  // renderProjectList() rebuilds every project card, so the folder filter must be
  // reapplied explicitly after saving; otherwise a folder view temporarily looks
  // like the Library root.
  const returnFolderId=currentFolderId;
  persistProjectStore();
  closeProjectEdit();
  renderProjectList();
  currentFolderId=(returnFolderId&&projectStore.folders?.[returnFolderId])?returnFolderId:null;
  renderFoldersAndFilter();
  saveViewState(currentFolderId?"folder":"root");
  syncFillioHistory("replace");
});


const editOverlay=document.getElementById("editProjectModal");
["touchstart","touchmove","touchend"].forEach(type=>{
  editOverlay.addEventListener(type,e=>e.stopPropagation(),{passive:true});
});
