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
const video = document.querySelector('#onyra');const toggle = document.querySelector('#video-toggle');
let visible = false;let userPaused = false;
function loadVideo(){if(!video.getAttribute('src')){video.src=video.dataset.src;video.load();}}
function syncButton(){toggle.textContent=video.paused?'Reproducir':'Pausar';toggle.setAttribute('aria-label',`${video.paused?'Reproducir':'Pausar'} vídeo Onyra`);}
async function play(){loadVideo();try{await video.play();if(!visible||document.hidden)video.pause();}catch{syncButton();}}
const observer=new IntersectionObserver(entries=>{visible=entries[0].isIntersecting&&entries[0].intersectionRatio>=.55;if(visible){loadVideo();if(!reduced.matches&&!userPaused&&!document.hidden)play();}else video.pause();},{threshold:[0,.55]});observer.observe(video);
toggle.addEventListener('click',()=>{if(video.paused){userPaused=false;play();}else{userPaused=true;video.pause();}});
video.addEventListener('play',syncButton);video.addEventListener('pause',syncButton);video.addEventListener('error',()=>{toggle.textContent='Reintentar';});
document.addEventListener('visibilitychange',()=>{if(document.hidden)video.pause();else if(visible&&!userPaused&&!reduced.matches)play();});
reduced.addEventListener('change',()=>{if(reduced.matches)video.pause();});
