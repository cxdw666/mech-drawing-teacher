#!/usr/bin/env node
/** 极简静态服务器：挂整个仓库根目录，用于本地查看生成的 3D 页面。
 *  用法：node tools/serve.mjs [port]   默认 8770 */
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';

const root = path.resolve(import.meta.dirname, '..');
const port = Number(process.argv[2] || 8770);
const host = process.argv[3] || '0.0.0.0';   // 0.0.0.0 = 局域网可访问；只想本机用就传 127.0.0.1
const MIME = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8', '.md': 'text/plain; charset=utf-8',
  '.svg': 'image/svg+xml', '.png': 'image/png' };

http.createServer((req, res) => {
  let p = decodeURIComponent((req.url || '/').split('?')[0]);
  if (p === '/') p = '/viewer/index.html';
  const f = path.join(root, p);
  if (!f.startsWith(root)) { res.writeHead(403).end('forbidden'); return; }
  fs.readFile(f, (e, buf) => {
    if (e) { res.writeHead(404, { 'content-type': 'text/plain; charset=utf-8' }).end('not found: ' + p); return; }
    res.writeHead(200, { 'content-type': MIME[path.extname(f)] || 'application/octet-stream' });
    res.end(buf);
  });
}).listen(port, host, () => {
  const nets = os.networkInterfaces();
  const lan = [];
  for (const k in nets) for (const a of nets[k]) if (a.family === 'IPv4' && !a.internal) lan.push(a.address);
  console.log('serving ' + root + '  (bind ' + host + ')');
  console.log('  本机   http://127.0.0.1:' + port + '/viewer/pages/724-3.html');
  lan.forEach(function (ip) { console.log('  局域网 http://' + ip + ':' + port + '/viewer/pages/724-3.html'); });
  console.log('  手机连同一 WiFi 后打开上面"局域网"那一行');
});
