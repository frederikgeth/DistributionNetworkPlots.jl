/* DistributionNetworkPlots.jl worker entrypoint for the pinned ELK bundle. */
importScripts("elk.bundled.js");
self.onmessage = async function (event) {
  try {
    const result = await new self.ELK().layout(event.data);
    self.postMessage({ ok: true, result });
  } catch (error) {
    self.postMessage({ ok: false, error: error && error.message ? error.message : String(error) });
  }
};
