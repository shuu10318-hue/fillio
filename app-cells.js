/* Fillio — Stage cell interaction module
   Cell tap helpers and long-press slide painting. Behavior is shared by tap and long-press slide painting. */

function fillioHaptic(ms){
  try{
    if(typeof navigator!=="undefined" && typeof navigator.vibrate==="function")navigator.vibrate(ms);
  }catch(_e){}
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
let paintLastHapticKey=null;
let paintScrollRaf=0;
const PAINT_HOLD_MS=480;
const PAINT_CANCEL_MOVE=12;
const PAINT_AXIS_LOCK_MOVE=10;
const PAINT_SCROLL_EDGE=72;
const PAINT_SCROLL_MAX=12;

function setCellVisual(cell,value){
  cell.classList.remove("state0","state1","state2");
  cell.classList.add("state"+value);
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
  let endpointKey=null;
  if(paintAxis==="vertical"){
    endpointKey=paintKey(p,paintStage);
    showPaintPreview(p,paintStage);
  }else if(paintAxis==="horizontal"){
    endpointKey=paintKey(paintSourcePage,s);
    showPaintPreview(paintSourcePage,s);
  }
  if(endpointKey && endpointKey!==paintLastHapticKey){
    paintLastHapticKey=endpointKey;
    fillioHaptic(6);
  }
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
  paintLastHapticKey=null;
  if(paintSourceCell)paintSourceCell.classList.remove('paint-source');
  paintSourceCell=null;
  if(!wasPaintMode){paintPreviewCells.clear();return}
  suppressCellClickUntil=Date.now()+500;
  suppressPageSwipeUntil=Date.now()+500;
  if(commit){
    let changed=false;
    for(const key of paintPreviewCells){
      const [p,s]=key.split(":").map(Number);
      if(progress[p][s]!==paintValue)changed=true;
      progress[p][s]=paintValue;
    }
    paintPreviewCells.clear();
    if(changed)fillioHaptic(18);
    save();
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
  paintLastHapticKey=null;
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
    paintLastHapticKey=paintKey(p,s);
    paintPreviewCells=new Set([paintKey(p,s)]);
    cell.classList.add('paint-source');
    suppressCellClickUntil=Date.now()+1000;
    suppressPageSwipeUntil=Date.now()+1000;
    fillioHaptic(28);
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
