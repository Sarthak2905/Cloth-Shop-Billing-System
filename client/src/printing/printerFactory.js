import { createBrowserPrinter } from './browserPrinter'
import { createSimulatedPrinter } from './printerAdapter'

// Every printer the app can use. "browser" is the real printer through Windows.
export const PRINTER_CHOICES = {
  browser: 'Windows printer (real printer)',
  'simulated:ok': 'Simulated: working',
  'simulated:paper_out': 'Simulated: paper out',
  'simulated:offline': 'Simulated: printer offline',
}

// The two choices that make sense as a permanent setting.
export const SETTINGS_PRINTER_CHOICES = {
  browser: 'Windows printer (real printer)',
  'simulated:ok': 'Simulated (nothing is printed)',
}

export function createPrinter(choice = 'simulated:ok') {
  if (choice === 'browser') return createBrowserPrinter()
  if (typeof choice === 'string' && choice.startsWith('simulated:')) {
    return createSimulatedPrinter(choice.slice('simulated:'.length))
  }
  return createSimulatedPrinter('ok')
}
