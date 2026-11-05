# AI 模块（server/src/ai + app/src/ai）

一个可以整体删掉的独立功能：推荐、搜索资讯、对话。

## 目录

```
server/src/ai/
├── index.js      路由（挂载在 /api/ai，见 routes/index.js 一行）
├── config.js     环境变量
├── provider.js   大模型调用（OpenAI 兼容）
├── recommend.js  规则召回与打分（口味向量 + 热度 + 新鲜度）
├── chat.js       对话：检索候选 → 模型组织语言，失败降级规则
├── search.js     搜索 + 资讯摘要
├── prompt.js     提示词
└── data.js       只读查询

app/src/ai/
├── api.js            三个接口的封装
└── chat-widget.vue   悬浮对话窗（首页、AI 页在用）

app/src/pages/ai/index.vue   独立搜索页（pages.json 已注册）
```

## 配置

不配置也能用，走「规则模式」：用库里真实数据拼回答，页面显示「演示模式」。

```bash
AI_BASE_URL=https://api.deepseek.com/v1   # 任何 OpenAI 兼容服务
AI_MODEL=deepseek-chat
AI_API_KEY=sk-xxxx                        # 留空 = 规则模式
AI_TIMEOUT=20000
```

## 接口

| 方法 | 路径 | 说明 |
|---|---|---|
| GET | `/api/ai/status` | 是否启用模型 |
| GET | `/api/ai/recommend?limit=6` | 推荐列表（登录后按口味个性化） |
| GET | `/api/ai/search?q=牛` | 店铺 + 配方 + 一句话摘要 |
| POST | `/api/ai/chat` | `{message, history}` → `{reply, mode}` |

## 删除方式

1. 删 `server/src/ai/`、`app/src/ai/`、`app/src/pages/ai/`
2. 去掉 `server/src/routes/index.js` 里的 `aiRoutes` 两行
3. 去掉 `app/src/pages.json` 里 `pages/ai/index` 一行
4. 首页移除 `<AiChat />` 与「问问 AI」按钮，`SiteHeader` 移除菜单项

主站其余部分不依赖本模块，删掉不影响任何现有功能。
