/*
Copyright 2020 Croquet Corporation.

Licensed under the Apache License, Version 2.0 (the "License");
you may not use this file except in compliance with the License.
You may obtain a copy of the License at

    http://www.apache.org/licenses/LICENSE-2.0

Unless required by applicable law or agreed to in writing, software
distributed under the License is distributed on an "AS IS" BASIS,
WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
See the License for the specific language governing permissions and
limitations under the License.
*/

class PeerView {
    init() {
        this.isInIframe = window !== window.top;

        let promise = new Promise((resolve, reject) => {
            if (this.isInIframe) {
                window.onmessage = (msg) => {
                    let data = msg.data.data;
                    window.fromLandingPage = data;
                    this.sessionName = msg.data.sessionId;
                    resolve(data);
                };
            } else {
                let getHash = (href) => {
                    let reg = /.*\?q=([0-9a-zA-Z%]+)/;
                    let match = reg.exec(href);
                    return match ? decodeURIComponent(match[1]) : this.sessionId;
                };

                this.sessionName = getHash(window.location.href);
                resolve(null);
            }

            window.parent.postMessage("askLandingPageInfo", "*");
        }).then(() => {
            console.log("SkyWay Session: ", this.sessionName);
            if (!this.Peer) {
                import("../skyway/skyway-latest.js").then((_mod) => {
                    this.Peer = window.Peer;
                }).then(() => {
                    if (window.fromLandingPage) {
                        window.topView.requestInitialization(this, "PeerView", "launchFromLandingPage");
                    }
                });
            }
        });

        if (!this.key) {
            import("../skyway/key.js").then((mod) => {
                this.key = mod.key;
            });
        }

        this.addEventListener('pointerenter', "pointerEnter");
        this.addEventListener('pointerleave', "pointerLeave");

        // now I finally know what was my problem.
        let scope = this.model.sessionId;
        this.subscribe(scope, "sessionButton", "sessionButtonPressed");
        this.subscribe(scope, "audioButton", "audioButtonPressed");
        this.subscribe(scope, "videoButton", "videoButtonPressed");
        this.subscribe(scope, "shareButton", "shareButtonPressed");
        this.state = {action: "new", time: Date.now()};
        this.peers = {};
        this.audio = {};
        this.width = 300;

        this.myPeerId = this.viewId; //  + "_" + Math.floor((Math.random() * 0x10000)).toString(16);

        this.peer = null;
        this.peer2 = null;
        this.room = null;
        this.localStream = null;

        window.topView.detachCallbacks.push({view: this, trait: "PeerView", method: "detach"});
        console.log("PeerView.init");
    }

    detach() {
        this.close();
        if (this.peer) {
            this.peer.destroy();
            this.peer = null;
        }
    }

    close() {
        if (this.room) {
            this.room.close();
            this.room = null;
        }

        if (this.peer2) {
            this.fullScreenWrapper = null;
            this.peer2.destroy();
            this.peer2 = null;
        }

        for (let k in this.audio)  {
            let audio = this.audio[k];
            if (audio.input) {
                audio.input.disconnect();
            }
            if (audio.processor) {
                audio.processor.disconnect();
            }
            if (audio.context) {
                audio.context.close();
            }
            if (audio.clone) {
                audio.clone.getTracks().forEach(track => track.stop());
            }
            delete this.audio[k];
        }

        if (this.timer) {
            window.clearInterval(this.timer);
            this.timer = null;
        }

        if (this.localStream) {
            this.localStream.getTracks().forEach(track => track.stop());
        }
        this.localStream = null;
        this.state = {action: "new", time: Date.now()};
    }

    launchFromLandingPage() {
        this.sessionButtonPressed(true);
    }

    ensurePeer() {
        if (this.peerPromise) {
            return this.peerPromise;
        }

        if (this.peer) {
            return Promise.resolve(this.peer);
        }

        this.state = {action: "openingPeer", time: Date.now()};
        console.log("openPeer");
        this.future(1000).call("PeerView", "resizeWatcher");

        this.peerPromise = new Promise((resolve, reject) => {
            let peer = new this.Peer(this.myPeerId, {
                key: this.key,
                debug: 0,
            });

            peer.on("open", id => {
                console.log("open", id);
                this.peer = peer;
                this.peerPromise = null;
                resolve(peer);
            });

            peer.on("error", error => {
                console.log(error, error.type, error.message);
                this.sessionButton.call("ButtonView", "setButtonState", "Error", "Error");
                this.detach();
                reject();
            });

            peer.on("close", () => {
                console.log("close peer");
                this.closed();
            });

            peer.on("disconnected", () => {
                console.log("disconnected peer");
                this.close();
            });
        });

        return this.peerPromise;
    }

