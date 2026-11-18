param(
    [Parameter(Mandatory = $true)][string]$PrinterName,
    [Parameter(Mandatory = $true)][string]$FilePath
)

# Sends the bytes of a file to a Windows printer as RAW data (no driver layout).
$source = @"
using System;
using System.Runtime.InteropServices;

public class RawPrinter {
  [StructLayout(LayoutKind.Sequential, CharSet = CharSet.Ansi)]
  public class DOCINFOA {
    [MarshalAs(UnmanagedType.LPStr)] public string pDocName;
    [MarshalAs(UnmanagedType.LPStr)] public string pOutputFile;
    [MarshalAs(UnmanagedType.LPStr)] public string pDataType;
  }

  [DllImport("winspool.Drv", EntryPoint = "OpenPrinterA", SetLastError = true, CharSet = CharSet.Ansi, ExactSpelling = true)]
  public static extern bool OpenPrinter(string szPrinter, out IntPtr hPrinter, IntPtr pd);
  [DllImport("winspool.Drv", EntryPoint = "ClosePrinter", SetLastError = true, ExactSpelling = true)]
  public static extern bool ClosePrinter(IntPtr hPrinter);
  [DllImport("winspool.Drv", EntryPoint = "StartDocPrinterA", SetLastError = true, CharSet = CharSet.Ansi, ExactSpelling = true)]
  public static extern bool StartDocPrinter(IntPtr hPrinter, Int32 level, [In, MarshalAs(UnmanagedType.LPStruct)] DOCINFOA di);
  [DllImport("winspool.Drv", EntryPoint = "EndDocPrinter", SetLastError = true, ExactSpelling = true)]
  public static extern bool EndDocPrinter(IntPtr hPrinter);
  [DllImport("winspool.Drv", EntryPoint = "StartPagePrinter", SetLastError = true, ExactSpelling = true)]
  public static extern bool StartPagePrinter(IntPtr hPrinter);
  [DllImport("winspool.Drv", EntryPoint = "EndPagePrinter", SetLastError = true, ExactSpelling = true)]
  public static extern bool EndPagePrinter(IntPtr hPrinter);
  [DllImport("winspool.Drv", EntryPoint = "WritePrinter", SetLastError = true, ExactSpelling = true)]
  public static extern bool WritePrinter(IntPtr hPrinter, IntPtr pBytes, Int32 dwCount, out Int32 dwWritten);

  public static string SendBytes(string printer, byte[] bytes) {
    IntPtr h;
    if (!OpenPrinter(printer, out h, IntPtr.Zero)) {
      return "The printer '" + printer + "' was not found (error " + Marshal.GetLastWin32Error() + "). Check its name in Windows Printers & scanners.";
    }
    DOCINFOA di = new DOCINFOA();
    di.pDocName = "Clothing POS labels";
    di.pDataType = "RAW";
    string error = null;
    if (StartDocPrinter(h, 1, di)) {
      if (StartPagePrinter(h)) {
        IntPtr p = Marshal.AllocCoTaskMem(bytes.Length);
        Marshal.Copy(bytes, 0, p, bytes.Length);
        int written;
        if (!WritePrinter(h, p, bytes.Length, out written) || written != bytes.Length) {
          error = "The printer did not accept the data (error " + Marshal.GetLastWin32Error() + ").";
        }
        Marshal.FreeCoTaskMem(p);
        EndPagePrinter(h);
      } else {
        error = "The printer did not start a page (error " + Marshal.GetLastWin32Error() + ").";
      }
      EndDocPrinter(h);
    } else {
      error = "The printer did not start the job (error " + Marshal.GetLastWin32Error() + ").";
    }
    ClosePrinter(h);
    return error;
  }
}
"@

Add-Type -TypeDefinition $source
$bytes = [System.IO.File]::ReadAllBytes($FilePath)
$problem = [RawPrinter]::SendBytes($PrinterName, $bytes)
if ($problem) {
    [Console]::Error.WriteLine($problem)
    exit 1
}