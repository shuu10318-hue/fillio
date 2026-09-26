/* Fillio — Library rendering module
   Rendering only. Folder mutations and Library drag/drop remain in app.js. */

function projectPercent(p){
  const vals=(p.progress||[]).flat();
  if(!vals.length)return 0;
  return Math.round(vals.filter(v=>v===2).length/vals.length*100);
}

function projectDashboardStats(p){
  const rows=Array.isArray(p?.progress)?p.progress:[];
  const vals=rows.flat();
  const total=Math.max(1,vals.length);
  const started=vals.filter(v=>v>0).length;
  const done=vals.filter(v=>v===2).length;
  const weighted=vals.reduce((sum,v)=>sum+(v===2?1:v===1?0.5:0),0);
  const today=localDate();
  const h=p?.history&&typeof p.history==="object"?p.history:{};
  const todayDone=h.day===today ? done-Number(h.baselineDone||0) : Number(h.days?.[today]||0);
  let weekDone=0,weekWeighted=0;
  for(let i=-6;i<=0;i++){
    const d=addDays(today,i);
    if(d===today&&h.day===today){
      weekDone+=todayDone;
      weekWeighted+=weighted-Number(h.baselineWeighted||0);
    }else{
      weekDone+=Number(h.days?.[d]||0);
      weekWeighted+=Number(h.weightedDays?.[d]||0);
    }
  }
  const avgWeighted=weekWeighted/7;
  const remaining=Math.max(0,total-weighted);
  let forecast="—";
  if(remaining<=0) forecast=languageSettings?.language==="en"?"Completed":"完成";
  else if(avgWeighted>0){
    const days=Math.ceil(remaining/avgWeighted),d=new Date(); d.setDate(d.getDate()+days);
    forecast=`${d.getFullYear()}/${d.getMonth()+1}/${d.getDate()}`;
  }
  return {startedPct:Math.round(started/total*100),donePct:Math.round(done/total*100),todayDone,weekDone,forecast};
}

function projectStageStats(p){
  const rows=Array.isArray(p?.progress)?p.progress:[];
  const names=Array.isArray(p?.stages)&&p.stages.length?p.stages:DEFAULT_STAGES;
  return names.map((name,stageIndex)=>{
    const vals=rows.map(row=>Array.isArray(row)?Number(row[stageIndex]||0):0);
    const total=Math.max(1,vals.length);
    const started=vals.filter(v=>v>0).length;
    const done=vals.filter(v=>v===2).length;
    return {name:String(name||""),startedPct:Math.round(started/total*100),pct:Math.round(done/total*100),done,total};
  });
}

