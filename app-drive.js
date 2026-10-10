"use strict";
// Web OAuth is isolated here; backup JSON and restore validation stay in app.js.
const DRIVE_CLIENT_ID="97752928572-42c9bi5eqic0q7r19mkgok87g7793hfe.apps.googleusercontent.com";
const DRIVE_SCOPE="https://www.googleapis.com/auth/drive.file";
const DRIVE_API="https://www.googleapis.com/drive/v3/files";
let driveTokenClient=null;
let driveAccessToken="";
let driveScriptPromise=null;
const driveText=(ja,en)=>uiLang()==="en"?en:ja;
function driveStatus(message){
  const box=document.getElementById("backupStatus");
  box.style.display="block";box.textContent=message;
}
function loadDriveIdentity(){
  if(window.google?.accounts?.oauth2)return Promise.resolve();
  if(driveScriptPromise)return driveScriptPromise;
  driveScriptPromise=new Promise((resolve,reject)=>{
    const script=document.createElement("script");
    script.src="https://accounts.google.com/gsi/client";
    script.async=true;
    script.onload=()=>window.google?.accounts?.oauth2?resolve():reject(new Error("Google Identity Services unavailable"));
    script.onerror=()=>reject(new Error("Google Identity Services could not load"));
    document.head.appendChild(script);
  }).catch(error=>{driveScriptPromise=null;throw error});
  return driveScriptPromise;
}
async function driveAuthorize(forceConsent=false){
  await loadDriveIdentity();
  return new Promise((resolve,reject)=>{
    if(!driveTokenClient){
      driveTokenClient=google.accounts.oauth2.initTokenClient({
        client_id:DRIVE_CLIENT_ID,scope:DRIVE_SCOPE,callback:()=>{}
      });
    }
    driveTokenClient.callback=response=>{
      if(response.error||!response.access_token){reject(new Error(response.error||"Google authorization failed"));return}
      driveAccessToken=response.access_token;
      resolve(driveAccessToken);
    };
    driveTokenClient.error_callback=error=>reject(new Error(error.type||"Google authorization cancelled"));
    driveTokenClient.requestAccessToken({prompt:forceConsent||!driveAccessToken?"consent":""});
  });
}
async function driveFetch(url,options={}){
  const response=await fetch(url,{...options,headers:{Authorization:`Bearer ${driveAccessToken}`,...options.headers}});
  if(!response.ok){
    const detail=await response.json().catch(()=>null);
    throw new Error(detail?.error?.message||`Google Drive HTTP ${response.status}`);
  }
  return response;
}
async function saveBackupToDrive(){
  const button=document.getElementById("driveExport");button.disabled=true;
  try{
    driveStatus(driveText("Google Driveに接続しています…","Connecting to Google Drive…"));
    await driveAuthorize();
    const name=`fillio-backup-${localDate()}-${new Date().toTimeString().slice(0,8).replaceAll(":", "")}.json`;
    const metadata={name,mimeType:"application/json",appProperties:{fillioBackup:"1"}};
    const boundary="fillio_backup_boundary";
    const body=`--${boundary}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n${JSON.stringify(metadata)}\r\n--${boundary}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n${JSON.stringify(makeBackup())}\r\n--${boundary}--`;
    await driveFetch("https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&fields=id,name",{method:"POST",headers:{"Content-Type":`multipart/related; boundary=${boundary}`},body});
    driveStatus(driveText(`Driveに保存しました：${name}`,`Saved to Drive: ${name}`));
  }catch(error){driveStatus(driveText("Driveへの保存に失敗：","Drive backup failed: ")+error.message)}
  finally{button.disabled=false}
}
async function chooseDriveBackup(){
  const button=document.getElementById("driveImport");button.disabled=true;
  const panel=document.getElementById("driveRestoreChoices");panel.hidden=true;panel.replaceChildren();
  try{
    driveStatus(driveText("バックアップ一覧を取得しています…","Loading Drive backups…"));
    await driveAuthorize();
    const query=new URLSearchParams({q:"trashed = false and appProperties has { key='fillioBackup' and value='1' }",fields:"nextPageToken,files(id,name,createdTime)",page_size:"100",orderBy:"createdTime desc"});
    const data=await (await driveFetch(`${DRIVE_API}?${query}`)).json();
    if(!data.files?.length){driveStatus(driveText("このアプリで保存したDriveバックアップはありません。","No Drive backups created by this app."));return}
    const select=document.createElement("select");select.setAttribute("aria-label",driveText("復元するバックアップ","Backup to restore"));
    for(const file of data.files){const opt=document.createElement("option");opt.value=file.id;opt.textContent=`${file.name} (${new Date(file.createdTime).toLocaleString()})`;select.appendChild(opt)}
    const restore=document.createElement("button");restore.type="button";restore.className="backup-button";restore.textContent=driveText("選択したバックアップを復元","Restore selected backup");
    restore.onclick=async()=>{
      if(!confirm(driveText("現在の全データを選択したバックアップで置き換えます。続行しますか？","Replace all current data with this backup?")))return;
      restore.disabled=true;
      try{
        const response=await driveFetch(`${DRIVE_API}/${encodeURIComponent(select.value)}?alt=media`);
        const data=await response.json();
        restoreBackup(data);
        panel.hidden=true;
        driveStatus(driveText("Driveバックアップを復元しました。","Drive backup restored."));
      }catch(error){driveStatus(driveText("復元に失敗：","Restore failed: ")+error.message)}
      finally{restore.disabled=false}
    };
    panel.append(select,restore);panel.hidden=false;
    driveStatus(driveText("復元するファイルを選択してください。","Select a backup to restore."));
  }catch(error){driveStatus(driveText("Driveの読み込みに失敗：","Drive load failed: ")+error.message)}
  finally{button.disabled=false}
}
document.getElementById("driveExport").addEventListener("click",saveBackupToDrive);
document.getElementById("driveImport").addEventListener("click",chooseDriveBackup);
