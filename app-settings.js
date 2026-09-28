/* fillio settings UI helpers */
/* ===== Help, theme, and i18n ===== */
(function fillioUiFixes(){
  const $=id=>document.getElementById(id);

  document.querySelectorAll(".display-mode-option").forEach(btn=>btn.addEventListener("click",e=>{
    e.preventDefault();
    appSettings.displayMode=btn.dataset.displayMode;
    applyDisplayMode(appSettings.displayMode);
    persistAppSettings();
  },{capture:true}));

  document.querySelectorAll(".theme-color-option").forEach(btn=>btn.addEventListener("click",e=>{
    e.preventDefault();
    const color=btn.dataset.themeColor;
    appSettings.themeColor=color;
    applyThemeColor(color);
    persistAppSettings();
  },{capture:true}));

  document.querySelectorAll(".cell-shape-option").forEach(btn=>btn.addEventListener("click",e=>{
    e.preventDefault();
    const shape=btn.dataset.cellShape;
    appSettings.cellShape=shape;
    applyCellShape(shape);
    persistAppSettings();
  },{capture:true}));

})();

/* Finish form editing consistently on mobile */
(function setupCommitBlurBehavior(){
  // Project titles: keyboard Done/Enter commits the field and dismisses the keyboard.
  ["newProjectTitle","editProjectTitle"].forEach(id=>{
    const el=document.getElementById(id); if(!el)return;
    el.setAttribute("enterkeyhint","done");
    el.addEventListener("keydown",e=>{
      if(e.key==="Enter"){
        e.preventDefault();
        el.blur();
      }
    });
  });

  // Page counts: normalize the value, then dismiss the numeric keyboard on Done/Enter.
  ["defaultPages","newProjectPages","editProjectPages"].forEach(id=>{
    const el=document.getElementById(id); if(!el)return;
    el.setAttribute("enterkeyhint","done");
    el.addEventListener("keydown",e=>{
      if(e.key==="Enter"){
        e.preventDefault();
        el.value=String(clampPageCount(el.value));
        el.dispatchEvent(new Event("input",{bubbles:true}));
        el.blur();
      }
    });
  });

  // Native date pickers are already a commit-style control; after a date is chosen,
  // release focus so the picker/focus state does not linger.
  ["newProjectDeadline","editProjectCreationStartDate","editProjectDeadline"].forEach(id=>{
    const el=document.getElementById(id); if(!el)return;
    el.addEventListener("change",()=>el.blur());
  });
})();
