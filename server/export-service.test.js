const assert = require("node:assert/strict");
const test = require("node:test");

const { buildExportRows } = require("./export-service");

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

  assert.deepEqual(rows[0], ["运单号", "FBA号", "服务", "国家", "收件人", "件数", "实重", "材重", "收费重", "应收", "费用分支", "报关方式", "数据来源", "查询时间"]);
  assert.deepEqual(rows[1].slice(0, 11), ["MO10083334", "FBA15M2B6V3B", "欧洲空运包税-普货", "法国", "Amazon.com.XCD2", "1", "15.37", "15.35", "21.00", "826.00CNY", "有费用"]);
});