    join() {
        console.log("join", this.state);
        if (!this.peer || !this.peer.open) {
            // Now something is wrong here
            return;
        }

        let room = this.peer.joinRoom(this.sessionName, {
            mode: 'sfu',
            stream: this.localStream // may be null if it is an observer
        });

        if (!room) {console.log("cannot open the room");}
        this.room = room;

        room.on('open', () => {
            this.roomOpened();
        });

        room.on('peerJoin', peerId => {
            console.log("peerJoin", peerId);
            // this.publish(this.model.id, "message", {type: "remoteJoin", id: peerId});
        });

        room.on('peerLeave', peerId => {
            this.peerLeft(peerId);
        });

        // for closing myself
        room.on('close', () => {
            this.roomClosed();
        });

        // Render remote stream for new peer join in the room
        room.on('stream', stream => {
            console.log(stream.peerId);

            if (stream.peerId === this.myPeerId + "_2") {
                this.displayOpened(stream.peerId);
            } else {
                this.streamJoined(stream);
            }
        });

        // let showStats = true; // /isLocal/.exec(window.location.href);
        let showStats = /Meeting\.html$/.exec(window.location.href);
        if (showStats && !this.timer) {
            let elem = document.createElement('div');
            document.body.style.removeProperty("overflow");
            elem.id = "stats-box";
            elem.style.setProperty("width", "100%");

            document.body.appendChild(elem);
            this.timer = window.setInterval(() => {
                room._negotiator._pc.getStats().then(stats => {
                    let statsOutput = "";

                    stats.forEach(report => {
                        statsOutput += `<h2 style="width: 100%">Report: ${report.type}</h3>\n<strong>ID:</strong> ${report.id}<br>\n` +
                            `<strong>Timestamp:</strong> ${report.timestamp}<br>\n`;
                        // Now the statistics for this report; we intentially drop the ones we
                        // sorted to the top above

                        Object.keys(report).forEach(statName => {
                            if (statName !== "id" && statName !== "timestamp" && statName !== "type") {
                                statsOutput += `<div style="overflow: hidden; width: 90%"><strong>${statName}:</strong>${report[statName]}<br>\n</div>`;
                            }
                        });
                    });
                    elem.innerHTML = statsOutput;
                });
            }, 1000);
        }
    }

    roomOpened() {
        console.log("joined");
        this.state = {action: "joined", time: Date.now()};

        this.sessionButton.call("ButtonView", "setButtonState", "Leave", "icon-door-leavea.svgIcon", "simple-button");

        this.room.setMaxListeners(60);

        this.ensureAudioButton();
        if (!this.audioButton) {return;}
        this.audioButton.call("ButtonView", "setButtonState", "Mute", "unmute.svgIcon", "simple-button");
        if (window.fromLandingPage && window.fromLandingPage.mic === "off") {
            this.audioButtonPressed();
        }
        this.ensureVideoButton();
        if (!this.videoButton) {return;}
        this.videoButton.call("ButtonView", "setButtonState", "Video On", "video-on.svgIcon", "simple-button");
        if (window.fromLandingPage && window.fromLandingPage.video === "off") {
            this.videoButtonPressed();
        }

        this.ensureShareButton();
        if (!this.shareButton) {return;}
        this.shareButton.call("ButtonView", "setButtonState", "Share", "unshare-screen.svgIcon", "simple-button");
        // this.publish(this.model.id, "message", {type: "localJoin", id: this.viewId});
    }

    createLocalStream(options) {
        if (!options.audio && !options.video) {
            return Promise.resolve(null);
        }

        let video = {width: 200, height: 120, frameRate: 5, resizeMode: "crop-and-scale"};
        let audio = true;

        return navigator.mediaDevices.getUserMedia({audio, video}).then((stream) => {
            console.log("localStream", this.state);
            this.state = {action: "localStream", time: Date.now()};

            if (this.localStream) {
                this.oldLocalStream = this.localStream;
                this.oldLocalStream.getTracks().forEach(track => {
                    track.enabled = false;
                    setTimeout(() => track.stop(), 100);
                });
                // can I call replaceStream without stopping?
            }

            this.localStream = stream;
            stream.getTracks().forEach((track) => {
                if (track.kind === "audio") {
                    track.applyConstraints({echoCancellation: true});
                }
            });

            if (this.room) {
                this.room.replaceStream(stream);
            }
            this.createLocalDisplayIfNeeded(stream);
            return stream;
        });
    }

