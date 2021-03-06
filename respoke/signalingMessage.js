/*
 * Copyright 2015, Digium, Inc.
 * All rights reserved.
 *
 * This source code is licensed under The MIT License found in the
 * LICENSE file in the root directory of this source tree.
 *
 * For all details and documentation:  https://www.respoke.io
 */

/**
 * A signaling message and the information needed to route it.
 * @class respoke.SignalingMessage
 * @constructor
 * @param {object} params
 * @param {string} [params.fromEndpoint] - If sending, the endpoint ID of the recipient
 * @param {string} [params.fromConnection] - If sending, the connection ID of the recipient
 * @param {string} [params.connectionId] - The connectionId of the endpoint whose answer signal has been accepted.
 * @param {string} [params.signal] - If sending, a message to send
 * @param {respoke.Endpoint} [params.recipient]
 * @param {string} [params.signalType]
 * @param {string} [params.sessionId] - A globally unique ID to identify this call.
 * @param {string} [params.target] - Either 'call' or 'directConnection', TODO remove the need for this.
 * @param {string} [params.callerId] - Human readable caller ID. Not implemented.
 * @param {RTCSessionDescription} [params.sdp]
 * @param {Array<RTCIceCandidate>} [params.iceCandidates]
 * @param {object} [params.offering] - Object describing the media we're offering to send the remote party in a more
 * usable way than SDP. Not implemented.
 * @param {object} [params.requesting] - Object describing the media we're requesting from the remote party in a more
 * usable way than SDP. Not implemented.
 * @param {string} [params.reason] - Human readable reason for hanging up.
 * @param {string} [params.error] - String indicating that a previous signal was malformed or received in the wrong
 * state. Not implemented.
 * @param {string} [params.status] - "Ringing". Not implemented.
 * @param {object} [params.rawMessage] - If receiving, the parsed JSON we got from the server
 * @private
 * @returns {respoke.SignalingMessage}
 */
module.exports = function (params) {
    "use strict";
    params = params || {};
    var that = {};

    /**
     * Attributes without which we cannot build a signaling message.
     * @memberof! respoke.SignalingMessage
     * @name required
     * @private
     */
    var required = ['signalType', 'sessionId', 'target', 'signalId'];

    /**
     * Attributes which we will copy onto the signal if defined.
     * @memberof! respoke.SignalingMessage
     * @name required
     * @private
     */
    var optional = [
        'sessionDescription', 'iceCandidates', 'offering', 'callerId', 'requesting',
        'reason', 'error', 'status', 'connectionId', 'finalCandidates', 'metadata',
        'action'
    ];

    /**
     * Parse rawMessage and set attributes required for message delivery.
     * @memberof! respoke.SignalingMessage
     * @method respoke.SignalingMessage.parse
     * @private
     */
    function parse() {
        if (params.rawMessage) {
            try {
                that = JSON.parse(params.rawMessage.body); // Incoming message
            } catch (e) {
                that = params.rawMessage.body;
            }
            that.fromType = params.rawMessage.header.fromType;
            that.fromEndpoint = params.rawMessage.header.from;
            that.fromConnection = params.rawMessage.header.fromConnection;
            that.timestamp = params.rawMessage.header.timestamp;

            if (!that.target) {
                that.target = 'call';
            }
        } else {
            required.forEach(function eachAttr(attr) {
                if (!params.hasOwnProperty(attr)) {
                    throw new Error("Can't build a signaling without " + attr);
                }
                that[attr] = params[attr];
            });

            optional.forEach(function eachAttr(attr) {
                if (params.hasOwnProperty(attr)) {
                    that[attr] = params[attr];
                }
            });
        }
    }

    parse();

    that.version = '1.0';

    return that;
}; // End respoke.SignalingMessage
