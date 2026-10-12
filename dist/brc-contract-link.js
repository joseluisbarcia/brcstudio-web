const field=document.getElementById('private-link');
document.getElementById('copy-link')?.addEventListener('click',async()=>{
 try{await navigator.clipboard.writeText(field.value);document.getElementById('copy-status').textContent='Enlace copiado. Envíalo solo al destinatario verificado.'}
 catch{field.focus();field.select();document.getElementById('copy-status').textContent='Selecciona y copia el enlace.'}
});