    openDisplay() {
        if (this.displayStream) {return Promise.resolve(null);}
        return navigator.mediaDevices.getDisplayMedia({ video: true }).then((stream) => {
            console.log("displayStream", this.state);
            this.state = {action: "displayStream", time: Date.now()};
            this.displayStream = stream;
            let videos = this.querySelector("#videoHolder");
            let shareVideo = document.createElement("video");
            shareVideo.id = "shareVideo";
            let videoWrapper = this.styleVideo(shareVideo);

            videos.dom.appendChild(videoWrapper);
            shareVideo.muted = true;
            shareVideo.srcObject = this.displayStream;
            shareVideo.playsInline = true;
            shareVideo.play().catch(console.error);

            let peer2 = new this.Peer(this.myPeerId + "_2", {
                key: this.key,
                debug: 0,
            });

            peer2.on("open", id => {
                console.log("open 2", id, this.myPeerId + "_2");
                this.peer2 = peer2;
                this.displayJoin(this.displayStream);
            });

            this.displayJoin(this.displayStream);
            return this.displayStream;
        }); //.catch((err) => console.log(err));
    }

    closeDisplay() {
        if (!this.displayStream) {return;}
        let shareVideo = this.dom.querySelector("#shareVideo");
        if (shareVideo) {
            if (this.displayStream !== shareVideo.srcObject) {console.log("inconsistent");}

            shareVideo.srcObject.getTracks().forEach(track => track.stop());
            shareVideo.srcObject = null;
            shareVideo.parentNode.remove();
            shareVideo.remove();
        }

        this.displayStream = null;
        if (this.peer2) {
            this.peer2.destroy();
            this.peer2 = null;
        }
    }

    displayOpened(id) {
        console.log("open 2", id, this.myPeerId + "_2");
        this.ensureShareButton();
        if (!this.shareButton) {return;}
        this.shareButton.call("ButtonView", "setButtonState", "Unshare", "share-screen.svgIcon", "simple-button");
    }

    displayLeft(peerId) {
        console.log("peerLeave 2", peerId);
        const remoteWrapper = this.peers[peerId + "_2"];
        if (remoteWrapper) {
            if (remoteWrapper === this.fullScreenWrapper) {
                this.fullScreenWrapper = null;
            }
            let remoteVideo = remoteWrapper.querySelector("video");
            remoteVideo.srcObject.getTracks().forEach(track => track.stop());
            remoteVideo.srcObject = null;
            remoteVideo.remove();
            remoteWrapper.remove();
        }
        delete this.peers[peerId + "_2"];
    }

    displayClosed() {
        let shareVideo = this.dom.querySelector("#shareVideo");
        if (shareVideo) {
            if (this.displayStream !== shareVideo.srcObject) {console.log("inconsistent");}
            shareVideo.srcObject.getTracks().forEach(track => track.stop());
            shareVideo.srcObject = null;
            shareVideo.parentNode.remove();
            shareVideo.remove();
        }
        this.displayStream = null;

        this.ensureShareButton();
        if (!this.shareButton) {return;}
        this.shareButton.call("ButtonView", "setButtonState", "Share", "unshare-screen.svgIcon", "simple-button");

        if (this.peer2) {
            this.peer2.destroy();
            this.peer2 = null;
        }
    }

    displayJoin(displayStream) {
        let peer2 = this.peer2;
        if (!peer2 || !peer2.open) {
            return;
        }

        let room = peer2.joinRoom(this.sessionName, {
            mode: 'sfu',
            stream: displayStream
        });

        console.log("room", room, this.room, room === this.room);

        // for closing myself
        displayStream.getVideoTracks()[0].onended = () => this.displayClosed();
    }

    styleVideo(elem, optWrapper) {
        elem.style.setProperty("width", "200px");
        elem.style.setProperty("height", "120px");
        elem.style.setProperty("margin", "auto");

        let wrapper = optWrapper;
        if (!wrapper) {
            wrapper = document.createElement("div");
        }
        wrapper.style.setProperty("background-color", "black");
        wrapper.style.setProperty("width", "200px");
        wrapper.style.setProperty("height", "120px");
        wrapper.style.setProperty("margin", "10px 0px 0px 10px");
        wrapper.classList.add("videoWrapper");
        wrapper.style.setProperty("display", "flex");
        wrapper.style.setProperty("justify-content", "space-around");
        wrapper.style.setProperty("align-content", "center");

        wrapper.style.removeProperty("position");
        wrapper.style.removeProperty("left");
        wrapper.style.removeProperty("top");

        if (!optWrapper) {
            wrapper.appendChild(elem);

            let borderElem = document.createElement("div");
            borderElem.id = "border";
            borderElem.style.setProperty("position", "absolute");
            borderElem.style.setProperty("width", "200px");
            borderElem.style.setProperty("height", "120px");
            borderElem.style.setProperty("box-sizing", "border-box");
            borderElem.style.setProperty("pointer-events", "none");
            wrapper.appendChild(borderElem);
        }
        return wrapper;
    }

