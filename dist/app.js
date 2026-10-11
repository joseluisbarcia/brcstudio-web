const rail = document.querySelector('#carousel');
const slides = [...rail.querySelectorAll('.project')];
const dots = [...document.querySelectorAll('.dots button')];
const prev = document.querySelector('#prev');
const next = document.querySelector('#next');
const reduced = window.matchMedia('(prefers-reduced-motion: reduce)');
let active = 0;
function update(){
 const padding = parseFloat(getComputedStyle(rail).paddingLeft);
 const origin = rail.getBoundingClientRect().left + padding;
 active = slides.reduce((best, slide, index) => Math.abs(slide.getBoundingClientRect().left-origin) < Math.abs(slides[best].getBoundingClientRect().left-origin) ? index : best, 0);
 dots.forEach((dot,index)=>dot.setAttribute('aria-current',String(index===active)));
 prev.disabled = active === 0; next.disabled = active === slides.length-1;
 document.querySelector('#position').textContent = `${String(active+1).padStart(2,'0')} / ${String(slides.length).padStart(2,'0')}`;
}
function go(index){
 index = Math.max(0, Math.min(slides.length-1,index));
 const left = slides[index].getBoundingClientRect().left - rail.getBoundingClientRect().left + rail.scrollLeft - parseFloat(getComputedStyle(rail).paddingLeft);
 rail.scrollTo({left,behavior:reduced.matches?'instant':'smooth'});
}
prev.addEventListener('click',()=>go(active-1));next.addEventListener('click',()=>go(active+1));
dots.forEach((dot,index)=>dot.addEventListener('click',()=>go(index)));
rail.addEventListener('keydown',event=>{if(event.key==='ArrowRight'||event.key==='ArrowLeft'){event.preventDefault();go(active+(event.key==='ArrowRight'?1:-1));}});
let queued=false;rail.addEventListener('scroll',()=>{if(!queued){queued=true;requestAnimationFrame(()=>{update();queued=false;});}},{passive:true});
window.addEventListener('resize',update);update();
// Keep all five case studies on the same editorial grid, even with varying copy.
const cases = [...document.querySelectorAll('.project-case')];
function alignCases(){
 const bodies=cases.map(item=>item.querySelector('.case-body'));
 bodies.forEach(body=>{body.style.gridTemplateRows='';});
 if(!bodies.length)return;
 const maxChallenge=Math.max(...bodies.map(body=>body.children[1].scrollHeight));
 const maxSolution=Math.max(...bodies.map(body=>body.children[3].scrollHeight));
 bodies.forEach(body=>{
  body.style.gridTemplateRows=`auto ${Math.ceil(maxChallenge)}px auto ${Math.ceil(maxSolution)}px auto`;
 });
}
let caseResizePending=false;
function scheduleCaseAlignment(){
 if(caseResizePending)return;
 caseResizePending=true;
 requestAnimationFrame(()=>{caseResizePending=false;alignCases();});
}
cases.forEach(item=>item.addEventListener('toggle',()=>{
 // A single open case at a time avoids an unnecessarily tall carousel.
 if(item.open)cases.forEach(other=>{if(other!==item)other.open=false;});
 scheduleCaseAlignment();
}));
addEventListener('resize',scheduleCaseAlignment,{passive:true});
document.fonts?.ready.then(scheduleCaseAlignment);
scheduleCaseAlignment();

// Video bytes are requested only when the phone is actually visible.
const connection = navigator.connection;
const players = [...document.querySelectorAll('video[data-src]')].map(video => {
 const toggle = video.parentElement.querySelector('.video-toggle') || video.closest('.phone')?.querySelector('.video-toggle');
 const name = video.closest('.project').querySelector('h3').textContent;
 const trimStart = ['psymorph', 'reformas'].includes(video.id) ? 1 : 0;
 let startReady = false;
 function skipIntro(){
  if(!trimStart || startReady || video.readyState < 1)return;
  video.currentTime = trimStart;
  startReady = true;
 }
 video.addEventListener('loadedmetadata', skipIntro);
 let visible = false, userPaused = false;
 // Keep an independent poster above Safari's video surface until a frame is presented.
 let framePending = false;
 function revealFrame(){
  if(video.readyState >= 2 && !video.paused)video.parentElement.classList.add('video-ready');
 }
 function awaitFirstFrame(){
  if(video.parentElement.classList.contains('video-ready') || framePending)return;
  framePending = true;
  if('requestVideoFrameCallback' in video){
   video.requestVideoFrameCallback(()=>{framePending=false;revealFrame();});
  }else{
   requestAnimationFrame(()=>requestAnimationFrame(()=>{framePending=false;revealFrame();}));
  }
 }
 const autoplayAllowed = () => !reduced.matches && !connection?.saveData;
 function syncButton(){
  toggle.textContent = video.paused ? 'Reproducir' : 'Pausar';
  toggle.setAttribute('aria-label', `${video.paused ? 'Reproducir' : 'Pausar'} vídeo ${name}`);
 }
 async function play(){
  if(!video.getAttribute('src')){video.src=video.dataset.src;video.load();}
  if(trimStart && !startReady){
   try{if(video.readyState < 1)await new Promise((resolve,reject)=>{video.addEventListener('loadedmetadata',resolve,{once:true});video.addEventListener('error',reject,{once:true});});skipIntro();}catch{syncButton();return;}
  }
  try{await video.play();if(!visible||document.hidden)video.pause();}catch{syncButton();}
 }
 const observer = new IntersectionObserver(entries => {
  visible = entries[0].isIntersecting && entries[0].intersectionRatio >= .55;
  if(visible && autoplayAllowed() && !userPaused && !document.hidden)play();
  else if(!visible)video.pause();
 },{threshold:[0,.55]});
 observer.observe(video);
 toggle.addEventListener('click',()=>{if(video.paused){userPaused=false;play();}else{userPaused=true;video.pause();}});
 video.addEventListener('play',syncButton);video.addEventListener('pause',syncButton);
 video.addEventListener('timeupdate',()=>{
  if(trimStart && video.duration && video.currentTime >= video.duration - 0.08){
   video.currentTime = trimStart;
  }
 });
 video.addEventListener('seeked',()=>{if(trimStart && video.currentTime < trimStart)video.currentTime = trimStart;});
 video.addEventListener('playing',awaitFirstFrame);
 video.addEventListener('error',()=>{video.parentElement.classList.remove('video-ready');toggle.textContent='Reintentar';video.removeAttribute('src');startReady=false;});
 return {video,resume(){if(visible&&!userPaused&&autoplayAllowed())play();}};
});
document.addEventListener('visibilitychange',()=>players.forEach(player=>document.hidden?player.video.pause():player.resume()));
reduced.addEventListener('change',()=>{if(reduced.matches)players.forEach(player=>player.video.pause());});

/* Native continuous silk loop. The hero scrolls naturally with the page. */
(() => {
 const film=document.querySelector('#silk-film');
 const header=document.querySelector('.header');
 if(!film||!header)return;
 function play(){film.muted=true;film.playbackRate=1;film.play().catch(()=>{});}
 film.loop=true;
 film.setAttribute('loop','');
 film.addEventListener('canplay',play,{once:true});
 document.addEventListener('touchstart',play,{once:true,passive:true});
 document.addEventListener('visibilitychange',()=>{if(!document.hidden)play()});
 play();
 let scheduled=false;
 function updateHeader(){scheduled=false;header.classList.toggle('is-scrolled',window.scrollY>64);}
 addEventListener('scroll',()=>{if(!scheduled){scheduled=true;requestAnimationFrame(updateHeader)}},{passive:true});
 updateHeader();
})();
