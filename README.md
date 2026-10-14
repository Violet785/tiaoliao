# 蘸料

自助餐厅蘸料配方分享社区。找到你要去的那家店 → 看别人为**这家店**推荐的配方 → 照着配出来 → 配完打分。

> **核心洞察：配方必须绑定到具体餐馆。**
> 「芝麻酱两勺」在 A 店和 B 店含义完全不同 —— 有的店麻酱是纯的，得自己澥开；
> 有的店已经调过水了。这是本产品和普通菜谱 App 的根本区别，也决定了整个数据模型。

---

## 环境要求

| | 要求 | 说明 |
|---|---|---|
| Node | **≥ 22.5，推荐 24** | 后端用了 Node 内置的 `node:sqlite`，低版本没有 |
| npm | 任意 | |

**不需要装数据库。** SQLite 是 Node 自带的，没有任何原生模块要编译 —— `npm install` 只拉 2 个后端依赖和 6 个前端依赖。

---

## 跑起来

开**两个终端窗口**。

### 窗口 1 —— 后端

```powershell
cd server
npm install
npm run seed          # 灌调料表和标签（71 项调料 / 35 个标签），可反复跑
npm run seed:demo     # 可选：铺演示数据（4 家店 / 9 个配方 / 5 个账号）
npm run dev           # → http://localhost:3000
```

`npm run dev` 会自动跑数据库迁移，**不用单独执行 `migrate`**。

### 窗口 2 —— 前端

```powershell
cd app
npm install
npm run dev:h5        # → http://localhost:5173
```

### 然后打开

**http://localhost:5173**

（开发用 5173，改代码立刻生效。打包后 `http://localhost:3000` 也能打开同一份东西 —— 那是将来部署到服务器上的形态。）

**演示账号**：`majiang_lover` / `demo123456`
另外 4 个账号见 `server/src/seed/demo.js`，密码相同。

---

## 项目结构

```
蘸料/
├── server/                    后端 —— Express + node:sqlite
│   └── src/
│       ├── db/                连接单例 / 事务封装 / 版本化迁移执行器
│       ├── migrations/        001_init.sql …（加字段就加新文件，不改老的）
│       ├── services/          业务逻辑全在这里
│       ├── routes/            只做 HTTP 转接，不写业务
│       ├── middleware/        auth / 参数校验 / 统一错误出口
│       ├── constants.js       用量档位、幕序、类目配色 —— 前后端共用的口径
│       ├── seed/              调料表、标签；demo.js 是演示数据
│       └── scripts/           smoke（接口自测）/ db-info / reset
└── app/                       前端 —— uni-app + Vue3（一套代码出 H5 + 微信小程序）
    └── src/
        ├── api/               所有 HTTP 都走 request.js：注入 token、拆响应外壳、统一报错
        ├── pages/             页面
        ├── components/        跨页面复用
        ├── store/             Pinia（目前只有登录态）
        └── utils/             storage / feedback / restaurantMeta
```

**分层原则**：`routes` 不写业务，`services` 不碰 `req`/`res`。
这样同一个业务逻辑将来能从小程序、H5、后台管理三处调用。

---

## 上手前必须知道的几件事

这几条都是踩过坑才定下来的。绕开它们能省你半天。

### 1. 时间一律存 UTC ISO8601，带 `T` 和 `Z`

**不要**用 SQLite 的 `datetime('now','localtime')` —— 它产出 `2026-10-14 10:30:00`，
这个格式在 **iOS Safari 和微信内置浏览器**里 `new Date()` 返回 `Invalid Date`。
在 Chrome 上是好的，所以本地测不出来。

用 `strftime('%Y-%m-%dT%H:%M:%SZ','now')`。

### 2. 用量存 0–5 档位，不存毫升

用户在调料台没有量具，而且各店的勺子大小不一样。
档位定义在 `server/src/constants.js`，前端镜像在 `app/src/utils/amount.js`（**还没建，M6 时补**）。

改文案只改这两处，数据库存的是 level —— 所以历史配方显示不会跟着漂。

