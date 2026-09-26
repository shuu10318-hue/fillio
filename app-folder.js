// Fillio — folder operations
// Folder create / rename / delete / eject UI operations.
// Rendering remains in app-library.js; drag/drop remains in app.js.

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
 showProjectHome();
});


// フォルダ操作は委譲でも受ける。再描画後のボタンでも確実に動作。
document.addEventListener("click",e=>{
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
