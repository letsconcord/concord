import * as mediasoup from "mediasoup";
import type { types as MediasoupTypes } from "mediasoup";
import os from "node:os";

let workers: MediasoupTypes.Worker[] = [];
let nextWorkerIdx = 0;

const mediaCodecs: MediasoupTypes.RtpCodecCapability[] = [
  {
    kind: "audio",
    mimeType: "audio/opus",
    preferredPayloadType: 111,
    clockRate: 48000,
    channels: 2,
  },
  {
    kind: "video",
    mimeType: "video/VP8",
    preferredPayloadType: 96,
    clockRate: 90000,
    parameters: {},
  },
];

export async function initSfu(): Promise<void> {
  const numWorkers = Math.max(1, os.cpus().length);
  console.log(`[sfu] Creating ${numWorkers} mediasoup worker(s)`);

  for (let i = 0; i < numWorkers; i++) {
    const worker = await mediasoup.createWorker({
      logLevel: "warn",
      rtcMinPort: 10000,
      rtcMaxPort: 10100,
    });

    worker.on("died", () => {
      console.error(`[sfu] Worker ${worker.pid} died, exiting...`);
      process.exit(1);
    });

    workers.push(worker);
  }
}

function getNextWorker(): MediasoupTypes.Worker {
  const worker = workers[nextWorkerIdx];
  nextWorkerIdx = (nextWorkerIdx + 1) % workers.length;
  return worker;
}

export async function createRouter(): Promise<MediasoupTypes.Router> {
  const worker = getNextWorker();
  return worker.createRouter({ mediaCodecs });
}

export function isSfuReady(): boolean {
  return workers.length > 0;
}

export function getWorkers(): MediasoupTypes.Worker[] {
  return workers;
}
