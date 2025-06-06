import { BrowserRouter as Router, Routes, Route } from 'react-router-dom'
import Home from './pages/Home'
import About from './pages/About'
import PostPage from './pages/PostPage'

function App() {
  return (
    <Router>
      <div className="min-h-screen flex flex-col">
        <main className="flex-grow">
          <Routes>
            <Route path="/" element={<Home />} />
            <Route path="/post/:slug" element={<PostPage />} />
            <Route path="/about" element={<About />} />
          </Routes>
        </main>

        {/* Footer */}
        <footer className="bg-gray-100 text-center text-sm text-gray-600 py-4 mt-8 border-t">
          © {new Date().getFullYear()} eugeniop's tech blog. All rights reserved.
        </footer>
      </div>
    </Router>
  )
}

export default App


// import { BrowserRouter as Router, Routes, Route } from 'react-router-dom'
// import Home from './pages/Home'
// import PostPage from './pages/PostPage'

// function App() {
//   return (
//     <Router>
//       <Routes>
//         <Route path="/" element={<Home />} />
//         <Route path="/post/:slug" element={<PostPage />} />
//       </Routes>
//     </Router>
//   )
// }

// export default App
