/* --- Home design  soft trash + monochrome controls --- */
(function setupSoftTrash(){
  const zone=document.getElementById("dragTrashZone");
  const modal=document.getElementById("trashModal");
  const list=document.getElementById("trashList");
  const open=document.getElementById("trashOpen");
  const close=document.getElementById("trashClose");
  const empty=document.getElementById("trashEmpty");
  if(!zone||!modal||!list||!open||!close||!empty)return;
  const isEn=()=>uiLang()==="en";
  function renderTrash(){
    list.innerHTML="";
    const folderEntries=Object.entries(projectStore.folders||{}).filter(([,f])=>f?.trashedAt);
    const entries=Object.entries(projectStore.projects||{}).filter(([,p])=>p?.trashedAt);
    if(!entries.length&&!folderEntries.length){list.innerHTML=`<div class="trash-empty">${t("trash.emptyState")}</div>`;return;}
    folderEntries.sort((a,b)=>(b[1].trashedAt||0)-(a[1].trashedAt||0)).forEach(([id,f])=>{
      const row=document.createElement("div");row.className="trash-item";
      row.innerHTML=`<div class="trash-item-name" data-user-text="1"></div><div class="trash-item-actions"><button type="button" data-act="restore">${t("trash.restore")}</button><button type="button" class="danger" data-act="delete">${t("trash.delete")}</button></div>`;
      row.querySelector(".trash-item-name").textContent=t("trash.folderPrefix")+(f.name||"");
      row.querySelector('[data-act="restore"]').onclick=()=>{delete f.trashedAt;if(!projectStore.rootOrder.includes("f:"+id))projectStore.rootOrder.unshift("f:"+id);persistProjectStore();renderProjectList();renderFoldersAndFilter();renderTrash()};
      row.querySelector('[data-act="delete"]').onclick=()=>{if(!confirm(isEn()?`Permanently delete folder “${f.name}” and all projects inside? This cannot be undone.`:`フォルダ「${f.name}」と中の作品を完全に削除しますか？\nこの操作は元に戻せません。`))return;const childIds=Object.keys(projectStore.projects||{}).filter(pid=>projectStore.projects[pid]?.folderId===id);childIds.forEach(pid=>delete projectStore.projects[pid]);projectStore.projectOrder=(projectStore.projectOrder||[]).filter(pid=>!childIds.includes(pid));projectStore.rootOrder=(projectStore.rootOrder||[]).filter(k=>k!=="f:"+id&&!childIds.some(pid=>k==="p:"+pid));delete projectStore.folders[id];persistProjectStore();renderTrash();renderProjectList();renderFoldersAndFilter()};
      list.appendChild(row);
    });
    entries.sort((a,b)=>(b[1].trashedAt||0)-(a[1].trashedAt||0)).forEach(([id,p])=>{
      const row=document.createElement("div");row.className="trash-item";
      row.innerHTML=`<div class="trash-item-name" data-user-text="1"></div><div class="trash-item-actions"><button type="button" data-act="restore">${t("trash.restore")}</button><button type="button" class="danger" data-act="delete">${t("trash.delete")}</button></div>`;
      row.querySelector(".trash-item-name").textContent=p.title||(t("trash.untitled"));
      row.querySelector('[data-act="restore"]').onclick=()=>{delete p.trashedAt;p.folderId=null;persistProjectStore();renderProjectList();renderFoldersAndFilter();renderTrash()};
      row.querySelector('[data-act="delete"]').onclick=()=>{const name=p.title||(t("trash.untitled"));if(!confirm(isEn()?`Permanently delete “${name}”? This cannot be undone.`:`「${name}」を完全に削除しますか？\nこの操作は元に戻せません。`))return;delete projectStore.projects[id];projectStore.projectOrder=(projectStore.projectOrder||[]).filter(x=>x!==id);projectStore.rootOrder=(projectStore.rootOrder||[]).filter(x=>x!=="p:"+id);if(projectStore.activeProjectId===id)projectStore.activeProjectId=null;persistProjectStore();renderTrash();renderProjectList();renderFoldersAndFilter()};
      list.appendChild(row);
    });
  }
  empty.onclick=()=>{
    const folderIds=Object.keys(projectStore.folders||{}).filter(id=>projectStore.folders[id]?.trashedAt);
    const projectIds=Object.keys(projectStore.projects||{}).filter(id=>projectStore.projects[id]?.trashedAt);
    if(!folderIds.length&&!projectIds.length)return;
    if(!confirm(t("trash.confirmEmpty")))return;
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
  function setZoneText(){document.getElementById("trashTitle").textContent=t("trash.title");document.getElementById("dragTrashLabel").textContent=t("trash.move");open.querySelector("span").textContent=t("trash.title");empty.textContent=t("trash.empty");close.textContent="×";close.setAttribute("aria-label",t("common.close"))}
  setZoneText();
})();
