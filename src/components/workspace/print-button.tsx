"use client";

import { Download } from "lucide-react";

/** Opens the browser print dialog; choose "Save as PDF" to download the report. */
export function PrintButton() {
  return <button type="button" className="site-report-print" onClick={() => window.print()}><Download size={14} aria-hidden="true" /> Download PDF</button>;
}
