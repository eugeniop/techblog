import { visit } from 'unist-util-visit'

export default function remarkFixLinks(options = {}) {
  const base = options.base || '/'

  return (tree) => {
    visit(tree, (node) => {
      if (node.type === 'link' && node.url.startsWith('/')) {
        node.url = base.replace(/\/$/, '') + node.url
      }
      if (node.type === 'image' && node.url.startsWith('/')) {
        node.url = base.replace(/\/$/, '') + node.url
      }
    })
  }
}

