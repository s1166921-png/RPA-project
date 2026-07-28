const rows = [
  {
    waybill_number: "MO10083334",
    fba_number: "FBA15M2B6V3B",
    status: "已交货",
    service: "欧洲空运包税-普货",
    country: "法国",
    recipient: "Amazon.com.XCD2",
    pieces: 1,
    actual_weight: "15.37",
    volume_weight: "15.35",
    charge_weight: "21.00",
    customs_mode: "买单报关",
    receivable: "826.00CNY",
    last_route: "货物已交承运商"
  }
];

function createSampleProvider() {
  return {
    async findByWaybill(waybillNumber) {
      return rows.find((row) => row.waybill_number === waybillNumber) || null;
    }
  };
}

module.exports = { createSampleProvider };
