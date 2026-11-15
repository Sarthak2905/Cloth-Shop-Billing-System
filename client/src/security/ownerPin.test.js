import { webcrypto } from 'node:crypto'
import { db } from '../db/db'
import { hasOwnerPin, setOwnerPin, verifyOwnerPin } from './ownerPin'

beforeEach(async () => {
  vi.stubGlobal('crypto', webcrypto)
  await Promise.all(db.tables.map((t) => t.clear()))
})
afterEach(() => vi.unstubAllGlobals())

test('there is no PIN at the start, and checking one says so', async () => {
  expect(await hasOwnerPin()).toBe(false)
  await expect(verifyOwnerPin('1234')).rejects.toMatchObject({ code: 'PIN_NOT_SET' })
})

test('a PIN is stored only as a salted hash', async () => {
  await setOwnerPin('4821')

  const row = await db.settings.get('ownerPin')
  expect(row.value.pin).toBeUndefined()
  expect(row.value.hash).toHaveLength(64)
  expect(row.value.salt).toHaveLength(32)
  expect(row.value.iterations).toBe(100000)
  expect(await hasOwnerPin()).toBe(true)
  expect(await verifyOwnerPin('4821')).toBe(true)
})

test('a PIN must be 4 to 6 digits', async () => {
  for (const bad of ['123', '1234567', '12a4', '']) {
    await expect(setOwnerPin(bad)).rejects.toMatchObject({ code: 'VALIDATION_ERROR' })
  }
  expect(await hasOwnerPin()).toBe(false)
})

test('a wrong PIN says how many tries are left', async () => {
  await setOwnerPin('4821')

  await expect(verifyOwnerPin('1111')).rejects.toMatchObject({
    code: 'PIN_WRONG',
    message: expect.stringContaining('4 tries left'),
  })
  await expect(verifyOwnerPin('1111')).rejects.toMatchObject({
    message: expect.stringContaining('3 tries left'),
  })
})

test('five wrong PINs lock it, and it opens again later', async () => {
  await setOwnerPin('4821')
  const t0 = 1_000_000

  for (let i = 0; i < 4; i += 1) {
    await expect(verifyOwnerPin('1111', t0)).rejects.toMatchObject({ code: 'PIN_WRONG' })
  }
  await expect(verifyOwnerPin('1111', t0)).rejects.toMatchObject({ code: 'PIN_LOCKED' })

  // Even the right PIN is refused while it is locked.
  await expect(verifyOwnerPin('4821', t0 + 60_000)).rejects.toMatchObject({
    code: 'PIN_LOCKED',
    message: expect.stringContaining('4 minutes'),
  })
  expect(await verifyOwnerPin('4821', t0 + 301_000)).toBe(true)
})

test('a right PIN clears the earlier wrong tries', async () => {
  await setOwnerPin('4821')

  await expect(verifyOwnerPin('1111')).rejects.toMatchObject({ code: 'PIN_WRONG' })
  expect(await verifyOwnerPin('4821')).toBe(true)
  await expect(verifyOwnerPin('1111')).rejects.toMatchObject({
    message: expect.stringContaining('4 tries left'),
  })
})

test('changing the PIN needs the current one', async () => {
  await setOwnerPin('4821')

  await expect(setOwnerPin('9999')).rejects.toMatchObject({ code: 'PIN_WRONG' })
  await expect(setOwnerPin('9999', { currentPin: '0000' })).rejects.toMatchObject({ code: 'PIN_WRONG' })

  await setOwnerPin('9999', { currentPin: '4821' })
  expect(await verifyOwnerPin('9999')).toBe(true)
  await expect(verifyOwnerPin('4821')).rejects.toMatchObject({ code: 'PIN_WRONG' })
})