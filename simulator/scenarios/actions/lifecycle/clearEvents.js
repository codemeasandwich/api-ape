/**
 * Clear all tracked events
 *
 * @param {Object} options - Options
 * @param {Object} options.events - Events object to clear
 * @returns {void}
 */
function clearEvents({ events }) {
  events.connections.length = 0;
  events.disconnections.length = 0;
  events.receives.length = 0;
  events.sends.length = 0;
  events.errors.length = 0;
}

module.exports = clearEvents;
