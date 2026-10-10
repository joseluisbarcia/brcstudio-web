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


// Scroll-controlled chrome sculpture: no WebGL, no video, no extra dependencies.
(() => {
 const section=document.querySelector('#chrome-transition');
 if(!section)return;
 const field=section.querySelector('.chrome-particles');
 const motion=window.matchMedia('(prefers-reduced-motion: reduce)');
 const lowData=navigator.connection?.saveData;
 const mobile=window.matchMedia('(max-width: 800px)').matches;
 const count=motion.matches||lowData?0:mobile?32:65;
 // Deterministic placement avoids visual jumps between visits.
 let seed=1976;const random=()=>{seed=(seed*1664525+1013904223)>>>0;return seed/4294967296;};
 const frag=document.createDocumentFragment();
 const particles=[];
 for(let i=0;i<count;i++){
  const p=document.createElement('i');p.className='chrome-particle';
  const size=1.4+random()*(mobile?4:6);
  p.style.setProperty('--size',size+'px');
  p.style.setProperty('--x',(10+random()*80)+'%');
  p.style.setProperty('--y',(8+random()*82)+'%');
  p.style.setProperty('--opacity',(.25+random()*.7).toFixed(2));
  p.style.setProperty('--dx',((random()-.5)*130).toFixed(0)+'px');
  p.style.setProperty('--dy',((random()-.5)*170).toFixed(0)+'px');
  particles.push({el:p,dx:parseFloat(p.style.getPropertyValue('--dx')),dy:parseFloat(p.style.getPropertyValue('--dy'))});
  frag.appendChild(p);
 }
 field.appendChild(frag);
 if(motion.matches)return;
 let visible=false,scheduled=false;
 const observer=new IntersectionObserver(entries=>{visible=entries[0].isIntersecting;if(visible)requestUpdate();},{rootMargin:'120px'});
 observer.observe(section);
 function update(){
  scheduled=false;if(!visible||document.hidden)return;
  const rect=section.getBoundingClientRect();
  const range=Math.max(1,rect.height-window.innerHeight*.5);
  const progress=Math.max(0,Math.min(1,(window.innerHeight*.65-rect.top)/range));
  section.style.setProperty('--chrome-progress',progress.toFixed(3));
  section.style.setProperty('--chrome-y',((progress-.5)*-38).toFixed(1)+'px');
  section.style.setProperty('--chrome-scale',(.88+progress*.17).toFixed(3));
  section.style.setProperty('--chrome-angle',((progress-.5)*-12).toFixed(2)+'deg');
  section.style.setProperty('--chrome-turn',((progress-.5)*20).toFixed(2)+'deg');
  section.style.setProperty('--chrome-skew',((progress-.5)*-3).toFixed(2)+'deg');
  section.style.setProperty('--chrome-line-opacity',(progress*.7).toFixed(2));
  for(const p of particles){p.el.style.setProperty('--px',((progress-.5)*p.dx).toFixed(1)+'px');p.el.style.setProperty('--py',((progress-.5)*p.dy).toFixed(1)+'px');}
 }
 function requestUpdate(){if(!scheduled){scheduled=true;requestAnimationFrame(update);}}
 window.addEventListener('scroll',requestUpdate,{passive:true});
 window.addEventListener('resize',requestUpdate,{passive:true});
 document.addEventListener('visibilitychange',requestUpdate);
})();
