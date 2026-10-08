import {createServer} from 'node:http';
import {readFile,stat} from 'node:fs/promises';
import {resolve,extname} from 'node:path';
const root=resolve('dist');const types={'.html':'text/html','.js':'application/javascript','.css':'text/css','.svg':'image/svg+xml','.webp':'image/webp','.mp4':'video/mp4','.png':'image/png'};
createServer(async(req,res)=>{try{let path=resolve(root,'.'+decodeURIComponent(new URL(req.url,'http://localhost').pathname));if(!path.startsWith(root+'/')&&path!==root)throw Error();if((await stat(path)).isDirectory())path+='/index.html';let body=await readFile(path);res.writeHead(200,{'Content-Type':types[extname(path)]||'application/octet-stream','Content-Length':body.length});res.end(body);}catch{res.writeHead(404);res.end('Not found');}}).listen(4173,'0.0.0.0');
