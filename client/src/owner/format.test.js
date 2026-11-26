import { expect, test } from 'vitest'
import { change, dayName, rupees } from './format'

test('paise are shown as rupees', () => {
    expect(rupees(123456)).toBe('₹1,235')
    expect(rupees(0)).toBe('₹0')
    expect(rupees(undefined)).toBe('₹0')
})

test('change against an earlier amount', () => {
    expect(change(150, 100)).toEqual({ text: '+50%', up: true })
    expect(change(50, 100)).toEqual({ text: '-50%', up: false })
    expect(change(50, 0)).toBeNull()
})

test('day name from a date', () => {
    expect(dayName('2026-11-25')).toBe('Wed')
})