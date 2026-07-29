function runShipmentTrackingWorkflow(results) {
  return {
    workflowId: "shipment_tracking",
    name: "物流轨迹查询",
    readOnly: true,
    items: results.map((item) => {
      const shipment = item.shipment || {};
      return {
        waybillNumber: item.waybillNumber || shipment.waybillNumber || "",
        status: item.status,
        currentStatus: item.status === "found" ? shipment.status : "",
        lastRoute: item.status === "found" ? shipment.lastRoute : "",
        routeNodes: item.status === "found" ? shipment.routeNodes || [] : [],
        source: item.status === "found" ? shipment.source || "" : "",
        queriedAt: item.status === "found" ? shipment.queriedAt || "" : "",
        sourceSnapshotId: item.status === "found" ? shipment.sourceSnapshotId || "" : ""
      };
    })
  };
}

module.exports = { runShipmentTrackingWorkflow };
