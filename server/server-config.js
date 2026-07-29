function getListenOptions(env = process.env) {
  return {
    port: Number(env.PORT || 3000),
    host: env.HOST || "127.0.0.1"
  };
}

module.exports = { getListenOptions };
