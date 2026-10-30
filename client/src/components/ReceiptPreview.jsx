export default function ReceiptPreview({ receipt }) {
    return (
        <div className="overflow-x-auto rounded-xl bg-white p-4 shadow-sm">
            <pre
                data-testid="receipt-preview"
                aria-label="Receipt preview"
                className="mx-auto w-fit rounded bg-amber-50 p-3 font-mono text-xs leading-snug text-black"
            >
                {receipt.text}
            </pre>
            {receipt.cut && (
                <p className="mt-2 text-center text-xs text-slate-400">- - - - - cut here - - - - -</p>
            )}
        </div>
    )
}