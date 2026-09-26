/* Fillio — Stage UI module
   Stage editor, stage progress display, and production-table header/sizing.
   Progress-cell tap / long-press paint behavior remains in app.js. */

function makeStageRow(stage,i,arr,render,meta){
 const name=stageLabel(stage);
 const row=document.createElement("div"); row.className="stage-editor-row"; row.dataset.stageIndex=String(i);
 const pencil='<svg class="icon-line" viewBox="0 0 24 24" aria-hidden="true"><path d="M4 20h4l11-11-4-4L4 16z"/><path d="M13.5 6.5l4 4"/></svg>';
 const trash='<svg class="icon-line" viewBox="0 0 24 24" aria-hidden="true"><path d="M4 7h16M9 7V4h6v3M7 7l1 13h8l1-13M10 11v5M14 11v5"/></svg>';
 const grip='<svg class="icon-line stage-grip-icon" viewBox="0 0 24 24" aria-hidden="true"><path d="M5 8h14M5 12h14M5 16h14"/></svg>';
 row.innerHTML=`<button type="button" class="stage-edit-button" title="${t("stage.rename")}" aria-label="${t("stage.rename")}">${pencil}</button><input type="text" maxlength="12" value="${escapeStageHtml(name)}" aria-label="${t("stage.name")}" readonly enterkeyhint="done"><button type="button" class="stage-delete-button" title="${t("stage.delete")}" aria-label="${t("stage.delete")}">${trash}</button><button type="button" class="stage-drag-handle" title="${t("stage.reorder")}" aria-label="${t("stage.reorder")}">${grip}</button>`;
 const input=row.querySelector("input"),edit=row.querySelector(".stage-edit-button"),del=row.querySelector(".stage-delete-button"),handle=row.querySelector(".stage-drag-handle");
 edit.addEventListener("click",()=>{
   input.readOnly=false;row.classList.add("editing");input.focus();
   // Keep the existing name unselected; editing starts from the end.
   const n=input.value.length;try{input.setSelectionRange(n,n)}catch{}
 });
 input.addEventListener("input",()=>arr[Number(row.dataset.stageIndex)]={name:input.value});
 const endEdit=()=>{input.readOnly=true;row.classList.remove("editing");input.blur()};
 input.addEventListener("blur",()=>{input.readOnly=true;row.classList.remove("editing")});
 input.addEventListener("keydown",e=>{if(e.key==="Enter"){e.preventDefault();endEdit()}});
 del.addEventListener("click",()=>{
   const idx=Number(row.dataset.stageIndex);
   if(arr.length<=1){alert(t("stage.min"));return}
   const label=stageLabel(arr[idx]);
   const ok=confirm(t("stage.confirmDelete",{name:label}));
   if(!ok)return;
   arr.splice(idx,1);if(meta)meta.splice(idx,1);render();
 });

 // Keep the drag alive at window level. Capturing the pointer on the handle
 // proved unreliable on Android when the dragged row itself changes DOM position.
 let dragging=false,pointerId=null,startIndex=i,list=null;
 const rows=()=>list?[...list.children].filter(el=>el.classList?.contains("stage-editor-row")):[];
 const moveRowAtPointer=y=>{
   if(!list)return;
   const others=rows().filter(el=>el!==row);
   let before=null;
   for(const el of others){const r=el.getBoundingClientRect();if(y<r.top+r.height/2){before=el;break}}
   if(before){if(row.nextElementSibling!==before)list.insertBefore(row,before)}
   else if(list.lastElementChild!==row)list.appendChild(row);
 };
 const cleanupDragListeners=()=>{
   window.removeEventListener("pointermove",onDragMove);
   window.removeEventListener("pointerup",finishDrag);
   window.removeEventListener("pointercancel",finishDrag);
 };
 const finishDrag=e=>{
   if(!dragging||(e?.pointerId!=null&&e.pointerId!==pointerId))return;
   const finalIndex=rows().indexOf(row);
   dragging=false;row.classList.remove("dragging");cleanupDragListeners();pointerId=null;
   if(finalIndex>=0&&finalIndex!==startIndex){
     const [item]=arr.splice(startIndex,1);arr.splice(finalIndex,0,item);
     if(meta){const [m]=meta.splice(startIndex,1);meta.splice(finalIndex,0,m)}
   }
   render();
 };
 const onDragMove=e=>{
   if(!dragging||e.pointerId!==pointerId)return;
   e.preventDefault();moveRowAtPointer(e.clientY);
 };
 handle.addEventListener("pointerdown",e=>{
   if(e.pointerType==="mouse"&&e.button!==0)return;
   e.preventDefault();
   list=row.parentElement;if(!list)return;
   dragging=true;pointerId=e.pointerId;startIndex=rows().indexOf(row);
   row.classList.add("dragging");
   window.addEventListener("pointermove",onDragMove,{passive:false});
   window.addEventListener("pointerup",finishDrag);
   window.addEventListener("pointercancel",finishDrag);
 });
 return row;
}
let defaultStageDraft=[];
function renderDefaultStageEditor(){
 const box=document.getElementById("defaultStageList"); if(!box)return; box.innerHTML="";
 defaultStageDraft.forEach((stage,i)=>box.appendChild(makeStageRow(stage,i,defaultStageDraft,renderDefaultStageEditor)));
 document.getElementById("defaultStageAdd").disabled=false;
}


function displayStageName(stage){return stageLabel(stage)}
function renderDynamicTableHead(){
  const head=document.getElementById("tableHead"); if(!head)return;
  document.documentElement.style.setProperty("--stage-count",String(stages.length));
  head.innerHTML=`<div class="table-head-corner"></div>${stages.map((n,i)=>`<div class="head">${escapeStageHtml(displayStageName(n))}</div>`).join("")}`;
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
