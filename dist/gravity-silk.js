// BRC Studio / Gravity Silk — isolated, scroll-driven WebGL experiment.
// Branch preview build trigger: 2026-10-11; never merge without visual approval.
const section=document.querySelector('#gravity-silk');
if(section){
const canvas=section.querySelector('canvas');
const fallback=section.querySelector('.silk-fallback');
const reduced=matchMedia('(prefers-reduced-motion: reduce)').matches;
const saveData=navigator.connection?.saveData===true;
const lowPower=matchMedia('(max-width: 700px)').matches;
let renderer,scene,camera,cloth,geometry,positions,original,observer,visible=false,raf=0,progress=0,contextLost=false;
const clamp=(v,a,b)=>Math.max(a,Math.min(b,v));
async function init(){
 if(reduced||saveData)return;
 try{
  const THREE=await import('https://cdn.jsdelivr.net/npm/three@0.169.0/build/three.module.js');
  renderer=new THREE.WebGLRenderer({canvas,alpha:true,antialias:!lowPower,powerPreference:'low-power',preserveDrawingBuffer:false});
  renderer.setPixelRatio(Math.min(devicePixelRatio,lowPower?1.35:1.7));
  renderer.outputColorSpace=THREE.SRGBColorSpace;
  renderer.toneMapping=THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure=1.15;
  scene=new THREE.Scene();
  camera=new THREE.PerspectiveCamera(34,1,.1,50);camera.position.set(0,0,9.4);
  const nx=lowPower?44:76,ny=lowPower?66:108;
  geometry=new THREE.PlaneGeometry(5.7,6.6,nx,ny);
  positions=geometry.attributes.position;
  original=new Float32Array(positions.array);
  const material=new THREE.MeshPhysicalMaterial({color:0x969696,metalness:.32,roughness:.33,side:THREE.DoubleSide,clearcoat:.45,clearcoatRoughness:.26});
  cloth=new THREE.Mesh(geometry,material);
  cloth.rotation.z=-.27;scene.add(cloth);
  scene.add(new THREE.HemisphereLight(0xffffff,0x080808,1.35));
  const lights=[[0xffffff,5.8,-3,4,6],[0xd5d5d5,3.1,4,-1,4],[0x777777,2.4,1,-5,2]];
  for(const [color,power,x,y,z] of lights){const light=new THREE.DirectionalLight(color,power);light.position.set(x,y,z);scene.add(light);}
  const resize=()=>{const w=canvas.clientWidth,h=canvas.clientHeight;if(!w||!h)return;renderer.setSize(w,h,false);camera.aspect=w/h;camera.updateProjectionMatrix();requestFrame();};
  const ro=new ResizeObserver(resize);ro.observe(canvas);
  canvas.addEventListener('webglcontextlost',e=>{e.preventDefault();contextLost=true;cancelAnimationFrame(raf);canvas.style.opacity='0';fallback.style.opacity='1';},{passive:false});
  canvas.addEventListener('webglcontextrestored',()=>{contextLost=false;resize();});
  observer=new IntersectionObserver(e=>{visible=e[0].isIntersecting;if(visible)requestFrame();},{rootMargin:'150px'});
  observer.observe(section);
  window.addEventListener('scroll',requestFrame,{passive:true});
  window.addEventListener('resize',requestFrame,{passive:true});
  document.addEventListener('visibilitychange',requestFrame);
  resize();
 }catch(e){canvas.style.display='none';fallback.style.opacity='1';console.warn('Silk fallback:',e);}
}
function requestFrame(){if(!raf)raf=requestAnimationFrame(draw);}
function draw(){
 raf=0;if(!renderer||!visible||document.hidden||contextLost)return;
 const r=section.getBoundingClientRect();
 progress=clamp((innerHeight*.78-r.top)/Math.max(1,r.height-innerHeight*.2),0,1);
 const open=clamp((progress-.63)/.37,0,1);
 const p=positions.array;
 for(let i=0;i<p.length;i+=3){
  const x=original[i],y=original[i+1];
  const u=x/2.85,v=y/3.3;
  const folds=.54*Math.sin(u*10.5+v*4.5+progress*3.3)+.27*Math.sin(u*18-v*8+progress*4.8)+.14*Math.cos(v*16+u*8-progress*2.7);
  const billow=.8*Math.sin(v*2.8+progress*2.7)*Math.cos(u*2.4-progress*1.7);
  const taper=1-.18*Math.pow(Math.abs(v),2);
  p[i]=x*taper + .48*Math.sin(v*3.5+progress*2.4)+open*(Math.sign(x)*2.3+x*.35);
  p[i+1]=y*.84+.27*Math.sin(u*4+progress*3.4)+open*.38*Math.sin(u*3);
  p[i+2]=folds+billow+.55*Math.sin(u*3.3+v*2.2+progress*2.2);
 }
 positions.needsUpdate=true;geometry.computeVertexNormals();
 cloth.rotation.y=(progress-.5)*.66;
 cloth.rotation.x=(progress-.5)*.16;
 cloth.position.y=(progress-.5)*-.42;
 cloth.scale.setScalar(1-open*.12);
 renderer.render(scene,camera);
 canvas.style.opacity='1';fallback.style.opacity='0';
}
init();
}
