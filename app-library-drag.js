/* fillio v41 - Library drag/drop and reorder module
   Active Pointer Events implementation only. Obsolete Touch-event implementations removed after v38 audit. */

// Library reorder v11 — same pointer model as Stage editor.
// ≡ starts immediately; the real card stays in the list and only moves vertically.
(function initLibraryStageStyleReorder(){
 const list=document.getElementById("projectList"); if(!list)return;
 let drag=null,pointerId=null,startIndex=-1,dropFolderId=null,trashOver=false;
 const directVisibleItems=()=>[...list.children].filter(el=>
   (el.classList?.contains("folder-item")||el.classList?.contains("project-item")) &&
   getComputedStyle(el).display!=="none"
 );
 const activeItems=()=>currentFolderId
   ? directVisibleItems().filter(el=>el.classList.contains("project-item"))
   : directVisibleItems();
 const clearTargets=()=>document.querySelectorAll(".folder-item.drag-over").forEach(el=>el.classList.remove("drag-over"));
 const setTrash=(x,y)=>{
   const zone=document.getElementById("dragTrashZone");
   if(!zone)return false;
   zone.classList.add("show");
   // Keep hit testing independent from the zone's own show/over transform.
   // The visual element moves and scales, but the drop target stays fixed.
   const width=Math.min(360,Math.max(0,window.innerWidth-28));
   const left=(window.innerWidth-width)/2;
   const right=left+width;
   const top=0;
   const bottom=94;
   const over=x>=left-10&&x<=right+10&&y>=top&&y<=bottom;
   zone.classList.toggle("over",over);
   return over;
 };
 // Same crossing rule as the Stage editor: use the current midpoint of every
 // other visible row and move only when the pointer crosses that midpoint.
 const moveAt=y=>{
   const others=activeItems().filter(el=>el!==drag);
   let before=null;
   for(const el of others){
     const r=el.getBoundingClientRect();
     if(y<r.top+r.height/2){before=el;break}
   }
   if(before){
     if(drag.nextElementSibling!==before)list.insertBefore(drag,before);
   }else if(others.length){
     const last=others[others.length-1];
     if(last.nextElementSibling!==drag)list.insertBefore(drag,last.nextSibling);
   }
 };
 const saveCurrentOrder=()=>{
   if(currentFolderId){
     // Keep global projectOrder compatible while applying the visible folder order.
     const visible=activeItems().map(el=>el.dataset.projectId).filter(Boolean);
     const set=new Set(visible); let i=0;
     projectStore.projectOrder=(projectStore.projectOrder||[]).map(id=>set.has(id)?visible[i++]:id);
     // Append any missing visible IDs defensively.
     visible.forEach(id=>{if(!projectStore.projectOrder.includes(id))projectStore.projectOrder.push(id)});
   }else{
     projectStore.rootOrder=activeItems().map(el=>el.dataset.orderKey).filter(Boolean);
     projectStore.projectOrder=projectStore.rootOrder.filter(k=>k.startsWith("p:")).map(k=>k.slice(2));
   }
   persistProjectStore();
 };
 const cleanup=()=>{
   window.removeEventListener("pointermove",onMove);
   window.removeEventListener("pointerup",finish);
   window.removeEventListener("pointercancel",finish);
 };
 const finish=e=>{
   if(!drag||(e?.pointerId!=null&&e.pointerId!==pointerId))return;
   const pid=drag.dataset.projectId, fid=drag.dataset.folderId;
   if(trashOver&&fid&&projectStore.folders?.[fid]){
     projectStore.folders[fid].trashedAt=Date.now();
     projectStore.rootOrder=(projectStore.rootOrder||[]).filter(k=>k!=="f:"+fid);
     persistProjectStore();
   }else if(trashOver&&pid&&projectStore.projects?.[pid]){
     const p=projectStore.projects[pid];p.trashedAt=Date.now();p.folderId=null;
     projectStore.rootOrder=(projectStore.rootOrder||[]).filter(k=>k!=="p:"+pid);
     projectStore.projectOrder=(projectStore.projectOrder||[]).filter(id=>id!==pid);
     persistProjectStore();
   }else if(dropFolderId&&pid&&projectStore.projects?.[pid]){
     projectStore.projects[pid].folderId=dropFolderId;
     projectStore.rootOrder=(projectStore.rootOrder||[]).filter(k=>k!=="p:"+pid);
     persistProjectStore();
   }else saveCurrentOrder();
   drag.classList.remove("library-stage-dragging");
   clearTargets();
   document.getElementById("dragTrashZone")?.classList.remove("show","over");
   document.body.classList.remove("library-drag-active");
   cleanup(); drag=null;pointerId=null;dropFolderId=null;trashOver=false;window.__libraryStageDragging=false;
   window.__suppressMixedClickUntil=Date.now()+250;
   setTimeout(renderFoldersAndFilter,0);
 };
 function onMove(e){
   if(!drag||e.pointerId!==pointerId)return;
   e.preventDefault();
   trashOver=setTrash(e.clientX,e.clientY);
   clearTargets();dropFolderId=null;
   if(trashOver)return;
   // Root only: dropping a project into the center of a folder keeps folder move support.
   if(!currentFolderId&&drag.classList.contains("project-item")){
     const folder=directVisibleItems().find(el=>{
       if(!el.classList.contains("folder-item")||el===drag)return false;
       const r=el.getBoundingClientRect(), inset=Math.min(18,r.height*.22);
       return e.clientX>=r.left&&e.clientX<=r.right&&e.clientY>=r.top+inset&&e.clientY<=r.bottom-inset;
     });
     if(folder){dropFolderId=folder.dataset.folderId;folder.classList.add("drag-over");return}
   }
   moveAt(e.clientY);
 }
 list.addEventListener("pointerdown",e=>{
   const handle=e.target.closest(".project-drag-handle,.folder-drag-handle");if(!handle)return;
   if(e.pointerType==="mouse"&&e.button!==0)return;
   const item=handle.closest(".project-item,.folder-item");if(!item)return;
   if(currentFolderId&&item.classList.contains("folder-item"))return;
   e.preventDefault();e.stopPropagation();
   drag=item;pointerId=e.pointerId;startIndex=activeItems().indexOf(item);dropFolderId=null;trashOver=false;
   window.__libraryStageDragging=true;
   document.body.classList.add("library-drag-active");
   drag.classList.add("library-stage-dragging");
   document.getElementById("dragTrashZone")?.classList.add("show");
   window.addEventListener("pointermove",onMove,{passive:false});
   window.addEventListener("pointerup",finish);
   window.addEventListener("pointercancel",finish);
 },{capture:true});
 list.addEventListener("click",e=>{if(Date.now()<(window.__suppressMixedClickUntil||0)){e.preventDefault();e.stopImmediatePropagation()}},true);
})();
