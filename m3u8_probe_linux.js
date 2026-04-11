#!/usr/bin/env node

"use strict";

const fs = require("fs");
const net = require("net");
const path = require("path");
const tls = require("tls");

const defaults = {
  baseUrlTemplate: "https://zapi.8-8.tv/live/{0}/index.m3u8",
  fixedPrefix: "1775517",
  suffixWidth: 6,
  startSuffix: 827000,
  endSuffix: 828000,
  concurrency: 50,
  delayMs: 200,
  timeoutSec: 5,
  outputCsv: path.join(process.cwd(), "m3u8_probe_results_linux.csv"),
  logFile: "",
  progressIntervalMs: 1000,
  onlyAvailable: true,
  stopOn429: false,
  verbose: false,
};

function printHelp() {
  console.log(`Usage: node m3u8_probe_linux.js [options]

Options:
  --base-url-template <value>  URL template, use {0} as stream id placeholder
  --fixed-prefix <value>       Prefix before numeric suffix
  --suffix-width <number>      Numeric suffix width, default 6
  --start-suffix <number>      Start of suffix range, default 0
  --end-suffix <number>        End of suffix range, default 999999
  --concurrency <number>       Parallel workers, default 1
  --delay-ms <number>          Wait after each request per worker in ms, default 200
  --timeout-sec <number>       Request timeout in seconds, default 5
  --output-csv <path>          CSV output path
  --log-file <path>            Optional log file path
  --progress-interval-ms <n>   Progress log interval in ms, default 1000
  --only-available             Store only available rows, default on
  --stop-on-429                Stop immediately on HTTP 429
  --verbose                    Log every probe result
  --help                       Show this help
`);
}

function parseArgs(argv) {
  const options = { ...defaults };

  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (!arg.startsWith("--")) {
      throw new Error(`Unexpected argument: ${arg}`);
    }

    const eqIndex = arg.indexOf("=");
    const key = eqIndex >= 0 ? arg.slice(2, eqIndex) : arg.slice(2);
    const inlineValue = eqIndex >= 0 ? arg.slice(eqIndex + 1) : undefined;

    if (key === "help") {
      options.help = true;
      continue;
    }

    if (key === "only-available") {
      options.onlyAvailable = true;
      continue;
    }

    if (key === "stop-on-429") {
      options.stopOn429 = true;
      continue;
    }

    if (key === "verbose") {
      options.verbose = true;
      continue;
    }

    const nextValue = inlineValue ?? argv[i + 1];
    if (nextValue === undefined) {
      throw new Error(`Missing value for --${key}`);
    }
    if (inlineValue === undefined) {
      i += 1;
    }

    switch (key) {
      case "base-url-template":
        options.baseUrlTemplate = nextValue;
        break;
      case "fixed-prefix":
        options.fixedPrefix = nextValue;
        break;
      case "suffix-width":
        options.suffixWidth = parseInteger(nextValue, key);
        break;
      case "start-suffix":
        options.startSuffix = parseInteger(nextValue, key);
        break;
      case "end-suffix":
        options.endSuffix = parseInteger(nextValue, key);
        break;
      case "concurrency":
        options.concurrency = parseInteger(nextValue, key);
        break;
      case "delay-ms":
        options.delayMs = parseInteger(nextValue, key);
        break;
      case "timeout-sec":
        options.timeoutSec = parseInteger(nextValue, key);
        break;
      case "output-csv":
        options.outputCsv = path.resolve(nextValue);
        break;
      case "log-file":
        options.logFile = path.resolve(nextValue);
        break;
      case "progress-interval-ms":
        options.progressIntervalMs = parseInteger(nextValue, key);
        break;
      default:
        throw new Error(`Unknown option: --${key}`);
    }
  }

  validateOptions(options);
  return options;
}

function parseInteger(value, name) {
  const parsed = Number.parseInt(value, 10);
  if (!Number.isInteger(parsed)) {
    throw new Error(`Invalid integer for --${name}: ${value}`);
  }
  return parsed;
}

