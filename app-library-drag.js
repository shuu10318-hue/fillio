/* fillio v43 - Library drag/drop and reorder module
   Active Pointer Events implementation only. Obsolete Touch-event implementations removed after v38 audit. */

// Library reorder v11 — same pointer model as Stage editor.
// ≡ starts immediately; the real card stays in the list and only moves vertically.
(function initLibraryStageStyleReorder(){
 const list=document.getElementById("projectList"); if(!list)return;
 let drag=null,pointerId=null,startIndex=-1,dropFolderId=null,trashOver=false;
 let autoScrollFrame=0,lastPointerX=0,lastPointerY=0;
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
   // v57: the destructive hit target matches the visible 210 x 50px trash box.
   // Auto-scroll still uses its own wider edge band, so reorder scrolling stays easy.
   const width=Math.min(210,Math.max(0,window.innerWidth-112));
   const left=(window.innerWidth-width)/2;
   const right=left+width;
   const top=72;
   const bottom=top+50;
   const over=x>=left&&x<=right&&y>=top&&y<=bottom;
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
 const stopAutoScroll=()=>{
   if(autoScrollFrame){cancelAnimationFrame(autoScrollFrame);autoScrollFrame=0}
 };
 const autoScrollStep=()=>{
   autoScrollFrame=0;
   if(!drag)return;
   const edge=112;
   let delta=0;
   if(!trashOver&&lastPointerY<edge){
     const strength=Math.max(0,Math.min(1,(edge-lastPointerY)/edge));
     delta=-(3+11*strength);
   }else if(lastPointerY>window.innerHeight-edge){
     const strength=Math.max(0,Math.min(1,(lastPointerY-(window.innerHeight-edge))/edge));
     delta=3+11*strength;
   }
   if(delta){
     const before=window.scrollY;
     window.scrollBy(0,delta);
     if(window.scrollY!==before){
       clearTargets();dropFolderId=null;
       moveAt(lastPointerY);
     }
     autoScrollFrame=requestAnimationFrame(autoScrollStep);
   }
 };
 const updateAutoScroll=()=>{
   const edge=112;
   const shouldScroll=!trashOver&&(lastPointerY<edge||lastPointerY>window.innerHeight-edge);
   if(shouldScroll){if(!autoScrollFrame)autoScrollFrame=requestAnimationFrame(autoScrollStep)}
   else stopAutoScroll();
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
   stopAutoScroll();
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
   lastPointerX=e.clientX;lastPointerY=e.clientY;
   trashOver=setTrash(lastPointerX,lastPointerY);
   updateAutoScroll();
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
   lastPointerX=e.clientX;lastPointerY=e.clientY;
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
