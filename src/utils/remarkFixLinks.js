// utils/remarkFixLinks.js
import { visit } from 'unist-util-visit'

export default function remarkFixLinks() {
  return (tree) => {
    const base = import.meta.env.BASE_URL || '/'

    visit(tree, (node) => {
      // Handle links
      if (node.type === 'link' && node.url.startsWith('/')) {
        node.url = base.replace(/\/$/, '') + node.url
      }

      // Handle images
      if (node.type === 'image' && node.url.startsWith('/')) {
        node.url = base.replace(/\/$/, '') + node.url
      }
    })
  }
}

// export default function remarkFixLinks() {
//   return (tree) => {
//     const base = import.meta.env.BASE_URL || '/'
//     visit(tree, 'link', (node) => {
//       if (node.url.startsWith('/')) {
//         node.url = base.replace(/\/$/, '') + node.url
//       }
//     })
//   }
// }
