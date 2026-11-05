// AI 模块的独立配置。
//
// 只从环境变量读，不改动主 config.js —— 这样 AI 功能整个目录可以单独删掉，
// 主项目其它部分不受影响。
//
// 没有配 AI_API_KEY 时，所有接口依然可用，只是走「规则模式」：
// 用数据库里的真实数据拼回答，不调用大模型。
export const aiConfig = {
  baseUrl: (process.env.AI_BASE_URL || 'https://api.deepseek.com/v1').replace(/\/+$/, ''),
  apiKey: process.env.AI_API_KEY || '',
  model: process.env.AI_MODEL || 'deepseek-chat',
  timeout: Number(process.env.AI_TIMEOUT || 20000),

  get enabled() {
    return Boolean(this.apiKey)
  },
}

export default aiConfig
