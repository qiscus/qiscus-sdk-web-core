export function escapeHTML(str) {
  return str.replace(/<[^>]*\/?>([\s\S]*)?<\/.*?>/gi, function (match) {
    return match
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#039;')
  })
}

export function delayed(cb, timeout) {
  let timer = null
  return function (...args) {
    if (timer != null) clearTimeout(timer)
    timer = setTimeout(() => {
      cb(...args)
      timer = null
    }, timeout)
  }
}
