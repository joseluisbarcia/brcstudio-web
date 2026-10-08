import {readFileSync,existsSync} from 'node:fs';
import {execFileSync} from 'node:child_process';
const html=readFileSync('dist/index.html','utf8');
for(const match of html.matchAll(/(?:src|href|poster|data-src)="(\/[^"#]*)"/g)){if(!existsSync(`dist${match[1]}`))throw new Error(`Missing asset: ${match[1]}`)}
execFileSync(process.execPath,['--check','dist/app.js']);
console.log('Build OK: static assets and JavaScript validated. No runtime dependencies.');
