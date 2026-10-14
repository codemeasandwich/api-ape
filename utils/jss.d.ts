// Type definitions for `api-ape/jss` (JSON Super Set: Date, RegExp, Error, Set, Map, undefined, circular references)

/**
 * Serialise a value to JSS text (JSON with `<!X>`-tagged keys). `errorStacks: false` sends every
 * Error's stack as "Name: message" (use it when the text leaves your process: a real stack holds absolute paths).
 */
export declare function stringify(value: any, options?: { errorStacks?: boolean }): string

/** Parse JSS text back to values (Dates, Maps, Errors, `undefined` ... restored). */
export declare function parse(text: string): any

/** Encode a value to a JSON-compatible object with tagged keys (no string step). */
export declare function encode(value: any, options?: { errorStacks?: boolean }): any

/** Decode what `encode` produced. */
export declare function decode(value: any): any