    resizeWatcher() {
        this.future(1000).call("PeerView", "resizeWatcher");
        let videoHolder = this.querySelector("#videoHolder");
        let separator = this.querySelector("#separator");
        if (!this.isInIframe && !separator) {return;}
        let w;
        if (separator) {
            w = this.dom.getBoundingClientRect().width - separator.dom.getBoundingClientRect().width;
        } else {
            w = this.dom.parentNode.getBoundingClientRect().width - 0;
        }

        let numChildren = videoHolder.dom.childNodes.length;
        if (w === this.width && numChildren === this.lastNumChildren) {return;}
        this.width = w;
        this.lastNumChildren = numChildren;
        let scale = Math.min((w - 20) / 200, 1); // 10px margin on the left; leave a 10px gap on the right
        let width = (200 * scale);
        let height = (120 * scale);
        let vWidth = (200 * scale);
        let vHeight = (120 * scale);

        Array.from(videoHolder.dom.children).forEach(videoWrapper => {
            if (this.fullScreenWrapper === videoWrapper) {return;}
            let video = videoWrapper.querySelector("video");
            let borderElem = videoWrapper.querySelector("#border");
            videoWrapper.style.setProperty("width", width + "px");
            videoWrapper.style.setProperty("height", height + "px");
            video.style.setProperty("width", vWidth + "px");
            video.style.setProperty("height", vHeight + "px");
            borderElem.style.setProperty("width", vWidth + "px");
            borderElem.style.setProperty("height", vHeight + "px");
        });
    }

    ensureButton(name) {
        // it still may be null
        if (!this[name]) {
            this[name] = window.topView.querySelector("#" + name);
        }
    }

    ensureSessionButton() {
        this.ensureButton("sessionButton");
    }

    ensureAudioButton() {
        this.ensureButton("audioButton");
    }

    ensureVideoButton() {
        this.ensureButton("videoButton");
    }

    ensureShareButton() {
        this.ensureButton("shareButton");
    }

    sessionButtonPressed(fromLandingPage) {
        this.ensureSessionButton();
        if (!this.sessionButton) {throw new Error("no session button");}
        if (this.state.action === "new") {
            if (fromLandingPage &&
                window.fromLandingPage &&
                window.fromLandingPage.mic === "off" &&
                window.fromLandingPage.video === "off") {
                return;
            }
            if (this.state.action === "opening local" && Date.now() - this.state.time < 3000) {return;}
            this.state = {action: "opening local", time: Date.now()};
            this.ensurePeer().then((peer) => {
                let video = window.fromLandingPage ? window.fromLandingPage.video === "on" : true;
                let audio = window.fromLandingPage ? window.fromLandingPage.mic === "on" : true;
                this.createLocalStream({audio, video}).then((mediaStream) => {
                    this.localStream = mediaStream;
                    this.sessionButton.call("ButtonView", "setButtonState", "Joining", "Joining");
                    this.join();
                }).catch(() => {
                    console.log("error in creating local stream");
                    this.peerPromise = null;
                });
            });
        } else {
            this.close();
            this.state = {action: "new", time: Date.now()};
        }
    }

    videoButtonPressed() {
        console.log("videoButton pressed");
        this.ensureVideoButton();
        if (!this.videoButton) {return;}
        if (!this.localStream) {return;}
        if (this.videoButton.call("ButtonView", "getButtonState") === "Video On") {
            this.videoButton.call("ButtonView", "setButtonState", "Video Off", "video-off.svgIcon", "simple-button");
            this.localStream.getVideoTracks().forEach((t) => t.enabled = false);
            // this.createLocalStream({audio, video: false});
        } else {
            this.videoButton.call("ButtonView", "setButtonState", "Video On", "video-on.svgIcon", "simple-button");
            // this.createLocalStream({audio, video: true});
            this.localStream.getVideoTracks().forEach((t) => t.enabled = true);
        }
    }

    audioButtonPressed() {
        console.log("audioButton pressed");
        this.ensureAudioButton();
        if (!this.audioButton) {return;}
        if (!this.localStream) {return;}
        if (this.audioButton.call("ButtonView", "getButtonState") === "Mute") {
            this.audioButton.call("ButtonView", "setButtonState", "Unmute", "mute.svgIcon", "simple-button");
            this.localStream.getAudioTracks().forEach((t) => t.enabled = false);
        } else {
            this.audioButton.call("ButtonView", "setButtonState", "Mute", "unmute.svgIcon", "simple-button");
            this.localStream.getAudioTracks().forEach((t) => t.enabled = true);
        }
    }

