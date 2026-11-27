import http from 'node:http'; import fs from 'node:fs'; import path from 'node:path';
const dir = process.argv[2]; const T = { '.webm': 'audio/webm', '.ogg': 'audio/ogg', '.m4a': 'audio/mp4', '.mp3': 'audio/mpeg', '.wav': 'audio/wav', '.html': 'text/html; charset=utf-8', '.json': 'application/json' };
http.createServer((q, r) => {
  r.setHeader('Access-Control-Allow-Origin', '*'); r.setHeader('Access-Control-Allow-Headers', '*');
  const u = new URL(q.url, 'http://x');
  if (q.method === 'POST') { const name = path.basename(u.searchParams.get('name') || 'out.bin'); const c = []; q.on('data', d => c.push(d)); q.on('end', () => { fs.writeFileSync(path.join(dir, name), Buffer.concat(c)); r.end('saved ' + name); }); return; }
  const f = path.join(dir, path.normalize(decodeURIComponent(u.pathname)).replace(/^([\/]\.\.)+/, ''));
  if (!f.startsWith(path.resolve(dir)) || !fs.existsSync(f) || fs.statSync(f).isDirectory()) { r.statusCode = 404; return r.end('404'); }
  r.setHeader('Content-Type', T[path.extname(f)] || 'application/octet-stream'); fs.createReadStream(f).pipe(r);
}).listen(5190, '127.0.0.1');
