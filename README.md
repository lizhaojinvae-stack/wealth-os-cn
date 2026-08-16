# WEALTH OS

面向中国投资者的本地优先投资工作台，覆盖真实行情、自选分组、持仓管理、交互式K线、规则策略、DeepSeek辅助分析、公开资讯和金融知识课程。

> 本项目用于研究与学习，不构成投资建议，不承诺收益。行情和资讯来自第三方公开接口，生产使用前请自行确认数据许可、稳定性与合规要求。

## 功能

- 沪深主板、创业板、科创板、北交所及沪深ETF模糊搜索
- 自选股自定义分组、跨组移动、全字段排序与分页
- 持仓成本、持仓市值、浮动盈亏与分页
- 实时行情、五档盘口、指数详情、分时和多周期前复权K线
- K线本地缓存、十字光标、价位提示、缩放和拖拽
- 总市值、流通市值、换手率、主力净流入及多周期表现
- 规则证据层：均线、量能、支撑压力、触发与失效条件
- DeepSeek结构化分析：证据、消息影响、情景、风险和数据缺口
- 个股公开资讯、原文链接和关键词事件分类
- 从零基础到高阶的金融知识课程

## 项目结构

```text
app/
  api/
    analyze/route.ts   # DeepSeek服务端代理，密钥不会进入浏览器
    market/route.ts    # 行情、K线、搜索、盘口、资讯和区间表现
  page.tsx             # 单页投资工作台
  globals.css          # 主题与响应式样式
  layout.tsx           # 页面元数据
public/                # 图标和分享图
.env.example           # 环境变量模板，不含真实密钥
```

## 本地运行

要求 Node.js 22.13 或更高版本。

```bash
npm install
copy .env.example .env.local
npm run dev
```

停止本地开发服务：

```bash
npm run stop
```

浏览器访问 `http://localhost:3000/`。macOS/Linux 使用 `cp .env.example .env.local`。

## DeepSeek 配置

编辑项目根目录的 `.env.local`：

```env
DEEPSEEK_API_KEY=你的新密钥
DEEPSEEK_MODEL=deepseek-v4-pro
```

以后更换密钥只需修改这一处并重启服务。不要把真实密钥写入源代码、`.env.example`、README、提交记录或前端变量。`.env.local` 已被 `.gitignore` 排除。

DeepSeek只在策略室点击“生成AI分析”时调用。结果在当前浏览器缓存30分钟；普通行情约5秒刷新不会触发模型请求。若不配置密钥，行情、自选、持仓、K线、新闻、学习和规则证据层仍可使用。

部署时请在平台的 Secrets/Environment Variables 设置同名变量，不要上传 `.env.local`。

## 数据口径

| 数据 | 主要来源 | 更新策略 |
| --- | --- | --- |
| 行情、市值、估值、换手、资金流 | 东方财富 push2 | 页面约5秒轮询 |
| K线 | 东方财富 push2his，腾讯证券备用 | 本地缓存优先，后台更新 |
| 证券搜索 | 东方财富证券搜索，腾讯备用 | 输入防抖查询 |
| 五档盘口 | 东方财富 push2 | 约5秒轮询 |
| 新闻 | 东方财富公开资讯检索 | 切换股票立即请求，约5分钟更新 |
| AI分析 | DeepSeek Chat Completions | 用户主动生成，缓存30分钟 |

第三方免费接口可能限流、调整字段或暂时不可用。系统在缺少数据时显示暂无或数据不足，不生成假行情。

## AI分析边界

DeepSeek收到当前股票的数据快照，包括行情、估值、前复权K线统计、规则信号和公开新闻摘要。系统要求模型：只依据输入数据；区分事实、计算与推断；新闻不足时标记待核验；输出证据、风险、数据缺口和条件情景；禁止收益承诺。

规则证据层独立存在以便复核。AI结果不会修改行情、自动下单或回写策略参数。

## 本地数据

自选分组、持仓、自选日期与价格、K线、历史表现和AI分析缓存保存在浏览器 `localStorage`。清除站点数据会删除本地记录，不同设备不会自动同步。

## 常用命令

```bash
npm run dev
npm run build
npm run lint
```

## GitHub 与部署

提交前用 `git status` 和 `git diff --cached` 确认 `.env.local` 没有进入提交。部署到 Cloudflare/Sites 或其他平台时配置 `DEEPSEEK_API_KEY` 与可选的 `DEEPSEEK_MODEL` 环境变量。

## 安全提醒

- 已粘贴到聊天、工单或公开位置的密钥应立即轮换。
- 不要创建 `NEXT_PUBLIC_DEEPSEEK_API_KEY`，否则密钥会进入浏览器。
- 公开部署建议增加身份验证、速率限制和用量预算。
- 对外服务前应审查第三方行情与资讯接口的使用条款。

## 参考

- [DeepSeek Chat Completions](https://api-docs.deepseek.com/api/create-chat-completion)
- [DeepSeek JSON Output](https://api-docs.deepseek.com/guides/json_mode)
- [vinext](https://github.com/cloudflare/vinext)
