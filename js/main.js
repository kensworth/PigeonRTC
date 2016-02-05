/****************************************************************************
 * Initial setup
 ****************************************************************************/

var configuration = {'iceServers': [{'url': 'stun:stun.l.google.com:19302'}]},
// {"url":"stun:stun.services.mozilla.com"}

    roomURL = document.getElementById('url'),
    video = document.getElementsByTagName('video')[0],
    trail = document.getElementById('trail'),
    sendTextBtn = document.getElementById('sendText'),
    // Default values for width and height of the photoContext.
    // Maybe redefined later based on user's webcam video stream.
    photoContextW = 300, photoContextH = 150;

// Attach event handlers
video.addEventListener('play', setCanvasDimensions);
sendTextBtn.addEventListener('click', sendText);


// Create a random room if not already present in the URL.
var isInitiator;
var room = window.location.hash.substring(1);
if (!room) {
    //change to random phrase
    room = window.location.hash = randomToken();
}


/****************************************************************************
 * Signaling server 
 ****************************************************************************/

// Connect to the signaling server
var socket = io.connect();

socket.on('ipaddr', function (ipaddr) {
    console.log('Server IP address is: ' + ipaddr);
    updateRoomURL(ipaddr);
});

socket.on('created', function (room, clientId) {
  console.log('Created room', room, '- my client ID is', clientId);
  isInitiator = true;
  grabWebCamVideo();
});

socket.on('joined', function (room, clientId) {
  console.log('This peer has joined room', room, 'with client ID', clientId);
  isInitiator = false;
  grabWebCamVideo();
});

socket.on('full', function (room) {
    alert('Room "' + room + '" is full. We will create a new room for you.');
    window.location.hash = '';
    window.location.reload();
});

socket.on('ready', function () {
    createPeerConnection(isInitiator, configuration);
})

socket.on('log', function (array) {
  console.log.apply(console, array);
});

socket.on('message', function (message){
    console.log('Client received message:', message);
    signalingMessageCallback(message);
});

// Join a room
socket.emit('create or join', room);

if (location.hostname.match(/localhost|127\.0\.0/)) {
    socket.emit('ipaddr');
}

/**
 * Send message to signaling server
 */
function sendMessage(message){
    console.log('Client sending message: ', message);
    socket.emit('message', message);
}

/**
 * Updates URL on the page so that users can copy&paste it to their peers.
 */
function updateRoomURL(ipaddr) {
    var url;
    if (!ipaddr) {
        url = location.href
    } else {
        url = location.protocol + '//' + ipaddr + ':2013/#' + room
    }
    roomURL.innerHTML = url;
}


/**************************************************************************** 
 * User media (webcam) 
 ****************************************************************************/

function grabWebCamVideo() {
    console.log('Getting user media (video) ...');
    getUserMedia({video: true, /*audio: true*/}, getMediaSuccessCallback, getMediaErrorCallback);
}

function getMediaSuccessCallback(stream) {
    var streamURL = window.URL.createObjectURL(stream);
    console.log('getUserMedia video stream URL:', streamURL);
    window.stream = stream; // stream available to console

    video.src = streamURL;
}

function getMediaErrorCallback(error){
    console.log("getUserMedia error:", error);
}


/**************************************************************************** 
 * WebRTC peer connection and data channel
 ****************************************************************************/

var peerConn;
var dataChannel;

function signalingMessageCallback(message) {
    if (message.type === 'offer') {
        console.log('Got offer. Sending answer to peer.');
        peerConn.setRemoteDescription(new RTCSessionDescription(message), function(){}, logError);
        peerConn.createAnswer(onLocalSessionCreated, logError);

    } else if (message.type === 'answer') {
        console.log('Got answer.');
        peerConn.setRemoteDescription(new RTCSessionDescription(message), function(){}, logError);

    } else if (message.type === 'candidate') {
        peerConn.addIceCandidate(new RTCIceCandidate({candidate: message.candidate}));

    } else if (message === 'bye') {
        // TODO: cleanup RTC connection?
    }
}

function createPeerConnection(isInitiator, config) {
    console.log('Creating Peer connection as initiator?', isInitiator, 'config:', config);
    peerConn = new RTCPeerConnection(config);

    // send any ice candidates to the other peer
    peerConn.onicecandidate = function (event) {
        console.log('onIceCandidate event:', event);
        if (event.candidate) {
            sendMessage({
                type: 'candidate',
                label: event.candidate.sdpMLineIndex,
                id: event.candidate.sdpMid,
                candidate: event.candidate.candidate
            });
        } else {
            console.log('End of candidates.');
        }
    };

    if (isInitiator) {
        console.log('Creating Data Channel');
        dataChannel = peerConn.createDataChannel("media");
        onDataChannelCreated(dataChannel);

        console.log('Creating an offer');
        peerConn.createOffer(onLocalSessionCreated, logError);
    } else {
        peerConn.ondatachannel = function (event) {
            console.log('ondatachannel:', event.channel);
            dataChannel = event.channel;
            onDataChannelCreated(dataChannel);
        };
    }
}

function onLocalSessionCreated(desc) {
    console.log('local session created:', desc);
    peerConn.setLocalDescription(desc, function () {
        console.log('sending local desc:', peerConn.localDescription);
        sendMessage(peerConn.localDescription);
    }, logError);
}

function onDataChannelCreated(channel) {
    console.log('onDataChannelCreated:', channel);

    channel.onopen = function () {
        console.log('channel opened!');
    };

    channel.onmessage = handleText();
}

function handleText() {
    return function onmessage(event) {
        document.getElementById("textArea").value = event.data;
    }
}

/**************************************************************************** 
 * Aux functions, mostly UI-related
 ****************************************************************************/

function sendText() {
    var CHUNK_LEN = 1000;
    var text = document.getElementById('text').value;
    var whiteSpaceRegEx = /^\s*$/.test(text);
    if(!whiteSpaceRegEx) {
        console.log('stuff to send');
        if(text.length < CHUNK_LEN) {
            dataChannel.send(text);
            document.getElementById('text').value = '';
        }
    }
}

function setCanvasDimensions() {
    if (video.videoWidth == 0) {
        setTimeout(setCanvasDimensions, 200);
        return;
    }
    
    console.log('video width:', video.videoWidth, 'height:', video.videoHeight)

    photoContextW = video.videoWidth / 2;
    photoContextH = video.videoHeight / 2;
    //photo.style.width = photoContextW + 'px';
    //photo.style.height = photoContextH + 'px';
    // TODO: figure out right dimensions
    photoContextW = 300; //300;
    photoContextH = 150; //150;
}

function randomToken() {
    return Math.floor((1 + Math.random()) * 1e16).toString(16).substring(1);
}

function logError(err) {
    console.log(err.toString(), err);
}
