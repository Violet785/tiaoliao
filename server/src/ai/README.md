# AI 模块（server/src/ai + app/src/ai）

一个可以整体删掉的独立功能：推荐、搜索资讯、对话。

## 目录

```
server/src/ai/
├── index.js      路由（挂载在 /api/ai，见 routes/index.js 一行）
├── config.js     环境变量
├── provider.js   大模型调用（OpenAI 兼容）
├── recommend.js  复用点赞/差评推荐服务，转换为对话所需字段
├── chat.js       先确认店铺，再按会话口味生成回复与配方名片
├── intent.js     调用模型提取受约束条件，校验、合并与失败备用
├── storeContext.js 店名、别名、歧义与店铺上下文确认
├── chatPreferences.js 会话中的口味与排除调料
├── search.js     搜索 + 资讯摘要
├── prompt.js     提示词
└── data.js       只读查询

app/src/ai/
├── api.js            三个接口的封装
├── chat-widget.vue   悬浮对话窗（首页、AI 页、店铺与配方详情）
└── recipe-card.vue   聊天中的配方名片、调料用量与操作入口

app/src/pages/ai/index.vue   独立搜索页（pages.json 已注册）
```

## 配置

不配置模型也能用。配置后，聊天实际调用模型把当前一句转换为口味、排除调料、允许调料及重置条件，采用 `response_format: json_schema` 约束输出并校验。先模型解析再应用用户本句明确规则，防止反读、不必要的重置或额外限制；只有文本有依据的条件才能进入筛选。店铺由已确认上下文和数据库确定，名片来自数据库。搜索摘要继续使用模型配置。

当前服务器沿用本地 `qwen2.5:0.5b`，小模型能力有限，使用短条件数组与少量示例降低解析难度；不会让它直接填写整套会话或生成配方。`AI_INTENT_TIMEOUT_MS` 默认 6500、最大 10000；每个进程同时处理一次模型解析，繁忙、超时、无效输出会保留规则备用。`understanding.source` 为 `model` 或 `rule`，并返回实际模型及已接受条件。只向模型发送当前一句和固定解析示例，不发送账号和私有互动记录。

店铺内「智能推荐」由 `services/recommendationService.js` 即时计算，使用当前账号对已发布配方的点赞和不喜欢，结合调料、辣咸浓画像与搭配标签排序。全站反馈可跨店学习，但候选只来自本店，筛选条件仍生效；直接排除点过不喜欢的配方，相似口味降权。匿名或没有历史时展示候选的热度与社区反馈，并明确说明尚未个性化；空店和全被排除时返回明确空状态。取消或切换投票后下一次请求立即重算，不调用大模型生成排序。

会话把店铺与本次口味独立保存。已有店铺时，未知短句按口味追问处理，只有明确换店或完整店名才改变范围；不再用口味词白名单猜测是否换店。口味修改按语句先后生效，支持全量重置、取消辣度以及重新允许调料。前台的重置操作使旧请求失效，防止迟到回复恢复旧状态；验证命令为后端 `npm run test:chat` 和前端 `npm run test:chat-session`。

忌口名称由已发布调料库实时提供，覆盖全名、简称及名称括号或斜线内的别名（如柠檬汁、青柠、芝麻油）。按最长名称匹配，具体的「不要蒜末」只排除蒜末，泛称「不要蒜」才排除蒜类。支持前置否定、后置忌口与重新允许，多轮最多保留128个排除项；新增调料审核发布后即可识别。模型候选只增加本句涉及的真实调料名称，验证后转换成数据库ID，失败时同一套全库解析仍生效。具体调料名中的「辣」不会单独改变整体辣度。

```bash
AI_BASE_URL=https://api.deepseek.com/v1   # 任何 OpenAI 兼容服务
AI_MODEL=deepseek-chat
AI_API_KEY=sk-xxxx                        # 留空 = 规则模式
AI_TIMEOUT=20000
AI_INTENT_TIMEOUT_MS=6500
```

### 本地小模型（Ollama）

不想用云端 key 时，在本机或服务器装 Ollama，指向它的 OpenAI 兼容接口：

```bash
AI_BASE_URL=http://127.0.0.1:11434/v1
AI_MODEL=qwen2.5:1.5b
AI_API_KEY=local        # 随便填，非空即视为启用
AI_TIMEOUT=60000        # CPU 推理慢，超时要放宽
```

内存与速度的参考（无 GPU 的 x86 服务器）：

| 模型 | 内存占用 | 2 核上的生成速度 |
|---|---|---|
| qwen2.5:0.5b | ~400 MB | 8–15 token/s |
| qwen2.5:1.5b | ~1.1 GB | 3–6 token/s |
| qwen2.5:3b | ~2.0 GB | 2–3 token/s，2G 机器会 OOM |

2 核 2G 的机器建议：1.5b + 2G swap，并给 Ollama 设
`OLLAMA_NUM_PARALLEL=1`、`OLLAMA_MAX_LOADED_MODELS=1`，否则并发请求会直接把内存打爆。

## 接口

| 方法 | 路径 | 说明 |
|---|---|---|
| GET | `/api/ai/status` | 是否启用模型 |
| GET | `/api/ai/recommend?limit=6` | 推荐列表（登录后按口味个性化） |
| GET | `/api/restaurants/:id/recommendations` | 店铺内推荐；支持口味、食材、辣度和排除调料，响应禁止共享缓存 |
| GET | `/api/ai/search?q=牛` | 店铺 + 配方 + 一句话摘要 |
| POST | `/api/ai/chat` | `{message, restaurantId?, preferences?}` → `{reply, restaurant, needsRestaurant, restaurantOptions, preferences, preferenceSummary, cards}`；名片包含调料、用量、配图与配方 ID |

## 删除方式

1. 删 `server/src/ai/`、`app/src/ai/`、`app/src/pages/ai/`
2. 去掉 `server/src/routes/index.js` 里的 `aiRoutes` 两行
3. 去掉 `app/src/pages.json` 里 `pages/ai/index` 一行
4. 首页移除 `<AiChat />` 与「问问 AI」按钮，`SiteHeader` 移除菜单项
5. 店铺和配方详情页移除 `AiChat` 导入与组件

主站其余部分不依赖本模块，删掉不影响任何现有功能。
