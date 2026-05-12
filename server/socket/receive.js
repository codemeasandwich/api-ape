/**
 * @fileoverview WebSocket Message Receive Handler for api-ape Server
 *
 * Handles incoming WebSocket messages: parsing, binary uploads, routing, responses.
 *
 * @module server/socket/receive
 * @see {@link module:server/socket/receiveContext} for controller context
 */

const { apeLog } = require("../../utils/apeLogger");
const messageHash = require("../../utils/messageHash");
const { subscribe, unsubscribe } = require("../lib/broadcast");
const jss = require("../../utils/jss");
const {
  findUploadTags,
  findFileTags,
  cleanUploadTags,
  setValueAtPath,
} = require("./tagUtils");
const { processPluginReceive, findPluginTags } = require("./pluginHooks");
const { getAllPlugins } = require("../../utils/jss/plugins");
const { getSessionId, createControllerContext } = require("./receiveContext");
const { createAuthMessageHandler } = require("../security/auth/handlers/auth-messages");
const { isAuthMessage } = require("../security/auth");

/**
 * Create a message receive handler for a WebSocket connection
 *
 * @param {Object} ape - The connection context object
 * @returns {Function} Async function that handles incoming messages
 */
module.exports = function receiveHandler(ape) {
  const {
    send,
    checkReply,
    events,
    controllers,
    sharedValues,
    clientId,
    embedValues,
    fileTransfer,
    socketAuth,
    authMiddleware,
  } = ape;

  const sessionId = getSessionId(sharedValues.req);
  const that = createControllerContext({ sharedValues, embedValues, clientId, sessionId, socketAuth });

  // Create auth message handler if auth is configured
  const handleAuthMessage = socketAuth
    ? createAuthMessageHandler(socketAuth, send)
    : null;

  return async function onReceive(msg) {
    const msgString = typeof msg === "string" ? msg : msg.toString("utf8");
    const queryId = messageHash(msgString);

    try {
      const rawParsed = JSON.parse(msgString);
      const rawData = rawParsed.data;

      // Handle subscribe/unsubscribe messages
      if (rawParsed.subscribe) {
        const channel = rawParsed.subscribe;
        const result = subscribe(clientId, channel);
        if (result?.lastMessage) {
          try {
            send(false, result.channel, result.lastMessage, false);
          } catch (sendErr) {
            // Socket likely closed
          }
        }
        return;
      }

      if (rawParsed.unsubscribe) {
        unsubscribe(clientId, rawParsed.unsubscribe);
        return;
      }

      const { type: rawType, data, createdAt } = jss.parse(msgString);
      const type = rawType.replace(/^\//, "");

      // Handle authentication messages first (before any other processing)
      if (handleAuthMessage && isAuthMessage(type)) {
        await handleAuthMessage(queryId, type, data);
        return;
      }

      const onFinish = events.onReceive(queryId, data, type) || (() => { });

      // Check authorization if middleware is configured
      if (authMiddleware && socketAuth) {
        const authzResult = authMiddleware.check(socketAuth, type, { queryId, data });
        if (!authzResult.allowed) {
          const failResponse = authMiddleware.createFailResponse(authzResult);
          try {
            send(queryId, failResponse.type, failResponse, null);
          } catch (sendErr) {
            // Socket likely closed
          }
          if (typeof onFinish === "function") onFinish(failResponse, true);
          return;
        }
      }

      let processedData = data;

      if (fileTransfer && rawData) {
        const pluginTags = findPluginTags(rawData);

        if (getAllPlugins().size > 0 && pluginTags.length > 0) {
          const context = {
            queryId,
            clientId,
            fileTransfer,
            direction: "receive",
          };

          try {
            processedData = await processPluginReceive(data, rawData, context);
          } catch (pluginErr) {
            try {
              send(queryId, false, false, pluginErr);
            } catch (sendErr) { }
            if (typeof onFinish === "function") onFinish(pluginErr, true);
            return;
          }
        } else {
          const uploadTags = findUploadTags(rawData);

          if (uploadTags.length > 0) {
            processedData = cleanUploadTags(data);

            try {
              await Promise.all(
                uploadTags.map(async ({ path, hash }) => {
                  const uploadData = await fileTransfer.registerUpload(
                    queryId,
                    hash,
                    clientId,
                  );
                  setValueAtPath(processedData, path, uploadData);
                }),
              );
            } catch (uploadErr) {
              try {
                send(queryId, false, false, uploadErr);
              } catch (sendErr) { }
              if (typeof onFinish === "function") onFinish(uploadErr, true);
              return;
            }
          }

          const fileTags = findFileTags(rawData);
          if (fileTags.length > 0) {
            fileTags.forEach(({ hash }) =>
              fileTransfer.registerStreamingFile(hash, clientId),
            );
          }
        }
      }

      const result = new Promise((resolve, reject) => {
        try {
          const controller = controllers[type];

          if (!controller) {
            throw `TypeError: "${type}" was not found`;
          }

          checkReply(queryId, createdAt);

          // Inject a per-request keepalive function onto the controller
          // context. Long-running controllers (e.g., sessions/message with
          // stream:false) call this.keepalive() periodically to send a
          // heartbeat signal that resets the client's RPC timeout timer,
          // preventing legitimate slow operations from timing out.
          that._currentQueryId = queryId;
          that.keepalive = () => {
            try {
              send(queryId, false, false, false, true);
            } catch (_) { /* socket may be closed */ }
          };

          resolve(controller.call(that, processedData));
        } catch (err) {
          reject(err);
        }
      });

      result
        .then((val) => {
          if (undefined !== val) {
            try {
              send(queryId, false, val, false);
            } catch (sendErr) { }
          }
          if (typeof onFinish === "function") onFinish(false, val);
        })
        .catch((err) => {
          try {
            send(queryId, false, false, err);
          } catch (sendErr) { }
          if (typeof onFinish === "function") onFinish(err, true);
        });
    } catch (err) {
      // Wrap in try/catch — if the error is a RangeError (stack overflow),
      // even calling events.onError() can fail due to stack exhaustion.
      try {
        events.onError(clientId, queryId, err.message || err);
      } catch (_) {
        apeLog.error('[api-ape] Fatal: error handler failed for message processing.', err);
      }
    }
  };
};
