import { Navigate, Route, Routes } from 'react-router-dom'
import Layout from './components/Layout'
import ProductsPage from './pages/ProductsPage'
import NewProductPage from './pages/NewProductPage'
import ProductDetailPage from './pages/ProductDetailPage'
import ScannerTestPage from './pages/ScannerTestPage'

export default function App() {
  return (
    <Routes>
      <Route element={<Layout />}>
        <Route index element={<Navigate to="/products" replace />} />
        <Route path="/products" element={<ProductsPage />} />
        <Route path="/products/new" element={<NewProductPage />} />
        <Route path="/products/:id" element={<ProductDetailPage />} />
        <Route path="/scanner" element={<ScannerTestPage />} />
        <Route path="*" element={<p>Page not found</p>} />
      </Route>
    </Routes>
  )
}