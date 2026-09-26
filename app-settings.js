/* fillio settings UI helpers */
/* ===== Help, theme, and i18n ===== */
(function fillioUiFixes(){
  const $=id=>document.getElementById(id);
  function isEn(){return languageSettings?.language==="en"}

  function syncExtraLanguage(){
    const set=(id,key)=>{const el=$(id);if(el)el.textContent=t(key)};
    set("displayModeTitle","settings.displayMode");set("displayModeNote","settings.displayModeNote");
    set("themeColorTitle","settings.themeColor");set("themeColorNote","settings.themeColorNote");
    set("cellShapeTitle","settings.cellShape");set("cellShapeNote","settings.cellShapeNote");
    set("dataManagementTitle","settings.dataManagement");set("dataManagementNote","settings.dataManagementNote");
    set("exportBackup","settings.backup");set("importBackup","settings.restore");set("libraryHelpTitle","help.libraryTitle");
    const hb=$("libraryHelpButton");if(hb)hb.setAttribute("aria-label",t("help.libraryTitle"));
    const hc=$("libraryHelpClose");if(hc)hc.setAttribute("aria-label",t("common.close"));
    const helpKeys=["create","open","reorder","folder","edit","settings","defaults","theme","trash","backup"];
    $("libraryHelpModal")?.querySelectorAll(".help-item").forEach((it,i)=>{const key=helpKeys[i];if(!key)return;it.querySelector(".help-item-title").textContent=t(`help.${key}.title`);it.querySelector(".help-item-text").textContent=t(`help.${key}.text`)});
    const en=uiLang()==="en";
    document.querySelectorAll(".display-mode-option").forEach(btn=>{const label=en?btn.dataset.en:btn.dataset.ja;btn.textContent=label;btn.setAttribute("aria-label",label)});
    document.querySelectorAll(".theme-color-option").forEach(btn=>{const label=en?btn.dataset.en:btn.dataset.ja;btn.setAttribute("aria-label",label);btn.title=label;btn.querySelector(".theme-option-label").textContent=label});
    document.querySelectorAll(".cell-shape-option").forEach(btn=>{const label=en?btn.dataset.en:btn.dataset.ja;btn.setAttribute("aria-label",label);btn.title=label;btn.querySelector(".cell-shape-label").textContent=label});
  }

  const helpBtn=$("libraryHelpButton"), helpModal=$("libraryHelpModal"), helpClose=$("libraryHelpClose");
  const openHelp=()=>{if(!helpModal)return;lockPageScroll();helpModal.classList.add("open");helpModal.setAttribute("aria-hidden","false")};
  const closeHelp=()=>{if(!helpModal)return;helpModal.classList.remove("open");helpModal.setAttribute("aria-hidden","true");unlockPageScroll()};
  helpBtn?.addEventListener("click",e=>{e.preventDefault();e.stopPropagation();openHelp()},{capture:true});
  helpClose?.addEventListener("click",e=>{e.preventDefault();e.stopPropagation();closeHelp()},{capture:true});

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

  syncExtraLanguage();
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
