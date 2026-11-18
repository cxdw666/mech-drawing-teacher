# Mechanical Drawing Teacher — a verifiable prompt

An open-source **prompt engineering project** for teaching mechanical drawing (engineering graphics), built around GB/T Chinese drawing standards.

Not another chatbot that casually talks about drafting. It is a teacher prompt split into 8 modules, each with an insertion point and acceptance criteria.

## Scope

**One audience: undergraduate engineering students** taking Mechanical Drawing / Descriptive Geometry / Engineering Graphics.

- Depth anchor: the undergraduate syllabus — rigorous enough for the course, not extended into engineering-practice topics, not simplified to school level.
- Other identities (vocational college, grad-school entrance exam, practising engineers) are still served, but answers stay at the undergraduate standard; register is not switched.
- Out-of-scope requests (FEA, process planning, corporate drafting rules) are downgraded: say it is beyond the course and only explain how it should be *annotated* on a drawing.

## The three failure modes it fixes

Generic LLMs fail at engineering graphics in predictable ways:

1. **Pretending to draw** — claiming "drawn to scale, ready for machining" when the output is text.
2. **Inventing standard numbers** — citing clauses that do not exist, so students cannot verify anything.
3. **Stopping at mnemonics** — repeating "length aligns, height levels, width equals", with nothing on *why* the rule exists.

Every rule here is a behavioural constraint aimed at those three, not a wish like "please be accurate".

## Quick start

1. Open `prompts/core-v0.1.md`
2. Copy it in full into any chat model (Claude / GPT / DeepSeek / Doubao) as system prompt or first message
3. Ask: "Which line type separates the view half from the section half in a half-section view?"

Want to know how far it goes? Read the acceptance criteria in `evals/round-1.md` — **the criteria are the capability boundary**.

## Layout

```
prompts/    paste-ready prompts (core = any chat model, full = long context)
docs/       MANUAL.md — module workbench, assembled prompt, acceptance table, roadmap
evals/      manual acceptance protocol and per-round cases (no API key needed)
skills/     packaged skill (produced in round 5)
ROADMAP.md  five rounds and their status
```

Chinese documentation: [README.zh-CN.md](README.zh-CN.md)

## Design stance

An LLM cannot produce a manufacturable drawing. "Accuracy" here rests on exactly three things: structured entity descriptions, orthographic consistency checks, and standard-clause cross-referencing. Any claim of "precisely drawn to scale" is treated as a hallucination.

## License

MIT
