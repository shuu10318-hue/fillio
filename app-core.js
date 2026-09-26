// Fillio core settings and shared application configuration.
const PROJECTS_KEY="fillio-projects-v1";
const VIEW_STATE_KEY="fillio-view-state-v1";
const APP_SETTINGS_KEY="fillio-settings-v1";
const STAGE_VALUE_MODE_KEY="fillio-stage-value-mode-v1";

function reportStorageFailure(err){
 console.error("Fillio: local storage write failed",err);
 const m=document.getElementById("saveMessage");
 if(m)m.textContent=languageSettings?.language==="en"?"Save failed — export a backup":"保存に失敗しました — バックアップしてください";
}
function safeStorageSet(key,value){
 try{localStorage.setItem(key,value);return true}catch(err){reportStorageFailure(err);return false}
}
let stageValueModes={};
try{stageValueModes=JSON.parse(localStorage.getItem(STAGE_VALUE_MODE_KEY)||"{}")||{}}catch{stageValueModes={}}
function projectStageValueMode(id){return stageValueModes[id]==="steps"?"steps":"percent"}
function saveProjectStageValueModes(){return safeStorageSet(STAGE_VALUE_MODE_KEY,JSON.stringify(stageValueModes))}
let appSettings=null;
let languageSettings={language:"ja"};
let projectDefaults={pages:48,stages:[]};
const DATA_VERSION=3;
const BACKUP_VERSION=3;
const PROJECT_PAGE_MAX=500;
let projectStore={version:DATA_VERSION,activeProjectId:null,projects:{}};
let currentProjectId=null;
const DEFAULT_STAGE_LABELS={
 ja:{storyboard:"ネーム",lineArt:"ペン",background:"背景",tone:"トーン",lettering:"写植"},
 en:{storyboard:"Storyboard",lineArt:"Line Art",background:"Background",tone:"Tone",lettering:"Lettering"}
};
const DEFAULT_STAGE_KEYS=Object.keys(DEFAULT_STAGE_LABELS.ja);
const DEFAULT_STAGES=DEFAULT_STAGE_KEYS.map(defaultKey=>({defaultKey}));
const MAX_STAGES=100;
function cloneStage(stage){return stage?.defaultKey?{defaultKey:stage.defaultKey}:{name:String(stage?.name??"")}}
function cloneStages(list){return (list||[]).map(cloneStage)}
function normalizeStage(stage){
 if(stage&&typeof stage==="object"){
   if(DEFAULT_STAGE_KEYS.includes(stage.defaultKey))return {defaultKey:stage.defaultKey};
   return {name:String(stage.name??"").trim()};
 }
 const name=String(stage??"").trim();
 for(const lang of ["ja","en"]){
   const key=DEFAULT_STAGE_KEYS.find(k=>DEFAULT_STAGE_LABELS[lang][k]===name);
   if(key)return {defaultKey:key};
 }
 return {name};
}
function normalizeStages(list){
 const out=Array.isArray(list)?list.slice(0,MAX_STAGES).map(normalizeStage):[];
 return out.length?out:cloneStages(DEFAULT_STAGES);
}
function stageLabel(stage,lang=languageSettings?.language||"ja"){
 if(stage?.defaultKey)return DEFAULT_STAGE_LABELS[lang]?.[stage.defaultKey]||DEFAULT_STAGE_LABELS.ja[stage.defaultKey]||"";
 const name=String(stage?.name??"").trim();
 return name||(lang==="en"?"New Stage":"新しい工程");
}

function normalizeAppSettings(raw){
 const lang=raw?.language==="en"?"en":"ja";
 const pages=Math.max(1,Math.min(PROJECT_PAGE_MAX,Number(raw?.defaultPages)||48));
 let ss=normalizeStages(raw?.defaultStages);
 const allowedColors=["#222222","#d9788d","#6e9fd0","#70ad98","#9a83c6","#dc9878","#d6b94c","#d86f67","#7656a8"];
 const requested=raw?.themeColor ?? appSettings?.themeColor;
 const themeColor=allowedColors.includes(requested)?requested:"#222222";
 const rawDisplayMode=raw?.displayMode ?? appSettings?.displayMode;
 const displayMode=["light","dark","auto"].includes(rawDisplayMode)?rawDisplayMode:"light";
 const rawCellShape=raw?.cellShape ?? appSettings?.cellShape;
 const cellShape=["rounded","circle","star"].includes(rawCellShape)?rawCellShape:"rounded";
 return {language:lang,defaultPages:pages,defaultStages:ss,themeColor,displayMode,cellShape};
}
function syncSplitSettings(){
 languageSettings={language:appSettings?.language==="en"?"en":"ja"};
 projectDefaults={
   pages:appSettings?.defaultPages||48,
   stages:cloneStages(appSettings?.defaultStages||DEFAULT_STAGES)
 };
}
function loadAppSettings(){
 try{appSettings=normalizeAppSettings(JSON.parse(localStorage.getItem(APP_SETTINGS_KEY)||"null"))}
 catch(e){appSettings=normalizeAppSettings(null)}
 syncSplitSettings();
}
function persistAppSettings(){
 syncSplitSettings();
 return safeStorageSet(APP_SETTINGS_KEY,JSON.stringify(appSettings));
}

function resolvedDisplayMode(mode=appSettings?.displayMode||"light"){
 return mode==="auto"?(window.matchMedia?.("(prefers-color-scheme: dark)").matches?"dark":"light"):mode;
}
function applyDisplayMode(mode=appSettings?.displayMode||"light"){
 const resolved=resolvedDisplayMode(mode);
 document.documentElement.dataset.displayMode=resolved;
 document.documentElement.dataset.displayPreference=mode;
 document.querySelectorAll(".display-mode-option").forEach(b=>{const on=b.dataset.displayMode===mode;b.classList.toggle("selected",on);b.setAttribute("aria-checked",on?"true":"false")});
 const meta=document.querySelector('meta[name="theme-color"]');
 if(meta)meta.content=resolved==="dark"?"#151515":"#f6f6f6";
}
const fillioColorSchemeQuery=window.matchMedia?.("(prefers-color-scheme: dark)");
fillioColorSchemeQuery?.addEventListener?.("change",()=>{if(appSettings?.displayMode==="auto")applyDisplayMode("auto")});

function applyCellShape(shape=appSettings?.cellShape||"rounded"){
 const safe=["rounded","circle","star"].includes(shape)?shape:"rounded";
 document.documentElement.dataset.cellShape=safe;
 document.querySelectorAll(".cell-shape-option").forEach(b=>{
   const on=b.dataset.cellShape===safe;b.classList.toggle("selected",on);b.setAttribute("aria-checked",on?"true":"false");
 });
}

function applyThemeColor(color=appSettings?.themeColor||"#222222"){
 document.documentElement.style.setProperty("--accent",color);
 document.documentElement.dataset.theme=color==="#222222"?"mono":"color";
 const meta=document.querySelector('meta[name="theme-color"]');
 if(meta && resolvedDisplayMode()!=="dark") meta.content="#f6f6f6";
 document.querySelectorAll(".theme-color-option").forEach(b=>{
   const on=b.dataset.themeColor===color;b.classList.toggle("selected",on);b.setAttribute("aria-checked",on?"true":"false");
 });
}

