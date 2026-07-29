function toNumber(value) {
  const text = String(value || "").trim();
  if (!text) return null;
  const numeric = Number(text);
  return Number.isFinite(numeric) ? numeric : null;
}

function runWeightValidationWorkflow(results) {
  return {
    workflowId: "weight_validation",
    name: "货物计重校验",
    readOnly: true,
    items: results.map((item) => {
      const shipment = item.shipment || {};
      const actualWeight = shipment.actualWeight || "";
      const volumeWeight = shipment.volumeWeight || "";
      const chargeWeight = shipment.chargeWeight || "";
      const actual = toNumber(actualWeight);
      const volume = toNumber(volumeWeight);
      const charge = toNumber(chargeWeight);
      let validationStatus = "unavailable";
      if (item.status === "found") {
        validationStatus = actual === null || volume === null || charge === null
          ? "needs_review"
          : charge < Math.max(actual, volume) ? "anomaly" : "valid";
      }
      return {
        waybillNumber: item.waybillNumber || shipment.waybillNumber || "",
        status: item.status,
        actualWeight,
        volumeWeight,
        chargeWeight,
        validationStatus,
        source: item.status === "found" ? shipment.source || "" : "",
        queriedAt: item.status === "found" ? shipment.queriedAt || "" : ""
      };
    })
  };
}

module.exports = { runWeightValidationWorkflow };
