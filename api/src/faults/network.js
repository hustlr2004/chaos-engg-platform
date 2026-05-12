const axios = require("axios");

const toxiproxy = axios.create({
  baseURL: "http://toxiproxy:8474",
  timeout: 5000,
});

async function createProxy(name, listenPort, upstream) {
  const response = await toxiproxy.post("/proxies", {
    name,
    listen: `0.0.0.0:${listenPort}`,
    upstream,
  });

  return response.data;
}

async function addLatency(proxyName, latencyMs, jitterMs) {
  const response = await toxiproxy.post(`/proxies/${proxyName}/toxics`, {
    name: `${proxyName}-latency`,
    type: "latency",
    stream: "downstream",
    toxicity: 1,
    attributes: {
      latency: latencyMs,
      jitter: jitterMs,
    },
  });

  return response.data;
}

async function addPacketLoss(proxyName, lossPercent) {
  const response = await toxiproxy.post(`/proxies/${proxyName}/toxics`, {
    name: `${proxyName}-packet-loss`,
    type: "bandwidth",
    stream: "downstream",
    toxicity: 1,
    attributes: {
      rate: 0,
      loss: lossPercent,
    },
  });

  return response.data;
}

async function addBandwidthLimit(proxyName, rateKbps) {
  const response = await toxiproxy.post(`/proxies/${proxyName}/toxics`, {
    name: `${proxyName}-bandwidth`,
    type: "bandwidth",
    stream: "downstream",
    toxicity: 1,
    attributes: {
      rate: rateKbps,
    },
  });

  return response.data;
}

async function removeAllToxics(proxyName) {
  const response = await toxiproxy.get(`/proxies/${proxyName}`);
  const toxics = response.data.toxics || [];

  await Promise.all(
    toxics.map((toxic) =>
      toxiproxy.delete(`/proxies/${proxyName}/toxics/${toxic.name}`)
    )
  );

  return { removed: true, count: toxics.length };
}

async function deleteProxy(proxyName) {
  await toxiproxy.delete(`/proxies/${proxyName}`);

  return { deleted: true, proxyName };
}

module.exports = {
  addBandwidthLimit,
  addLatency,
  addPacketLoss,
  createProxy,
  deleteProxy,
  removeAllToxics,
};
