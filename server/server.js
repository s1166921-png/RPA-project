const path = require("node:path");
const { createServer } = require("./app");
const { createSampleProvider } = require("./providers/sample-provider");
const { createNewWisdomProvider } = require("./providers/new-wisdom-provider");
const { getListenOptions } = require("./server-config");

const { port, host } = getListenOptions();
const useNewWisdom = process.env.LOOKUP_PROVIDER === "new-wisdom";
const provider = useNewWisdom
  ? createNewWisdomProvider({
      username: process.env.NEXTSLS_USERNAME,
      password: process.env.NEXTSLS_PASSWORD,
      browserFactory: async () => (await require("playwright")).chromium.launch({ headless: true })
    })
  : createSampleProvider();
const server = createServer({ provider, staticRoot: path.resolve(__dirname, "..") });
server.listen(port, host, () => console.log(`Waybill portal: http://${host}:${port}`));
