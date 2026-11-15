import { webcrypto } from 'node:crypto'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { setOwnerPin } from '../security/ownerPin'
import { clearDb } from '../test-utils/correctionFixtures'
import CorrectBillPanel from './CorrectBillPanel'

beforeEach(async () => {
    vi.stubGlobal('crypto', webcrypto)
    await clearDb()
})
afterEach(() => vi.unstubAllGlobals())

function renderPanel(onAuthorized = vi.fn()) {
    render(
        <MemoryRouter>
            <CorrectBillPanel invoiceNumber="INV-000001" onAuthorized={onAuthorized} />
        </MemoryRouter>,
    )
    return onAuthorized
}
const type = (label, value) => fireEvent.change(screen.getByLabelText(label), { target: { value } })
const submit = () => fireEvent.click(screen.getByRole('button', { name: 'Continue' }))

test('asks you to set a PIN first when there is none', async () => {
    renderPanel()

    expect(await screen.findByText(/Set an owner PIN in Settings first/)).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Go to Settings' })).toBeInTheDocument()
})

test('a wrong PIN shows an error and does not continue', async () => {
    await setOwnerPin('4821')
    const onAuthorized = renderPanel()

    await screen.findByLabelText('Owner PIN')
    type('Owner PIN', '1111')
    submit()

    expect(await screen.findByRole('alert')).toHaveTextContent('Wrong PIN')
    expect(onAuthorized).not.toHaveBeenCalled()
})

test('the right PIN continues with the chosen reason', async () => {
    await setOwnerPin('4821')
    const onAuthorized = renderPanel()

    await screen.findByLabelText('Owner PIN')
    type('Reason', 'Wrong price')
    type('Owner PIN', '4821')
    submit()

    await waitFor(() => expect(onAuthorized).toHaveBeenCalledWith({ reason: 'Wrong price' }))
})

test('"Other" needs a written reason', async () => {
    await setOwnerPin('4821')
    const onAuthorized = renderPanel()

    await screen.findByLabelText('Owner PIN')
    type('Reason', 'Other')
    submit()
    expect(await screen.findByRole('alert')).toHaveTextContent('Please write the reason')
    expect(onAuthorized).not.toHaveBeenCalled()

    type('Write the reason', 'Customer changed mind')
    type('Owner PIN', '4821')
    submit()
    await waitFor(() => expect(onAuthorized).toHaveBeenCalledWith({ reason: 'Customer changed mind' }))
})

test('five wrong PINs lock the panel', async () => {
    await setOwnerPin('4821')
    renderPanel()
    await screen.findByLabelText('Owner PIN')

    const expected = ['4 tries left', '3 tries left', '2 tries left', '1 try left', 'locked for 5 minutes']
    for (const text of expected) {
        type('Owner PIN', '1111')
        submit()
        await waitFor(() => expect(screen.getByRole('alert')).toHaveTextContent(text))
    }
})