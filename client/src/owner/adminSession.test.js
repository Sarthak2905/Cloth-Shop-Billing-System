import { afterEach, expect, test, vi } from 'vitest'
import { adminLogin, adminLogout, getAdminState, ownerGet } from './ownerApi'

const reply = (status, body) =>
  vi
    .fn()
    .mockResolvedValue({ ok: status < 300, status, json: async () => body })

afterEach(() => adminLogout())

test('an admin login opens the admin area', async () => {
  await adminLogin('owner', 'secret', {
    fetchImpl: reply(200, {
      token: 't',
      user: { role: 'admin', username: 'owner' },
    }),
  })
  expect(getAdminState().token).toBe('t')
})

test('a cashier login is refused and nothing is kept', async () => {
  await expect(
    adminLogin('shop', 'x', {
      fetchImpl: reply(200, { token: 't', user: { role: 'cashier' } }),
    }),
  ).rejects.toThrow('not an admin login')
  expect(getAdminState().token).toBeNull()
})

test('a wrong password shows the server message', async () => {
  await expect(
    adminLogin('owner', 'bad', {
      fetchImpl: reply(401, {
        error: { message: 'Wrong username or password' },
      }),
    }),
  ).rejects.toThrow('Wrong username or password')
})

test('the owner pages send the admin token and log out when the server refuses it', async () => {
  await adminLogin('owner', 'secret', {
    fetchImpl: reply(200, { token: 't', user: { role: 'admin' } }),
  })
  const ok = reply(200, { hello: 1 })
  await ownerGet('/dashboard', { fetchImpl: ok })
  expect(ok.mock.calls[0][1].headers.Authorization).toBe('Bearer t')

  await expect(
    ownerGet('/dashboard', { fetchImpl: reply(401, {}) }),
  ).rejects.toThrow('sign in again')
  expect(getAdminState().token).toBeNull()
})