    shareButtonPressed(presshold) {
        if (this.presentationMenu) {
            this.presentationMenu.remove();
            this.presentationMenu = null;
            return;
        }

        if (presshold) {
            this.presentationStartMenu();
            return;
        }
        console.log("shareButton pressed");
        this.ensureShareButton();
        if (!this.shareButton) {return;}
        if (this.displayStream) {
            this.closeDisplay();
            this.shareButton.call("ButtonView", "setButtonState", "Share", "unshare-screen.svgIcon", "simple-button");
        } else {
            this.openDisplay();
        }
    }

    createLocalDisplayIfNeeded() {
        let videos = this.querySelector("#videoHolder");
        let localVideo = videos.dom.querySelector("#localVideo");
        if (!localVideo) {
            localVideo = document.createElement("video");
            localVideo.id = "localVideo";
            localVideo.style.setProperty("transform", "scale(-1, 1)");
            let videoWrapper = this.styleVideo(localVideo);
            videos.dom.appendChild(videoWrapper);
        }

        localVideo.srcObject = this.localStream;
        localVideo.muted = true;
        localVideo.playsInline = true;
        localVideo.play().catch(console.error);

        let borderElem = localVideo.parentNode.querySelector("#border");
        this.stopAudioFeedback(this.localStream, borderElem, this.myPeerId);
        this.setupAudioFeedback(this.localStream, borderElem, this.myPeerId);
    }

    peerLeft(peerId) {
        console.log("peerLeft", peerId);
        const remoteWrapper = this.peers[peerId];
        if (remoteWrapper) {
            let remoteVideo = remoteWrapper.querySelector("video");
            remoteVideo.srcObject.getTracks().forEach(track => track.stop());
            remoteVideo.srcObject = null;
            remoteVideo.remove();
            remoteWrapper.remove();
            if (this.fullScreenWrapper === remoteWrapper) {
                this.fullScreenWrapper = null;
            }
            delete this.peers[peerId];
        }

        let audio = this.audio[peerId];
        if (audio) {
            audio.input.disconnect();
            audio.processor.disconnect();
            audio.context.close();
            if (audio.clone) {
                audio.clone.getTracks().forEach(track => track.stop());
            }
            delete this.audio[peerId];
        }
    }

    roomClosed() {
        console.log("close");
        let videoHolder = this.querySelector("#videoHolder");
        if (videoHolder) {
            Array.from(videoHolder.dom.children).forEach(videoWrapper => {
                let remoteVideo = videoWrapper.querySelector("video");
                remoteVideo.srcObject.getTracks().forEach(track => track.stop());
                remoteVideo.srcObject = null;
                remoteVideo.remove();
                videoWrapper.remove();
            });
        }
        this.sessionButton.call("ButtonView", "setButtonState", "Join", "icon-door-joina.svgIcon", "simple-button");
        this.localStream = null;
        this.peers = {};

        this.displayClosed();

        this.ensureAudioButton();
        if (!this.audioButton) {return;}
        this.audioButton.call("ButtonView", "setButtonState", "AudioInit", "unmute.svgIcon", "simple-button");

        this.ensureVideoButton();
        if (!this.videoButton) {return;}
        this.videoButton.call("ButtonView", "setButtonState", "VideoInit", "video-on.svgIcon", "simple-button");

        this.ensureShareButton();
        if (!this.shareButton) {return;}
        this.shareButton.call("ButtonView", "setButtonState", "ShareInit", "unshare-screen.svgIcon", "simple-button");

        this.state = {action: "new", time: Date.now()};
    }

    closed() {
        console.log("closed");
    }

    streamJoined(stream) {
        let peerId = stream.peerId;
        if (this.peers[peerId]) {
            console.log("duplicated stream trigger for " + peerId);
            return;
        }

        let isSecondVideo = peerId.endsWith("_2");

        if (stream.getAudioTracks().length === 0 &&
            isSecondVideo &&
            peerId.slice(0, peerId.length - 2) === this.myPeerId) {
            console.log("likely to be a screenshare stream from myself");
            return;
        }

        const newVideo = document.createElement("video");
        newVideo.srcObject = stream;
        newVideo.playsInline = true;

        let videoWrapper = this.styleVideo(newVideo);
        videoWrapper.style.setProperty("align-content", "center");
        videoWrapper.appendChild(newVideo);
        let videoHolder = this.querySelector("#videoHolder");
        videoHolder.dom.appendChild(videoWrapper);
        this.peers[peerId] = videoWrapper;
        if (!isSecondVideo) {
            let borderElem = newVideo.parentNode.querySelector("#border");
            this.setupAudioFeedback(stream, borderElem, peerId);
        }

        if (isSecondVideo) {
            videoWrapper.addEventListener("click", (evt) => {
                this.extendShareVideo(videoWrapper);
            });
        }
        newVideo.play().catch(console.error);
    }

