(() => {
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

  // utils/jjs.js
  var require_jjs = __commonJS({
    "utils/jjs.js"(exports, module) {
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
            if (visited.has(value)) {
              return ["P", visited.get(value)];
            }
            visited.set(value, path);
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
        const result = {};
        for (let i = 0; i < keys.length; i++) {
          const key = keys[i];
          if (obj[key] !== void 0) {
            const [t, v] = encodeValue(obj[key], key);
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
            pointers2Res.push([sourceToPointAt, replaceAtThisPlace + ""]);
            return sourceToPointAt;
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
          if (tag in tagLookup) {
            return tagLookup[tag](val, this);
          } else if (Array.isArray(val)) {
            if (tag && tag.startsWith("[")) {
              const typeTags = tag.slice(1, -1).split(",");
              const result2 = [];
              for (let i = 0; i < val.length; i++) {
                const decodedValue = decodeValue.call(
                  `${this}${this ? "/" : ""}${name}`,
                  "",
                  typeTags[i],
                  val[i]
                );
                result2.push(decodedValue);
              }
              return result2;
            } else {
              const result2 = [];
              for (let i = 0; i < val.length; i++) {
                const decodedValue = decodeValue.call(`${this}${this ? "/" : ""}${name}`, "", "", val[i]);
                result2.push(decodedValue);
              }
              return result2;
            }
          } else if ("object" === typeof val && val !== null) {
            if (visited.has(val)) {
              return visited.get(val);
            }
            visited.set(val, {});
            const result2 = {};
            for (const key in val) {
              const [nam, tag2] = parseKeyWithTags(key);
              const decodedValue = decodeValue.call(
                `${name}${name ? "/" : ""}${nam}`,
                nam,
                tag2,
                val[key]
              );
              result2[nam] = decodedValue;
            }
            visited.set(val, result2);
            return result2;
          } else {
            return val;
          }
        }
        function parseKeyWithTags(key) {
          const match = key.match(/(.+)(<!(.+)>)/);
          if (match) {
            return [match[1], match[3]];
          } else {
            return [key, void 0];
          }
        }
        for (const key in data) {
          const [name, tag] = parseKeyWithTags(key);
          result[name] = decodeValue.call("", name, tag, data[key]);
        }
        pointers2Res.forEach(changeAttributeReference.bind(null, result));
        return result;
      }
      function changeAttributeReference(obj, [refPath, attrPath]) {
        const refKeys = refPath.split("/");
        const attrKeys = attrPath.split("/");
        let ref = obj;
        let attr = obj;
        for (let i = 0; i < refKeys.length - 1; i++) {
          ref = ref[refKeys[i]];
        }
        for (let i = 0; i < attrKeys.length - 1; i++) {
          attr = attr[attrKeys[i]];
        }
        attr[attrKeys[attrKeys.length - 1]] = ref[refKeys[refKeys.length - 1]];
        return obj;
      }
      module.exports = { parse, stringify, encode, decode };
    }
  });

  // client/connectSocket.js
  var import_messageHash = __toESM(require_messageHash());
  var import_jjs = __toESM(require_jjs());
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
  var handler = {
    get(fn, key) {
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
      __socket.onmessage = function(event) {
        const { err, type, queryId, data } = import_jjs.default.parse(event.data);
        if (queryId) {
          if (waitingOn[queryId]) {
            waitingOn[queryId](err, data);
            delete waitingOn[queryId];
          } else {
            console.error(`\u{1F98D} No matching queryId: ${queryId}`);
          }
          return;
        }
        if (ofTypesOb[type]) {
          ofTypesOb[type].forEach((worker) => worker({ err, type, data }));
        }
        reciverOnAr.forEach((worker) => worker({ err, type, data }));
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
    wsSend = function(type, data, createdAt, dirctCall) {
      let rej, promiseIsLive = false;
      const timeLetForReqToBeMade = createdAt + totalRequestTimeout - Date.now();
      const timer = setTimeout(() => {
        if (promiseIsLive) {
          rej(new Error("Request Timedout for :" + type));
        }
      }, timeLetForReqToBeMade);
      const payload = {
        type,
        data,
        //referer:window.location.href,
        createdAt: new Date(createdAt),
        requestedAt: dirctCall ? void 0 : /* @__PURE__ */ new Date()
      };
      const message = import_jjs.default.stringify(payload);
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
  window.ape.on = setOnReciver;
})();
