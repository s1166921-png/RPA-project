const fs = require("node:fs/promises");
const os = require("node:os");
const path = require("node:path");

async function createXlsxExport(rows) {
  const { SpreadsheetFile, Workbook } = await import("@oai/artifact-tool");
  const workbook = Workbook.create();
  const sheet = workbook.worksheets.add("计费重确认");
  const endColumn = String.fromCharCode(64 + rows[0].length);
  sheet.getRange(`A1:${endColumn}${rows.length}`).values = rows;
  sheet.getRange(`A1:${endColumn}1`).format = {
    fill: "#0F766E",
    font: { bold: true, color: "#FFFFFF" },
    horizontalAlignment: "center"
  };
  sheet.getRange(`A1:${endColumn}${rows.length}`).format.wrapText = true;
  sheet.getRange(`A1:${endColumn}${rows.length}`).format.autofitColumns();
  sheet.freezePanes.freezeRows(1);
  const output = await SpreadsheetFile.exportXlsx(workbook);
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), "waybill-export-"));
  const file = path.join(directory, "waybill-export.xlsx");
  try {
    await output.save(file);
    return await fs.readFile(file);
  } finally {
    await fs.rm(directory, { recursive: true, force: true });
  }
}

module.exports = { createXlsxExport };
