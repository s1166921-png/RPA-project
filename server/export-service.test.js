const assert = require("node:assert/strict");
const test = require("node:test");

const { buildExportRows, buildBatchExportRows, buildMonthlyBillingExportRows } = require("./export-service");

test("builds the fixed billing-weight export columns in workflow order", () => {
  const rows = buildExportRows([{
    waybillNumber: "MO10083334",
    fbaNumber: "FBA15M2B6V3B",
    service: "欧洲空运包税-普货",
    country: "法国",
    recipient: "Amazon.com.XCD2",
    pieces: "1",
    actualWeight: "15.37",
    volumeWeight: "15.35",
    chargeWeight: "21.00",
    receivable: "826.00CNY",
    customsMode: "买单报关",
    source: "新智慧运单接口",
    queriedAt: "2026-07-28T08:00:00.000Z"
  }]);

  assert.deepEqual(rows[0].slice(0, -1), ["运单号", "FBA号", "服务", "国家", "收件人", "件数", "实重", "材重", "收费重", "应收", "费用分支", "报关方式", "数据来源", "查询时间"]);
  assert.equal(rows[0].at(-1), "\u6765\u6e90\u5feb\u7167ID");
  assert.deepEqual(rows[1].slice(0, 11), ["MO10083334", "FBA15M2B6V3B", "欧洲空运包税-普货", "法国", "Amazon.com.XCD2", "1", "15.37", "15.35", "21.00", "826.00CNY", "有费用"]);
});

test("builds batch export rows for found and missing waybills", () => {
  const rows = buildBatchExportRows([
    {
      status: "found",
      shipment: {
        waybillNumber: "MO10083334",
        fbaNumber: "FBA15M2B6V3B",
        service: "Air",
        country: "France",
        recipient: "Recipient",
        pieces: "1",
        actualWeight: "15.37",
        volumeWeight: "15.35",
        chargeWeight: "21.00",
        receivable: "826.00CNY",
        customsMode: "Declaration",
        source: "New Wisdom",
        queriedAt: "2026-07-28T08:00:00.000Z"
      }
    },
    { status: "not_found", waybillNumber: "MISSING-1" },
    { status: "source_unavailable", waybillNumber: "UNAVAILABLE-1" }
  ]);

  assert.deepEqual(rows[0].slice(-3), ["\u6765\u6e90\u5feb\u7167ID", "\u67e5\u8be2\u72b6\u6001", "\u5931\u8d25\u539f\u56e0"]);
  assert.deepEqual(rows[1].slice(-2), ["\u5df2\u627e\u5230", ""]);
  assert.deepEqual(rows[2], ["MISSING-1", ...Array(14).fill(""), "\u672a\u627e\u5230", "\u672a\u627e\u5230\u8be5\u8fd0\u5355"]);
  assert.deepEqual(rows[3], ["UNAVAILABLE-1", ...Array(14).fill(""), "\u6570\u636e\u6e90\u4e0d\u53ef\u7528", "\u65b0\u667a\u6167\u6570\u636e\u6e90\u6682\u65f6\u4e0d\u53ef\u7528"]);
});

test("builds fixed monthly bill export columns without internal user identifiers", () => {
  const rows = buildMonthlyBillingExportRows({
    month: "2026-07",
    items: [{
      invoiceNumber: "INV-001", invoiceDate: "2026-07-02", currency: "CNY", totalAmount: "12.00",
      paidAmount: "2.00", remainingAmount: "10.00", status: "unpaid", source: "New Wisdom", queriedAt: "2026-07-29T00:00:00.000Z"
    }]
  });

  assert.deepEqual(rows[0], ["\u8d26\u5355\u6708\u4efd", "\u8d26\u5355\u53f7", "\u8d26\u5355\u65e5\u671f", "\u5e01\u79cd", "\u5e94\u6536", "\u5df2\u4ed8", "\u672a\u4ed8", "\u72b6\u6001", "\u6570\u636e\u6765\u6e90", "\u67e5\u8be2\u65f6\u95f4", "\u6765\u6e90\u5feb\u7167ID"]);
  assert.deepEqual(rows[1], ["2026-07", "INV-001", "2026-07-02", "CNY", "12.00", "2.00", "10.00", "unpaid", "New Wisdom", "2026-07-29T00:00:00.000Z", ""]);
});
