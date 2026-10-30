import { Navigate, Route, Routes } from 'react-router-dom'
import Layout from './components/Layout'
import BillingPage from './pages/BillingPage'
import SalesPage from './pages/SalesPage'
import SaleDetailPage from './pages/SaleDetailPage'
import ProductsPage from './pages/ProductsPage'
import NewProductPage from './pages/NewProductPage'
import ProductDetailPage from './pages/ProductDetailPage'
import LabelsPage from './pages/LabelsPage'
import SettingsPage from './pages/SettingsPage'
import StoragePage from './pages/StoragePage'
import ScannerTestPage from './pages/ScannerTestPage'

export default function App() {
  return (
    <Routes>
      <Route element={<Layout />}>
        <Route index element={<Navigate to="/products" replace />} />
        <Route path="/billing" element={<BillingPage />} />
        <Route path="/sales" element={<SalesPage />} />
        <Route path="/sales/:id" element={<SaleDetailPage />} />
        <Route path="/products" element={<ProductsPage />} />
        <Route path="/products/new" element={<NewProductPage />} />
        <Route path="/products/:id" element={<ProductDetailPage />} />
        <Route path="/labels" element={<LabelsPage />} />
        <Route path="/settings" element={<SettingsPage />} />
        <Route path="/storage" element={<StoragePage />} />
        <Route path="/scanner" element={<ScannerTestPage />} />
        <Route path="*" element={<p>Page not found</p>} />
      </Route>
    </Routes>
  )
}