import http from 'node:http';
import path from 'node:path';
import fs from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'../dist');
const port=Number(process.env.PORT||4173);
const types={'.html':'text/html; charset=utf-8','.js':'text/javascript; charset=utf-8','.css':'text/css; charset=utf-8','.svg':'image/svg+xml','.wav':'audio/wav','.png':'image/png','.json':'application/json'};
http.createServer(async(req,res)=>{try{const url=new URL(req.url,'http://localhost');const clean=decodeURIComponent(url.pathname);const file=path.resolve(root,`.${clean.endsWith('/')?clean+'index.html':clean}`);if(!file.startsWith(root+path.sep)){res.writeHead(403);res.end();return;}const body=await fs.readFile(file);res.writeHead(200,{'Content-Type':types[path.extname(file)]||'application/octet-stream','Cache-Control':'no-cache','X-Content-Type-Options':'nosniff'});res.end(body);}catch{res.writeHead(404);res.end('Not found. Run npm run build first.');}}).listen(port,'127.0.0.1',()=>console.log(`Bug War offline: http://127.0.0.1:${port} (Ctrl+C to stop)`));
