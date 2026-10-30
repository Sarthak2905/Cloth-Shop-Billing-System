// A printer adapter is anything with { id, label, print(receipt) }.
// print() resolves to { confirmation } or throws a PrinterError.
//
// Confirmation levels (what we can honestly claim):
//   'simulated'        shown on screen only, nothing physical happened
//   'handed_off'       sent to a printer or the system, no proof it printed
//   'device_confirmed' the printer itself reported success

export class PrinterError extends Error {
  constructor(code, message) {
    super(message)
    this.name = 'PrinterError'
    this.code = code
  }
}

export const SIMULATED_MODES = {
  ok: 'Working',
  paper_out: 'Paper out',
  offline: 'Printer offline',
}

export function createSimulatedPrinter(mode = 'ok') {
  return {
    id: 'simulated',
    label: 'Simulated printer',
    async print() {
      if (mode === 'paper_out') {
        throw new PrinterError(
          'PAPER_OUT',
          'The printer is out of paper. Add paper and try again.',
        )
      }
      if (mode === 'offline') {
        throw new PrinterError(
          'PRINTER_OFFLINE',
          'The printer is not connected. Check the printer and try again.',
        )
      }
      return { confirmation: 'simulated' }
    },
  }
}
