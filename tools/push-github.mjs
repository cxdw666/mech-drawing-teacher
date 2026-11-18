#!/usr/bin/env node
/**
 * 一条命令把仓库发布到 GitHub（不需要装 git）。
 *
 *   Windows PowerShell:
 *     $env:GITHUB_TOKEN="ghp_xxx"; node tools/push-github.mjs
 *   Git Bash / macOS / Linux:
 *     GITHUB_TOKEN=ghp_xxx node tools/push-github.mjs
 *
 * token 只需 classic 勾选 repo 一项；建议发布完就删掉。
 */
import fs from 'node:fs';
import path from 'node:path';

const TOKEN = process.env.GITHUB_TOKEN;
const OWNER = process.env.REPO_OWNER || 'cxdw666';
const REPO = process.env.REPO_NAME || 'mech-drawing-teacher';
if (!TOKEN) { console.error('缺少 GITHUB_TOKEN 环境变量'); process.exit(1); }

const root = path.resolve(import.meta.dirname, '..');
const SKIP_DIRS = new Set(['node_modules', '.git', 'runs']);
const SKIP_FILES = new Set(['.DS_Store', 'Thumbs.db']);

function walk(dir, base, acc) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) { if (!SKIP_DIRS.has(e.name)) walk(p, base, acc); }
    else if (!SKIP_FILES.has(e.name) && !e.name.endsWith('.zip')) acc.push(path.relative(base, p));
  }
  return acc;
}

const api = (p, opt) => fetch('https://api.github.com' + p, Object.assign({
  headers: { Authorization: 'Bearer ' + TOKEN, Accept: 'application/vnd.github+json',
             'X-GitHub-Api-Version': '2022-11-28', 'User-Agent': 'dsh-push' }
}, opt || {}));

async function ensureRepo() {
  const r = await api('/repos/' + OWNER + '/' + REPO);
  if (r.ok) { console.log('仓库已存在，直接上传'); return; }
  const c = await api('/user/repos', { method: 'POST', body: JSON.stringify({
    name: REPO, description: '机械制图 / 画法几何 / 工程图学教学 agent：可验收提示词 + 三视图三维还原 + 评测集',
    private: false, has_issues: true, has_wiki: false }) });
  if (!c.ok) { console.error('建库失败:', c.status, (await c.text()).slice(0, 300)); process.exit(1); }
  console.log('已创建仓库 ' + OWNER + '/' + REPO);
}

async function putFile(rel) {
  const buf = fs.readFileSync(path.join(root, rel));
  const body = JSON.stringify({
    message: 'add ' + rel,
    content: buf.toString('base64'),
    branch: 'main'
  });
  let r = await api('/repos/' + OWNER + '/' + REPO + '/contents/' + rel.split(path.sep).join('/'), { method: 'PUT', body });
  if (r.status === 422 || r.status === 409) {   // 已存在 → 取 sha 后覆盖
    const g = await api('/repos/' + OWNER + '/' + REPO + '/contents/' + rel.split(path.sep).join('/'));
    if (g.ok) {
      const sha = (await g.json()).sha;
      r = await api('/repos/' + OWNER + '/' + REPO + '/contents/' + rel.split(path.sep).join('/'),
        { method: 'PUT', body: JSON.stringify({ message: 'update ' + rel, content: buf.toString('base64'), branch: 'main', sha }) });
    }
  }
  return r.ok;
}

async function main() {
  await ensureRepo();
  const files = walk(root, root, []).sort();
  console.log('准备上传 ' + files.length + ' 个文件（逐个调用 Contents API）…');
  let ok = 0, fail = [];
  for (let i = 0; i < files.length; i++) {
    const f = files[i];
    const done = await putFile(f);
    if (done) ok++; else fail.push(f);
    if ((i + 1) % 10 === 0 || i === files.length - 1) console.log('  ' + (i + 1) + '/' + files.length + '  成功 ' + ok);
  }
  if (fail.length) console.error('失败 ' + fail.length + ' 个:', fail.slice(0, 8));

  // 开 GitHub Pages
  const pg = await api('/repos/' + OWNER + '/' + REPO + '/pages', {
    method: 'POST', body: JSON.stringify({ source: { branch: 'main', path: '/' } }) });
  if (pg.ok || pg.status === 409) console.log('GitHub Pages 已启用（构建需 1-2 分钟）');
  else console.log('Pages 未启用:', pg.status, (await pg.text()).slice(0, 200));

  console.log('\n仓库: https://github.com/' + OWNER + '/' + REPO);
  console.log('页面: https://' + OWNER + '.github.io/' + REPO + '/');
  console.log('三维: https://' + OWNER + '.github.io/' + REPO + '/viewer/pages/model-auto-5-1.html');
}

main().catch(e => { console.error(e); process.exit(1); });
