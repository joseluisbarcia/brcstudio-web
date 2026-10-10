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

/* Reversible silk scroll, iOS video priming, no duplicate hero. */
(() => {
 const section=document.querySelector('#silk-transition');
 const film=document.querySelector('#silk-film');
 const heroTitle=document.querySelector('#hero-title');
 const still=section.querySelector('.silk-image');
 if(!section||!film)return;
 const reduce=matchMedia('(prefers-reduced-motion: reduce)');
 const saver=navigator.connection?.saveData;
 let duration=5.184,loaded=false,primed=false,queued=false,seek=-1;
 const clamp=x=>Math.max(0,Math.min(1,x));
 async function prime(){
  if(primed||reduce.matches||saver)return;
  primed=true;
  if(!loaded){loaded=true;film.src=film.dataset.src;film.load();}
  try {
   film.muted=true;
   await film.play();
   film.pause();
   film.classList.add('silk-ready');
   update();
  }catch{ /* poster remains visible if Safari blocks playback */ }
 }
 film.addEventListener('loadedmetadata',()=>{duration=film.duration||duration;update()});
 film.addEventListener('loadeddata',()=>{film.classList.add('silk-ready');update()});
 film.addEventListener('error',()=>film.classList.remove('silk-ready'));
 const io=new IntersectionObserver(es=>{
  if(es[0].isIntersecting){if(!loaded&&!saver&&!reduce.matches){loaded=true;film.src=film.dataset.src;film.load();}}
 },{rootMargin:'120% 0px'});
 io.observe(section);
 // iOS may require a gesture before the first frame can be sought.
 addEventListener('touchstart',prime,{passive:true,once:true});
 addEventListener('pointerdown',prime,{passive:true,once:true});
 function update(){
  queued=false;
  if(reduce.matches)return;
  const rect=section.getBoundingClientRect();
  const distance=Math.max(1,section.offsetHeight-innerHeight);
  const p=clamp(-rect.top/distance);
  const t=Math.max(0,Math.min(duration-.05,p*duration));
  // Visible motion even when Safari cannot seek the source MP4.
  if(still){still.style.transform='translate3d('+(-p*6)+'%, '+(-p*8)+'%, 0) scale('+(1+p*.27)+')';still.style.filter='brightness('+(1-p*.18)+')';}
  if(film.readyState>=1&&Math.abs(t-seek)>.035){
   try{film.currentTime=t;seek=t;}catch{}
  }
  // The original hero moves away naturally, without a second copy.
  if(heroTitle){
   const hero=heroTitle.closest('.hero').getBoundingClientRect();
   const fraction=clamp(-hero.top/Math.max(1,hero.height));
   heroTitle.style.transform='translate3d(0,'+(-fraction*65)+'px,0)';
  }
 }
 function schedule(){if(!queued){queued=true;requestAnimationFrame(update)}}
 addEventListener('scroll',schedule,{passive:true});
 addEventListener('resize',schedule,{passive:true});
 reduce.addEventListener('change',()=>{if(reduce.matches){film.pause();if(heroTitle)heroTitle.style.transform='';}else schedule()});
 schedule();
})();
