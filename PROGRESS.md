# Agent-Hub 优化任务进度

## 已完成

- [x] Phase 1: Agent Provider 抽象（claude/codex 可插拔接口）
- [x] Phase 2: Pipeline 编排（串行/并行、JSON 配置、UI 编辑器）
- [x] Phase 3: Git 分支策略（per-pipeline-run 临时分支 + autoMerge）

## 进行中

（无）

## 最近完成

- [x] Session 恢复 — step 间通过 `resumeFrom` 共享 Claude session，provider 自动提取 session_id
- [x] Structured Output — `output: { tag: "plan", parseJson: true }` 从 Agent 输出提取 XML tag 内容
- [x] Multi-iteration — `maxIterations` + `completionSignal` 循环执行直到 Agent 发出完成信号
- [x] Token Usage 追踪 — 记录 step 输入/输出 token，并扩展 stats API 与运行详情展示
- [x] Pipeline 导入/导出 — bundle 导出过滤敏感字段，导入自动匹配/创建 Agent
- [x] Pipeline JSON Schema — 发布 `public/pipeline.schema.json`
- [x] Agent 配置导入/导出 — 支持批量导出/导入并按 name 去重
- [x] 实时 SSE 推送 — 运行时推送 step/run 状态事件，前端 EventSource 订阅

## 待做

- [ ] 沙箱隔离（Docker provider）
- [ ] Completion Signal
- [ ] Prompt Shell 表达式
- [ ] Sandbox Provider 抽象
- [ ] Pipeline 模板市场
- [ ] Webhook/Hook 系统
