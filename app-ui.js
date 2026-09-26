/* fillio common UI helpers */

let modalPageScrollY=0;
function lockPageScroll(){
  if(document.body.dataset.modalScrollLocked==="1")return;
  modalPageScrollY=window.scrollY||document.documentElement.scrollTop||0;
  document.body.dataset.modalScrollLocked="1";
  document.body.style.position="fixed";
  document.body.style.top=`-${modalPageScrollY}px`;
  document.body.style.left="0";
  document.body.style.right="0";
  document.body.style.width="100%";
  document.body.style.overflow="hidden";
}
function unlockPageScroll(){
  if(document.body.dataset.modalScrollLocked!=="1")return;
  delete document.body.dataset.modalScrollLocked;
  document.body.style.position="";
  document.body.style.top="";
  document.body.style.left="";
  document.body.style.right="";
  document.body.style.width="";
  document.body.style.overflow="";
  window.scrollTo(0,modalPageScrollY);
}

/* Localized dialogs without touching user data */
const _alert=window.alert.bind(window),_confirm=window.confirm.bind(window);
window.alert=(msg)=>{
 if(uiLang()==="en"){
   msg=String(msg).replace("1作品500ページまでです。","Up to 500 pages per project.")
    .replace("工程は1つ以上必要です。","At least one stage is required.")
    .replace("フォルダ名を入力してください。","Enter a folder name.")
    .replace("❌ このバックアップファイルは読み込めませんでした。","❌ This backup file could not be read.")
    .replace("❌ バックアップを保存できませんでした。","❌ Backup could not be saved.")
    .replace("✅ 全作品のバックアップを保存しました。","✅ All projects were backed up.")
    .replace("✅ 全作品のバックアップを復元しました。","✅ All projects were restored.")
    .replace("✅ 1作品を新しいプロジェクトとして復元しました。","✅ One project was restored as a new project.");
 }
 return _alert(msg);
};
window.confirm=(msg)=>{
 if(uiLang()==="en"){
   msg=String(msg)
    .replace(/「(.+?)」を削除しますか？\n中の作品は作品一覧へ戻ります。/,'Delete “$1”?\\nProjects inside will be moved back to Projects.')
    .replace(/「(.+?)」を削除しますか？\nこの操作は元に戻せません。/,'Delete “$1”?\\nThis action cannot be undone.');
 }
 return _confirm(msg);
};
