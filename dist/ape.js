var ape = (() => {
  var __create = Object.create;
  var __defProp = Object.defineProperty;
  var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
  var __getOwnPropNames = Object.getOwnPropertyNames;
  var __getProtoOf = Object.getPrototypeOf;
  var __hasOwnProp = Object.prototype.hasOwnProperty;
  var __commonJS = (cb, mod) => function __require() {
    return mod || (0, cb[__getOwnPropNames(cb)[0]])((mod = { exports: {} }).exports, mod), mod.exports;
  };
  var __copyProps = (to, from, except, desc) => {
    if (from && typeof from === "object" || typeof from === "function") {
      for (let key of __getOwnPropNames(from))
        if (!__hasOwnProp.call(to, key) && key !== except)
          __defProp(to, key, { get: () => from[key], enumerable: !(desc = __getOwnPropDesc(from, key)) || desc.enumerable });
    }
    return to;
  };
  var __toESM = (mod, isNodeMode, target) => (target = mod != null ? __create(__getProtoOf(mod)) : {}, __copyProps(
    // If the importer is in node compatibility mode or this is not an ESM
    // file that has been converted to a CommonJS file using a Babel-
    // compatible transform (i.e. "__esModule" has not been set), then set
    // "default" to the CommonJS "module.exports" for node compatibility.
    isNodeMode || !mod || !mod.__esModule ? __defProp(target, "default", { value: mod, enumerable: true }) : target,
    mod
  ));

  // utils/messageHash.js
  var require_messageHash = __commonJS({
    "utils/messageHash.js"(exports, module) {
      var alphabet = "0123456789ABCDEFGHJKMNPQRSTVWXYZ";
      function toBase32(n) {
        const remainder = Math.floor(n / 32);
        const current = n % 32;
        if (0 === remainder) {
          return alphabet[current];
        }
        return toBase32(remainder) + alphabet[current];
      }
      function jenkinsOneAtATimeHash(keyString) {
        var hash = 0;
        for (var charIndex = 0; charIndex < keyString.length; ++charIndex) {
          hash += keyString.charCodeAt(charIndex);
          hash += hash << 10;
          hash ^= hash >> 6;
        }
        hash += hash << 3;
        hash ^= hash >> 11;
        return (hash + (hash << 15) & 4294967295) >>> 0;
      }
      function messageHash2(messageSt) {
        return toBase32(jenkinsOneAtATimeHash(messageSt));
      }
      module.exports = messageHash2;
    }
  });

  // utils/jss.js
  var require_jss = __commonJS({
    "utils/jss.js"(exports, module) {
      function encode(obj) {
        const tagLookup = {
          "[object RegExp]": "R",
          "[object Date]": "D",
          "[object Error]": "E",
          "[object Undefined]": "U",
          "[object Map]": "M",
          "[object Set]": "S"
        };
        const visited = /* @__PURE__ */ new WeakMap();
        function encodeValue(value, path = "") {
          const type = typeof value;
          const tag = tagLookup[Object.prototype.toString.call(value)];
          if (tag !== void 0) {
            if ("D" === tag) return [tag, value.valueOf()];
            if ("E" === tag) return [tag, [value.name, value.message, value.stack]];
            if ("R" === tag) return [tag, value.toString()];
            if ("U" === tag) return [tag, null];
            if ("S" === tag) return [tag, Array.from(value)];
            if ("M" === tag) return [tag, Object.fromEntries(value)];
            return [tag, JSON.stringify(value)];
          } else if (type === "object" && value !== null) {
            if (visitedEncode.has(value)) {
              return ["P", visitedEncode.get(value)];
            }
            visitedEncode.set(value, path);
            const isArray = Array.isArray(value);
            const keys2 = isArray ? Array.from(Array(value.length).keys()) : Object.keys(value);
            const result2 = isArray ? [] : {};
            const typesFound = [];
            for (let i = 0; i < keys2.length; i++) {
              const key = keys2[i];
              const [t, v] = encodeValue(value[key], key);
              if (isArray) {
                typesFound.push(t);
                result2.push(v);
              } else if (value[key] !== void 0) {
                result2[key + (t ? `<!${t}>` : "")] = v;
              }
            }
            visited.delete(value);
            if (isArray && typesFound.find((t) => !!t)) {
              return [`[${typesFound.join()}]`, result2];
            }
            return ["", result2];
          } else {
            return ["", value];
          }
        }
        let keys = [];
        if (Array.isArray(obj)) {
          keys = Array.from(Array(obj.length).keys());
        } else {
          keys = Object.keys(obj);
        }
        const visitedEncode = /* @__PURE__ */ new WeakMap();
        visitedEncode.set(obj, []);
        function encodeValueWithVisited(value, path = []) {
          const type = typeof value;
          const tag = tagLookup[Object.prototype.toString.call(value)];
          if (tag !== void 0) {
            if ("D" === tag) return [tag, value.valueOf()];
            if ("E" === tag) return [tag, [value.name, value.message, value.stack]];
            if ("R" === tag) return [tag, value.toString()];
            if ("U" === tag) return [tag, null];
            if ("S" === tag) return [tag, Array.from(value)];
            if ("M" === tag) return [tag, Object.fromEntries(value)];
            return [tag, JSON.stringify(value)];
          } else if (type === "object" && value !== null) {
            if (visitedEncode.has(value)) {
              return ["P", visitedEncode.get(value)];
            }
            visitedEncode.set(value, path);
            const isArray = Array.isArray(value);
            const objKeys = isArray ? Array.from(Array(value.length).keys()) : Object.keys(value);
            const result2 = isArray ? [] : {};
            const typesFound = [];
            for (let i = 0; i < objKeys.length; i++) {
              const key = objKeys[i];
              const [t, v] = encodeValueWithVisited(value[key], [...path, key]);
              if (isArray) {
                typesFound.push(t);
                result2.push(v);
              } else if (value[key] !== void 0) {
                result2[key + (t ? `<!${t}>` : "")] = v;
              }
            }
            if (isArray && typesFound.find((t) => !!t)) {
              return [`[${typesFound.join()}]`, result2];
            }
            return ["", result2];
          } else {
            return ["", value];
          }
        }
        const result = {};
        for (let i = 0; i < keys.length; i++) {
          const key = keys[i];
          if (obj[key] !== void 0) {
            const [t, v] = encodeValueWithVisited(obj[key], [key]);
            result[key + (t ? `<!${t}>` : "")] = v;
          }
        }
        return result;
      }
      function stringify(obj) {
        return JSON.stringify(encode(obj));
      }
      function parse(encoded) {
        return decode(JSON.parse(encoded));
      }
      function decode(data) {
        const result = {};
        const pointers2Res = [];
        const tagLookup = {
          R: (s) => new RegExp(s),
          D: (n) => new Date(n),
          P: function(sourceToPointAt, replaceAtThisPlace) {
            pointers2Res.push([sourceToPointAt, replaceAtThisPlace]);
            return null;
          },
          E: ([name, message, stack]) => {
            let err;
            try {
              err = new global[name](message);
              if (err instanceof Error) err.stack = stack;
              else throw {};
            } catch (e) {
              err = new Error(message);
              err.name = name;
              err.stack = stack;
            }
            return err;
          },
          U: () => void 0,
          S: (a) => new Set(a),
          M: (o) => new Map(Object.entries(o))
        };
        const visited = /* @__PURE__ */ new Map();
        function decodeValue(name, tag, val) {
          const currentPath = Array.isArray(this) ? this : [];
          if (tag in tagLookup) {
            return tagLookup[tag](val, currentPath);
          } else if (Array.isArray(val)) {
            if (tag && tag.startsWith("[")) {
              const typeTags = tag.slice(1, -1).split(",");
              const res = [];
              for (let i = 0; i < val.length; i++) {
                const itemPath = [...currentPath, i];
                const decodedValue = decodeValue.call(
                  itemPath,
                  i.toString(),
                  typeTags[i],
                  val[i]
                );
                res.push(decodedValue);
              }
              return res;
            } else {
              const res = [];
              for (let i = 0; i < val.length; i++) {
                const decodedValue = decodeValue.call([...currentPath, i], "", "", val[i]);
                res.push(decodedValue);
              }
              return res;
            }
          } else if ("object" === typeof val && val !== null) {
            if (visited.has(val)) {
              return visited.get(val);
            }
            visited.set(val, {});
            const res = {};
            for (const key in val) {
              const [nam, t] = parseKeyWithTags(key);
              const decodedValue = decodeValue.call(
                [...currentPath, nam],
                nam,
                t,
                val[key]
              );
              res[nam] = decodedValue;
            }
            visited.set(val, res);
            return res;
          } else {
            return val;
          }
        }
        function parseKeyWithTags(key) {
          const match = key.match(/(.+)(<!(.)>)/);
          if (match) {
            return [match[1], match[3]];
          }
          const multiMatch = key.match(/(.+)(<!!(.+)>)/);
          if (multiMatch) {
            return [multiMatch[1], multiMatch[3]];
          }
          const arrayMatch = key.match(/(.+)(<!\[(.*)>)/);
          if (arrayMatch) {
            return [arrayMatch[1], "[" + arrayMatch[3]];
          }
          return [key, void 0];
        }
        for (const key in data) {
          const [name, tag] = parseKeyWithTags(key);
          result[name] = decodeValue.call([name], name, tag, data[key]);
        }
        pointers2Res.forEach(changeAttributeReference.bind(null, result));
        return result;
      }
      function changeAttributeReference(obj, [refPath, attrPath]) {
        const refKeys = refPath || [];
        const attrKeys = attrPath || [];
        let ref = obj;
        for (let i = 0; i < refKeys.length; i++) {
          ref = ref[refKeys[i]];
        }
        let attr = obj;
        for (let i = 0; i < attrKeys.length - 1; i++) {
          attr = attr[attrKeys[i]];
        }
        attr[attrKeys[attrKeys.length - 1]] = ref;
        return obj;
      }
      module.exports = { parse, stringify, encode, decode };
    }
  });

  // client/connectSocket.js
  var import_messageHash = __toESM(require_messageHash());
  var import_jss = __toESM(require_jss());
  var connect;
  var configuredPort = null;
  var configuredHost = null;
  function configure(opts = {}) {
    if (opts.port) configuredPort = opts.port;
    if (opts.host) configuredHost = opts.host;
  }
  function getSocketUrl() {
    const hostname = configuredHost || window.location.hostname;
    const localServers = ["localhost", "127.0.0.1", "[::1]"];
    const isLocal = localServers.includes(hostname);
    const isHttps = window.location.protocol === "https:";
    const defaultPort = isLocal ? 9010 : window.location.port || (isHttps ? 443 : 80);
    const port2 = configuredPort || defaultPort;
    const protocol = isHttps ? "wss" : "ws";
    const portSuffix = isLocal || port2 !== 80 && port2 !== 443 ? `:${port2}` : "";
    return `${protocol}://${hostname}${portSuffix}/api/ape`;
  }
  var reconnect = false;
  var connentTimeout = 5e3;
  var totalRequestTimeout = 1e4;
  var joinKey = "/";
  var reservedKeys = /* @__PURE__ */ new Set(["on"]);
  var handler = {
    get(fn, key) {
      if (reservedKeys.has(key)) {
        return fn[key];
      }
      const wrapperFn = function(a, b) {
        let path = joinKey + key, body;
        if (2 === arguments.length) {
          path += a;
          body = b;
        } else {
          body = a;
        }
        return fn(path, body);
      };
      return new Proxy(wrapperFn, handler);
    }
    // END get
  };
  function wrap(api) {
    return new Proxy(api, handler);
  }
  var __socket = false;
  var ready = false;
  var wsSend = false;
  var waitingOn = {};
  var aWaitingSend = [];
  var reciverOnAr = [];
  var ofTypesOb = {};
  function connectSocket() {
    if (!__socket) {
      let findLinkedResources = function(obj, path = "") {
        const resources = [];
        if (obj === null || obj === void 0 || typeof obj !== "object") {
          return resources;
        }
        if (Array.isArray(obj)) {
          for (let i = 0; i < obj.length; i++) {
            resources.push(...findLinkedResources(obj[i], path ? `${path}.${i}` : String(i)));
          }
          return resources;
        }
        for (const key of Object.keys(obj)) {
          if (key.endsWith("<!L>")) {
            const cleanKey = key.slice(0, -4);
            const hash = obj[key];
            resources.push({
              path: path ? `${path}.${cleanKey}` : cleanKey,
              hash,
              originalKey: key
            });
          } else {
            resources.push(...findLinkedResources(obj[key], path ? `${path}.${key}` : key));
          }
        }
        return resources;
      }, setValueAtPath = function(obj, path, value) {
        const parts = path.split(".");
        let current = obj;
        for (let i = 0; i < parts.length - 1; i++) {
          current = current[parts[i]];
        }
        current[parts[parts.length - 1]] = value;
      }, cleanLinkedKeys = function(obj) {
        if (obj === null || obj === void 0 || typeof obj !== "object") {
          return obj;
        }
        if (Array.isArray(obj)) {
          return obj.map(cleanLinkedKeys);
        }
        const cleaned = {};
        for (const key of Object.keys(obj)) {
          if (key.endsWith("<!L>")) {
            const cleanKey = key.slice(0, -4);
            cleaned[cleanKey] = obj[key];
          } else {
            cleaned[key] = cleanLinkedKeys(obj[key]);
          }
        }
        return cleaned;
      };
      __socket = new WebSocket(getSocketUrl());
      __socket.onopen = (event) => {
        ready = true;
        aWaitingSend.forEach(({ type, data, next, err, waiting, createdAt, timer }) => {
          clearTimeout(timer);
          const resultPromise = wsSend(type, data, createdAt);
          if (waiting) {
            resultPromise.then(next).catch(err);
          }
        });
        aWaitingSend = [];
      };
      async function fetchLinkedResources(data, hostId) {
        const resources = findLinkedResources(data);
        if (resources.length === 0) {
          return data;
        }
        console.log(`\u{1F98D} Fetching ${resources.length} binary resource(s)`);
        const cleanedData = cleanLinkedKeys(data);
        const hostname = configuredHost || window.location.hostname;
        const isLocal = ["localhost", "127.0.0.1", "[::1]"].includes(hostname);
        const isHttps = window.location.protocol === "https:";
        const defaultPort = isLocal ? 9010 : window.location.port || (isHttps ? 443 : 80);
        const port2 = configuredPort || defaultPort;
        const protocol = isHttps ? "https" : "http";
        const portSuffix = isLocal || port2 !== 80 && port2 !== 443 ? `:${port2}` : "";
        const baseUrl = `${protocol}://${hostname}${portSuffix}`;
        await Promise.all(resources.map(async ({ path, hash }) => {
          try {
            const response = await fetch(`${baseUrl}/api/ape/data/${hash}`, {
              credentials: "include",
              headers: {
                "X-Ape-Host-Id": hostId || ""
              }
            });
            if (!response.ok) {
              throw new Error(`Failed to fetch binary resource: ${response.status}`);
            }
            const arrayBuffer = await response.arrayBuffer();
            setValueAtPath(cleanedData, path, arrayBuffer);
          } catch (err) {
            console.error(`\u{1F98D} Failed to fetch binary resource at ${path}:`, err);
            setValueAtPath(cleanedData, path, null);
          }
        }));
        return cleanedData;
      }
      __socket.onmessage = async function(event) {
        const { err, type, queryId, data } = import_jss.default.parse(event.data);
        if (queryId) {
          if (waitingOn[queryId]) {
            if (data && !err) {
              try {
                const hydratedData = await fetchLinkedResources(data);
                waitingOn[queryId](err, hydratedData);
              } catch (fetchErr) {
                waitingOn[queryId](fetchErr, null);
              }
            } else {
              waitingOn[queryId](err, data);
            }
            delete waitingOn[queryId];
          } else {
            console.error(`\u{1F98D} No matching queryId: ${queryId}`);
          }
          return;
        }
        let processedData = data;
        if (data && !err) {
          try {
            processedData = await fetchLinkedResources(data);
          } catch (fetchErr) {
            console.error(`\u{1F98D} Failed to hydrate broadcast data:`, fetchErr);
          }
        }
        if (ofTypesOb[type]) {
          ofTypesOb[type].forEach((worker) => worker({ err, type, data: processedData }));
        }
        reciverOnAr.forEach((worker) => worker({ err, type, data: processedData }));
      };
      __socket.onerror = function(err) {
        console.error("socket ERROR:", err);
      };
      __socket.onclose = function(event) {
        console.warn("socket disconnect:", event);
        __socket = false;
        ready = false;
        setTimeout(() => reconnect && connectSocket(), 500);
      };
    }
    function isBinaryData(value) {
      if (value === null || value === void 0) return false;
      return value instanceof ArrayBuffer || ArrayBuffer.isView(value) || typeof Blob !== "undefined" && value instanceof Blob;
    }
    function getBinaryTag(value) {
      if (typeof Blob !== "undefined" && value instanceof Blob) return "B";
      return "A";
    }
    function generateUploadHash(path) {
      let hash = 0;
      for (let i = 0; i < path.length; i++) {
        const char = path.charCodeAt(i);
        hash = (hash << 5) - hash + char;
        hash = hash & hash;
      }
      return Math.abs(hash).toString(36);
    }
    function processBinaryForUpload(data, path = "") {
      if (data === null || data === void 0) {
        return { processedData: data, uploads: [] };
      }
      if (isBinaryData(data)) {
        const tag = getBinaryTag(data);
        const hash = generateUploadHash(path || "root");
        return {
          processedData: { [`__ape_upload__`]: hash },
          uploads: [{ path, hash, data, tag }]
        };
      }
      if (Array.isArray(data)) {
        const processedArray = [];
        const allUploads = [];
        for (let i = 0; i < data.length; i++) {
          const itemPath = path ? `${path}.${i}` : String(i);
          const { processedData, uploads } = processBinaryForUpload(data[i], itemPath);
          processedArray.push(processedData);
          allUploads.push(...uploads);
        }
        return { processedData: processedArray, uploads: allUploads };
      }
      if (typeof data === "object") {
        const processedObj = {};
        const allUploads = [];
        for (const key of Object.keys(data)) {
          const itemPath = path ? `${path}.${key}` : key;
          const { processedData, uploads } = processBinaryForUpload(data[key], itemPath);
          if (uploads.length > 0 && processedData?.__ape_upload__) {
            const tag = uploads[uploads.length - 1].tag;
            processedObj[`${key}<!${tag}>`] = processedData.__ape_upload__;
          } else {
            processedObj[key] = processedData;
          }
          allUploads.push(...uploads);
        }
        return { processedData: processedObj, uploads: allUploads };
      }
      return { processedData: data, uploads: [] };
    }
    async function uploadBinaryData(queryId, uploads) {
      if (uploads.length === 0) return;
      const hostname = configuredHost || window.location.hostname;
      const isLocal = ["localhost", "127.0.0.1", "[::1]"].includes(hostname);
      const isHttps = window.location.protocol === "https:";
      const defaultPort = isLocal ? 9010 : window.location.port || (isHttps ? 443 : 80);
      const port2 = configuredPort || defaultPort;
      const protocol = isHttps ? "https" : "http";
      const portSuffix = isLocal || port2 !== 80 && port2 !== 443 ? `:${port2}` : "";
      const baseUrl = `${protocol}://${hostname}${portSuffix}`;
      console.log(`\u{1F98D} Uploading ${uploads.length} binary file(s)`);
      await Promise.all(uploads.map(async ({ hash, data }) => {
        try {
          const response = await fetch(`${baseUrl}/api/ape/data/${queryId}/${hash}`, {
            method: "PUT",
            credentials: "include",
            headers: {
              "Content-Type": "application/octet-stream"
            },
            body: data
          });
          if (!response.ok) {
            throw new Error(`Upload failed: ${response.status}`);
          }
        } catch (err) {
          console.error(`\u{1F98D} Failed to upload binary at ${hash}:`, err);
          throw err;
        }
      }));
    }
    wsSend = function(type, data, createdAt, dirctCall) {
      let rej, promiseIsLive = false;
      const timeLetForReqToBeMade = createdAt + totalRequestTimeout - Date.now();
      const timer = setTimeout(() => {
        if (promiseIsLive) {
          rej(new Error("Request Timedout for :" + type));
        }
      }, timeLetForReqToBeMade);
      const { processedData, uploads } = processBinaryForUpload(data);
      const payload = {
        type,
        data: processedData,
        //referer:window.location.href,
        createdAt: new Date(createdAt),
        requestedAt: dirctCall ? void 0 : /* @__PURE__ */ new Date()
      };
      const message = import_jss.default.stringify(payload);
      const queryId = (0, import_messageHash.default)(message);
      const replyPromise = new Promise((resolve, reject) => {
        rej = reject;
        waitingOn[queryId] = (err2, result) => {
          clearTimeout(timer);
          replyPromise.then = next.bind(replyPromise);
          if (err2) {
            reject(err2);
          } else {
            resolve(result);
          }
        };
        __socket.send(message);
        if (uploads.length > 0) {
          uploadBinaryData(queryId, uploads).catch((err2) => {
            console.error("\u{1F98D} Binary upload failed:", err2);
          });
        }
      });
      const next = replyPromise.then;
      replyPromise.then = (worker) => {
        promiseIsLive = true;
        replyPromise.then = next.bind(replyPromise);
        replyPromise.catch = err.bind(replyPromise);
        return next.call(replyPromise, worker);
      };
      const err = replyPromise.catch;
      replyPromise.catch = (worker) => {
        promiseIsLive = true;
        replyPromise.catch = err.bind(replyPromise);
        replyPromise.then = next.bind(replyPromise);
        return err.call(replyPromise, worker);
      };
      return replyPromise;
    };
    const sender2 = (type, data) => {
      if ("string" !== typeof type) {
        throw new Error("Missing Path vaule");
      }
      const createdAt = Date.now();
      if (ready) {
        return wsSend(type, data, createdAt, true);
      }
      const timeLetForReqToBeMade = createdAt + connentTimeout - Date.now();
      const timer = setTimeout(() => {
        const errMessage = "Request not sent for :" + type;
        if (payload.waiting) {
          payload.err(new Error(errMessage));
        } else {
          throw new Error(errMessage);
        }
      }, timeLetForReqToBeMade);
      const payload = { type, data, next: void 0, err: void 0, waiting: false, createdAt, timer };
      const waitingOnOpen = new Promise((res, er) => {
        payload.next = res;
        payload.err = er;
      });
      const waitingOnOpenThen = waitingOnOpen.then;
      const waitingOnOpenCatch = waitingOnOpen.catch;
      waitingOnOpen.then = (worker) => {
        payload.waiting = true;
        waitingOnOpen.then = waitingOnOpenThen.bind(waitingOnOpen);
        waitingOnOpen.catch = waitingOnOpenCatch.bind(waitingOnOpen);
        return waitingOnOpenThen.call(waitingOnOpen, worker);
      };
      waitingOnOpen.catch = (worker) => {
        payload.waiting = true;
        waitingOnOpen.catch = waitingOnOpenCatch.bind(waitingOnOpen);
        waitingOnOpen.then = waitingOnOpenThen.bind(waitingOnOpen);
        return waitingOnOpenCatch.call(waitingOnOpen, worker);
      };
      aWaitingSend.push(payload);
      if (!__socket) {
        connectSocket();
      }
      return waitingOnOpen;
    };
    return {
      sender: wrap(sender2),
      setOnReciver: (onTypeStFn, handlerFn) => {
        if ("string" === typeof onTypeStFn) {
          ofTypesOb[onTypeStFn] = [handlerFn];
        } else {
          if (!reciverOnAr.includes(onTypeStFn)) {
            reciverOnAr.push(onTypeStFn);
          }
        }
      }
      // END setOnReciver
    };
  }
  connectSocket.autoReconnect = () => reconnect = true;
  connectSocket.configure = configure;
  connect = connectSocket;
  var connectSocket_default = connect;

  // client/browser.js
  var port = window.location.port || (window.location.protocol === "https:" ? 443 : 80);
  connectSocket_default.configure({ port: parseInt(port, 10) });
  var { sender, setOnReciver } = connectSocket_default();
  connectSocket_default.autoReconnect();
  window.ape = sender;
  Object.defineProperty(window.ape, "on", {
    value: setOnReciver,
    writable: false,
    enumerable: false,
    configurable: false
  });
})();
