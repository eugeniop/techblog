import { useState, useEffect, useMemo } from 'react'
import { Link } from 'react-router-dom'
import Fuse from 'fuse.js'
import { formatDateWithOrdinal } from '../utils/formatDate'

function Home() {
  const [postList, setPostList] = useState([])
  const [query, setQuery] = useState('')
  const [activeTag, setActiveTag] = useState(null)

  // Fetch posts.json at runtime
  useEffect(() => {
    fetch('posts/posts.json')
      .then((res) => res.json())
      .then((posts) => {
        const sorted = posts
          .filter((post) => post.title && post.date && post.visible)
          .sort((a, b) => new Date(b.date) - new Date(a.date))
        setPostList(sorted)
      })
      .catch((err) => console.error('Failed to load posts.json', err))
  }, [])

  // Fuse search index
  const fuse = useMemo(() => {
    return new Fuse(postList, {
      keys: ['title', 'author', 'excerptPlain'],
      threshold: 0.3,
    })
  }, [postList])

  // Filtered posts by search and tag
  const filteredPosts = useMemo(() => {
    const base = query
      ? fuse.search(query).map((r) => r.item)
      : postList

    return activeTag
      ? base.filter((post) =>
          post.categories.includes(activeTag)
        )
      : base
  }, [query, postList, activeTag])

  const allTags = useMemo(() => {
    const tagSet = new Set()
    postList.forEach(post =>
      post.categories?.forEach(tag => tagSet.add(tag))
    )
    return Array.from(tagSet).sort()
  }, [postList])

  return (
    <div className="p-4 max-w-3xl mx-auto">
      <h1 className="text-3xl font-bold mb-4">eugeniop's Tech Blog</h1>
      <div className="mb-4">
        <a href="/about" className="text-blue-600 underline">About</a>
      </div>

      <input
        type="text"
        placeholder="Search posts..."
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        className="mb-4 w-full p-2 border rounded"
      />

      {/* Tag filter bar */}
      {allTags.length > 0 && (
        <div className="mb-6 flex flex-wrap gap-2">
          <button
            onClick={() => setActiveTag(null)}
            className={`px-3 py-1 rounded-full border ${
              !activeTag
                ? 'bg-blue-600 text-white'
                : 'bg-white text-gray-700'
            }`}
          >
            All
          </button>
          {allTags.map((tag) => (
            <button
              key={tag}
              onClick={() => setActiveTag(tag)}
              className={`px-3 py-1 rounded-full border ${
                activeTag === tag
                  ? 'bg-blue-600 text-white'
                  : 'bg-gray-100 text-gray-800'
              }`}
            >
              #{tag}
            </button>
          ))}
        </div>
      )}

      {/* Posts */}
      {filteredPosts.map((post) => (
        <div key={post.slug} className="mb-8">
          <h2 className="text-xl font-semibold text-blue-600 hover:underline">
            <Link to={`/post/${post.slug}${post.extension}`}>{post.title}</Link>
          </h2>
          <p className="text-gray-500 text-sm mb-2">
            By {post.author} on {formatDateWithOrdinal(post.date)}
          </p>

          {post.categories?.length > 0 && (
            <div className="mb-2 flex flex-wrap gap-2">
              {post.categories.map((tag) => (
                <span
                  key={tag}
                  className="bg-gray-200 text-gray-800 text-xs px-2 py-1 rounded-full"
                >
                  #{tag}
                </span>
              ))}
            </div>
          )}

          {/* Render HTML excerpt */}
          <div
            className="prose max-w-none"
            dangerouslySetInnerHTML={{ __html: post.excerpt }}
          />
        </div>
      ))}

      {filteredPosts.length === 0 && (
        <p className="text-gray-500">No posts found.</p>
      )}
    </div>
  )
}

export default Home