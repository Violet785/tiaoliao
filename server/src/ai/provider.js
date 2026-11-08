// 大模型调用层。只做一件事：把 messages 丢给 OpenAI 兼容接口，拿回文本。
//
// 用 fetch 而不是 SDK：少一个依赖，而且国内各家（DeepSeek / 通义 / 智谱）
// 的兼容接口都是同一个形状，换供应商只改 .env。
//
// 任何失败都返回 null，由上层降级到规则模式 —— AI 挂了不能把整个接口带崩。
import { aiConfig } from './config.js'

/**
 * @param {{role: 'system'|'user'|'assistant', content: string}[]} messages
 * @returns {Promise<string|null>} 模型回复；未配置或失败时为 null
 */
export async function chat(messages, { temperature = 0.6, maxTokens = 700, timeoutMs = aiConfig.timeout, responseFormat } = {}) {
  if (!aiConfig.enabled) return null

  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), timeoutMs)

  try {
    const res = await fetch(`${aiConfig.baseUrl}/chat/completions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${aiConfig.apiKey}`,
      },
      body: JSON.stringify({
        model: aiConfig.model,
        messages,
        temperature,
        max_tokens: maxTokens,
        ...(responseFormat ? { response_format: responseFormat } : {}),
      }),
      signal: controller.signal,
    })

    if (!res.ok) {
      // 401/429/超时都走降级，不向上抛 —— 页面上会显示「规则模式」
      return null
    }

    const data = await res.json()
    const text = data?.choices?.[0]?.message?.content
    return typeof text === 'string' && text.trim() ? text.trim() : null
  } catch {
    return null
  } finally {
    clearTimeout(timer)
  }
}

export default { chat }
