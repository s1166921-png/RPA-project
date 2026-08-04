function runCargoInformationWorkflow(results) {
  return {
    workflowId: "cargo_information",
    name: "货物信息查询",
    readOnly: true,
    items: results.map((item) => {
      const shipment = item.shipment || {};
      return {
        waybillNumber: item.waybillNumber || shipment.waybillNumber || "",
        status: item.status,
        fbaNumber: item.status === "found" ? shipment.fbaNumber || "" : "",
        service: item.status === "found" ? shipment.service || "" : "",
        country: item.status === "found" ? shipment.country || "" : "",
        recipient: item.status === "found" ? shipment.recipient || "" : "",
        pieces: item.status === "found" ? shipment.pieces || "" : "",
        actualWeight: item.status === "found" ? shipment.actualWeight || "" : "",
        volumeWeight: item.status === "found" ? shipment.volumeWeight || "" : "",
        chargeWeight: item.status === "found" ? shipment.chargeWeight || "" : "",
        customsMode: item.status === "found" ? shipment.customsMode || "" : "",
        source: item.status === "found" ? shipment.source || "" : "",
        queriedAt: item.status === "found" ? shipment.queriedAt || "" : "",
        sourceSnapshotId: item.status === "found" ? shipment.sourceSnapshotId || "" : ""
      };
    })
  };
}

module.exports = { runCargoInformationWorkflow };
