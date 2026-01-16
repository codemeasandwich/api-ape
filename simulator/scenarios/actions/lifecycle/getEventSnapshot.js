/**
 * Track lifecycle events for a server over a period
 *
 * @param {Object} options - Options
 * @param {Object} options.events - Events object from createServerWithEmbed
 * @returns {Object} Snapshot of current events
 *
 * @example
 * const snapshot = getEventSnapshot({ events })
 */
function getEventSnapshot({ events }) {
  return {
    connectionCount: events.connections.length,
    disconnectionCount: events.disconnections.length,
    receiveCount: events.receives.length,
    sendCount: events.sends.length,
    errorCount: events.errors.length,
    connections: [...events.connections],
    disconnections: [...events.disconnections],
    receives: [...events.receives],
    sends: [...events.sends],
    errors: [...events.errors],
  };
}

module.exports = getEventSnapshot;
