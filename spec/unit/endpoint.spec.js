/* global respoke: false, sinon: true */
describe("respoke.Endpoint", function () {
    'use strict';
    var expect = chai.expect;
    var _actualSinon = sinon;
    var Q = respoke.Q;

    beforeEach(function () {
        sinon = sinon.sandbox.create();
    });

    afterEach(function () {
        sinon.restore();
        sinon = _actualSinon;
    });

    ['', ' foobar', '/foobar'].forEach(function (append) {
        describe('with endpoint appended with "' + append + '"', function () {

            var endpoint;
            var endpointId;
            var client;
            var instanceId;
            var connectionId;

            beforeEach(function () {
                instanceId = respoke.makeGUID();
                connectionId = respoke.makeGUID();

                client = respoke.createClient({
                    instanceId: instanceId
                });

                endpointId = respoke.makeGUID() + append;
                endpoint = client.getEndpoint({
                    connectionId: connectionId,
                    id: endpointId,
                    gloveColor: "white"
                });
            });

            describe("it's object structure", function () {
                it("extends respoke.EventEmitter.", function () {
                    expect(typeof endpoint.listen).to.equal('function');
                    expect(typeof endpoint.ignore).to.equal('function');
                    expect(typeof endpoint.fire).to.equal('function');
                });

                it("has the correct class name.", function () {
                    expect(endpoint.className).to.equal('respoke.Endpoint');
                });

                it("contains some important methods.", function () {
                    expect(typeof endpoint.setPresence).to.equal('function');
                    expect(typeof endpoint.sendMessage).to.equal('function');
                    expect(typeof endpoint.resolvePresence).to.equal('function');
                    expect(typeof endpoint.startAudioCall).to.equal('function');
                    expect(typeof endpoint.startVideoCall).to.equal('function');
                    expect(typeof endpoint.startCall).to.equal('function');
                    expect(typeof endpoint.startDirectConnection).to.equal('function');
                    expect(typeof endpoint.startScreenShare).to.equal('function');
                });

                it("can set and get presence and fires the correct event.", function () {
                    var newPresence = 'xa';

                    sinon.spy(endpoint, "fire");
                    try {
                        endpoint.setPresence({
                            presence: newPresence,
                            connectionId: connectionId
                        });

                        expect(endpoint.presence).to.equal(newPresence);
                        expect(endpoint.fire.calledWith('presence')).to.equal(true);
                    } finally {
                        endpoint.fire.restore();
                    }
                });

                it("saves unexpected developer-specified parameters.", function () {
                    expect(endpoint.gloveColor).to.equal('white');
                });

                it("exposes the signaling channel", function () {
                    expect(endpoint.signalingChannel).to.exist;
                    expect(endpoint.getSignalingChannel).to.exist;
                });
            });

            describe("when not connected", function () {
                describe("sendMessage()", function () {
                    it("throws an error", function (done) {
                        endpoint.sendMessage({
                            message: "Ain't nobody got time fo dat."
                        }).then(function success() {
                            done(new Error("Shouldn't be able to send a message when not connected!"));
                        }).catch(function failure(err) {
                            expect(err.message).to.contain("not connected");
                            done();
                        });
                    });
                });

                describe("startAudioCall()", function () {
                    it("throws an error", function () {
                        var call;
                        try {
                            call = endpoint.startAudioCall();
                        } catch (err) {
                            expect(err.message).to.contain("not connected");
                        }
                        expect(call).to.be.undefined;
                    });
                });

                describe("startVideoCall()", function () {
                    it("throws an error", function () {
                        var call;
                        try {
                            call = endpoint.startVideoCall();
                        } catch (err) {
                            expect(err.message).to.contain("not connected");
                        }
                        expect(call).to.be.undefined;
                    });
                });

                describe("startCall()", function () {
                    it("throws an error", function () {
                        var call;
                        try {
                            call = endpoint.startCall();
                        } catch (err) {
                            expect(err.message).to.contain("not connected");
                        }
                        expect(call).to.be.undefined;
                    });
                });

                describe("startDirectConnection()", function () {
                    it("throws an error", function success(done) {
                        endpoint.startDirectConnection().then(function failure() {
                            done(new Error("User presence succeeded with no connection!"));
                        }, function (err) {
                            expect(err.message).to.contain("not connected");
                            done();
                        });
                    });
                });

                describe("resolvePresence()", function () {
                    describe("when only one connection", function () {
                        ['chat', 'available', 'away', 'dnd', 'xa', 'unavailable'].forEach(function (presString) {
                            describe("when presence is set to '" + presString + "'", function () {
                                it("endpoint.presence equals '" + presString + "'", function () {
                                    endpoint.connections = [{presence: presString}];
                                    endpoint.resolvePresence();
                                    expect(endpoint.presence).to.equal(presString);
                                });
                            });
                        });
                    });

                    describe("when there are two connections", function () {
                        var presenceStrings = ['chat', 'available', 'away', 'dnd', 'xa', 'unavailable'];
                        for (var i = 0; i < presenceStrings.length; i += 1) {
                            var presString1 = presenceStrings[i];
                            for (var j = i + 1; j < presenceStrings.length; j += 1) {
                                var presString2 = presenceStrings[j];

                                if (presString1 === presString2) {
                                    return;
                                }

                                describe("when presence is set to '" + presString1 + "' and '" + presString2 + "'", function () {
                                    it("endpoint.presence equals the one that appears first in the array", function () {
                                        var presenceToFind;
                                        if (presenceStrings.indexOf(presString1) > presenceStrings.indexOf(presString2)) {
                                            presenceToFind = presString2;
                                        } else {
                                            presenceToFind = presString1;
                                        }

                                        endpoint.connections = [{presence: presString1}, {presence: presString2}];
                                        endpoint.resolvePresence();
                                        expect(endpoint.presence).to.equal(presenceToFind);
                                    });
                                });
                            }
                        }

                        describe("with custom resolve endpoint presence", function () {

                            var customPresence1 = {'myRealPresence': 'not ready'};
                            var customPresence2 = {'myRealPresence': 'not ready'};

                            describe("that returns valid presence", function () {
                                it("endpoint.presence equals expected presence", function () {
                                    var tempInstanceId = respoke.makeGUID();
                                    var tempConnectionId = respoke.makeGUID();
                                    var tempEndpointId = respoke.makeGUID();
                                    var expectedPresence = {'myRealPresence': 'ready'};
                                    var tempClient = respoke.createClient({
                                        instanceId: tempInstanceId,
                                        resolveEndpointPresence: function (presenceList) {
                                            expect(presenceList.length).to.equal(3);
                                            expect(presenceList.indexOf(customPresence1)).to.not.equal(-1);
                                            expect(presenceList.indexOf(customPresence2)).to.not.equal(-1);
                                            expect(presenceList.indexOf(expectedPresence)).to.not.equal(-1);
                                            return expectedPresence;
                                        }
                                    });
                                    var ep = tempClient.getEndpoint({
                                        connectionId: tempConnectionId,
                                        id: tempEndpointId
                                    });
                                    ep.connections = [{presence: customPresence1}, {presence: expectedPresence}, {presence: customPresence2}];
                                    ep.resolvePresence();
                                    expect(ep.presence).to.equal(expectedPresence);
                                });
                            });
                            describe("that returns custom presence", function () {
                                it("endpoint.presence equals expected presence", function () {
                                    var tempInstanceId = respoke.makeGUID();
                                    var tempConnectionId = respoke.makeGUID();
                                    var tempEndpointId = respoke.makeGUID();
                                    var expectedPresence = 'always and forever';
                                    var tempClient = respoke.createClient({
                                        instanceId: tempInstanceId,
                                        resolveEndpointPresence: function () {
                                            return expectedPresence;
                                        }
                                    });
                                    var ep = tempClient.getEndpoint({
                                        connectionId: tempConnectionId,
                                        id: tempEndpointId
                                    });
                                    ep.connections = [{presence: customPresence1}, {presence: 'available'}, {presence: customPresence2}];
                                    ep.resolvePresence();
                                    expect(ep.presence).to.equal(expectedPresence);
                                });
                            });
                        });
                    });
                });

                describe("getConnection()", function () {
                    describe("when there is one connection", function () {
                        beforeEach(function () {
                            endpoint.connections = [{
                                id: respoke.makeGUID()
                            }];
                        });

                        describe("and no connectionId is specified", function () {
                            it("returns the connection", function () {
                                var connection = endpoint.getConnection();
                                expect(connection.id).to.equal(endpoint.connections[0].id);
                            });
                        });

                        describe("and the connectionId is specified", function () {
                            it("returns the connection", function () {
                                var connection = endpoint.getConnection({
                                    connectionId: endpoint.connections[0].id
                                });
                                expect(connection.id).to.equal(endpoint.connections[0].id);
                            });
                        });

                        describe("and a wrong connectionId is specified", function () {
                            it("returns null", function () {
                                var connection = endpoint.getConnection({
                                    connectionId: respoke.makeGUID()
                                });
                                expect(connection).to.equal(null);
                            });
                        });
                    });
                });
            });

            describe("startScreenShare", function () {

                it("calls startCall", function () {
                    sinon.stub(endpoint, 'startCall');

                    endpoint.startScreenShare();

                    expect(endpoint.startCall.calledOnce).to.equal(true);
                });

                it("sets target = 'screenshare' on params passed to startCall", function () {
                    sinon.stub(endpoint, 'startCall');

                    endpoint.startScreenShare();

                    expect(endpoint.startCall.calledOnce).to.equal(true);
                    var startCallArgs = endpoint.startCall.firstCall.args[0];
                    expect(startCallArgs).to.include.property('target', 'screenshare');
                });

                it("sets caller = true on params passed to startCall when params.caller not a boolean", function () {
                    // test against a bunch of non-bool things
                    ['beef', 1, [], {}, undefined, null].forEach(function (val) {
                        sinon.stub(endpoint, 'startCall');

                        endpoint.startScreenShare({ caller: val });

                        expect(endpoint.startCall.calledOnce).to.equal(true);
                        var startCallArgs = endpoint.startCall.firstCall.args[0];
                        expect(startCallArgs).to.include.property('caller', true);
                        endpoint.startCall.restore();
                    });
                });

                it("sets params.sendOnly = true when params.caller = true", function () {
                    sinon.stub(respoke, 'getScreenShareConstraints').returns({ foo: 'bar' });
                    sinon.stub(endpoint, 'startCall');

                    endpoint.startScreenShare({ caller: true });

                    expect(endpoint.startCall.calledOnce).to.equal(true);
                    var startCallArgs = endpoint.startCall.firstCall.args[0];
                    expect(startCallArgs).to.include.property('sendOnly', true);
                });

                it("sets constraints to result of getScreenShareConstraints when params.caller = true", function () {
                    sinon.stub(respoke, 'getScreenShareConstraints').returns({ foo: 'bar' });
                    sinon.stub(endpoint, 'startCall');

                    endpoint.startScreenShare();

                    expect(respoke.getScreenShareConstraints.calledOnce).to.equal(true);
                    expect(endpoint.startCall.calledOnce).to.equal(true);
                    var startCallArgs = endpoint.startCall.firstCall.args[0];
                    expect(startCallArgs).to.include.property('constraints');
                    expect(startCallArgs.constraints).to.deep.equal([{
                        foo: 'bar'
                    }]);
                });
            });

            describe("sendMessage", function () {

                describe("when called with a 'push' param", function () {

                    var messageEp;
                    var fakeSignalingChannel;

                    beforeEach(function () {
                        fakeSignalingChannel = {
                            sendMessage: sinon.stub().returns(Q.resolve())
                        };

                        messageEp = respoke.Endpoint({
                            signalingChannel: fakeSignalingChannel,
                            instanceId: instanceId,
                            addCall: sinon.stub()
                        });
                    });

                    it("passes it along to signalingChannel.sendMessage", function () {
                        messageEp.sendMessage({
                            message: 'foo',
                            push: true
                        });

                        expect(fakeSignalingChannel.sendMessage.calledOnce).to.equal(true);
                        var passedParams = fakeSignalingChannel.sendMessage.firstCall.args[0];
                        expect(passedParams).to.include.property('push', true);
                    });
                });
            });
        });
    });

    describe("startAudioCall", function () {

        var endpoint;
        var fakeCall = { id: 'fakeAudioCall' };

        beforeEach(function () {
            var client = respoke.createClient();
            endpoint = client.getEndpoint({ id: 'homer' });

            sinon.stub(respoke, 'convertConstraints').returns({ foo: 'bar' });
            sinon.stub(endpoint, 'startCall').returns(fakeCall);
        });

        it("converts the constraints", function () {
            endpoint.startAudioCall({
                metadata: { orderNumber: 'foo' },
                constraints: { audio: true, video: false }
            });

            expect(respoke.convertConstraints.calledOnce).to.equal(true);
            expect(respoke.convertConstraints.firstCall.args[0]).to.deep.equal({
                audio: true, video: false
            });
        });

        it("calls startCall with the passed params and converted constraints", function () {
            endpoint.startAudioCall({
                metadata: { orderNumber: 'foo' }
            });

            expect(endpoint.startCall.calledOnce).to.equal(true);
            expect(endpoint.startCall.firstCall.args[0]).to.deep.equal({
                constraints: { foo: 'bar' },
                metadata: { orderNumber: 'foo' }
            });
        });
    });

    describe("startVideoCall", function () {

        var endpoint;
        var fakeCall = { id: 'fakeVideoCall' };

        beforeEach(function () {
            var client = respoke.createClient();
            endpoint = client.getEndpoint({ id: 'homer' });

            sinon.stub(respoke, 'convertConstraints').returns({ foo: 'bar' });
            sinon.stub(endpoint, 'startCall').returns(fakeCall);
        });

        it("converts the constraints", function () {
            endpoint.startVideoCall({
                metadata: { orderNumber: 'foo' },
                constraints: { audio: true, video: true }
            });

            expect(respoke.convertConstraints.calledOnce).to.equal(true);
            expect(respoke.convertConstraints.firstCall.args[0]).to.deep.equal({
                audio: true, video: true
            });
        });

        it("calls startCall with the passed params and converted constraints", function () {
            endpoint.startVideoCall({
                metadata: { orderNumber: 'foo' }
            });

            expect(endpoint.startCall.calledOnce).to.equal(true);
            expect(endpoint.startCall.firstCall.args[0]).to.deep.equal({
                constraints: { foo: 'bar' },
                metadata: { orderNumber: 'foo' }
            });
        });
    });

    describe("startScreenShare", function () {

        var endpoint;
        var fakeCall = { id: 'fakeScreenShare' };

        beforeEach(function () {
            var client = respoke.createClient();
            endpoint = client.getEndpoint({ id: 'homer' });

            sinon.stub(endpoint, 'startCall').returns(fakeCall);
        });

        it("passes along metadata to startCall", function () {
            endpoint.startScreenShare({
                metadata: { orderNumber: 'foo' }
            });

            expect(endpoint.startCall.calledOnce).to.equal(true);
            var startCallParams = endpoint.startCall.firstCall.args[0];
            expect(startCallParams).to.include.property('metadata');
            expect(startCallParams.metadata).to.deep.equal({ orderNumber: 'foo' });
        });
    });

    describe("startCall", function () {

        describe("when called on an endpoint with an id", function () {

            describe("in all scenarios", function () {
                var endpoint;
                var fakeCall;

                beforeEach(function () {
                    var client = respoke.createClient();
                    fakeCall = { id: 'fakeCall', listen: sinon.stub() };
                    endpoint = client.getEndpoint({ id: 'homer' });
                    sinon.stub(client, 'verifyConnected');
                    sinon.stub(respoke, 'Call').returns(fakeCall);
                });

                it("passes along metadata to Call", function () {
                    endpoint.startCall({
                        metadata: { orderNumber: 'foo' }
                    });

                    expect(respoke.Call.calledOnce).to.equal(true);
                    var callParams = respoke.Call.firstCall.args[0];
                    expect(callParams).to.include.property('metadata');
                    expect(callParams.metadata).to.deep.equal({ orderNumber: 'foo' });
                });
            });

            describe("the passed signalOffer", function () {
                var endpoint;
                var fakeCall;
                var client;
                var signalOffer;

                beforeEach(function () {
                    client = respoke.createClient();
                    fakeCall = { id: 'fakeCall', listen: sinon.stub() };
                    endpoint = client.getEndpoint({ id: 'homer' });
                    sinon.stub(client, 'verifyConnected');
                    sinon.stub(respoke, 'Call').returns(fakeCall);
                    sinon.stub(client.signalingChannel, 'sendSDP').returns(Q());

                    endpoint.startCall({
                        metadata: { orderNumber: 'foo' }
                    });

                    signalOffer = respoke.Call.firstCall.args[0].signalOffer;
                });

                it("passes along any metadata into the signal", function () {
                    signalOffer({});

                    expect(client.signalingChannel.sendSDP.calledOnce).to.equal(true);
                    var sendSDPParams = client.signalingChannel.sendSDP.firstCall.args[0];
                    expect(sendSDPParams).to.include.property('metadata');
                    expect(sendSDPParams.metadata).to.deep.equal({ orderNumber: 'foo' });
                });
            });
        });
    });

    describe("startDirectConnection", function () {

        describe("when called on an endpoint with an id", function () {

            describe("in all scenarios", function () {
                var endpoint;
                var fakeCall;

                beforeEach(function () {
                    var client = respoke.createClient();
                    fakeCall = { id: 'fakeCall', listen: sinon.stub() };
                    endpoint = client.getEndpoint({ id: 'homer' });
                    sinon.stub(client, 'verifyConnected');
                    sinon.stub(respoke, 'Call').returns(fakeCall);
                });

                it("passes along metadata to Call", function () {
                    endpoint.startDirectConnection({
                        metadata: { orderNumber: 'foo' }
                    });

                    expect(respoke.Call.calledOnce).to.equal(true);
                    var callParams = respoke.Call.firstCall.args[0];
                    expect(callParams).to.include.property('metadata');
                    expect(callParams.metadata).to.deep.equal({ orderNumber: 'foo' });
                });
            });

            describe("the passed signalOffer", function () {
                var endpoint;
                var fakeCall;
                var client;
                var signalOffer;

                beforeEach(function () {
                    client = respoke.createClient();
                    fakeCall = { id: 'fakeCall', listen: sinon.stub() };
                    endpoint = client.getEndpoint({ id: 'homer' });
                    sinon.stub(client, 'verifyConnected');
                    sinon.stub(respoke, 'Call').returns(fakeCall);
                    sinon.stub(client.signalingChannel, 'sendSDP').returns(Q());

                    endpoint.startDirectConnection({
                        metadata: { orderNumber: 'foo' }
                    });

                    signalOffer = respoke.Call.firstCall.args[0].signalOffer;
                });

                it("passes along any metadata into the signal", function () {
                    signalOffer({});

                    expect(client.signalingChannel.sendSDP.calledOnce).to.equal(true);
                    var sendSDPParams = client.signalingChannel.sendSDP.firstCall.args[0];
                    expect(sendSDPParams).to.include.property('metadata');
                    expect(sendSDPParams.metadata).to.deep.equal({ orderNumber: 'foo' });
                });
            });
        });
    });
});
