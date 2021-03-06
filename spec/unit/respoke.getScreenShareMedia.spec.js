/* global respoke: false, sinon: true */
describe("respoke.getScreenShareMedia", function () {
    'use strict';
    var expect = chai.expect;
    var assert = chai.assert;
    var _actualSinon = sinon;

    function fakeLocalMedia(params) {
        params = params || {};

        return {
            start: function () {
                var deferred = respoke.Q.defer();
                setTimeout(function () {
                    if (params.reject) {
                        deferred.reject(params.reject);
                        return;
                    }

                    deferred.resolve();
                });
                return deferred.promise;
            }
        };
    }

    beforeEach(function () {
        sinon = sinon.sandbox.create();
    });

    afterEach(function () {
        sinon.restore();
        sinon = _actualSinon;
    });

    it("retrieves screenShare constraints using params.constraints and params.source", function () {
        var localMedia = fakeLocalMedia();
        var fakeConstraints = [{ foo: 'bar' }];
        var passedParams = {
            source: 'passedSource',
            constraints: { foo: 'bar' }
        };

        sinon.stub(respoke, 'LocalMedia').returns(localMedia);
        sinon.stub(respoke, 'getScreenShareConstraints').returns(fakeConstraints);

        return respoke.getScreenShareMedia(passedParams).then(function () {
            expect(respoke.getScreenShareConstraints.calledOnce).to.equal(true);
            var constraintArgs = respoke.getScreenShareConstraints.firstCall.args[0];
            expect(constraintArgs).to.be.an('object');
            expect(constraintArgs.source).to.equal(passedParams.source);
            expect(constraintArgs.constraints).to.deep.equal(passedParams.constraints);
        });
    });

    it("passes screen share constraints to LocalMedia when instantiating", function () {
        var localMedia = fakeLocalMedia();
        var fakeConstraints = { foo: 'bar' };
        sinon.stub(respoke, 'LocalMedia').returns(localMedia);
        sinon.stub(respoke, 'getScreenShareConstraints').returns(fakeConstraints);

        return respoke.getScreenShareMedia().then(function () {
            expect(respoke.LocalMedia.calledOnce).to.equal(true);
            var localMediaArgs = respoke.LocalMedia.firstCall.args[0];
            expect(localMediaArgs).to.be.an('object');
            expect(localMediaArgs.constraints).to.deep.equal(fakeConstraints);
        });
    });

    it("passes params.element to LocalMedia when instantiating", function () {
        var localMedia = fakeLocalMedia();
        var fakeConstraints = [{ foo: 'bar' }];
        var passedParams = { element: { bar: 'baz' } };
        sinon.stub(respoke, 'LocalMedia').returns(localMedia);
        sinon.stub(respoke, 'getScreenShareConstraints').returns(fakeConstraints);

        return respoke.getScreenShareMedia(passedParams).then(function () {
            expect(respoke.LocalMedia.calledOnce).to.equal(true);
            var localMediaArgs = respoke.LocalMedia.firstCall.args[0];
            expect(localMediaArgs).to.be.an('object');
            expect(localMediaArgs.element).to.equal(passedParams.element);
        });
    });

    it("passes params.source to LocalMedia when instantiating", function () {
        var localMedia = fakeLocalMedia();
        var fakeConstraints = [{ foo: 'bar' }];
        var passedParams = { source: 'bam' };
        sinon.stub(respoke, 'LocalMedia').returns(localMedia);
        sinon.stub(respoke, 'getScreenShareConstraints').returns(fakeConstraints);

        return respoke.getScreenShareMedia(passedParams).then(function () {
            expect(respoke.LocalMedia.calledOnce).to.equal(true);
            var localMediaArgs = respoke.LocalMedia.firstCall.args[0];
            expect(localMediaArgs).to.be.an('object');
            expect(localMediaArgs.source).to.equal(passedParams.source);
        });
    });

    describe("when passed callbacks", function () {

        it("calls the success callback with the localMedia when its stream-received event is fired", function () {
            var localMedia = fakeLocalMedia();
            sinon.stub(respoke, 'LocalMedia').returns(localMedia);

            return respoke.getScreenShareMedia().then(function (result) {
                expect(result).to.equal(localMedia);
            }, function () {
                assert.fail('should not reject promise');
            });
        });

        it("calls the error callback with the error if the localMedia error event is fired", function () {
            var fakeError = new Error('omg');
            var localMedia = fakeLocalMedia({ reject: fakeError });
            sinon.stub(respoke, 'LocalMedia').returns(localMedia);

            return respoke.getScreenShareMedia().then(function () {
                assert.fail('should not resolve promise');
            }, function (err) {
                expect(err).to.equal(fakeError);
            });
        });
    });

    describe("when passed no callbacks", function () {

        it("resolves the returned promise with the localMedia when its stream-received event is fired", function () {
            var localMedia = fakeLocalMedia();
            sinon.stub(respoke, 'LocalMedia').returns(localMedia);

            return respoke.getScreenShareMedia({
                onSuccess: function (result) {
                    expect(result).to.equal(localMedia);
                },
                onError: function () {
                    assert.fail('should not call onError');
                }
            });
        });

        it("rejects the returned promise with the error when the localMedia error event is fired", function () {
            var fakeError = new Error('omg');
            var localMedia = fakeLocalMedia({ reject: fakeError });
            sinon.stub(respoke, 'LocalMedia').returns(localMedia);

            return respoke.getScreenShareMedia({
                onSuccess: function () {
                    assert.fail('should not call onSuccess');
                },
                onError: function (err) {
                    expect(err).to.equal(fakeError);
                }
            });
        });
    });
});
