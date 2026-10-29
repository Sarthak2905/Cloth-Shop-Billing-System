import { Link, useNavigate } from 'react-router-dom'
import ProductForm from '../components/ProductForm'
import { createProduct } from '../db/productRepo'

export default function NewProductPage() {
    const navigate = useNavigate()

    async function handleSubmit(values) {
        const product = await createProduct(values)
        navigate(`/products/${product.id}`)
    }

    return (
        <div className="space-y-4">
            <Link to="/products" className="text-sm text-blue-600">
                ← Back to products
            </Link>
            <h2 className="text-xl font-bold">New product</h2>
            <div className="rounded-xl bg-white p-4 shadow-sm">
                <ProductForm onSubmit={handleSubmit} submitLabel="Create product" />
            </div>
            <p className="text-sm text-slate-500">
                After creating the product you can add its size and colour variants.
            </p>
        </div>
    )
}