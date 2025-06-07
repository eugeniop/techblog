import { useParams } from 'react-router-dom'
import { useEffect, useState } from 'react'
import fm from 'front-matter'
import { remark } from 'remark'
import remarkRehype from 'remark-rehype'
import rehypeMermaid from 'rehype-mermaid';
import rehypeHighlight from 'rehype-highlight';
import rehypeStringify from 'rehype-stringify'
import remarkGfm from 'remark-gfm';
import { formatDateWithOrdinal } from '../utils/formatDate'
import remarkFixLinks from '../utils/remarkFixLinks.js'

const posts = import.meta.glob('../posts/*.md', {
  query: '?raw',
  import: 'default',
  eager: true,
})

function estimateReadTime(text) {
  const words = text.trim().split(/\s+/).length
  if (words < 360) return 'about 1 min'
  const minutes = Math.ceil(words / 180)
  return `About ${minutes} min${minutes > 1 ? 's' : ''}`
}

function PostPage() {
  const { slug } = useParams()
  const [post, setPost] = useState(null)

  useEffect(() => {
    const loadPost = async () => {

      const res = await fetch(`${import.meta.env.BASE_URL}posts/${slug}`)
      const raw = await res.text()

      const { attributes: data, body: content } = fm(raw)

      const processed = await remark()
        .use(remarkFixLinks, { base: import.meta.env.BASE_URL || '/' })
        .use(remarkRehype, { allowDangerousHtml: true })
        .use(remarkGfm)
        .use(rehypeHighlight)
        .use(rehypeMermaid)
        .use(rehypeStringify, { allowDangerousHtml: true })
        .process(content);

      const contentHtml = processed.toString()

      setPost({
        title: data.title,
        date: data.date,
        author: data.author,
        content: contentHtml,
        readTime: estimateReadTime(content),
        categories: Array.isArray(data.categories)
                      ? data.categories
                      : (data.categories || '').split(' ').filter(Boolean),
      })
    }

    loadPost()
  }, [slug])

  if (!post) return <p className="p-4">Loading post...</p>

  return (
    <div className="p-4">
      <h1 className="text-3xl font-bold mb-2">{post.title}</h1>
      <p className="text-gray-500 text-sm mb-2">
        Written by {post.author} on {formatDateWithOrdinal(post.date)} · {post.readTime} read
      </p>
      {post.categories && (
        <div className="mb-4 flex flex-wrap gap-2">
          {post.categories.map((tag) => (
            <span
              key={tag}
              className="bg-blue-100 text-blue-800 text-sm px-2 py-1 rounded-full"
            >
              #{tag}
            </span>
          ))}
        </div>
      )}
      <p className="mt-4">
        <a href={import.meta.env.BASE_URL} className="text-blue-600 underline">← Home</a>
      </p>
      <div
        className="prose max-w-none"
        dangerouslySetInnerHTML={{ __html: post.content }}
      />
    </div>
  )
}

export default PostPage