function validateOptions(options) {
  if (options.startSuffix < 0 || options.endSuffix < options.startSuffix) {
    throw new Error(
      `Invalid suffix range: StartSuffix=${options.startSuffix} EndSuffix=${options.endSuffix}`
    );
  }
  if (options.suffixWidth < 1) {
    throw new Error(`Invalid suffix width: ${options.suffixWidth}`);
  }
  if (options.concurrency < 1) {
    throw new Error(`Invalid concurrency: ${options.concurrency}`);
  }
  if (options.delayMs < 0) {
    throw new Error(`Invalid delay ms: ${options.delayMs}`);
  }
  if (options.timeoutSec < 1) {
    throw new Error(`Invalid timeout sec: ${options.timeoutSec}`);
  }
  if (options.progressIntervalMs < 0) {
    throw new Error(
      `Invalid progress interval ms: ${options.progressIntervalMs}`
    );
  }
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function formatLocalDateTime(date) {
  const pad = (value) => String(value).padStart(2, "0");
  return [
    date.getFullYear(),
    pad(date.getMonth() + 1),
    pad(date.getDate()),
  ].join("-") + "T" + [
    pad(date.getHours()),
    pad(date.getMinutes()),
    pad(date.getSeconds()),
  ].join(":");
}

function formatElapsedMs(ms) {
  if (ms < 1000) {
    return `${ms}ms`;
  }
  return `${(ms / 1000).toFixed(1)}s`;
}

function createLogger(logFile) {
  if (logFile) {
    fs.mkdirSync(path.dirname(logFile), { recursive: true });
  }

  return function log(level, message) {
    const line = `[${formatLocalDateTime(new Date())}] [${level}] ${message}`;
    if (level === "WARN") {
      console.warn(line);
    } else if (level === "ERROR") {
      console.error(line);
    } else {
      console.log(line);
    }

    if (logFile) {
      fs.appendFileSync(logFile, `${line}\n`, "utf8");
    }
  };
}

function csvValue(value) {
  const text = value == null ? "" : String(value);
  return `"${text.replace(/"/g, "\"\"")}"`;
}

function csvHeaderLine() {
  return [
    "StreamId",
    "Url",
    "StatusCode",
    "Available",
    "Reason",
    "CheckedAt",
  ]
    .map(csvValue)
    .join(",");
}

function csvRowLine(row) {
  return [
    row.StreamId,
    row.Url,
    row.StatusCode,
    row.Available ? "True" : "False",
    row.Reason,
    row.CheckedAt,
  ]
    .map(csvValue)
    .join(",");
}

function initializeCsv(filePath) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, `${csvHeaderLine()}\n`, "utf8");
}

function appendCsvRow(filePath, row) {
  fs.appendFileSync(filePath, `${csvRowLine(row)}\n`, "utf8");
}

function socketTimeoutMessage(timeoutMs) {
  return `Timed out after ${timeoutMs}ms`;
}

function connectSocket(protocol, host, port, timeoutMs) {
  return new Promise((resolve, reject) => {
    let settled = false;
    const successEvent = protocol === "https:" ? "secureConnect" : "connect";
    const socket =
      protocol === "https:"
        ? tls.connect({
            host,
            port,
            servername: host,
            ALPNProtocols: ["http/1.1"],
          })
        : net.connect({ host, port });

    const cleanup = () => {
      socket.removeListener(successEvent, onSuccess);
      socket.removeListener("error", onError);
      socket.removeListener("timeout", onTimeout);
    };

    const finish = (callback) => {
      if (settled) {
        return;
      }
      settled = true;
      cleanup();
      callback();
    };

    const onSuccess = () => finish(() => resolve(socket));
    const onError = (error) => finish(() => reject(error));
    const onTimeout = () =>
      finish(() => {
        socket.destroy();
        reject(new Error(socketTimeoutMessage(timeoutMs)));
      });

    socket.setTimeout(timeoutMs);
    socket.once(successEvent, onSuccess);
    socket.once("error", onError);
    socket.once("timeout", onTimeout);
  });
}

function readHttpHeaders(socket, timeoutMs) {
  return new Promise((resolve, reject) => {
    let settled = false;
    let buffer = Buffer.alloc(0);

    const cleanup = () => {
      socket.removeListener("data", onData);
      socket.removeListener("error", onError);
      socket.removeListener("end", onEnd);
      socket.removeListener("timeout", onTimeout);
    };

    const finish = (callback) => {
      if (settled) {
        return;
      }
      settled = true;
      cleanup();
      callback();
    };

    const onData = (chunk) => {
      buffer = Buffer.concat([buffer, chunk]);
      const headerEnd = buffer.indexOf("\r\n\r\n");
      if (headerEnd < 0) {
        return;
      }

      const headerText = buffer.subarray(0, headerEnd).toString("utf8");
      const statusLine = headerText.split("\r\n", 1)[0] || "";
      const match = statusLine.match(/^HTTP\/\d+(?:\.\d+)?\s+(\d{3})\b/i);
      if (!match) {
        finish(() => reject(new Error(`Invalid HTTP response: ${statusLine}`)));
        return;
      }

      finish(() =>
        resolve({
          statusCode: Number(match[1]),
        })
      );
    };

    const onError = (error) => finish(() => reject(error));
    const onEnd = () =>
      finish(() => reject(new Error("Connection closed before response headers")));
    const onTimeout = () =>
      finish(() => {
        socket.destroy();
        reject(new Error(socketTimeoutMessage(timeoutMs)));
      });

    socket.setTimeout(timeoutMs);
    socket.on("data", onData);
    socket.once("error", onError);
    socket.once("end", onEnd);
    socket.once("timeout", onTimeout);
  });
}

function buildRequest(targetUrl) {
  const requestPath = `${targetUrl.pathname || "/"}${targetUrl.search || ""}`;
  const hostHeader = targetUrl.port
    ? `${targetUrl.hostname}:${targetUrl.port}`
    : targetUrl.hostname;

  return [
    `GET ${requestPath} HTTP/1.1`,
    `Host: ${hostHeader}`,
    "User-Agent: internal-security-check/1.0",
    "Accept: */*",
    "Connection: close",
    "",
    "",
  ].join("\r\n");
}

