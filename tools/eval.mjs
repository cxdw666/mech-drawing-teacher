#!/usr/bin/env node
/**
 * 批量跑验收用例：把 prompts/ 里的提示词当 system，逐条发 evals/cases.json 的输入，落盘原始输出。
 *
 * 用法：
 *   node tools/eval.mjs                    # 全部用例，各 1 次
 *   node tools/eval.mjs --runs 3           # 各 3 次（否定约束要看稳定性）
 *   node tools/eval.mjs --case 1-2 --runs 3
 *   node tools/eval.mjs --model qwen3.8-max
 *
 * 判据是人看的：脚本只负责收样本 + 打几个关键词提示，不给结论。
 */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const args = process.argv.slice(2);
const arg = (n, d) => { const i = args.indexOf('--' + n); return i >= 0 ? args[i + 1] : d; };
const RUNS = Number(arg('runs', 1));
const ONLY = arg('case', null);
const MODEL = arg('model', process.env.EVAL_MODEL || 'deepseek-v4-pro');
const PROMPT_FILE = arg('prompt', 'prompts/core-v0.2.md');
const MAXTOK = Number(arg('max-tokens', 12000));
const TEMPERATURE = arg('temperature', '0.3');   // 传 none 表示不发这个参数（部分模型不支持）
const BASE = process.env.DASHSCOPE_BASE || 'https://dashscope.aliyuncs.com/compatible-mode/v1';

function apiKey() {
  if (process.env.DASHSCOPE_API_KEY) return process.env.DASHSCOPE_API_KEY;
  const f = path.join(os.homedir(), '.dsh', '.credentials.yaml');
  const m = fs.readFileSync(f, 'utf8').match(/^\s*QWEN_TOKEN_PLAN_CN_API_KEY:\s*(\S+)/m);
  if (m) return m[1].replace(/["']/g, '');
  throw new Error('找不到密钥：设置 DASHSCOPE_API_KEY 环境变量');
}

const root = path.resolve(import.meta.dirname, '..');
const system = fs.readFileSync(path.join(root, PROMPT_FILE), 'utf8');
const cases = JSON.parse(fs.readFileSync(path.join(root, 'evals', 'cases.json'), 'utf8')).cases
  .filter(c => !ONLY || c.id === ONLY);
const stamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
const outDir = path.join(root, 'evals', 'runs', stamp);
fs.mkdirSync(outDir, { recursive: true });

const sleep = (ms) => new Promise(r => setTimeout(r, ms));
const call = async (input, attempt = 1) => {
  try {
    const r = await fetch(BASE + '/chat/completions', {
      method: 'POST',
      headers: { Authorization: 'Bearer ' + apiKey(), 'Content-Type': 'application/json' },
      body: JSON.stringify(Object.assign(
        { model: MODEL, max_tokens: MAXTOK * Math.pow(2, attempt - 1),
          messages: [{ role: 'system', content: system }, { role: 'user', content: input }] },
        TEMPERATURE === 'none' ? {} : { temperature: Number(TEMPERATURE) })),
      signal: AbortSignal.timeout(240000),
    });
    if (!r.ok) {
      const body = (await r.text()).slice(0, 300);
      if (r.status >= 500 && attempt < 4) { await sleep(2000 * attempt); return call(input, attempt + 1); }
      throw new Error('HTTP ' + r.status + ' ' + body);
    }
    const j = await r.json();
    const choice = j.choices[0];
    const text = choice.message.content || '';
    if (choice.finish_reason === 'length' && attempt < 4) {
      await sleep(1000 * attempt);
      return call(input, attempt + 1);   // 被截断：加倍额度重跑，不拿半截输出当结果
    }
    if (!text.trim()) {
      if (attempt < 4) { await sleep(1500 * attempt); return call(input, attempt + 1); }
      throw new Error('空输出（finish_reason=' + choice.finish_reason + '，多半是 max_tokens 被思考过程吃光）');
    }
    return text;
  } catch (e) {
    if (attempt < 4) { await sleep(2000 * attempt); return call(input, attempt + 1); }
    throw new Error(String(e.message || e) + '（已重试 3 次）');
  }
};

const rows = [];
for (const c of cases) {
  for (let i = 1; i <= RUNS; i++) {
    const t0 = Date.now();
    let text = '', err = null;
    try { text = await call(c.input); } catch (e) { err = String(e.message || e); }
    const file = path.join(outDir, c.id + '-run' + i + '.md');
    fs.writeFileSync(file,
      '# 用例 ' + c.id + ' · ' + c.title + '\n\n**模型** ' + MODEL + ' · **次数** ' + i + '/' + RUNS +
      '\n\n## 输入\n\n```\n' + c.input + '\n```\n\n## 原始输出\n\n' + (err ? '调用失败：' + err : text) + '\n', 'utf8');
    const hit = c.autoHints.filter(h => text.includes(h));
    const miss = c.autoHints.filter(h => !text.includes(h));
    rows.push({ 用例: c.id, 次: i, 耗时: ((Date.now() - t0) / 1000).toFixed(0) + 's', 字数: text.length,
      命中: hit.join('/') || '-', 缺失: miss.join('/') || '-', 错误: err ? '✗' : '' });
  }
}
console.table(rows);
console.log('\n原始输出已存：' + path.relative(root, outDir));
console.log('下一步：逐份对着 evals/round-1.md 的判据打勾，结论填 evals/results.md。');
