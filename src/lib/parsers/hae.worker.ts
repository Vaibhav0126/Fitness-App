/// <reference lib="webworker" />
import { parseHaeFile } from "./hae";

/** Parses Health Auto Export files off the main thread (they can be tens of MB). */
export type HaeWorkerRequest = {
  files: File[];
  timeZone: string;
  runClassification: { walkSpeedKmh: number; marginKmh: number };
};

self.onmessage = async (e: MessageEvent<HaeWorkerRequest>) => {
  const { files, timeZone, runClassification } = e.data;
  try {
    const results = [];
    for (const f of files) {
      const json: unknown = JSON.parse(await f.text());
      results.push({ name: f.name, ...parseHaeFile(json, { timeZone, runClassification }) });
    }
    self.postMessage({ ok: true, results });
  } catch (err) {
    self.postMessage({ ok: false, error: err instanceof Error ? err.message : String(err) });
  }
};
