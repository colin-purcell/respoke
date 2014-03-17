/**************************************************************************************************
 *
 * Copyright (c) 2014 Digium, Inc.
 * All Rights Reserved. Licensed Software.
 *
 * @authors : Erin Spiceland <espiceland@digium.com>
 */

/**
 * Create a new direct connection via RTCDataChannel.
 * @author Erin Spiceland <espiceland@digium.com>
 * @class brightstream.DirectConnection
 * @constructor
 * @augments brightstream.EventEmitter
 * @classdesc WebRTC DataChannel including path negotation and connection state.
 * @param {string} client - client id
 * @param {boolean} initiator - whether or not we initiated the connection
 * @param {boolean} forceTurn - If true, delete all 'host' and 'srvflx' candidates and send only 'relay' candidates.
 * @param {brightstream.Endpoint} remoteEndpoint
 * @param {string} connectionId - The connection ID of the remoteEndpoint.
 * @param {function} signalOffer - Signaling action from SignalingChannel.
 * @param {function} signalConnected - Signaling action from SignalingChannel.
 * @param {function} signalAnswer - Signaling action from SignalingChannel.
 * @param {function} signalTerminate - Signaling action from SignalingChannel.
 * @param {function} signalReport - Signaling action from SignalingChannel.
 * @param {function} signalCandidate - Signaling action from SignalingChannel.
 * @param {function} [onClose] - Callback for the developer to be notified about closing the connection.
 * @param {function} [onOpen] - Callback for the developer to be notified about opening the connection.
 * @param {function} [onMessage] - Callback for the developer to be notified about incoming messages. Not usually
 * necessary to listen to this event if you are already listening to brightstream.Endpoint#message
 * @param {function} [onStats] - Callback for the developer to receive statistics about the connection.
 * This is only used if connection.getStats() is called and the stats module is loaded.
 * @param {object} connectionSettings
 * @returns {brightstream.DirectConnection}
 */
