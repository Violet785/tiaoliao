export const emptyPreferences = () => ({ spice: '', tasteTag: '', foodTag: '', exclude: '' })

// 返回移除清空指令后的文本，允许「重置口味，改成重辣」继续处理新条件。
export function preferenceCommand(clause) {
  let reset = false
  const text = String(clause || '').replace(/(?:重置|清空|清除|取消|去掉|忘掉)[^，,。；;！？?!]{0,25}?(?:口味要求|口味条件|口味偏好|口味限制|口味|要求|条件|偏好|限制|忌口)/g, (match, offset, source) => {
    if (/(?:不要|别|不用|不想|不需要)$/.test(source.slice(0, offset))) return match
    reset = true; return ''
  }).replace(/(?:把)?[^，,。；;！？?!]{0,15}忌口(?:都|全部)?(?:忘掉|清掉|清空|取消)|重新开始|从头开始|重新来|重来|不限口味|口味不限|什么口味都行|不限制口味/g, (match, offset, source) => {
    if (/(?:不要|别|不用|不想|不需要)$/.test(source.slice(0, offset))) return match
    reset = true; return ''
  })
  if (/^(?:帮我|请|先)?(?:重置|重设|清空|清除|都可以|都行|口味都行|口味都可以|随便(?:配|来)?|无所谓|不限|不限制)(?:一下|了|吧|就行)?$/.test(text.trim())) return { reset: true, text: '' }
  return { reset, text }
}
