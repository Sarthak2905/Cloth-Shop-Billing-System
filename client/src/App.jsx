import { useEffect, useState } from 'react'

export default function App() {
  const [apiStatus, setApiStatus] = useState('checking...')

  useEffect(() => {
    fetch('http://localhost:5000/api/health')
      .then((res) => res.json())
      .then((data) => setApiStatus(data.status))
      .catch(() => setApiStatus('server not reachable'))
  }, [])

  return (
    <div className="min-h-screen bg-slate-100 flex items-center justify-center">
      <div className="bg-white rounded-xl shadow p-6 text-center">
        <h1 className="text-2xl font-bold">Clothing POS</h1>
        <p className="mt-2 text-slate-600">API status: {apiStatus}</p>
      </div>
    </div>
  )
}