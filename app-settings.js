/* fillio settings UI helpers — extracted from app.js in v28 */
/* ===== 2026-09-23 robust help/theme/i18n patch ===== */
(function fillioUiFixes(){
  const $=id=>document.getElementById(id);
  function isEn(){return languageSettings?.language==="en"}

  function syncExtraLanguage(){
    const en=isEn();
    const text=(id,ja,enText)=>{const el=$(id);if(el)el.textContent=en?enText:ja};
    text("displayModeTitle","表示モード","Display Mode");
    text("displayModeNote","画面の明るさを選べます。自動は端末の設定に合わせます。","Choose the appearance. Auto follows your device setting.");
    text("themeColorTitle","テーマカラー","Theme Color");
    text("themeColorNote","完了セルや選択状態などのアクセントカラーに使われます。","Used as the accent color for completed cells and selected states.");
    text("dataManagementTitle","データ管理","Data Management");
    text("dataManagementNote","全作品・フォルダ・進捗・付箋・作業履歴を1つのJSONに保存します。","Save all projects, folders, progress, notes, and work history in one JSON file.");
    text("exportBackup","💾 バックアップ","💾 Backup");
    text("importBackup","📂 復元","📂 Restore");
    const hp=$("libraryHelpTitle");if(hp)hp.textContent=en?"Using Library":"Libraryの使い方";
    const hb=$("libraryHelpButton");if(hb)hb.setAttribute("aria-label",en?"Library Help":"Libraryの使い方");
    const hc=$("libraryHelpClose");if(hc)hc.setAttribute("aria-label",en?"Close":"閉じる");
    const items=$("libraryHelpModal")?.querySelectorAll(".help-item");
    const ja=[["プロジェクトを作る","右上の「＋」→「＋ プロジェクト」から新しいプロジェクトを作成します。"],["タップして開く","プロジェクト名をタップすると入力ページへ、フォルダ名をタップするとフォルダが開きます。"],["≡で整理","プロジェクトやフォルダの≡をドラッグすると、上下に自由に並び替えできます。プロジェクトはフォルダへ重ねて移動することもできます。"],["フォルダで整理","「＋」からフォルダを作成できます。プロジェクトをフォルダにまとめて整理できます。"],["プロジェクトを編集","プロジェクト右上の設定ボタンから、プロジェクト名・ページ・日付・工程を変更できます。"],["Library設定","Library右上の設定ボタンからアプリ設定を開けます。新規プロジェクトの初期値やテーマカラー、データ管理などを設定できます。"],["新規プロジェクトのデフォルト","新しく作るプロジェクトの制作ページと工程の初期値を設定できます。作成後はプロジェクトごとに変更できます。"],["テーマカラー","完了セルや選択状態などに使うアクセントカラーを変更できます。"],["ゴミ箱","削除したプロジェクトやフォルダはゴミ箱へ移動します。必要なら復元できます。"],["バックアップ","設定の「データ管理」から、Library全体をJSONファイルにバックアップ・復元できます。"]];
    const ee=[["Create a project","Use + → + Project at the top right to create a new project."],["Tap to open","Tap a project name to open its input page, or tap a folder name to open the folder."],["Reorder with ≡","Drag ≡ on a project or folder to reorder items freely. You can also drag a project onto a folder to move it there."],["Organize with folders","Create folders from the + button and organize projects inside them."],["Edit a project","Use the settings button at the top right of a project to change its name, pages, dates, and stages."],["Library settings","Open App Settings with the settings button at the top right of Library. You can set new-project defaults, the theme color, data management, and more."],["New Project Defaults","Set the initial page range and stages for newly created projects. You can change them per project after creation."],["Theme Color","Change the accent color used for completed cells, selected states, and other highlights."],["Trash","Deleted projects and folders move to Trash and can be restored when needed."],["Backup","Use Data Management in Settings to back up or restore the entire Library as a JSON file."]];
    items?.forEach((it,i)=>{const a=(en?ee:ja)[i];if(!a)return;it.querySelector(".help-item-title").textContent=a[0];it.querySelector(".help-item-text").textContent=a[1]});
    document.querySelectorAll(".display-mode-option").forEach(btn=>{const label=en?btn.dataset.en:btn.dataset.ja;btn.textContent=label;btn.setAttribute("aria-label",label)});
    document.querySelectorAll(".theme-color-option").forEach(btn=>{const label=en?btn.dataset.en:btn.dataset.ja;btn.setAttribute("aria-label",label);btn.title=label;btn.querySelector(".theme-option-label").textContent=label});
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

  const langSelect=$("appLanguage");
  langSelect?.addEventListener("change",()=>{languageSettings.language=langSelect.value==="en"?"en":"ja";syncExtraLanguage()});
  new MutationObserver(syncExtraLanguage).observe(document.documentElement,{attributes:true,attributeFilter:["lang"]});
  syncExtraLanguage();
})();

/* v8: finish form editing consistently on mobile */
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
