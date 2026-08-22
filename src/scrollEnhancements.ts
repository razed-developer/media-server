const isScrollableX=(element:HTMLElement)=>element.scrollWidth>element.clientWidth+2&&['auto','scroll'].includes(getComputedStyle(element).overflowX);

function updateHints(element:HTMLElement){
  if(!isScrollableX(element)){
    delete element.dataset.scrollLeft;
    delete element.dataset.scrollRight;
    return;
  }
  element.dataset.scrollLeft=element.scrollLeft>3?'true':'false';
  element.dataset.scrollRight=element.scrollLeft+element.clientWidth<element.scrollWidth-3?'true':'false';
}

function nearestHorizontal(target:EventTarget|null):HTMLElement|null{
  let node=target instanceof HTMLElement?target:null;
  while(node&&node!==document.body){
    if(isScrollableX(node))return node;
    node=node.parentElement;
  }
  return null;
}

export function installScrollEnhancements(){
  const refresh=()=>document.querySelectorAll<HTMLElement>('*').forEach(element=>{if(isScrollableX(element))updateHints(element)});
  const observer=new MutationObserver(()=>requestAnimationFrame(refresh));
  observer.observe(document.body,{childList:true,subtree:true});
  window.addEventListener('resize',refresh);
  document.addEventListener('scroll',event=>{if(event.target instanceof HTMLElement)updateHints(event.target)},true);
  document.addEventListener('wheel',event=>{
    const scroller=nearestHorizontal(event.target);
    if(!scroller)return;
    if(Math.abs(event.deltaY)<=Math.abs(event.deltaX))return;
    if(event.ctrlKey)return;
    const canMove=(event.deltaY>0&&scroller.scrollLeft+scroller.clientWidth<scroller.scrollWidth-2)||(event.deltaY<0&&scroller.scrollLeft>2);
    if(!canMove)return;
    event.preventDefault();
    scroller.scrollLeft+=event.deltaY;
    updateHints(scroller);
  },{passive:false,capture:true});
  requestAnimationFrame(refresh);
}
