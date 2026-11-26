import { Navigate, Route, Routes } from 'react-router-dom'
import Layout from './components/Layout'
import BillingPage from './pages/BillingPage'
import SalesPage from './pages/SalesPage'
import SaleDetailPage from './pages/SaleDetailPage'
import ProductsPage from './pages/ProductsPage'
import AddStockPage from './pages/AddStockPage'
import ProductDetailPage from './pages/ProductDetailPage'
import LabelsPage from './pages/LabelsPage'
import SettingsPage from './pages/SettingsPage'
import SyncPage from './pages/SyncPage'
import BackupPage from './pages/BackupPage'
import StoragePage from './pages/StoragePage'
import ScannerTestPage from './pages/ScannerTestPage'
import ImportPage from './pages/ImportPage'
import CustomersPage from './pages/CustomersPage'
import CustomerDetailPage from './pages/CustomerDetailPage'
import AdminAreaPage from './pages/AdminAreaPage'


export default function App() {
  return (
    <Routes>
      <Route element={<Layout />}>
        <Route index element={<Navigate to="/products" replace />} />
        <Route path="/billing" element={<BillingPage />} />
        <Route path="/sales" element={<SalesPage />} />
        <Route path="/sales/:id" element={<SaleDetailPage />} />
        <Route path="/customers" element={<CustomersPage />} />
        <Route path="/customers/:key" element={<CustomerDetailPage />} />
        <Route path="/owner" element={<AdminAreaPage />} />
        <Route path="/products" element={<ProductsPage />} />
        <Route path="/stock/new" element={<AddStockPage />} />
        <Route path="/products/new" element={<AddStockPage />} />
        <Route path="/products/:id" element={<ProductDetailPage />} />
        <Route path="/labels" element={<LabelsPage />} />
        <Route path="/settings" element={<SettingsPage />} />
        <Route path="/sync" element={<SyncPage />} />
        <Route path="/backup" element={<BackupPage />} />
        <Route path="/storage" element={<StoragePage />} />
        <Route path="/scanner" element={<ScannerTestPage />} />
        <Route path="/import" element={<ImportPage />} />
        <Route path="*" element={<p>Page not found</p>} />
      </Route>
    </Routes>
  )
}