function renderProjectList(){
  const list=document.getElementById("projectList");
  list.innerHTML="";
  const ids=Object.keys(projectStore.projects).filter(id=>!projectStore.projects[id]?.trashedAt);
  const savedOrder=Array.isArray(projectStore.projectOrder)?projectStore.projectOrder:[];
  const orderedIds=savedOrder.filter(id=>ids.includes(id));
  ids.forEach(id=>{if(!orderedIds.includes(id))orderedIds.push(id)});
  projectStore.projectOrder=orderedIds;
  const entries=orderedIds.map(id=>[id,projectStore.projects[id]]);
  if(!entries.length){
    list.innerHTML='<div class="project-empty">まだ作品がありません。<br>「＋ 新しいプロジェクト」から作成できます。</div>';
    return;
  }
  entries.forEach(([id,p])=>{
    const item=document.createElement("div");
    item.className="project-item";
    item.dataset.projectId=id; item.dataset.orderKey="p:"+id;
    // Keep Library/folder visibility correct from the moment the card enters the DOM.
    // Startup language rendering can run before renderFoldersAndFilter's frame guard clears;
    // never expose the unfiltered all-project list during that gap.
    item.style.display=((p.folderId||null)===currentFolderId)?"":"none";
    const donePages=(p.progress||[]).filter(r=>Array.isArray(r)&&r.every(v=>v===2)).length;
    const dash=projectDashboardStats(p);
    const isEn=languageSettings?.language==="en";
    const donePct=projectPercent(p);
    const stageStats=projectStageStats(p);
    const expanded=expandedStageDetails.has(id);
    const stageValueMode=projectStageValueMode(id);
    const title=p.title||(isEn?"Untitled":"無題");
    const detailRows=stageStats.map(st=>`<div class="project-stage-row"><span class="project-stage-name"></span><div class="project-stage-track dual"><i class="started" style="width:${st.startedPct}%"></i><i class="done" style="width:${st.pct}%"></i></div><button class="project-stage-value" type="button" data-pct="${st.pct}" data-done="${st.done}" data-total="${st.total}" aria-label="${isEn?"Switch percent / steps":"パーセント / Step 表示を切り替え"}">${stageValueMode==="steps"?`${st.done} / ${st.total}`:`${st.pct}%`}</button></div>`).join("");
    item.innerHTML=`<div class="project-item-main">
      <div style="min-width:0">
        <button class="project-open-title" type="button" aria-label="${isEn?"Open input page":"入力ページを開く"}" title="${isEn?"Open input page":"入力ページを開く"}"><svg class="icon-line" viewBox="0 0 24 24" aria-hidden="true"><path d="M4 20h4l11-11-4-4L4 16z"/><path d="M13.5 6.5l4 4"/></svg><span class="project-item-title" data-user-text="1"></span></button>
        ${donePages>=p.totalPages ? `
<div class="project-summary project-summary-complete">
  <div class="project-summary-main"><b>${donePages} / ${p.totalPages}P</b><strong>✓ ${isEn?"Completed":"完成"}</strong></div>
  <div class="project-progress-track dual"><i class="started" style="width:100%"></i><i class="done" style="width:100%"></i></div>
  <div class="project-complete-meta"><span>${isEn?"Progress":"全工程"}</span><b>100%</b></div>
</div>` : `
<div class="project-summary">
  <div class="project-summary-main"><b>${donePages} / ${p.totalPages}P</b><strong>${donePct}%</strong></div>
  <div class="project-progress-track dual"><i class="started" style="width:${dash.startedPct}%"></i><i class="done" style="width:${donePct}%"></i></div>
  <div class="project-plan-row">
    <div><span>${isEn?"Deadline":"締切"}</span><b>${p.deadline?p.deadline.replaceAll("-","/"):(isEn?"None":"未設定")}</b></div>
    <div><span>${isEn?"Forecast":"完成予想"}</span><b>${dash.forecast}</b></div>
  </div>
  <div class="project-dashboard-strip project-dashboard-compact">
    <div><span>${isEn?"Started":"着手"}</span><b>${dash.startedPct}%</b></div>
    <div><span>${isEn?"Today":"今日"}</span><b>${dash.todayDone>=0?"+":""}${dash.todayDone}</b></div>
    <div><span>${isEn?"7 days":"7日"}</span><b>${dash.weekDone}</b></div>
  </div>
</div>`}
      </div>
      <div class="project-item-actions">
        <button class="project-drag-handle project-icon-button" type="button" aria-label="${isEn?"Reorder project":"プロジェクトを並べ替え"}" title="${isEn?"Reorder":"並べ替え"}"><svg class="icon-line" viewBox="0 0 24 24" aria-hidden="true"><path d="M5 8h14M5 12h14M5 16h14"/></svg></button>
        <button class="project-edit-button project-icon-button" type="button" aria-label="${isEn?"Project settings":"プロジェクト設定"}" title="${isEn?"Project settings":"プロジェクト設定"}"><svg class="icon-line" viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.7 1.7 0 0 0 .34 1.88l.06.06-2.83 2.83-.06-.06A1.7 1.7 0 0 0 15 19.4a1.7 1.7 0 0 0-1 .6 1.7 1.7 0 0 0-.4 1.1V21h-4v-.09A1.7 1.7 0 0 0 8.6 19.4a1.7 1.7 0 0 0-1.88.34l-.06.06-2.83-2.83.06-.06A1.7 1.7 0 0 0 4.6 15a1.7 1.7 0 0 0-.6-1 1.7 1.7 0 0 0-1.1-.4H3v-4h.09A1.7 1.7 0 0 0 4.6 8.6a1.7 1.7 0 0 0-.34-1.88l-.06-.06 2.83-2.83.06.06A1.7 1.7 0 0 0 9 4.6a1.7 1.7 0 0 0 1-.6 1.7 1.7 0 0 0 .4-1.1V3h4v.09A1.7 1.7 0 0 0 15.4 4.6a1.7 1.7 0 0 0 1.88-.34l.06-.06 2.83 2.83-.06.06A1.7 1.7 0 0 0 19.4 9c.13.37.35.7.64.96.3.27.68.42 1.08.44H21v4h-.09A1.7 1.7 0 0 0 19.4 15z"/></svg></button>
      </div>
    </div>
    <button class="project-stage-toggle" type="button" aria-expanded="${expanded}"><span>${isEn?"Stage details":"工程別"}</span><svg class="icon-line" viewBox="0 0 24 24" aria-hidden="true"><path d="M7 10l5 5 5-5"/></svg></button>
    <div class="project-stage-details${expanded?" open":""}">${detailRows}</div>`;
    item.querySelector(".project-item-title").textContent=title;
    item.querySelectorAll(".project-stage-name").forEach((el,i)=>{el.textContent=stageStats[i]?.name||(isEn?"New stage":"新しい工程")});
    item.querySelector(".project-open-title").onclick=e=>{e.stopPropagation();openProject(id)};
    item.querySelector(".project-edit-button").onclick=e=>{e.stopPropagation();openProjectEdit(id)};
    item.querySelectorAll(".project-stage-value").forEach(btn=>btn.onclick=e=>{
      e.stopPropagation();
      const next=projectStageValueMode(id)==="percent"?"steps":"percent";
      stageValueModes[id]=next;
      saveProjectStageValueModes();
      item.querySelectorAll(".project-stage-value").forEach(valueEl=>{
        valueEl.textContent=next==="steps"?`${valueEl.dataset.done} / ${valueEl.dataset.total}`:`${valueEl.dataset.pct}%`;
      });
    });
    item.querySelector(".project-stage-toggle").onclick=e=>{
      e.stopPropagation();
      if(expandedStageDetails.has(id))expandedStageDetails.delete(id);else expandedStageDetails.add(id);
      const details=item.querySelector(".project-stage-details");
      const btn=e.currentTarget;
      const open=expandedStageDetails.has(id);
      details.classList.toggle("open",open);btn.setAttribute("aria-expanded",String(open));
    };
    list.appendChild(item);
  });
}