async function probeOnce(url, timeoutSec) {
  const timeoutMs = timeoutSec * 1000;

  try {
    const targetUrl = new URL(url);
    const port = Number(targetUrl.port || (targetUrl.protocol === "https:" ? 443 : 80));
    const socket = await connectSocket(
      targetUrl.protocol,
      targetUrl.hostname,
      port,
      timeoutMs
    );

    try {
      socket.write(buildRequest(targetUrl), "utf8");
      const { statusCode } = await readHttpHeaders(socket, timeoutMs);

      if (statusCode === 429) {
        return {
          statusCode,
          available: false,
          reason: "rate_limited",
        };
      }

      if (statusCode !== 404) {
        return {
          statusCode,
          available: true,
          reason: "not_404",
        };
      }

      return {
        statusCode,
        available: false,
        reason: "not_found",
      };
    } finally {
      socket.destroy();
    }
  } catch (error) {
    return {
      statusCode: "",
      available: false,
      reason: error && error.message ? error.message : String(error),
    };
  }
}

async function main() {
  const options = parseArgs(process.argv.slice(2));
  if (options.help) {
    printHelp();
    return;
  }

  const log = createLogger(options.logFile);
  initializeCsv(options.outputCsv);
  const totalCount = options.endSuffix - options.startSuffix + 1;
  const startedAt = Date.now();
  let checkedCount = 0;
  let completedCount = 0;
  let availableCount = 0;
  let storedCount = 0;
  let nextProgressAt = Date.now() + options.progressIntervalMs;
  let nextSuffix = options.startSuffix;
  let stopRequested = false;

  log(
    "INFO",
    `Starting probe. Range=${options.startSuffix}-${options.endSuffix} Total=${totalCount} Concurrency=${options.concurrency} DelayMs=${options.delayMs} TimeoutSec=${options.timeoutSec} Output=${options.outputCsv}`
  );

  function logProgress(force = false) {
    if (
      !force &&
      options.progressIntervalMs !== 0 &&
      Date.now() < nextProgressAt
    ) {
      return;
    }
    nextProgressAt = Date.now() + options.progressIntervalMs;

    const percent =
      totalCount === 0 ? "100.00" : ((completedCount / totalCount) * 100).toFixed(2);
    const inFlight = checkedCount - completedCount;
    log(
      "INFO",
      `Progress ${completedCount}/${totalCount} (${percent}%) Available=${availableCount} Stored=${storedCount} InFlight=${inFlight} Elapsed=${formatElapsedMs(
        Date.now() - startedAt
      )}`
    );
  }

  async function worker() {
    while (!stopRequested) {
      const currentSuffix = nextSuffix;
      if (currentSuffix > options.endSuffix) {
        return;
      }

      nextSuffix += 1;
      checkedCount += 1;

      const suffix = String(currentSuffix).padStart(options.suffixWidth, "0");
      const streamId = `${options.fixedPrefix}${suffix}`;
      const url = options.baseUrlTemplate.split("{0}").join(streamId);
      const probeResult = await probeOnce(url, options.timeoutSec);

      const row = {
        StreamId: streamId,
        Url: url,
        StatusCode: probeResult.statusCode,
        Available: probeResult.available,
        Reason: probeResult.reason,
        CheckedAt: formatLocalDateTime(new Date()),
      };

      if (probeResult.available) {
        availableCount += 1;
        log("INFO", `AVAILABLE ${streamId} ${url}`);
      } else if (probeResult.reason === "rate_limited") {
        log("WARN", `Rate limited at ${streamId} ${url}`);
      } else if (options.verbose) {
        log(
          "INFO",
          `Checked ${streamId} Status=${probeResult.statusCode || "ERR"} Reason=${probeResult.reason}`
        );
      }

      if (!options.onlyAvailable || probeResult.available) {
        appendCsvRow(options.outputCsv, row);
        storedCount += 1;
      }

      completedCount += 1;
      logProgress();

      if (probeResult.reason === "rate_limited" && options.stopOn429) {
        stopRequested = true;
        log("WARN", "Stopping because --stop-on-429 was set.");
      }

      if (!stopRequested && options.delayMs > 0) {
        await sleep(options.delayMs);
      }
    }
  }

  const workerCount = Math.min(
    options.concurrency,
    options.endSuffix - options.startSuffix + 1
  );
  await Promise.all(Array.from({ length: workerCount }, () => worker()));

  logProgress(true);
  log(
    "INFO",
    `Completed. Checked=${checkedCount} Completed=${completedCount} Stored=${storedCount} Available=${availableCount} Output=${options.outputCsv} Elapsed=${formatElapsedMs(
      Date.now() - startedAt
    )}`
  );
}

main().catch((error) => {
  console.error(error.message || error);
  process.exitCode = 1;
});
