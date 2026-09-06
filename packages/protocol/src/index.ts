/**
 * Wire contract shared by the server and every client.
 *
 * Bumped whenever a message shape changes incompatibly; the server refuses
 * connections from clients on a different major protocol version.
 */
export const PROTOCOL_VERSION = 1
