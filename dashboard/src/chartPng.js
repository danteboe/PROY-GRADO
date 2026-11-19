const SVG = 'http://www.w3.org/2000/svg'

// La geometría de los elementos SVG ya está en sus atributos. Solo se copian
// las propiedades que afectan la presentación, también para miles de puntos.
const SVG_STYLES = [
  'clip-path', 'color', 'display', 'fill', 'fill-opacity', 'fill-rule',
  'font-family', 'font-size', 'font-style', 'font-weight', 'letter-spacing',
  'opacity', 'paint-order', 'stroke', 'stroke-dasharray', 'stroke-linecap',
  'stroke-linejoin', 'stroke-opacity', 'stroke-width', 'text-anchor', 'visibility',
]

function snapshot(element) {
  const clone = element.cloneNode(false)
  const style = getComputedStyle(element)
  const properties = element.ownerSVGElement ? SVG_STYLES : style
  for (const property of properties) {
    clone.style.setProperty(property, style.getPropertyValue(property))
  }
  clone.style.animation = 'none'
  clone.style.transition = 'none'

  for (const child of element.childNodes) {
    if (child.nodeType !== Node.ELEMENT_NODE) {
      clone.append(child.cloneNode())
    } else if (!child.hasAttribute('data-snapshot-ignore')) {
      const copy = snapshot(child)
      if (element.scrollLeft || element.scrollTop) {
        copy.style.translate = `${-element.scrollLeft}px ${-element.scrollTop}px`
      }
      if (element instanceof HTMLSelectElement && child instanceof HTMLOptionElement) {
        copy.toggleAttribute('selected', child.selected)
      }
      clone.append(copy)
    }
  }
  return clone
}

export async function chartPng(card) {
  const { width, height } = card.getBoundingClientRect()
  const canvas = document.createElement('canvas')
  canvas.width = Math.ceil(width)
  canvas.height = Math.ceil(height)

  const clone = snapshot(card)
  Object.assign(clone.style, {
    boxSizing: 'border-box',
    width: `${width}px`,
    height: `${height}px`,
    margin: '0',
  })

  const svg = document.createElementNS(SVG, 'svg')
  svg.setAttribute('width', canvas.width)
  svg.setAttribute('height', canvas.height)
  const content = document.createElementNS(SVG, 'foreignObject')
  content.setAttribute('width', '100%')
  content.setAttribute('height', '100%')
  content.append(clone)
  svg.append(content)

  const xml = new XMLSerializer().serializeToString(svg)
  const image = new Image()
  // Un data URL mantiene el canvas exportable al rasterizar HTML en SVG.
  image.src = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(xml)}`
  await image.decode()
  canvas.getContext('2d').drawImage(image, 0, 0)
  return new Promise((resolve, reject) => {
    canvas.toBlob((blob) => {
      if (blob) resolve(blob)
      else reject(new Error('No se pudo generar el PNG'))
    }, 'image/png')
  })
}
