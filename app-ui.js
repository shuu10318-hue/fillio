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

