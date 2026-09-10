(function () {
  "use strict";
  const LIMITS = Object.freeze({ bytes: 64 * 1024 * 1024, values: 2000000, depth: 100 });

  // This function is also the worker entry point. It has no DOM dependencies.
  async function prepare(file, mode, limits, progress) {
    if (file.size > limits.bytes) throw new Error("Files larger than 64 MiB are not supported.");
    progress("Reading JSON");
    const text = await file.text();
    progress("Parsing JSON");
    let raw;
    try { raw = JSON.parse(text); } catch { throw new Error("This file is not valid JSON. Check the file syntax and try again."); }
    if (!raw || typeof raw !== "object" || Array.isArray(raw)) throw new Error("The file must contain a JSON object.");
    const stack = [[raw, 0]];
    let count = 0;
    while (stack.length) {
      const [value, depth] = stack.pop();
      if (++count > limits.values || depth > limits.depth) throw new Error("File exceeds the 2,000,000-value or 100-level nesting limit.");
      if (value && typeof value === "object") for (const child of Object.values(value)) stack.push([child, depth + 1]);
    }
    const isResult = mode === "result" || mode === "comparison" || (mode === "auto" && BMOPFModel.looksLikeResultDocument(raw, file.name));
    const caseDocument = isResult ? BMOPFModel.resultCase(raw) : raw;
    progress("Indexing network");
    const start = performance.now();
    const index = caseDocument && mode !== "comparison" ? BMOPFModel.buildCaseIndex(caseDocument) : null;
    if (index) index.graphSignature = BMOPFModel.layoutGraphSignature(index);
    return { raw, index, isResult, indexMs: performance.now() - start };
  }

  function workerMain() {
    let acknowledge;
    const send = data => new Promise(resolve => { acknowledge = resolve; postMessage(data); });
    onmessage = async ({ data }) => {
      if (data.ack) { acknowledge?.(); return; }
      try {
        const result = await prepare(data.file, data.mode, data.limits, phase => postMessage({ phase }));
        postMessage({ phase: "Transferring network" });
        await send({ rawStart: true });
        const transfer = async (object, path = []) => {
          let batch = [];
          const flush = async () => { if (batch.length) { await send({ rawEntries: batch, path }); batch = []; } };
          for (const [key, value] of Object.entries(object)) {
            const split = value && typeof value === "object" && !Array.isArray(value) &&
              (path.length === 0 || ["case", "network", "result", "results", "nw"].includes(key) || path.at(-1) === "nw" || Object.keys(value).length > 500);
            if (split) {
              await flush();
              await send({ rawEntries: [[key, {}]], path });
              await transfer(value, [...path, key]);
            } else { batch.push([key, value]); if (batch.length === 500) await flush(); }
          }
          await flush();
        };
        await transfer(result.raw);
        const embeddedKey = result.isResult && result.index ? (result.index.raw === result.raw.case ? "case" : "network") : null;
        if (result.index) {
          const { raw, entities, buses, assets, byRef, byKind, byBus, busById, components, ...summary } = result.index;
          await send({ indexStart: summary });
          for (let offset = 0; offset < components.length; offset += 500) await send({ components: components.slice(offset, offset + 500) });
          const assetSet = new Set(assets), busSet = new Set(buses);
          for (let offset = 0; offset < entities.length; offset += 500) {
            const batch = entities.slice(offset, offset + 500).map(entity => {
              const { sourceRecord, ...item } = entity;
              return { item, asset: assetSet.has(entity), bus: busSet.has(entity) };
            });
            await send({ entities: batch, embeddedKey });
          }
        }
        postMessage({ done: { isResult: result.isResult, indexMs: result.indexMs }, embeddedKey });
      } catch (error) { postMessage({ error: error.message }); }
    };
  }

  function read(file, { mode = "case", signal, onProgress = () => {} } = {}) {
    return new Promise((resolve, reject) => {
      let worker, url, settled = false;
      let importedRaw, importedIndex;
      const finish = (error, value) => {
        if (settled) return;
        settled = true;
        worker?.terminate();
        if (url) URL.revokeObjectURL(url);
        signal?.removeEventListener("abort", abort);
        error ? reject(error) : resolve(value);
      };
      const abort = () => finish(new DOMException("Import cancelled", "AbortError"));
      if (signal?.aborted) { abort(); return; }
      signal?.addEventListener("abort", abort, { once: true });
      if (file.size > LIMITS.bytes) { finish(new Error("Files larger than 64 MiB are not supported.")); return; }
      try {
        // Transfer a large graph in bounded batches. A single structured clone
        // of raw data + every index map can itself freeze the receiving thread.
        const source = `${BMOPFModel.workerSource()}\nconst prepare = ${prepare.toString()};\n(${workerMain.toString()})();`;
        url = URL.createObjectURL(new Blob([source], { type: "text/javascript" }));
        worker = new Worker(url);
        worker.onmessage = ({ data }) => {
          if (settled) return;
          if (data.phase) onProgress(data.phase);
          else if (data.rawStart) { importedRaw = {}; worker.postMessage({ ack: true }); }
          else if (data.rawEntries) {
            const target = (data.path || []).reduce((value, key) => value[key], importedRaw);
            for (const [key, value] of data.rawEntries) Object.defineProperty(target, key, { value, writable: true, enumerable: true, configurable: true });
            worker.postMessage({ ack: true });
          } else if (data.indexStart) {
            importedIndex = { ...data.indexStart, raw: null, components: [], assets: [], buses: [], entities: [], byRef: new Map(), byKind: new Map(), byBus: new Map(), busById: new Map() };
            worker.postMessage({ ack: true });
          } else if (data.components) {
            for (const component of data.components) importedIndex.components.push(component);
            worker.postMessage({ ack: true });
          } else if (data.entities) {
            for (const { item, asset, bus } of data.entities) {
              const source = data.embeddedKey ? importedRaw[data.embeddedKey] : importedRaw;
              item.sourceRecord = item.ref.pointer.slice(1).split("/").reduce((value, key) => value?.[key.replace(/~1/g, "/").replace(/~0/g, "~")], source);
              importedIndex.entities.push(item);
              if (asset) importedIndex.assets.push(item);
              if (bus) { importedIndex.buses.push(item); importedIndex.busById.set(item.ref.id, item); }
              importedIndex.byRef.set(`${item.ref.kind}:${item.ref.id}:${item.ref.pointer}`, item);
              if (!importedIndex.byKind.has(item.ref.kind)) importedIndex.byKind.set(item.ref.kind, new Map());
              if (!importedIndex.byKind.get(item.ref.kind).has(item.ref.id)) importedIndex.byKind.get(item.ref.kind).set(item.ref.id, item);
              for (const port of item.ports) {
                if (!importedIndex.byBus.has(port.busId)) importedIndex.byBus.set(port.busId, []);
                importedIndex.byBus.get(port.busId).push(item);
              }
            }
            worker.postMessage({ ack: true });
          } else if (data.done) {
            if (importedIndex) importedIndex.raw = data.embeddedKey ? importedRaw[data.embeddedKey] : importedRaw;
            finish(null, { ...data.done, raw: importedRaw, index: importedIndex, execution: "worker" });
          } else if (data.error) finish(new Error(data.error));
        };
        worker.onerror = () => finish(new Error("The import worker could not run. Allow local blob workers in this browser's content security policy and retry."));
        worker.onmessageerror = () => finish(new Error("The browser could not transfer the imported network."));
        worker.postMessage({ file, mode, limits: LIMITS });
      } catch (error) {
        // File reports still work in environments without the Worker API.
        // Be explicit about this slower fallback instead of silently retrying
        // parse errors or a failed worker on the main thread.
        if (worker) { finish(error); return; }
        onProgress("Worker unavailable; importing on the main thread");
        setTimeout(() => {
          if (!settled) prepare(file, mode, LIMITS, () => {}).then(value => finish(null, { ...value, execution: "main-thread fallback" }), finish);
        }, 0);
      }
    });
  }
  globalThis.BMOPFImporter = Object.freeze({ read, LIMITS });
})();
