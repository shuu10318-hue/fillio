// Fillio — New project modal controller
// Kept separate from Library drag/drop and Stage editing logic.

let newProjectStageDraft=cloneStages(DEFAULT_STAGES);

function renderNewProjectStageEditor(){
  const box=document.getElementById("newStageEditorList");
  if(!box)return;
  box.innerHTML="";
  newProjectStageDraft.forEach((stage,i)=>box.appendChild(makeStageRow(stage,i,newProjectStageDraft,renderNewProjectStageEditor)));
  document.getElementById("newStageAddButton").disabled=false;
}

document.getElementById("clearNewProjectDeadline")?.addEventListener("click",()=>{
  document.getElementById("newProjectDeadline").value="";
});

document.getElementById("newStageAddButton").addEventListener("click",()=>{
  if(newProjectStageDraft.length>=MAX_STAGES){
    alert(languageSettings?.language==="en"?`Up to ${MAX_STAGES} stages.`:`工程は最大${MAX_STAGES}個までです。`);
    return;
  }
  newProjectStageDraft.push({name:""});
  renderNewProjectStageEditor();
});

document.getElementById("newProjectButton").onclick=()=>{
  document.getElementById("newProjectTitle").value="";
  document.getElementById("newProjectPages").value=clampPageCount(projectDefaults.pages);
  document.getElementById("newProjectDeadline").value="";
  newProjectStageDraft=cloneStages(projectDefaults.stages);
  renderNewProjectStageEditor();
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

document.getElementById("createNewProject").onclick=()=>{
  const title=document.getElementById("newProjectTitle").value.trim();
  const pages=clampPageCount(document.getElementById("newProjectPages").value);
  const id=newProjectId();
  projectStore.projects[id]=freshProjectData(title,pages);
  // フォルダ内から作成した場合は、そのフォルダに所属させる
  projectStore.projects[id].folderId=currentFolderId||null;
  const newStages=newProjectStageDraft.map(normalizeStage);
  projectStore.projects[id].stages=newStages;
  projectStore.projects[id].progress=Array.from({length:pages},()=>Array(newStages.length).fill(0));
  projectStore.projects[id].deadline=document.getElementById("newProjectDeadline").value||"";
  projectStore.projectOrder=[id,...(Array.isArray(projectStore.projectOrder)?projectStore.projectOrder:[]).filter(x=>x!==id)];
  if(!Array.isArray(projectStore.rootOrder))projectStore.rootOrder=[];
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