    extendShareVideo(videoWrapper) {
        if (this.fullScreenWrapper) {
            this.styleVideo(this.fullScreenWrapper.firstChild, this.fullScreenWrapper);
        }

        this.width = 0;

        if (this.fullScreenWrapper === videoWrapper) {
            this.fullScreenWrapper = null;
            return;
        }

        let pad = window.topView.querySelector("#pad");
        let rect = pad.dom.getBoundingClientRect();
        let video = videoWrapper.querySelector("video");

        let track = video.srcObject.getVideoTracks()[0];
        let settings = track.getSettings();
        if (settings.width === undefined) {
            let videoRect = video.getBoundingClientRect();
            settings = {width: videoRect.width, height: videoRect.height};
        }

        let tools = window.topView.querySelector("#tools");
        let toolsRect = tools.dom.getBoundingClientRect();

        let header = window.topView.querySelector("#header");
        let headerRect = header.dom.getBoundingClientRect();

        let infoBar = window.topView.querySelector("#infoBar");
        let infoBarRect = infoBar.dom.getBoundingClientRect();

        let peers = window.topView.querySelector("#peers");
        let peersRect = peers.dom.getBoundingClientRect();

        let maxX = rect.width - 20 - toolsRect.width - peersRect.width;
        let maxY = rect.height - 20 - headerRect.height - infoBarRect.height;

        let ratio = Math.min(maxX / settings.width, maxY / settings.height);

        video.style.setProperty("width", (settings.width * ratio) + "px");
        video.style.setProperty("height", (settings.height * ratio) + "px");

        videoWrapper.style.setProperty("position", "fixed");
        videoWrapper.style.setProperty("left", (toolsRect.right + 10) + "px");
        videoWrapper.style.setProperty("top",  (headerRect.bottom + 10) + "px");
        videoWrapper.style.setProperty("width", maxX + "px");
        videoWrapper.style.setProperty("height", maxY + "px");
        videoWrapper.style.setProperty("z-index",  "10");

        this.fullScreenWrapper = videoWrapper;
    }

    setupAudioFeedback(stream, videoBorder, peerId) {
        if (stream.getAudioTracks().length === 0) {
            console.log("video only stream, perhaps for screen share");
            return;
        }
        let process = (data) => {
            if (!this.audio[peerId]) {
                // already closed;
                return 0;
            }
            let oldTime = this.audio[peerId].time;
            let nowTime = Date.now();
            if (nowTime < oldTime + 250) {return 0;}
            this.audio[peerId].time = nowTime;
            let max = 0;
            let buf = data.inputBuffer.getChannelData(0);
            for (let i = 0; i < buf.length; i++) {
                max = Math.max(max, Math.abs(buf[i]));
            }
            let scale = this.scale || 1;
            let w = Math.max(((max * 10 - 0.5) * scale), 0); // hmm
            videoBorder.style.setProperty("border", w + "px solid blue");
            return max;
        };

        let context = new (window.AudioContext || window.webkitAudioContext)();
        let cloned = null; //stream.clone();
        let input = context.createMediaStreamSource(stream); // cloned
        let processor = context.createScriptProcessor(1024, 1, 1);
        processor.onaudioprocess = (e) => process(e);

        input.connect(processor);
        processor.connect(context.destination);

        let audio = {context, input, cloned, processor, time: 0};
        this.audio[peerId] = audio;
    }

    stopAudioFeedback(stream, videoBorder, peerId) {
        let audio = this.audio[peerId];
        if (!audio) {return;}
        if (audio.input) {
            audio.input.disconnect();
        }
        if (audio.processor) {
            audio.processor.disconnect();
        }
        if (audio.context) {
            audio.context.close();
        }
        if (audio.clone) {
            audio.clone.getTracks().forEach(track => track.stop());
        }
        delete this.audio[peerId];
    }

    presentationStartMenu() {
        let menu = this.makeMenu();
        let rect = this.shareButton.dom.getBoundingClientRect();
        menu.style.setProperty("position", "absolute");
        menu.style.setProperty("left", (rect.left - 100) + "px");
        menu.style.setProperty("top", (rect.bottom - 10) + "px");
        this.presentationMenu = menu;
        this.shareButton.dom.parentNode.appendChild(menu);
    }

