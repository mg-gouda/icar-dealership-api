import { Injectable } from '@nestjs/common';

interface ExportResult {
  content: Buffer;
  contentType: string;
  filename: string;
}

@Injectable()
export class ReportExportService {
  // ponytail: SpreadsheetML (.xls) avoids exceljs/zip dep; PDF path serves
  // print-ready HTML — swap for puppeteer when headless browser is available.

  /** Convert any value (Decimal, number, string, null) to display string. */
  readonly fmt = (v: unknown): string => {
    if (v === null || v === undefined) return '';
    if (typeof v === 'number') return v.toFixed(2);
    if (typeof v === 'object' && typeof (v as any).toFixed === 'function')
      return (v as any).toFixed(2);
    return String(v);
  };

  build(title: string, headers: string[], rows: string[][], format?: string): ExportResult {
    const slug = title.toLowerCase().replace(/\s+/g, '-');
    if (format === 'pdf') {
      return {
        content: this.toHtml(title, headers, rows),
        contentType: 'text/html; charset=utf-8',
        filename: `${slug}.html`,
      };
    }
    return {
      content: this.toExcel(title, headers, rows),
      contentType: 'application/vnd.ms-excel',
      filename: `${slug}.xls`,
    };
  }

  private esc(s: string): string {
    return s.replace(/[<>&"]/g, (c) => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;', '"': '&quot;' }[c] ?? c));
  }

  private cell(v: string): string {
    return `<Cell><Data ss:Type="String">${this.esc(v)}</Data></Cell>`;
  }

  private toExcel(title: string, headers: string[], rows: string[][]): Buffer {
    const hRow = `<Row>${headers.map((h) => this.cell(h)).join('')}</Row>`;
    const dRows = rows.map((r) => `<Row>${r.map((c) => this.cell(c)).join('')}</Row>`).join('\n');
    const xml = `<?xml version="1.0" encoding="UTF-8"?>
<?mso-application progid="Excel.Sheet"?>
<Workbook xmlns="urn:schemas-microsoft-com:office:spreadsheet"
          xmlns:ss="urn:schemas-microsoft-com:office:spreadsheet">
  <Worksheet ss:Name="${this.esc(title)}">
    <Table>
      ${hRow}
${dRows}
    </Table>
  </Worksheet>
</Workbook>`;
    return Buffer.from(xml, 'utf-8');
  }

  private toHtml(title: string, headers: string[], rows: string[][]): Buffer {
    const th = headers.map((h) => `<th>${this.esc(h)}</th>`).join('');
    const tbody = rows
      .map((r) => `<tr>${r.map((c) => `<td>${this.esc(c)}</td>`).join('')}</tr>`)
      .join('\n');
    const html = `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<title>${this.esc(title)}</title>
<style>
body{font-family:Arial,sans-serif;font-size:11px;margin:20px}
h1{font-size:16px;margin-bottom:12px}
table{width:100%;border-collapse:collapse}
th,td{border:1px solid #ccc;padding:4px 8px;text-align:left}
th{background:#f0f0f0;font-weight:bold}
@media print{body{margin:0}}
</style>
</head>
<body>
<h1>${this.esc(title)}</h1>
<table><thead><tr>${th}</tr></thead>
<tbody>
${tbody}
</tbody></table>
<script>window.onload=()=>window.print()</script>
</body>
</html>`;
    return Buffer.from(html, 'utf-8');
  }
}
