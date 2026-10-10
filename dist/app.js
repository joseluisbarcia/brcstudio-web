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
// Video bytes are requested only when the phone is actually visible.
const connection = navigator.connection;
const players = [...document.querySelectorAll('video[data-src]')].map(video => {
 const toggle = video.parentElement.querySelector('.video-toggle');
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

/* v6: reliable cinematic playback on iOS; scroll controls title, not video seeking. */
(() => {
 const section=document.querySelector('#silk-transition');
 const film=document.querySelector('#silk-film');
 const title=document.querySelector('#hero-title');
 const still=section?.querySelector('.silk-image');
 if(!section||!film||!title||!still)return;
 const reduce=matchMedia('(prefers-reduced-motion: reduce)');
 const clamp=n=>Math.max(0,Math.min(1,n));
 let scheduled=false,hasFrame=false,playing=false,fallbackTried=false;
 film.muted=true;
 film.defaultMuted=true;
 film.loop=true;
 film.playsInline=true;
 film.src=film.dataset.src;
 film.preload='auto';
 function showFrame(){hasFrame=true;film.classList.add('silk-ready')}
 film.addEventListener('playing',showFrame);
 film.addEventListener('loadeddata',()=>{if(film.readyState>=2)showFrame()});
 film.addEventListener('error',()=>{film.classList.remove('silk-ready');hasFrame=false;playing=false;if(!fallbackTried&&film.dataset.fallbackSrc){fallbackTried=true;film.src=film.dataset.fallbackSrc;film.load();start();}});
 async function start(){
  if(reduce.matches||playing)return;
  try{await film.play();playing=true;}catch{playing=false;}
 }
 function stop(){if(!film.paused)film.pause();playing=false}
 const observer=new IntersectionObserver(entries=>{
  if(entries[0].isIntersecting&&!document.hidden)start();
  else stop();
 },{threshold:0.01});
 observer.observe(section);
 // A real user gesture can unlock playback on restrictive iOS contexts.
 addEventListener('touchstart',()=>{if(section.getBoundingClientRect().bottom>0)start()},{once:true,passive:true});
 addEventListener('pointerdown',()=>{if(section.getBoundingClientRect().bottom>0)start()},{once:true,passive:true});
 document.addEventListener('visibilitychange',()=>{if(document.hidden)stop();else if(section.getBoundingClientRect().bottom>0)start()});
 function render(){
  scheduled=false;
  if(reduce.matches)return;
  const rect=section.getBoundingClientRect();
  const distance=Math.max(1,section.offsetHeight-innerHeight);
  const p=clamp(-rect.top/distance);
  const lift=Math.round(p*Math.min(innerHeight*.55,500));
  title.style.transform='translate3d(0,'+(-lift)+'px,0)';
  title.style.opacity=String(clamp((.96-p)/.10));
  still.style.transform='translate3d('+(-p*5)+'%,'+(-p*7)+'%,0) scale('+(1+p*.2)+')';
 }
 function schedule(){if(!scheduled){scheduled=true;requestAnimationFrame(render)}}
 addEventListener('scroll',schedule,{passive:true});
 addEventListener('resize',schedule,{passive:true});
 reduce.addEventListener('change',()=>{if(reduce.matches){stop();film.classList.remove('silk-ready');title.style.opacity='1';title.style.transform='none';}else{start();schedule()}});
 start();render();
})();