    makeMenuItem(assetName, value, label) {
        let opt = document.createElement("div");

        if (value === null) {
            opt.classList.add("no-select", "frame-menu-title");
            opt.innerHTML = `<span>${label}</span>`;
            return opt;
        }
        opt.classList.add("no-select", "frame-menu-item");

        let html = "";
        if (assetName) {
            let sectionName = "img-" + assetName;
            html = `<div class="frame-menu-icon"><svg viewBox="0 0 24 24" class="frame-menu-icon-svg"><use href="#${sectionName}"></use></svg></div>`;
        }
        html += `<span class="frame-menu-label">${label}</span>`;
        opt.innerHTML = html;
        opt.value = value;
        opt.addEventListener("click", (evt) => this.menuSelected(evt), true);
        return opt;
    }

    makeMenu() {
        // menu option for presenting:
        //   no-one presenting => "Start Presenting"
        //   this client presenting => "Stop Presenting"
        //   following other client presenting => "Leave Presentation"
        //   not following other client => "Join Presentation"
        let items = [];

        let pad = window.topView.querySelector("#pad");
        let presenterId = pad.call("TransformView", "getPresenter");
        if (!presenterId) {
            items.push(["startPresenting", "Start Presenting"]);
            // use this opportunity to make sure all clients know this client's viewport
            this.publish(pad.model.id, "prepareToStartPresenting"); // subscribed by view
        } else if (presenterId === this.viewId) {
            items.push(["stopPresenting", "Stop Presenting"]);
        } else if (pad.following) {
            items.push(["leavePresentation", "Leave Presentation"]);
        } else {
            items.push(["joinPresentation", "Join Presentation"]);
        }

        items.push(this.displayStream ? ["unshareScreen", "Unshare Screen"] : ["shareScreen", "Share Screen"]);

        let select = document.createElement("div");
        select.classList.add("frame-menu", "no-select");
        let title = this.makeMenuItem(null, null, "SHARE OPTIONS");
        select.appendChild(title);

        items.forEach(([value, label]) => {
            let opt = this.makeMenuItem(null, value, label);
            select.appendChild(opt);
        });

        let div = document.createElement("div");
        div.classList.add("frame-menu-holder");
        div.appendChild(select);
        return div;
    }

    menuSelected(evt) {
        let value = evt.currentTarget.value;

        if (this.presentationMenu) {
            this.presentationMenu.remove();
            this.presentationMenu = null;
        }

        let pad = window.topView.querySelector("#pad");
        let presenterId = pad.call("TransformView", "getPresenter");
        let thisId = this.viewId;

        // the menu items are based on the state at the time the menu was called up.
        // by the time a selection is made, the available options could be different.
        // in the case of a global change (start or stop presenting to all), the
        // model must decide if the change can go ahead.
        // a local change (leaving or joining another view's presentation) is
        // handled by local TransformView methods.
        if (value === "startPresenting") {
            console.log(`request to start presentation as ${thisId}`);
            this.publish(pad.model.id, "startPresentation", thisId); // to model
        } else if (value === "stopPresenting") {
            console.log(`request to stop presentation as ${thisId}`);
            this.publish(pad.model.id, "stopPresentation", thisId); // to model
        } else if (value === "leavePresentation") {
            pad.call("TransformView", "leavePresentation");
        } else if (value === "joinPresentation") {
            pad.call("TransformView", "joinPresentation");
        } else {
            this.shareButtonPressed();
        }
    }

    querySeparator() {
        if (!this.separator) {
            this.separator = this.querySelector("#separator");
        }
        return this.separator;
    }

    pointerEnter() {
        let separator = this.querySeparator();
        if (separator) {
            separator.call("SeparatorView", "show");
        }
    }

    pointerLeave() {
        let separator = this.querySeparator();
        if (separator) {
            separator.call("SeparatorView", "hide");
        }
    }
}

