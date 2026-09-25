/* fillio v36 - Library drag/drop and reorder module
   Behavior-preserving extraction from app.js.
   Includes legacy compatibility paths; active reorder remains the Stage-style pointer model. */

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
if(false&&reorderList){
 reorderList.addEventListener("touchstart",e=>{
  if(!currentFolderId||e.touches.length!==1)return;
  const handle=e.target.closest(".project-drag-handle");if(!handle)return;
  const item=handle.closest(".project-item[data-project-id]");if(!item)return;
  const t=e.touches[0];
  reorderStartX=reorderLastX=t.clientX;reorderStartY=reorderLastY=t.clientY;
  clearTimeout(reorderHoldTimer);
  reorderDragging=item;item.classList.add("reorder-dragging");
  if(navigator.vibrate)navigator.vibrate(20);
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
  if(!currentFolderId||e.button!==0)return;
  const handle=e.target.closest(".project-drag-handle");if(!handle)return;
  const item=handle.closest(".project-item[data-project-id]");if(!item)return;
  reorderStartX=e.clientX;reorderStartY=e.clientY;
  clearTimeout(reorderHoldTimer);
  reorderDragging=item;item.classList.add("reorder-dragging");
 });
 window.addEventListener("mousemove",e=>{
  if(!reorderDragging)return;
  e.preventDefault();moveReorderAt(e.clientX,e.clientY);
 });
 window.addEventListener("mouseup",finishReorder);
}



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
 return; // v11: replaced by Stage-style pointer reorder below
 let drag=null,hold=null,sx=0,sy=0,dropFolderId=null,dragGhost=null,trashOver=false,ghostFixedX=0;
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
 function updateGhost(t){if(!dragGhost)return;dragGhost.style.left=ghostFixedX+"px";dragGhost.style.top=t.clientY+"px"}
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
   let removedByTrash=false;
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
   const isProject=item.classList.contains("project-item");
   const dragHandle=e.target.closest(isProject?".project-drag-handle":".folder-drag-handle");
   // プロジェクトもフォルダも ≡ 専用。同じ操作で即ドラッグ開始。
   if(!dragHandle)return;
   const t=e.touches[0];sx=t.clientX;sy=t.clientY;
   clearTimeout(hold);
   const beginDrag=()=>{
     drag=item; dropFolderId=null; trashOver=false; item.classList.add("mixed-root-dragging");
     dragGhost=item.cloneNode(true);dragGhost.classList.remove("mixed-root-dragging");dragGhost.classList.add("drag-ghost");
     dragGhost.querySelectorAll("button").forEach(b=>b.setAttribute("tabindex","-1"));document.body.appendChild(dragGhost);ghostFixedX=item.getBoundingClientRect().left+item.getBoundingClientRect().width/2;updateGhost(t);
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
     if(navigator.vibrate)navigator.vibrate(isProject?20:28);
   };
   beginDrag();
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
   const r=zone.getBoundingClientRect();
   const over=x>=r.left-10&&x<=r.right+10&&y>=r.top-28&&y<=r.bottom+18;
   zone.classList.toggle("over",over); return over;
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


/* --- Trash drop compatibility layer (Library drag module) --- */
(function setupTrashDropCompatibility(){
  const zone=document.getElementById("dragTrashZone");
  if(!zone)return;
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


