// Fillio core settings and shared application configuration.
// Refactor phase 1: behavior and storage format intentionally unchanged.
const STORAGE_KEY="manga-progress-v1"; // 旧版データ。移行元として残す
const PROJECTS_KEY="manga-progress-projects-v2";
const VIEW_STATE_KEY="manga-progress-view-state-v1";
const APP_SETTINGS_KEY="manga-progress-app-settings-v1";
const STAGE_VALUE_MODE_KEY="fillio-stage-value-mode-v2";
let stageValueModes={};
try{stageValueModes=JSON.parse(localStorage.getItem(STAGE_VALUE_MODE_KEY)||"{}")||{}}catch{stageValueModes={}}
function projectStageValueMode(id){return stageValueModes[id]==="steps"?"steps":"percent"}
function saveProjectStageValueModes(){localStorage.setItem(STAGE_VALUE_MODE_KEY,JSON.stringify(stageValueModes))}
let appSettings=null;
let languageSettings={language:"ja"};
let projectDefaults={startPage:1,endPage:48,stages:[]};
let projectStore={version:2,activeProjectId:null,projects:{}};
let currentProjectId=null;
const DEFAULT_STAGES=["ネーム","ペン","背景","トーン","写植"];
const MAX_STAGES=100;

const UI_TEXT={
 ja:{home:"Library",newProject:"＋ プロジェクト",settings:"アプリ設定",language:"言語",defaults:"新規プロジェクトのデフォルト",pages:"制作ページ",stages:"工程",addStage:"＋ 工程を追加",cancel:"キャンセル",save:"保存",note:"新しいプロジェクトを作るときの初期値です。プロジェクトごとに変更できます。",folderAdd:"＋ フォルダ",memo:"メモ一覧",backProjects:"作品一覧"},
 en:{home:"Library",newProject:"+ Project",settings:"App Settings",language:"Language",defaults:"New Project Defaults",pages:"Pages",stages:"Stages",addStage:"+ Add Stage",cancel:"Cancel",save:"Save",note:"These are the initial values for new projects. Each project can be changed separately.",folderAdd:"+ Folder",memo:"Notes",backProjects:"Projects"}
};
function normalizeAppSettings(raw){
 const lang=raw?.language==="en"?"en":"ja";
 let a=Math.max(1,Math.min(500,Number(raw?.defaultStartPage)||1));
 let b=Math.max(a,Math.min(500,Number(raw?.defaultEndPage)||48));
 if(b-a+1>500)b=a+499;
 let ss=Array.isArray(raw?.defaultStages)?raw.defaultStages.map(x=>String(x||"").trim()).filter(Boolean).slice(0,MAX_STAGES):[];
 if(!ss.length)ss=[...DEFAULT_STAGES];
 const allowedColors=["#222222","#d9788d","#6e9fd0","#70ad98","#9a83c6","#dc9878","#d6b94c","#d86f67","#7656a8"];
 const legacyThemeMap={"#4f6bed":"#6e9fd0","#3f8f6b":"#70ad98","#7a5cc7":"#9a83c6","#c7663d":"#dc9878"};
 const rawTheme=raw?.themeColor ?? appSettings?.themeColor;
 const requested=legacyThemeMap[rawTheme]||rawTheme;
 const themeColor=allowedColors.includes(requested)?requested:"#222222";
 const rawDisplayMode=raw?.displayMode ?? appSettings?.displayMode;
 const displayMode=["light","dark","auto"].includes(rawDisplayMode)?rawDisplayMode:"light";
 const rawCellShape=raw?.cellShape ?? appSettings?.cellShape;
 const cellShape=["rounded","circle","star"].includes(rawCellShape)?rawCellShape:"rounded";
 return {language:lang,defaultStartPage:a,defaultEndPage:b,defaultStages:ss,themeColor,displayMode,cellShape};
}
function syncSplitSettings(){
 languageSettings={language:appSettings?.language==="en"?"en":"ja"};
 projectDefaults={
   startPage:appSettings?.defaultStartPage||1,
   endPage:appSettings?.defaultEndPage||48,
   stages:[...(appSettings?.defaultStages||DEFAULT_STAGES)]
 };
}
function loadAppSettings(){
 try{appSettings=normalizeAppSettings(JSON.parse(localStorage.getItem(APP_SETTINGS_KEY)||"null"))}
 catch(e){appSettings=normalizeAppSettings(null)}
 syncSplitSettings();
}
function persistAppSettings(){
 syncSplitSettings();
 localStorage.setItem(APP_SETTINGS_KEY,JSON.stringify(appSettings));
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
function applyLanguage(){
 const t=UI_TEXT[languageSettings.language]||UI_TEXT.ja;
 document.documentElement.lang=languageSettings.language;
 const set=(id,s)=>{const e=document.getElementById(id);if(e)e.textContent=s};
 set("homeTitle",t.home); set("newProjectButton",t.newProject); set("settingsTitle",t.settings);
 set("settingsLanguageLabel",t.language);set("settingsDefaultsTitle",t.defaults);set("settingsPagesLabel",t.pages);
 set("settingsStagesLabel",t.stages);set("defaultStageAdd",t.addStage);set("settingsCancel",t.cancel);set("settingsSave",t.save);set("settingsNote",t.note);
 set("folderAdd",t.folderAdd);const memoLabel=document.querySelector("#memoListButton .memo-list-label");if(memoLabel)memoLabel.textContent=t.memo;set("backToProjects",t.backProjects);
}
