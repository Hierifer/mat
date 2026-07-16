/**
 * SVG symbol 自动注册（清单式，无需 iconfont.cn 项目导出）。
 *
 * 把单个 SVG 文件放进本目录，文件名即图标名：
 *   setting.svg -> <icon-font name="setting" />
 *
 * 写死的 fill / fill-opacity 会在注册时被移除，颜色跟随 currentColor
 * （fill="none" 会保留，以免破坏描边类图标）。
 */
const svgs = import.meta.glob('./*.svg', { query: '?raw', import: 'default', eager: true })

function buildSymbols() {
  const parser = new DOMParser()
  let html = ''
  for (const [path, raw] of Object.entries(svgs)) {
    const name = path.replace(/^\.\//, '').replace(/\.svg$/, '')
    const doc = parser.parseFromString(raw, 'image/svg+xml')
    const svg = doc.documentElement
    if (svg.nodeName !== 'svg') continue
    for (const el of svg.querySelectorAll('[fill], [fill-opacity]')) {
      if (el.getAttribute('fill') !== 'none') el.removeAttribute('fill')
      el.removeAttribute('fill-opacity')
    }
    const viewBox = svg.getAttribute('viewBox') || '0 0 1024 1024'
    html += `<symbol id="icon-${name}" viewBox="${viewBox}">${svg.innerHTML}</symbol>`
  }
  return html
}

function inject() {
  const sprite = document.createElementNS('http://www.w3.org/2000/svg', 'svg')
  sprite.setAttribute('aria-hidden', 'true')
  sprite.style.position = 'absolute'
  sprite.style.width = '0'
  sprite.style.height = '0'
  sprite.style.overflow = 'hidden'
  sprite.innerHTML = buildSymbols()
  document.body.insertBefore(sprite, document.body.firstChild)
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', inject)
} else {
  inject()
}

export {}
