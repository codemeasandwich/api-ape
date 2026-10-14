/**
 * @file TypeScript Echo Controller - proves apeBun's `selector` option
 *
 * Loaded only when apeBun is called with `selector: ['js', 'ts']`; the
 * default selector (`['js']`) must ignore it.
 */

/**
 * Echo the payload back, tagged so the caller can see a `.ts` file answered.
 *
 * @param {unknown} data - Request payload
 * @returns {{ success: boolean, runtime: string, received: unknown }} Echo response
 */
module.exports = function tsEcho(data: unknown) {
    return { success: true, runtime: 'ts', received: data };
};
