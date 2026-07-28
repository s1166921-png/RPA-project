const path = require("node:path");
const { createServer } = require("./app");
const { createSampleProvider } = require("./providers/sample-provider");

const port = Number(process.env.PORT || 3000);
const server = createServer({ provider: createSampleProvider(), staticRoot: path.resolve(__dirname, "..") });
server.listen(port, () => console.log(`Waybill portal: http://localhost:${port}`));
