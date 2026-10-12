// The credential lives in the URL fragment: never in query strings, logs or referrers.
const token=location.hash.slice(1);
history.replaceState(null,'',location.pathname);
if(/^[a-f0-9]{64}$/.test(token)){
 document.getElementById('token').value=token;
 document.getElementById('open').hidden=false;
 document.getElementById('message').textContent='Pulsa para revisar la propuesta antes de decidir si la aceptas.';
}
