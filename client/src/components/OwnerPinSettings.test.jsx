import { webcrypto } from 'node:crypto'
import { fireEvent, render, screen } from '@testing-library/react'
import { setOwnerPin, hasOwnerPin } from '../security/ownerPin'
import { clearDb } from '../test-utils/correctionFixtures'
import OwnerPinSettings from './OwnerPinSettings'

beforeEach(async () => {
    vi.stubGlobal('crypto', webcrypto)
    await clearDb()
})
afterEach(() => vi.unstubAllGlobals())

const type = (label, value) => fireEvent.change(screen.getByLabelText(label), { target: { value } })

test('sets a first PIN', async () => {
    render(<OwnerPinSettings />)

    type('New PIN', '4821')
    type('Confirm new PIN', '4821')
    fireEvent.click(await screen.findByRole('button', { name: 'Set PIN' }))

    expect(await screen.findByText('Owner PIN saved')).toBeInTheDocument()
    expect(await hasOwnerPin()).toBe(true)
})

test('two different PINs are refused', async () => {
    render(<OwnerPinSettings />)

    type('New PIN', '4821')
    type('Confirm new PIN', '1234')
    fireEvent.click(await screen.findByRole('button', { name: 'Set PIN' }))

    expect(await screen.findByRole('alert')).toHaveTextContent('do not match')
    expect(await hasOwnerPin()).toBe(false)
})

test('changing an existing PIN needs the current one', async () => {
    await setOwnerPin('4821')
    render(<OwnerPinSettings />)

    await screen.findByLabelText('Current PIN')
    type('Current PIN', '0000')
    type('New PIN', '9999')
    type('Confirm new PIN', '9999')
    fireEvent.click(screen.getByRole('button', { name: 'Change PIN' }))
    expect(await screen.findByRole('alert')).toHaveTextContent('Wrong PIN')

    type('Current PIN', '4821')
    fireEvent.click(screen.getByRole('button', { name: 'Change PIN' }))
    expect(await screen.findByText('Owner PIN saved')).toBeInTheDocument()
})