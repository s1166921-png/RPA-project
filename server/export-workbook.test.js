const assert = require("node:assert/strict");
const test = require("node:test");

const { createXlsxExport } = require("./export-workbook");

test("creates an xlsx workbook with the fixed export rows", async () => {
  const bytes = await createXlsxExport([
    ["运单号", "FBA号"],
    ["MO10083334", "FBA15M2B6V3B"]
  ]);

  assert.equal(Buffer.from(bytes).subarray(0, 2).toString(), "PK");
  assert.ok(Buffer.from(bytes).length > 1000);
});
