/**
 * Stream buffer parser - extracts JSON objects from streaming data
 * @module client/transports/streamParser
 */

import jss from '../../utils/jss'

/**
 * Parse JSON objects from a streaming buffer by counting braces
 * Handles strings containing braces correctly
 * @param {string} buffer - Raw streaming buffer content
 * @returns {{messages: Object[], remaining: string}} Parsed messages and remaining unparsed buffer
 */
export function parseStreamBuffer(buffer) {
    const messages = []
    let start = -1
    let depth = 0
    let inString = false
    let escaped = false

    for (let i = 0; i < buffer.length; i++) {
        const char = buffer[i]

        if (escaped) {
            escaped = false
            continue
        }

        if (char === '\\' && inString) {
            escaped = true
            continue
        }

        if (char === '"') {
            inString = !inString
            continue
        }

        if (inString) continue

        if (char === '{') {
            if (depth === 0) start = i
            depth++
        } else if (char === '}') {
            depth--
            if (depth === 0 && start !== -1) {
                const jsonStr = buffer.slice(start, i + 1)
                try {
                    messages.push(jss.parse(jsonStr))
                } catch (e) {
                    console.error('🦍 Failed to parse stream message:', e)
                }
                start = -1
            }
        }
    }

    const remaining = start !== -1 ? buffer.slice(start) : ''
    return { messages, remaining }
}
