uglifyjs util/q.js util/loglevel.js util/adapter.js webrtc.js webrtc/event.js webrtc/client.js webrtc/identity.js webrtc/endpoints.js webrtc/signaling.js webrtc/media.js webrtc/xmpp.js -c  -o webrtc.min.js > /dev/null 2>&1
#cat util/q.js util/strophe.js util/loglevel.js util/adapter.js webrtc.js webrtc/event.js webrtc/client.js webrtc/identity.js webrtc/endpoints.js webrtc/signaling.js webrtc/media.js webrtc/xmpp.js | jsmin > webrtc.min.js
