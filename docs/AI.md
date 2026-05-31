# AI 功能

TraceMe 的核心产品方向是 AI-first 旅行规划：用户不需要先手工填完整旅行资料，而是先提供少量基础信息，由 AI 生成结构化草稿，再由用户确认落库。

## 入口

- `/trips/new`: 创建旅行入口，默认推荐使用 AI 生成旅行计划，也保留手动创建方式。
- `/trips/ai-plan`: AI 结构化旅行计划生成流程。
- `/trips/[id]/ai`: 旅行内 AI 助手，用于生成或保存旅行相关草稿。
- `/settings/ai`: 管理员配置 AI Provider、模型、开关和 API Key。

## AI 计划流程

1. 用户填写旅行目标、目的地、出发城市、开始/结束日期、人数、预算、节奏、偏好、禁忌、必去点和规避项。
2. 服务端调用 AI provider，生成 2-3 个可比较方案，每个方案包含每日行程、交通建议、预算估算、风险提醒和准备清单。
3. 草稿保存到 `AiPlanDraft`，状态为 `draft`，同时保留 AI 工作区中的方案和版本历史。
4. 用户查看方案评分，包括轻松度、预算匹配度、路线合理性、亲子/老人友好度和综合分。
5. 用户选择一个方案进入计划草稿，可以返回修改输入、重新生成、追问局部修改、回滚历史版本、丢弃草稿，或预览/下载完整方案。
6. 写入前页面展示 Trip、Destination、Place、Itinerary、Checklist、Budget、Route、Note 等变更预览。
7. 用户确认后，系统把选中的草稿写入正式旅行数据，并把草稿状态改为 `applied`。

确认前不会写入正式旅行模块。AI 结果始终视为草稿，实时票价、班次、酒店库存、开放时间、签证、保险和政策必须人工核验。

## Provider 配置

环境变量：

```env
AI_PROVIDER="openai"
AI_FEATURE_ENABLED="true"
OPENAI_API_KEY=""
OPENAI_MODEL="gpt-4.1-mini"
AI_CONFIG_ENCRYPTION_KEY=""
```

Provider：

- `openai`: 服务端调用 OpenAI Responses API。
- `mock`: 不需要 API Key，适合本地开发、演示和 E2E。

API Key 来源：

- 首选服务器环境变量 `OPENAI_API_KEY`。
- 管理员也可以在 `/settings/ai` 页面保存 API Key；此时必须配置 `AI_CONFIG_ENCRYPTION_KEY`，保存值会服务端加密。

## 安全边界

- API Key 只在服务端读取和使用。
- 前端只显示“已配置/未配置”状态，不显示密钥原文。
- AI 输入会提示用户不要填写证件号、手机号、订单号、API Key 等敏感信息。
- AI prompt 会经过敏感信息检测和脱敏处理。
- AI 不会自动读取上传文件内容。
- 公开分享页不会暴露 AI prompt 原文。
- AI 设置、测试和删除必须由管理员执行。

## 失败与降级

- 未配置 OpenAI Key 时，可切换到 `mock` provider 验证流程。
- Provider 调用失败时，草稿记录会保存失败状态或返回可读错误。
- 已生成草稿不等于已创建旅行；只有用户确认后才会落库。
- 方案选择、追问修改和回滚都保存在 AI 工作区版本历史中，便于对比和恢复。

## 测试覆盖

相关测试位于：

- `tests/unit/ai.test.ts`
- `tests/unit/ai-plan.test.ts`
- `tests/unit/stage18-ai-advanced.test.ts`
- `tests/e2e/ai.spec.ts`
- `tests/e2e/ai-plan.spec.ts`
