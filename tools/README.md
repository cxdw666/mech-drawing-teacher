# tools/

## eval.mjs · 批量跑验收

零依赖 Node 脚本：把 `prompts/core-*.md` 当 system，逐条发 `evals/cases.json` 的输入，原始输出落到 `evals/runs/<时间戳>/`，终端打印一张提示表。

```bash
export DASHSCOPE_API_KEY=sk-...        # 或省略，脚本会读 ~/.dsh/.credentials.yaml 里的 QWEN 套餐 key
node tools/eval.mjs                    # 全部用例各 1 次
node tools/eval.mjs --runs 3           # 各 3 次（否定约束必须看稳定性）
node tools/eval.mjs --case 1-2 --runs 3
node tools/eval.mjs --prompt prompts/exp/core-v0.1.2-test.md   # 跑实验分支
node tools/eval.mjs --model qwen3.8-max                        # 换模型对照
```

**它不给结论**。表里的「命中/缺失」只是关键词提示，判据仍要对着 `evals/round-1.md` 人眼打勾——提示词的主要失效是行为漂移，关键词匹配判不出来。

## 为什么不用现成的 agent CLI 跑

任何 agent CLI 都会在你的提示词外面再套一层它自己的指令（工具使用、计划输出、审批话术），测的就不再是你的提示词。做 prompt eval 要一个**干净的信道**：一次 HTTP，system + user，拿回原样文本。这也是 `eval.mjs` 只有 50 行、不引入依赖的原因。
