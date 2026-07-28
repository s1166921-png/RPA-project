const shipmentPath = "/tms/csos/shipment?page=1&pageSize=30&activeTab=all";

function buildSearchBody(waybillNumber) {
  return {
    timeLimit: 0, page: 1, pageSize: 30, keywords: waybillNumber, waybill_number: "",
    lading_number: "", service: "", username: "", user_grade: "", country: "", to_warehouse_code: "",
    postcode: "", servicer_id: "", seller_id: "", finance_id: "", organization_id: "", partner_service: "",
    depot_id: "", pickup_depot_id: "", creator: "", picker_id: "", created_daterange: "", picking_daterange: "",
    ship_daterange: "", delivered_daterange: "", outer_pickup_time: "", expected_arrived_time: "", config: "",
    tag: "", tag_not: "", outer_carrier_code: "", vat_number: "", warehouse_location: "", main_name: "",
    charge_paid: "", pay_type: "", amazon_ref_id: "", delivery_time: [], def_fields: "", isActiveTab: "ready",
    restart: 0, btnType: "", scenes: 0
  };
}

function createNewWisdomProvider({ username, password, baseUrl = "http://moyckj.nextsls.com", browserFactory }) {
  if (!username || !password) throw new Error("New Wisdom read-only credentials are required");

  return {
    async findByWaybill(waybillNumber) {
      const browser = await browserFactory();
        const context = await browser.newContext();
      try {
        const page = await context.newPage();
        await page.goto(`${baseUrl}${shipmentPath}`, { waitUntil: "domcontentloaded" });
        const usernameInput = page.locator('input[name="username"]');
        const needsLogin = await usernameInput.waitFor({ timeout: 5000 }).then(() => true).catch(() => false);
        if (needsLogin) {
          await usernameInput.fill(username);
          await page.locator('input[name="password"]').fill(password);
          await page.locator("button").filter({ hasText: /登录/ }).click();
          await page.waitForURL(/\/tms\/csos\/shipment/);
        }
        const payload = { endpoint: "/rest/tms/csos/shipment/lists", body: buildSearchBody(waybillNumber) };
        const response = await page.evaluate(async ({ endpoint, body }) => {
          const response = await fetch(endpoint, {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: JSON.stringify(body)
          });
          if (!response.ok) throw new Error("New Wisdom list request failed");
          return response.json();
        }, payload);
        return response?.data?.components?.gridView?.table?.dataSource?.[0] || null;
      } finally {
        await context.close();
        await browser.close();
      }
    }
  };
}

module.exports = { buildSearchBody, createNewWisdomProvider };