function renderFoldersAndFilter(){
 if(folderRendering)return;
 folderRendering=true;
 ensureFolders();
 const list=document.getElementById("projectList");if(!list)return;
 list.querySelectorAll(".folder-item").forEach(x=>x.remove());
 const head=document.getElementById("folderHead");
 if(currentFolderId&&projectStore.folders[currentFolderId]){
   head?.classList.add("show");
   document.getElementById("folderHeadTitle").innerHTML=`<button type="button" class="crumb-link" data-nav="root">${"Library"}</button><span class="crumb-sep">›</span><span class="crumb-current">${String(projectStore.folders[currentFolderId].name).replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;","\"":"&quot;","'":"&#39;"}[c]))}</span>`;
 const renameBtn=document.getElementById("folderRename");
 const deleteBtn=document.getElementById("folderDelete");
 if(renameBtn)renameBtn.style.display="";
 if(deleteBtn){deleteBtn.style.display="";deleteBtn.textContent=languageSettings?.language==="en"?"Remove":"解除";}
 }else{
   currentFolderId=null;head?.classList.remove("show");
   const renameBtn=document.getElementById("folderRename");
   const deleteBtn=document.getElementById("folderDelete");
   if(renameBtn)renameBtn.style.display="none";
   if(deleteBtn)deleteBtn.style.display="none";
 }
 [...list.querySelectorAll(".project-item[data-project-id]")].forEach(el=>{
   const p=projectStore.projects[el.dataset.projectId];
   el.style.display=(!p?.trashedAt&&(p?.folderId||null)===currentFolderId)?"":"none";
 });
 if(currentFolderId){
   // フォルダ内の各作品に「フォルダから戻す」を表示
   [...list.querySelectorAll(".project-item[data-project-id]")].forEach(item=>{
     const pid=item.dataset.projectId;
     const p=projectStore.projects[pid];
     if(!p||p.folderId!==currentFolderId)return;
     if(item.querySelector(".folder-eject"))return;
     const actions=item.querySelector(".project-item-actions")||item;
     const btn=document.createElement("button");
     btn.type="button";
     btn.className="folder-eject project-icon-button";
     btn.setAttribute("aria-label",languageSettings?.language==="en"?"Remove from folder":"フォルダから解除");
     btn.title=languageSettings?.language==="en"?"Remove from folder":"フォルダから解除";
     btn.innerHTML='<svg class="icon-line" viewBox="0 0 24 24" aria-hidden="true"><path d="M9 7l-5 5 5 5"/><path d="M4 12h10a6 6 0 0 1 6 6v1"/></svg>';
     btn.addEventListener("click",e=>{
       e.stopPropagation();
       p.folderId=null;
       persistProjectStore();
       renderFoldersAndFilter();
     });
     actions.append(btn);
   });
 }
 if(!currentFolderId){
   Object.entries(projectStore.folders).filter(([,f])=>!f?.trashedAt).forEach(([fid,f])=>{
     const el=document.createElement("div");el.className="folder-item";el.dataset.folderId=fid;el.dataset.orderKey="f:"+fid;
     el.innerHTML=`<div class="folder-row"><div><div class="folder-name"><span class="folder-icon"><svg class="icon-line" viewBox="0 0 24 24" aria-hidden="true"><path d="M3 6h7l2 2h9v11H3z"/></svg></span><span data-user-text="1">${String(f.name).replace(/[&<>"\']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;","\"":"&quot;","\'":"&#39;"}[c]))}</span></div><div class="folder-meta">${folderCount(fid)}${languageSettings?.language==="en"?" projects":"作品"}</div></div><button class="folder-drag-handle project-icon-button" type="button" aria-label="${languageSettings?.language==="en"?"Reorder folder":"フォルダを並べ替え"}" title="${languageSettings?.language==="en"?"Reorder":"並べ替え"}"><svg class="icon-line" viewBox="0 0 24 24" aria-hidden="true"><path d="M5 8h14M5 12h14M5 16h14"/></svg></button></div>`;
     const openFolder=()=>{ showFolderView(fid); };
     // カード本体の短いタップでも開く。長押しドラッグ直後のclickは既存の抑制を尊重。
     el.addEventListener("click",e=>{
       if(e.target.closest("button,a,input,textarea,select,label"))return;
       if(Date.now()<(window.__suppressMixedClickUntil||0))return;
       if(window.__mixedRootDragging)return;
       openFolder();
     });
     list.append(el);
   });
   const rank=new Map(projectStore.rootOrder.map((k,i)=>[k,i]));
   const mixed=[...list.querySelectorAll(".folder-item[data-folder-id],.project-item[data-project-id]")]
     .filter(el=>el.classList.contains("folder-item")||(!projectStore.projects[el.dataset.projectId]?.trashedAt&&!projectStore.projects[el.dataset.projectId]?.folderId));
   mixed.sort((a,b)=>(rank.get(a.dataset.orderKey)??999999)-(rank.get(b.dataset.orderKey)??999999));
   mixed.forEach(el=>list.append(el));
 }
 if(!currentFolderId)renderRootBreadcrumb();
 requestAnimationFrame(()=>{folderRendering=false});
}