function beChat(parent, json) {
    parent.style.setProperty("display", "flex");
    parent.style.setProperty("flex-direction", "column");

    parent.setStyleClasses(`
.peer-button {
    display: flex;
    align-items: center;
    width: 40px;
    height: 40px;
    border-radius: 50%;
    margin: 8px;
    background-color: #F2F2F2;
    box-shadow: 0 1px 4px 0 rgba(0,0,0,0.3), 0 2px 6px 0 rgba(0,0,0,0.2);
    -webkit-transition: background-color 0.25s linear;
    -ms-transition: background-color 0.25s linear;
    transition: background-color 0.25s linear;
}

.peer-button:hover {
    background-color: rgba(0,0,0,0.02);
}

.peer-button[buttonState="Leave"] {
    background-color: #FFFFFF;
}

.peer-button[buttonState="Mute"] {
    background-color: #00DA5A;
}

.peer-button[buttonState="Video On"] {
    background-color: #00DA5A;
}

.peer-button[buttonState="AudioInit"] {
    visibility: hidden;
}

.peer-button[buttonState="VideoInit"] {
    visibility: hidden;
}

.peer-button[buttonState="ShareInit"] {
    visibility: hidden;
    background-color: #808080;
}

.simple-button {
    display: flex;
    align-items: center;
    height: 40px;
    width: 40px;
}

.icon-svg {
    width: 24px;
    height: 24px;
    margin-left: auto;
    margin-right: auto;
}

.frame-menu-icon-svg {
    width: 100%;
    height: 100%;
}

#peers {
    background-color: rgba(255,255,255,0.7);
}


`);

    let isInIframe = window !== window.top;

    let buttonBox = parent.createElement();
    buttonBox.style.setProperty("display", "flex");

    let headerSpacer = parent.createElement();
    headerSpacer.style.setProperty("flex-grow", "10");

    let sessionButton = parent.createElement();
    sessionButton.domId = "sessionButton";
    sessionButton.classList.add("peer-button");
    sessionButton.setCode("widgets.Button");
    sessionButton.call("Button", "beViewButton", "Join", "icon-door-joina.svgIcon", "simple-button", "Join Video Chat Session");
    sessionButton.addDomain(null, "sessionButton");

    let audioButton = parent.createElement();
    audioButton.domId = "audioButton";
    audioButton.classList.add("peer-button");
    audioButton.setCode("widgets.Button");
    audioButton.call("Button", "beViewButton", "AudioInit", "unmute.svgIcon", "simple-button", "Microphone");
    audioButton.addDomain(null, "audioButton");

    let videoButton = parent.createElement();
    videoButton.domId = "videoButton";
    videoButton.classList.add("peer-button");
    videoButton.setCode("widgets.Button");
    videoButton.call("Button", "beViewButton", "VideoInit", "video-on.svgIcon", "simple-button", "Camera");
    videoButton.addDomain(null, "videoButton");

    let shareButton = parent.createElement();
    shareButton.domId = "shareButton";
    shareButton.classList.add("peer-button");
    shareButton.setCode("widgets.Button");
    shareButton.call("Button", "beViewButton", "ShareInit", "share-screen.svgIcon", "simple-button", "Share Screen");
    shareButton.addDomain(null, "shareButton");
    shareButton.call("Button", "enablePressHold");
    // this way of handling an event is not suggested; but to handle some cases where
    // a media request has to be handled in the event handler, a handler has to be invoked directly.
    shareButton.call("Button", "beImmediateViewButton", "peers", "PeerView", "shareButtonPressed");

    buttonBox.appendChild(headerSpacer);
    buttonBox.appendChild(audioButton);
    buttonBox.appendChild(videoButton);
    buttonBox.appendChild(shareButton);
    buttonBox.appendChild(sessionButton);

    parent.appendChild(buttonBox);

    let middle = parent.createElement();
    middle.style.setProperty("display", "flex");
    middle.style.setProperty("width", "100%");
    middle.style.setProperty("height", "100%");

    let space = parent.createElement();
    space.domId = "space";
    if (window === window.top) {
        space.style.setProperty("width", "100%");
        space.style.setProperty("height", "100%");
    } else {
        space.style.setProperty("width", "0px");
        space.style.setProperty("height", "0px");
    }
    space.style.setProperty("background-color", "#fffff0");

    let peers = parent.createElement();
    peers.domId = "peers";
    peers.setViewCode("videoChat.PeerView");
    peers.style.setProperty("display", "flex");
    peers.style.setProperty("background-color", "#cccccc");
    peers.style.setProperty("flex-direction", "column");

    if (isInIframe) {
        peers.style.setProperty("flex-grow: 1");
    } else {
        peers.style.setProperty("width", "400px");
    }

    let videos = peers.createElement();
    videos.domId = "videoHolder";
    videos.style.setProperty("display", "flex");
    videos.style.setProperty("flex-wrap", "wrap");
    videos.style.setProperty("margin-right", "10px");
    peers.appendChild(videos);

    middle.appendChild(space);
    middle.appendChild(peers);

    parent.appendChild(middle);
    return parent;
}

export const videoChat = {
    expanders: [
        PeerView
    ],
    functions: [beChat]
};