### 3. `heat_score` 和 `hot_score` 只差一个字母，含义完全不同

- **`heat_score`** = 辣度画像（0–100），和 `salt_score` / `rich_score` 并列，由配方里各调料的 `spicy_weight` 聚合而来
- **`hot_score`** = 热度排序分，列表按它排

这里写错过一次：卡片上的「热度」显示的其实是辣度，跟排序结果对不上。
改这两个字段前先看清楚是哪一个。

### 4. 状态字段用 `'published'`，不是 `'active'`

调料、标签、配方都是。写成 `'active'` 查不到任何东西，**而且不报错** —— 列表直接空掉。

### 5. 图标用单汉字 + 色块，不用 emoji

各版本微信对 emoji 的渲染差异大，而且 emoji 的字号不受 `font-size` 控制，排版会失控。
一个「蒜」字比任何图标都快，且跨端零差异。

### 6. uni-app 组件事件名不要用 `tap`

`tap` 是小程序的**原生点击事件**。组件 emit 一个叫 `tap` 的事件，
处理函数会被调用两次，第二次拿到的是事件对象而不是数据。
用 `select` / `action` 这类名字。**这个坑在 H5 上不会暴露，上小程序才炸。**

### 7. `node:sqlite` 的几个脾气

| 现象 | 应对 |
|---|---|
| 绑定 `true` / `undefined` **直接抛错**（不是尽力转换） | 用 `db/tx.js` 的 `bind()` |
| **没有** `db.transaction()` | 用 `withTx()` |
| `busy_timeout` 默认 0 → 并发写立刻 SQLITE_BUSY | `db/index.js` 已显式设为 5000 |
| 不自动创建 DB 父目录，路径不存在会启动崩 | `db/index.js` 已 `mkdirSync` |

### 8. 注释写「为什么」，不写「是什么」

全项目中文注释。
如果一段代码需要解释「做了什么」，先想想能不能改得更直白；
注释留给「为什么这么选」和「踩过什么坑」。

### 9. 单文件 500 行是个信号

超过就该拆。不是说 501 行会崩，是说一个文件长到这个程度，
通常意味着它兼任了太多职责。

---

## 当前进度

| 阶段 | 内容 | 状态 |
|---|---|---|
| M1–M3 | 后端：建表 / 中间件 / services / routes | ✅ 接口自测 78 项全绿 |
| M4 | 前端脚手架 + 请求封装 + 登录闭环 | ✅ |
| M5 | 餐馆：列表 / 详情 / 新建（含相似店去重拦截） | ✅ |
| **M6** | **配方：创作页 / 详情页 / 列表** | ⬜ 下一步 |
| **M7** | **★「照着配」全屏模式 —— 产品核心** | ⬜ |
| M8 | 评分 / 收藏 / 我的 / tabBar | ⬜ |

**已知限制**：配方卡片目前点不动 —— `pages/recipe/detail` 还不存在（M6）。

---

## 改完怎么验证

### 后端

```powershell
cd server
npm run smoke      # 78 项接口自测，跑完自动清理测试数据
npm run db:info    # 看库里各表行数
```

`smoke` 会真的起 HTTP 请求打一遍全部接口，包括注册登录、建店去重、评分聚合。
**加完接口记得往里补断言** —— 它曾经在 67 项全绿的情况下漏掉过两个真 bug。

### 前端

```powershell
cd app
npm run build:h5   # 能过就说明语法和引用没问题
```

### 其他命令

| 命令 | 干什么 |
|---|---|
| `npm run seed:demo -- --clean` | 只删演示数据，保留自己建的店和账号 |
| `npm run reset` | 删库重建（只剩调料表和标签） |

---

## 数据库放哪

`server/data/dev.db`（已在 `.gitignore` 里）。

**别把它放到 OneDrive / 坚果云同步目录** —— 文件锁会把库搞坏。
数据全部由 seed 脚本可复现，所以不需要提交进仓库；
新人 clone 下来跑一遍 `npm run seed` + `npm run seed:demo` 就能得到和你一样的数据。