/*global brightstream: false */
brightstream.DirectConnection = function (params) {
    "use strict";
    params = params || {};
    var client = params.client;
    var that = brightstream.EventEmitter(params);
    delete that.client;
    that.className = 'brightstream.DirectConnection';
    that.id = brightstream.makeUniqueID().toString();

    if (!that.initiator) {
        that.initiator = false;
    }

    var pc = null;
    var dataChannel = null;
    var defOffer = Q.defer();
    var defAnswer = Q.defer();
    var defApproved = Q.defer();
    var forceTurn = typeof params.forceTurn === 'boolean' ? params.forceTurn : false;
    var candidateSendingQueue = [];
    var candidateReceivingQueue = [];
    var clientObj = brightstream.getClient(client);
    var signalOffer = params.signalOffer;
    var signalConnected = params.signalConnected;
    var signalAnswer = params.signalAnswer;
    var signalTerminate = params.signalTerminate;
    var signalReport = params.signalReport;
    function signalCandidate(oCan) {
        params.signalCandidate({
            candidate: oCan,
            connectionId: that.connectionId
        });
        report.candidatesSent.push(oCan);
    }
    var connectionSettings = params.connectionSettings;

    [ // clean up
        'signalOffer', 'signalConnected', 'signalAnswer', 'signalTerminate',
        'signalReport', 'signalCandidate', ''
    ].forEach(function (name) { delete that[name]; });
    var options = {
        optional: [
            { DtlsSrtpKeyAgreement: true },
            { RtpDataChannels: false }
        ]
    };

    var report = {
        connectionStarted: 0,
        connectionStopped: 0,
        lastSDPString: '',
        sdpsSent: [],
        sdpsReceived: [],
        candidatesSent: [],
        candidatesReceived: [],
        stats: [],
        userAgent: navigator.userAgent,
        os: navigator.platform
    };

    var ST_STARTED = 0;
    var ST_INREVIEW = 1;
    var ST_APPROVED = 2;
    var ST_OFFERED = 3;
    var ST_ANSWERED = 4;
    var ST_FLOWING = 5;
    var ST_ENDED = 6;
    var ST_MEDIA_ERROR = 7;

    /**
     * Initiate some state. If we're not the initiator, we need to listen for approval AND the remote SDP to come in
     * before we can act on the peerconnection. Save callbacks off the params object passed into the DirectConnection
     * constructor and add them as listeners onto their respective DirectConnection events.
     */
    if (that.initiator !== true) {
        Q.all([defApproved.promise, defOffer.promise]).spread(function (approved, oOffer) {
            if (approved === true && oOffer && oOffer.sdp) {
                processOffer(oOffer);
            }
        }, function (err) {
            log.warn("Call rejected.");
        }).done();
    }

    /**
     * Register any event listeners passed in as callbacks
     * @memberof! brightstream.DirectConnection
     * @method brightstream.DirectConnection.registerListeners
     * @param {function} [onOpen]
     * @param {function} [onClose]
     * @param {function} [onMessage]
     * @private
     */
    function registerListeners(params) {
        if (typeof params.onOpen === 'function') {
            that.listen('open', params.onOpen);
        }

        if (typeof params.onClose === 'function') {
            that.listen('close', params.onClose);
        }

        if (typeof params.onMessage === 'function') {
            that.listen('message', params.onMessage);
        }
    }
    registerListeners(params);

    /**
     * Start the process of obtaining media. registerListeners will only be meaningful for the non-initiator,
     * since the library calls this method for the initiator. Developers will use this method to pass in
     * callbacks for the non-initiator.
     * @memberof! brightstream.DirectConnection
     * @method brightstream.DirectConnection.accept
     * @fires brightstream.DirectConnection#accept
     * @param {function} [onOpen]
     * @param {function} [onClose]
     * @param {function} [onMessage]
     * @param {boolean} [forceTurn]
     */
    that.accept = function (params) {
        that.state = ST_STARTED;
        params = params || {};
        log.trace('answer');
        registerListeners(params);

        forceTurn = typeof params.forceTurn === 'boolean' ? params.forceTurn : forceTurn;

        log.debug("I am " + (that.initiator ? '' : 'not ') + "the initiator.");

        /**
         * @event brightstream.DirectConnection#answer
         * @type {brighstream.Event}
         */
        that.fire('accept');
        startPeerConnection(params);
        createDataChannel();
    };

    /**
     * Start the process of network and media negotiation. Called after local video approved.
     * @memberof! brightstream.DirectConnection
     * @method brightstream.DirectConnection.approve.
     * @fires brightstream.DirectConnection#approve
     */
    that.approve = function () {
        that.state = ST_APPROVED;
        log.trace('Call.approve');
        /**
         * @event brightstream.DirectConnection#approve
         */
        that.fire('approve');
        defApproved.resolve(true);

        if (that.initiator === true) {
            log.info('creating offer');
            pc.createOffer(saveOfferAndSend, function errorHandler(p) {
                log.error('createOffer failed');
            }, {
                mandatory: {
                    OfferToReceiveAudio: true,
                    OfferToReceiveVideo: true
                }
            });
        }
    };

    /**
     * Process a remote offer if we are not the initiator.
     * @memberof! brightstream.DirectConnection
     * @method brightstream.DirectConnection.processOffer
     * @private
     * @param {RTCSessionDescriptor}
     */
    function processOffer(oOffer) {
        log.trace('processOffer');
        log.debug('processOffer', oOffer);

        try {
            pc.setRemoteDescription(new RTCSessionDescription(oOffer),
                function successHandler() {
                    log.debug('set remote desc of offer succeeded');
                    pc.createAnswer(saveAnswerAndSend, function errorHandler(err) {
                        log.error("Error creating SDP answer.", err);
                        report.connectionStoppedReason = 'Error creating SDP answer.';
                    });
                }, function errorHandler(err) {
                    log.error('set remote desc of offer failed', err);
                    report.connectionStoppedReason = 'setLocalDescr failed at offer.';
                    that.close();
                }
            );
            that.state = ST_OFFERED;
        } catch (err) {
            log.error("error processing offer: ", err);
        }
    }

    /**
     * Return media stats. Since we have to wait for both the answer and offer to be available before starting
     * statistics, we'll return a promise for the stats object.
     * @memberof! brightstream.DirectConnection
     * @method brightstream.DirectConnection.getStats
     * @returns {Promise<object>}
     * @param {number} [interval=5000] - How often in milliseconds to fetch statistics.
     * @param {function} [onStats] - An optional callback to receive the stats. If no callback is provided,
     * the connection's report will contain stats but the developer will not receive them on the client-side.
     * @param {function} [onSuccess] - Success handler for this invocation of this method only.
     * @param {function} [onError] - Error handler for this invocation of this method only.
     */
    function getStats(params) {
        var deferred = brightstream.makeDeferred(null, function (err) {
            log.warn("Couldn't start stats:", err.message);
        });

        if (!pc) {
            deferred.reject(new Error("Can't get stats, pc is null."));
            return deferred.promise;
        }

        if (brightstream.MediaStats) {
            that.listen('stats', params.onStats);
            Q.all([defOffer.promise, defAnswer.promise]).done(function () {
                var stats = brightstream.MediaStats({
                    peerConnection: pc,
                    interval: params.interval,
                    onStats: function (stats) {
                        /**
                         * @event brightstream.DirectConnection#stats
                         * @type {brightstream.Event}
                         * @property {object} stats - an object with stats in it.
                         */
                        that.fire('stats', {
                            stats: stats
                        });
                        report.stats.push(stats);
                    }
                });
                that.listen('close', function (evt) {
                    stats.stopStats();
                }, true);
                deferred.resolve(stats);
            }, function (err) {
                log.warn("DirectConnection rejected.");
            });
        } else {
            deferred.reject(new Error("Statistics module is not loaded."));
        }
        return deferred.promise;
    }

    if (brightstream.MediaStats) {
        that.getStats = getStats;
    }

    /**
     * Detect datachannel errors for internal state.
     * @memberof! brightstream.DirectConnection
     * @method brightstream.DirectConnection.onDataChannelError
     */
    function onDataChannelError(error) {
        that.close();
    }

    /**
     * Receive and route messages to the Endpoint.
     * @memberof! brightstream.DirectConnection
     * @method brightstream.DirectConnection.onDataChannelMessage
     * @param {MessageEvent}
     * @fires brightstream.DirectConnection#message
     */
    function onDataChannelMessage(evt) {
        var message;
        try {
            message = JSON.parse(evt.data);
        } catch (e) {
            message = evt.data;
        }
        /**
         * @event brightstream.Endpoint#message
         * @type {brightstream.Event}
         * @property {object} message
         * @property {brightstream.DirectConnection) directConnection
         */
        that.remoteEndpoint.fire('message', {
            message: message,
            directConnection: that
        });
        /**
         * @event brightstream.DirectConnection#message
         * @type {brightstream.Event}
         * @property {object} message
         * @property {brightstream.Endpoint} endpoint
         */
        that.fire('message', {
            message: message,
            endpoint: that.remoteEndpoint
        });
    }

    /**
     * Detect when the channel is open.
     * @memberof! brightstream.DirectConnection
     * @method brightstream.DirectConnection.onDataChannelMessage
     * @param {MessageEvent}
     * @fires brightstream.DirectConnection#open
     */
    function onDataChannelOpen(evt) {
        if (!evt) {
            throw new Error("DataChannel.onopen got no event or channel");
        }
        dataChannel = evt.target || evt.channel;
        /**
         * @event brightstream.DirectConnection#open
         * @type {brightstream.Event}
         */
        that.fire('open');
    }

    /**
     * Detect when the channel is closed.
     * @memberof! brightstream.DirectConnection
     * @method brightstream.DirectConnection.onDataChannelClose
     * @param {MessageEvent}
     * @fires brightstream.DirectConnection#close
     */
    function onDataChannelClose() {
        /**
         * @event brightstream.DirectConnection#close
         * @type {brightstream.Event}
         */
        that.fire('close');
    }

    /**
     * Create the RTCPeerConnection and add handlers. Process any offer we have already received.
     * For the non-initiator, set up all the handlers we'll need to keep track of the
     * datachannel's state and to receive messages.
     * @memberof! brightstream.DirectConnection
     * @method brightstream.DirectConnection.startPeerConnection
     * @todo Find out when we can stop deleting TURN servers
     * @private
     * @param {object} connectionSettings
     */
    function startPeerConnection(finalConnectionSettings) {
        var now = new Date();
        var toDelete = [];
        var url = '';

        finalConnectionSettings = finalConnectionSettings || {};
        if (finalConnectionSettings.servers) {
            connectionSettings.servers = finalConnectionSettings.servers;
        }

        report.connectionStarted = now.getTime();
        log.trace('startPeerConnection');

        try {
            pc = new RTCPeerConnection(connectionSettings.servers, options);
        } catch (e) {
            /* TURN is not supported, delete them from the array.
             * TODO: Find out when we can remove this workaround
             */
            log.debug("Removing TURN servers.");
            for (var i in connectionSettings.servers.iceServers) {
                if (connectionSettings.servers.iceServers.hasOwnProperty(i)) {
                    url = connectionSettings.servers.iceServers[i].url;
                    if (url.toLowerCase().indexOf('turn') > -1) {
                        toDelete.push(i);
                    }
                }
            }
            toDelete.sort(function sorter(a, b) { return b - a; });
            toDelete.forEach(function deleteByIndex(value, index) {
                connectionSettings.servers.iceServers.splice(index);
            });
            pc = new RTCPeerConnection(connectionSettings.servers, options);
        }

        pc.onicecandidate = onIceCandidate;
        pc.onnegotiationneeded = onNegotiationNeeded;
        pc.ondatachannel = function (evt) {
            if (evt && evt.channel) {
                dataChannel = evt.channel;
                dataChannel.onError = onDataChannelError;
                dataChannel.onmessage = onDataChannelMessage;
                dataChannel.onopen = onDataChannelOpen;
                dataChannel.onclose = onDataChannelClose;
            }
        };
    }

    /**
     * Create the datachannel. For the initiator, set up all the handlers we'll need to keep track of the
     * datachannel's state and to receive messages.
     * @memberof! brightstream.DirectConnection
     * @method brightstream.DirectConnection.createDataChannel
     * @private
     * @param [channel] RTCDataChannel
     */
    function createDataChannel(channel) {
        dataChannel = pc.createDataChannel("brightstreamDataChannel");
        dataChannel.binaryType = 'arraybuffer';

        dataChannel.onError = onDataChannelError;
        dataChannel.onmessage = onDataChannelMessage;
        dataChannel.onopen = onDataChannelOpen;
        dataChannel.onclose = onDataChannelClose;
        that.approve();
    }

    /**
     * Process a local ICE Candidate
     * @memberof! brightstream.DirectConnection
     * @method brightstream.DirectConnection.onIceCandidate
     * @private
     * @param {RTCICECandidate}
     */
    function onIceCandidate(oCan) {
        if (!oCan.candidate || !oCan.candidate.candidate) {
            return;
        }

        if (forceTurn === true && oCan.candidate.candidate.indexOf("typ relay") === -1) {
            return;
        }

        if (that.initiator && that.state < ST_ANSWERED) {
            candidateSendingQueue.push(oCan.candidate);
        } else {
            signalCandidate(oCan.candidate);
        }
    }

    /**
     * Handle renegotiation
     * @memberof! brightstream.DirectConnection
     * @method brightstream.DirectConnection.onNegotiationNeeded
     * @private
     */
    function onNegotiationNeeded() {
        log.warn("Negotiation needed.");
    }

    /**
     * Process any ICE candidates that we received either from the browser or the other side while
     * we were trying to set up our RTCPeerConnection to handle them.
     * @memberof! brightstream.DirectConnection
     * @method brightstream.DirectConnection.processQueues
     * @private
     */
    function processQueues() {
        /* We only need to queue (and thus process queues) if
         * we are the initiator. The person receiving the connection
         * never has a valid PeerConnection at a time when we don't
         * have one. */
        var can = null;
        for (var i = 0; i < candidateSendingQueue.length; i += 1) {
            signalCandidate(candidateSendingQueue[i]);
        }
        candidateSendingQueue = [];
        for (var i = 0; i < candidateReceivingQueue.length; i += 1) {
            that.addRemoteCandidate(candidateReceivingQueue[i]);
        }
        candidateReceivingQueue = [];
    }

    /**
     * Save an SDP we've gotten from the browser which will be an offer and send it to the other
     * side.
     * @memberof! brightstream.DirectConnection
     * @method brightstream.DirectConnection.saveOfferAndSend
     * @param {RTCSessionDescription}
     * @private
     */
    function saveOfferAndSend(oSession) {
        oSession.type = 'offer';
        that.state = ST_OFFERED;
        log.debug('setting and sending offer', oSession);
        report.sdpsSent.push(oSession);
        pc.setLocalDescription(oSession, function successHandler(p) {
            oSession.type = 'offer';
            signalOffer({sdp: oSession});
            defOffer.resolve(oSession);
        }, function errorHandler(p) {
            log.error('setLocalDescription failed');
            log.error(p);
        });
    }

    /**
     * Save our SDP we've gotten from the browser which will be an answer and send it to the
     * other side.
     * @memberof! brightstream.DirectConnection
     * @method brightstream.DirectConnection.saveAnswerAndSend
     * @param {RTCSessionDescription}
     * @private
     */
    function saveAnswerAndSend(oSession) {
        oSession.type = 'answer';
        that.state = ST_ANSWERED;
        log.debug('setting and sending answer', oSession);
        report.sdpsSent.push(oSession);
        pc.setLocalDescription(oSession, function successHandler(p) {
            oSession.type = 'answer';
            signalAnswer({
                sdp: oSession,
                connectionId: that.connectionId
            });
            defAnswer.resolve(oSession);
        }, function errorHandler(p) {
            log.error('setLocalDescription failed');
            log.error(p);
        });
    }

    /**
     * Handle shutting the session down if the other side hangs up.
     * @memberof! brightstream.DirectConnection
     * @method brightstream.DirectConnection.onRemoteHangup
     * @private
     */
    function onRemoteHangup() {
        if (pc && pc.readyState !== 'active') {
            report.connectionStoppedReason = report.byeReasonReceived ||
                'Remote side did not confirm media.';
        } else {
            report.connectionStoppedReason = 'Remote side hung up.';
        }
        log.info('Non-initiator busy or connection rejected:' + report.connectionStoppedReason);
        that.close({signal: false});
    }

    /**
     * Tear down the connection.  Send a bye signal to the remote party if
     * signal is not false and we have not received a bye signal from the remote party.
     * @memberof! brightstream.DirectConnection
     * @method brightstream.DirectConnection.close
     * @fires brightstream.DirectConnection#close
     * @param {boolean} signal Optional flag to indicate whether to send or suppress sending
     * a hangup signal to the remote side.
     */
    that.close = function (params) {
        params = params || {};
        if (that.state === ST_ENDED) {
            log.trace("DirectConnection.close got called twice.");
            return;
        }
        that.state = ST_ENDED;

        log.trace("at close, connection state is " + that.state);
        if (that.initiator === true) {
            if (that.state < ST_OFFERED) {
                // Never send bye if we are the initiator but we haven't sent any other signal yet.
                params.signal = false;
            }
        } else {
            if (defApproved.promise.isPending()) {
                defApproved.reject(new Error("Call hung up before approval."));
            }
        }

        clientObj.updateTurnCredentials();
        log.debug('closing direct connection');

        params.signal = (typeof params.signal === 'boolean' ? params.signal : true);
        if (params.signal) {
            log.info('sending bye');
            signalTerminate({connectionId: that.connectionId});
        }

        report.connectionStopped = new Date().getTime();
        signalReport({
            report: report,
            connectionId: that.connectionId
        });

        /**
         * @event brightstream.DirectConnection#close
         * @type {brightstream.Event}
         * @property {boolean} sentSignal - Whether or not we sent a 'bye' signal to the other party.
         */
        that.fire('close', {
            sentSignal: params.signal
        });
        that.ignore();

        if (dataChannel) {
            dataChannel.close();
        }
        dataChannel =  null;

        if (pc) {
            pc.close();
        }
        pc = null;
    };

    /*
     * Send a message over the datachannel in the form of a JSON-encoded plain old JavaScript object. Only one
     * attribute may be given: either a string 'message' or an object 'object'.
     * @memberof! brightstream.DirectConnection
     * @method brightstream.DirectConnection.sendMessage
     * @param {string} [message] - The message to send.
     * @param {object} object - An object to send.
     * @param [function] onSuccess - Success handler.
     * @param [function] onError - Error handler.
     * @returns {Promise<undefined>}
     */
    that.sendMessage = function (params) {
        var deferred = brightstream.makeDeferred(params.onSuccess, params.onError);
        if (dataChannel.readyState === 'open') {
            dataChannel.send(JSON.stringify(params.object || {
                message: params.message
            }));
            deferred.resolve();
        } else {
            log.error("dataChannel not in an open state.");
            deferred.reject();
        }
        return deferred.promise;
    };

    /*
     * Expose close as reject for approve/reject workflow.
     * @memberof! brightstream.DirectConnection
     * @method brightstream.DirectConnection.reject
     * @param {boolean} signal - Optional flag to indicate whether to send or suppress sending
     * a hangup signal to the remote side.
     */
    that.reject = that.close;

    /**
     * Indicate whether a datachannel is being setup or is in progress.
     * @memberof! brightstream.DirectConnection
     * @method brightstream.DirectConnection.isActive
     * @returns {boolean}
     */
    that.isActive = function () {
        log.trace('isActive');

        if (!pc || that.state < ST_ENDED) {
            return false;
        }

        return dataChannel.readyState === 'open';
    };

    /**
     * Save the offer so we can tell the browser about it after the PeerConnection is ready.
     * @memberof! brightstream.DirectConnection
     * @method brightstream.DirectConnection.setOffer
     * @param {RTCSessionDescription} sdp - The remote SDP.
     * @todo TODO Make this listen to events and be private.
     */
    that.setOffer = function (params) {
        log.debug('got offer', params.sdp);

        if (!that.initiator) {
            report.sdpsReceived.push(params.sdp);
            report.lastSDPString = params.sdp.sdp;
            defOffer.resolve(params.sdp);
        } else {
            defOffer.reject(new Error("Received offer in a bad state."));
            log.warn('Got offer in pre-connection state.');
            signalTerminate({connectionId: that.connectionId});
        }
    };

    /**
     * Save the answer and tell the browser about it.
     * @memberof! brightstream.DirectConnection
     * @method brightstream.DirectConnection.setAnswer
     * @param {RTCSessionDescription} sdp - The remote SDP.
     * @param {string} connectionId - The connectionId of the endpoint who answered the call.
     * @todo TODO Make this listen to events and be private.
     */
    that.setAnswer = function (params) {
        if (defAnswer.promise.isFulfilled()) {
            log.debug("Ignoring duplicate answer.");
            return;
        }

        that.state = ST_ANSWERED;
        log.debug('got answer', params.sdp);

        report.sdpsReceived.push(params.sdp);
        report.lastSDPString = params.sdp.sdp;
        that.connectionId = params.connectionId;
        delete params.connectionId;
        signalConnected({connectionId: that.connectionId});

        pc.setRemoteDescription(
            new RTCSessionDescription(params.sdp),
            function successHandler() {
                processQueues();
                defAnswer.resolve(params.sdp);
            }, function errorHandler(p) {
                log.error('set remote desc of answer failed', params.sdp);
                report.connectionStoppedReason = 'setRemoteDescription failed at answer.';
                that.close();
            }
        );
    };

    /**
     * Save the answer and tell the browser about it.
     * @memberof! brightstream.DirectConnection
     * @method brightstream.DirectConnection.setConnected
     * @param {RTCSessionDescription} oSession The remote SDP.
     * @todo TODO Make this listen to events and be private.
     */
    that.setConnected = function (signal) {
        if (signal.connectionId !== clientObj.user.id) {
            that.close(false);
        }
    };

    /**
     * Save the candidate. If we initiated the connection, place the candidate into the queue so
     * we can process them after we receive the answer.
     * @memberof! brightstream.DirectConnection
     * @method brightstream.DirectConnection.addRemoteCandidate
     * @param {RTCIceCandidate} candidate The ICE candidate.
     * @todo TODO Make this listen to events and be private.
     */
    that.addRemoteCandidate = function (params) {
        if (!params || params.candidate === null) {
            return;
        }
        if (!params.candidate.hasOwnProperty('sdpMLineIndex') || !params.candidate) {
            log.warn("addRemoteCandidate got wrong format!", params);
            return;
        }
        if (that.initiator && that.state < ST_ANSWERED) {
            candidateReceivingQueue.push(params);
            log.debug('Queueing a candidate.');
            return;
        }
        try {
            pc.addIceCandidate(new RTCIceCandidate(params.candidate));
        } catch (e) {
            log.error("Couldn't add ICE candidate: " + e.message, params.candidate);
            return;
        }
        log.debug('Got a remote candidate.', params.candidate);
        report.candidatesReceived.push(params.candidate);
    };

    /**
     * Get the state of the connection.
     * @memberof! brightstream.DirectConnection
     * @method brightstream.DirectConnection.getState
     * @returns {string}
     */
    that.getState = function () {
        return pc ? that.state : "before";
    };

    /**
     * Indicate whether the logged-in User initated the connection.
     * @memberof! brightstream.DirectConnection
     * @method brightstream.DirectConnection.isInitiator
     * @returns {boolean}
     */
    that.isInitiator = function () {
        return that.initiator;
    };

    /**
     * Save the close reason and hang up.
     * @memberof! brightstream.DirectConnection
     * @method brightstream.DirectConnection.setBye
     * @todo TODO Make this listen to events and be private.
     */
    that.setBye = function (params) {
        params = params || {};
        report.connectionStoppedReason = params.reason || "Remote side hung up";
        that.close({signal: false});
    };

    return that;
}; // End brightstream.DirectConnection