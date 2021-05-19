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

/* globals Croquet */

class ChatModel {
    init() {
        this.subscribe(this.id, "newPost", "newPost");
        this.subscribe(this.id, "typing", "typing");
        this.subscribe(this.id, "reset", "reset");
        this.subscribe(this.id, "setLimit", "setLimit");

        if (!this._get("history")) {
            this._set("history", []); //[{nickname, string, text: string}]
        }
        if (!this._get("typing")) {
            this._set("typing", {});
        }
        if (!this._get("limit")) {
            this._set("limit", 100);
        }
        console.log("ChatModel.init");
    }

    setLimit(number) {
        number = Math.min(Math.max(number, 1), 1000);
        this._set("limit", number);
        let post = {nickname: "(system)",
                    text: `history limit is set to ${number}.`,
                    userColor: "#000000",
                    timestamp: Date.now()};
        this.newPost(post);
    }

    newPost(post) {
        this.addToHistory(post);
        this.publish(this.id, "append", post);
    }

    typing(data) {
        let {viewId, value} = data;
        let typing = {...this._get("typing")};
        typing[viewId] = value;
        this._set("typing", typing);
        this.publish(this.id, "updateTyping");
    }

    addToHistory(item) {
        let history = this._get("history").slice();
        history.push(item);
        if (history.length > this._get("limit")) {
            history.shift();
        }
        this._set("history", history);
        this.savePersistentData();

    }

    reset() {
        this._set("history", []);
        this.savePersistentData();
        this.publish(this.id, "refresh");
    }

    loadPersistentData(data) {
        this._set("history", data.history);
        this._set("limit", data.limit);
        this.publish(this.id, "refresh");
    }

    savePersistentData() {
        let top = this.wellKnownModel("modelRoot");
        let func = () => ({history: this._get("history"), limit: this._get("limit")});
        top.persistSession(func);
    }
}

class ChatView {
    init() {
        if (!this.textIn) {
            this.nickname = this.dom.querySelector("#nickname");
            this.textIn = this.dom.querySelector("#textIn");
            this.textOut = this.dom.querySelector("#textOut");
            this.sendButton = this.dom.querySelector("#sendButton");
            this.enableButton(false);
            this.textIn.addEventListener("keydown", (evt) => {
                if (evt.keyCode === 13 || evt.keyCode === 10) {
                    evt.preventDefault();
                    this.send();
                }
            });
            this.textIn.addEventListener("input", (evt) => {
                let flag = this.textIn.value.length > 0;
                this.enableButton(flag);
            });
            this.sendButton.addEventListener("click", () => this.send());

            this.sendButton.addEventListener("pointerdown", (evt) => this.sendPointerDown(evt));
            this.sendButton.addEventListener("pointerenter", (evt) => this.sendPointerEnter(evt));
            this.sendButton.addEventListener("pointerup", (evt) => this.sendPointerUp(evt));
            this.sendButton.addEventListener("pointercancel", (evt) => this.sendPointerUp(evt));
            this.sendButton.addEventListener("pointerout", (evt) => this.sendPointerUp(evt));
            this.sendButton.addEventListener("pointerleave", (evt) => this.sendPointerUp(evt));

            this.sounds = {};
            for (const asset of ["message", "enter", "leave"]) {
                this.sounds[asset] = new Audio(`../assets/sounds/${asset}.mp3`);
            };

            this.users = new Set();
        }

        this.isTyping = {time: 0, string: ""};

        this.refresh();
        this.subscribe(this.model.id, "append", "newMessage");
        this.subscribe(this.model.id, "refresh", "refresh");
        this.subscribe(this.model.id, "updateTyping", "updateTyping");

        window.document.addEventListener("wheel", (evt) => this.wheel(evt), {passive: false, capture: false});
        this.textOut.addEventListener("wheel", (evt) => this.textWheel(evt));
        this.textIn.addEventListener("wheel", (evt) => this.textWheel(evt));
        this.textIn.addEventListener("input", (evt) => this.checkTyping(evt));

        let docked = /docked=true/.exec(window.location.search);

        if (window.parent !== window) {
            if (!docked) {
                Croquet.Messenger.startPublishingPointerMove();
            }
            Croquet.Messenger.setReceiver(this);
            Croquet.Messenger.on("sessionInfo", "handleSessionInfo");
            Croquet.Messenger.on("userInfo", "handleUserInfo");
            Croquet.Messenger.on("allUserInfo", "handleAllUserInfo");
            Croquet.Messenger.on("userCursor", "handleUserCursor");
            Croquet.Messenger.on("transparency", "handleTransparency");
            Croquet.Messenger.on("videoChatInitialState", "handleVideoChatInitialState");
            Croquet.Messenger.on("appInfoRequest", "handleAppInfoRequest");

            Croquet.Messenger.send("appReady");
            Croquet.Messenger.send("sessionInfoRequest");
            Croquet.Messenger.send("allUserInfoRequest");
            Croquet.Messenger.send("userInfoRequest");
            Croquet.Messenger.send("transparencyRequest");
            Croquet.Messenger.send("videoChatInitialStateRequest");
            if (!docked) {
                Croquet.Messenger.send("userCursorRequest");
            }
        }
        console.log("ChatView.init");
    }

    handleSessionInfo(data) {
        // console.log("sessionInfo", data);
    }

    handleVideoChatInitialState(data) {
        console.log("videoChatInitialState", data);
    }

    handleUserInfo(data) {
        // console.log("userInfo", data);
        this.dom.setAttribute("resizable", "true");
        if (data.initials) {
            this.nickname.value = data.initials;
            let holder = this.dom.querySelector("#nicknameHolder");
            if (holder) {
                holder.classList.add("hidden");
            }
        }
        this.userColor = data.userColor || this.randomColor(this.viewId);

        let post = {nickname: "(meta)", text: `${data.nickname} (${data.initials}) entered`, userColor: this.userColor, timestamp: Date.now()};
        this.publish(this.model.id, "newPost", post)
    }

    handleUserCursor(data) {
        window.document.body.style.setProperty("cursor", data);
    }

    handleTransparency(data) {
        console.log("transparency", data);
        this.dom.setAttribute("transparency", `${data}`);
    }

    handleAllUserInfo(data) {
        let users = new Set(Object.keys(data));
        this.publish(this.sessionId, "userCountChanged", users.size);
        for (let user of this.users) if (user !== this.viewId && !users.has(user)) { this.sounds.leave.play().catch(_=>_); break; }
        for (let user of users) if (user !== this.viewId && !this.users.has(user)) { this.sounds.enter.play().catch(_=>_); break; }
        this.users = users;
    }

    handleAppInfoRequest() {
        Croquet.Messenger.send("appInfo", {appName: "text-chat", label: "text chat", iconName: "tools.svgIcon", urlTemplate: "./apps/text-chat.html?q=${q}"});
    }

    enableButton(flag) {
        this.sendButton.setAttribute("enabled", `${flag}`);
        let name = flag ? "#img-send" : "#img-send-disabled";
        this.sendButton.innerHTML = `<svg class="sendLabel no-select" width="24" height="24" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg" version="1.1" preserveAspectRatio="xMinYMin">
<use xlink:href="${name}"></use>`;
    }

    setNickname(name) {
        if (this.nickname) {
            this.nickname.value = name;
        }
    }

    send() {
        if (this.textIn.value.length ===  0) {return;}

        let command = this.isCommand(this.textIn.value);
        if (command) {
            if (command.type === "reset") {
                this.publish(this.model.id, "reset");
            } else if (command.type  === "setlimit") {
                this.publish(this.model.id, "setLimit", command.value);
            } else if (command.type  === "help") {
                let help = [
                    "/reset -- reset the history",
                    "/setlimit <num> -- set the history length",
                    "/help -- show this help"
                ];
                let html = this.html({nickname: "(system)", userColor: "#000000", text: help.join("\n")});
                this.textOut.insertBefore(html, this.typers);
                this.scroll();
            } else {
                this.append({nickname: "(system)", text: `unknown command ${this.textIn.value}`, userColor: "#000000"});
            }
            this.textIn.value = "";
            this.checkTyping();
            this.enableButton(false);
            return;
        }
        let post = {nickname: this.nickname.value, text: this.textIn.value, userColor: this.userColor, timestamp: Date.now()};
        this.textIn.value = "";
        this.checkTyping();
        this.enableButton(false);
        this.publish(this.model.id, "newPost", post);
    }

    newMessage(item) {
        this.trim();
        this.append(item);
        this.sounds.message.play().catch(_=>_);
    }

    trim() {
        while (this.textOut.childNodes.length > this.model._get("limit")) {
            this.textOut.firstChild.remove();
        }
    }

    append(item) {
        if (item.timestamp) {
            let date = new Date(item.timestamp).toLocaleDateString();
            if (date !== this.date) {
                if (this.date) this.textOut.insertBefore(document.createElement("hr"), this.typers);
                this.date = date;
            }
        }
        this.textOut.insertBefore(this.html(item), this.typers);
        this.scroll();
    }

    isCommand(string) {
        let match = /^\/([a-z]+)( +[a-z0-9]+)?$/.exec(string);
        if (match) {
            return {type: match[1], value: match[2] ? match[2].trim() : null};
        }
        return null;
    }

    refresh() {
        let history = this.model._get("history");
        while (this.textOut.lastChild) {
            this.textOut.lastChild.remove();
        }

        this.addTypers();
        history.forEach((h) => this.append(h));
        this.scroll();
    }

    scroll() {
        this.textOut.parentNode.scrollTop = Math.max(10000, this.textOut.scrollHeight);
    }

    html(item) {
        let {nickname, userColor, text, timestamp} = item;

        if (nickname === "(meta)") {
            let div = document.createElement("div");
            div.className = "metaLine";
            div.innerHTML = this.message(timestamp, text);
            return div;
        }

        if (!nickname) {
            nickname = String.fromCodePoint(0x1F601);
        }

        if (nickname === "(system)") {
            nickname = String.fromCodePoint(0x1F916);
        }

        let replace = (str) => {
            let urlish = this.lookURLish(str);

            let frags = urlish.map(([cooked, orig, isURL]) => {
                if (isURL) {
                    return `<a target="_blank" rel="noopener noreferrer" href="${cooked}">${orig}</a>`;
                    // return `<a target="popup" rel="noopener noreferrer" href="${cooked}" onclick="window.open('${cooked}', '${orig}', 'width=640,height=480')">${orig}</a>`;
                }
                return cooked.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/\n/g, "<br>");
            });
            return frags.join("");
        };
        nickname = replace(nickname);
        text = replace(text);

        let fillColor = userColor;
        let initialsColor = "white";

        let avatar = this.avatar(nickname, userColor, fillColor, initialsColor);
        let message = this.message(timestamp, text);

        let div = document.createElement("div");
        div.className = "chatLine";
        div.innerHTML = `${avatar} ${message}`;
        return div;
    }

    randomColor(viewId) {
        let h = Math.floor(parseInt(viewId, 36) / (36 ** 10) * 360);
        let s = "40%";
        let l = "40%";
        return `hsl(${h}, ${s}, ${l})`;
    }

    avatar(initials, outlineColor, fillColor, initialsColor) {
    return `<svg class="person" width="32px" height="32px" viewBox="0 0 32 34" version="1.1" xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink">
    <!-- Generator: Sketch 64 (93537) - https://sketch.com -->
    <desc>Created with Sketch.</desc>
    <defs>
        <path d="M17,0 L17.0002994,0.0307604489 C25.3708878,0.547104153 32,7.49939602 32,16 C32,24.836556 24.836556,32 16,32 C7.49939602,32 0.547104153,25.3708878 0.0307604489,17.0002994 L0,17 L0,0 L17,0 Z" id="path-1"></path>
        <filter x="-15.6%" y="-12.5%" width="131.2%" height="131.2%" filterUnits="objectBoundingBox" id="filter-2">
            <feOffset dx="0" dy="1" in="SourceAlpha" result="shadowOffsetOuter1"></feOffset>
            <feGaussianBlur stdDeviation="1.5" in="shadowOffsetOuter1" result="shadowBlurOuter1"></feGaussianBlur>
            <feColorMatrix values="0 0 0 0 0   0 0 0 0 0   0 0 0 0 0  0 0 0 0.203780594 0" type="matrix" in="shadowBlurOuter1" result="shadowMatrixOuter1"></feColorMatrix>
            <feOffset dx="0" dy="0.5" in="SourceAlpha" result="shadowOffsetOuter2"></feOffset>
            <feGaussianBlur stdDeviation="0.5" in="shadowOffsetOuter2" result="shadowBlurOuter2"></feGaussianBlur>
            <feColorMatrix values="0 0 0 0 0   0 0 0 0 0   0 0 0 0 0  0 0 0 0.304223121 0" type="matrix" in="shadowBlurOuter2" result="shadowMatrixOuter2"></feColorMatrix>
            <feMerge>
                <feMergeNode in="shadowMatrixOuter1"></feMergeNode>
                <feMergeNode in="shadowMatrixOuter2"></feMergeNode>
            </feMerge>
        </filter>
    </defs>
    <g id="avatar/cursor/small-right" stroke="none" stroke-width="1" fill="none" fill-rule="evenodd">
        <g id="Combined-Shape" transform="translate(16.000000, 16.000000) scale(-1, 1) translate(-16.000000, -16.000000) ">
            <use fill="black" fill-opacity="1" filter="url(#filter-2)" xlink:href="#path-1"></use>
            <use fill="${outlineColor}" fill-rule="evenodd" xlink:href="#path-1"></use>
        </g>
        <path d="M17,2 L17.0008661,2.0352252 C24.2657313,2.54839185 30,8.60454082 30,16 C30,23.7319865 23.7319865,30 16,30 C8.94734804,30 3.11271995,24.7850199 2.14189822,18.0008423 L2,18 L2,2 L17,2 Z" id="Combined-Shape" fill="${fillColor}" transform="translate(16.000000, 16.000000) scale(-1, 1) translate(-16.000000, -16.000000) "></path>
        <text id="TD" font-family="Poppins-SemiBold, Open Sans, sans-serif" font-size="13" font-weight="500" fill="${initialsColor}">
            <tspan x="7.491" y="20">${initials}</tspan>
        </text>
    </g>
</svg>`;
    }

    message(timestamp, text) {
        let sent = timestamp ? this.formatTimestamp(timestamp) : "";
        return `<div class="message"><div class="messageTime">${sent}</div><div class="messageContent">${text}</div></div>`;
    }

    formatTimestamp(timestamp) {
        let date = new Date(timestamp);
        let time;
        try { time = date.toLocaleTimeString([], {timeStyle: "short"}) } catch (err) { time = date.toLocaleTimeString(); }
        let midnight = new Date().setHours(0,0,0,0);
        if (date >= midnight) return time;
        let day;
        try { day = date.toLocaleDateString([], {dateStyle: "short"}) } catch (err) { day = date.toLocaleDateString(); }
        return `${day} ${time}`;
    }

    wheel(evt) {
        evt.preventDefault();
    }

    textWheel(evt) {
        if (evt.deltaY !== Math.ceil(evt.deltaY)) {
            evt.preventDefault();
        }
        evt.stopPropagation();
    }

    checkTyping(evt) {
        let now = Date.now();
        let wasTyping = this.isTyping;
        let currentValue = this.textIn.value;
        if (currentValue.length === 0) {
            this.publish(this.model.id, "typing", {viewId: this.viewId, value: false});
            this.isTyping = {time: 0, string: currentValue};
            return;
        }

        if (now - wasTyping.time < 1000) {return;}

        let updated = wasTyping.string !== currentValue;
        this.isTyping = {time: now, string: currentValue};
        this.publish(this.model.id, "typing", {viewId: this.viewId, value: updated});
        if (updated) {
            this.future(8000).call("ChatView", "checkTyping");
        }
    }

    updateTyping() {
        let typing = this.model._get("typing");
        let typers = [];
        for (let k in typing) {
            if (typing[k] && k !== this.viewId) {typers.push(k);}
        }

        this.showTypers(typers);
    }

    addTypers() {
        let div = this.html({nickname: "  ", text: "\u00B7\u00B7\u00B7"});
        let typers = div;
        let m = typers.querySelector(".messageContent");
        m.classList.add("typers");
        typers.style.setProperty("display", "none");
        this.textOut.appendChild(typers);
        this.typers = typers;
    }

    showTypers(typers) {
        if (typers.length === 0) {
            this.typers.style.setProperty("display", "none");
        } else {
            this.typers.style.removeProperty("display");
        }
    }

    sendPointerDown(evt) {
        let flag = this.textIn.value.length > 0 && true;
        this.sendButton.setAttribute("pressed", `${flag}`);
    }

    sendPointerEnter(evt) {
        let flag = this.textIn.value.length > 0 && true;
        this.sendButton.setAttribute("entered", `${flag}`);
    }

    sendPointerUp(evt) {
        this.sendButton.setAttribute("pressed", "false");
        this.sendButton.setAttribute("entered", "false");
    }

    lookURLish(string) {
        if (string.length < 3) {return [[string, "", false]];}
        let urlRegex = new RegExp(
            '^(https?:\\/\\/)?' + // protocol
                '((([a-z\\d][a-z\\d-]*)\\.)+[a-z]{2,}|' + // domain name
                '((\\d{1,3}\\.){3}\\d{1,3}))' + // OR ip (v4) address
                '(\\:\\d+)?(\\/[-a-z@\\d%_.~+]*)*' + // port and path
                '(\\?[;&a-z\\d%_.~+=-]*)?' + // query string
                '(\\#[-a-z\\d_]*)?','i' // fragment locator
        );
        // if somebody knows how the g flag and lastIndex work,
        // the extra slicing in below can be avoided

        let result = [];
        let last = 0;
        let index = 0;
        while (index < string.length) {
            let slice = string.slice(index);
            let match = urlRegex.exec(slice);
            if (match) {
                if (last < index) {
                    let orig = string.slice(last, index);
                    result.push([orig, orig, false]);
                }
                let orig = slice.slice(0, match[0].length);
                let cooked = orig.startsWith("http") ? orig : "http://" + orig;
                result.push([cooked, orig, true]);
                index += match[0].length;
                last = index;
            } else {
                index++;
            }
        }

        if (last < index) {
            result.push([string.slice(last, index), false]);
        }
        return result;
    }
}

class UserListView {
    init() {
        let label = document.createElement("div");
        this.label = label;
        this.dom.appendChild(label);
        this.subscribe(this.sessionId, "userCountChanged", "setUserCount");
    }

    setUserCount(n) {
        let fragment = (n === 1) ? "user" : "users";
        this.label.innerHTML = `<span>${n} ${fragment} in the session</span>`;
    }
}

function beChat(parent, _json, persistentData) {
    parent.style.setProperty("background-color", "transparent");
    let chat = parent.createElement();
    chat.beWellKnownAs("appModel");
    chat.domId = "chat";

    chat.setStyleClasses(`
body {
  margin: 0px;
  padding: 8px;
}

@font-face {
  font-family: 'Poppins';
  src: url("./assets/fonts/poppins-v15-latin-ext_latin-regular.woff2") format('woff2');
}

@font-face {
  font-family: 'Poppins-SemiBold';
  src: url('./assets/fonts/poppins-v15-latin-ext_latin-600.woff2') format('woff2');
}

.margin {
   margin-left: 2px;
   margin-top: 2px;
   margin-bottom: 2px;
}

#chat {
    width: 200px;
    height: 400px;
    background-color: #f9f9f9;
}

#chat[resizable="true"] {
    width: 100%;
    height: calc(100% - 20px);
}

#chat[transparency="true"] {
    background-color: transparent;
}

.nicknameHolder {
    height: fit-content;
    display: flex;
    border: 1px solid gray;
}

.userList {
    font-family: Poppins;
    font-size: 10px;
    margin-left: auto;
    white-space: nowrap;
    padding: 5px 10px 4px 10px;
}

.hidden {
    display: none;
}

#textOutHolder {
    flex-grow: 2;
    padding: 10px;
    overflow-x: hidden;
}

#chat[transparency="true"] #textOutHolder {
    background-color: transparent;
    border: 1px solid transparent;
}

#infoBar {
    display: flex;
    align-items: center;
    height: fit-content;
}

#textInHolder {
    flex-grow: 2;
    height: fit-content;
    padding:2px;
}

#textIn {
    width: 100%;
    font-family: Poppins;
    resize: none;
    border: 2px solid rgba(255,255,255,0.6);
    // border-radius: 9px;
    background-color: #E6E6E6;
    box-shadow: inset -2px -2px 2px 0 rgba(240,240,240.0.3), inset 2px 2px 2px 0 rgba(0,35,46,0.08);
    padding-left: 10px;
}

#textIn:hover {
    border: 2px solid rgba(220,220,255,0.8);
}

#sendButton {
    display: flex;
    align-items: center;
    width: fit-content;
    height: 28px;
    border-radius: 8px;
    margin: 0px 4px;
    // background-color: #e8e8e8;
    // box-shadow: -1px -1px 2px 1px rgba(240,240,240,0.3), 2px 2px 2px 1px rgba(124,135,157,0.24)
}

#sendButton[entered="true"] {
    background-color: #f8f8f8;
}

#sendButton[enabled="false"] {
   color: #c0c0c0;
}

#sendButton[pressed="true"] {
   background-color: #c0c0c0;
}

.sendLabel {
  margin: 0px 0px 0px 4px;
}

.chatLine {
  display: flex;
  margin-bottom: 8px;
  margin-top: 12px;
}

.chatLine:first-child {
  margin-top: 8px;
}

.metaLine {
    display: flex;
    color: #999;
}

hr {
    border-top: 1px dashed #CCC;
}

.person {
  width: 32px;
  height: 32px;
  min-width: 32px;
  min-height: 32px;
  margin-left: 4px;
  margin-right: 4px;
}

.message {
  border-radius: 0px 8px 8px 8px;
  /*background-color: #F5FAFA;*/
  /*box-shadow: 2px -2px 2px 1px rgba(180,180,180,0.3), -1px 1px 2px 1px rgba(124,135,157,0.24);*/
  flex-grow: 1;
  margin-right: 12px;
}

.messageContent,.messageTime {
  font-family: Poppins;
  font-size: 14px;
  letter-spacing: 0;
  line-height: 18px;
  margin: 5px;
  height: fit-content;
}

.messageTime {
    float: right;
    font-size: 10px;
    color: lightgray;
}

@keyframes blinker {
  50% {
    opacity: 0;
  }
}

.typers {
   animation: blinker 2s linear infinite;
   font-size: 24px;
}

.no-select {
    user-select: none;
    -webkit-user-select: none;
    -moz-user-select: none;
   pointer-events: none;
}
`);
    chat.style.setProperty("display", "flex");
    chat.style.setProperty("flex-direction", "column");

    chat.setCode("chat.ChatModel");
    chat.setViewCode(["chat.ChatView", "widgets.GestureFilterView"]);

    let nickname = parent.createElement();
    nickname.domId = "nicknameHolder";
    nickname.classList.add("margin", "nicknameHolder");
    nickname.innerHTML = `
<span style="height: fit-content; width: fit-content">Nickname:</span>
<input id="nickname" style="width: 100%; font-weight: bold">`;

    let userList = parent.createElement();
    userList.domId = "userList";
    userList.classList.add("margin", "userList");
    userList.setViewCode("chat.UserListView");

    let textOut = parent.createElement();
    textOut.domId = "textOutHolder";
    textOut.classList.add("margin");
    textOut.innerHTML = '<div id="textOut"style="height: fit-content"></div>';

    let infoBar = parent.createElement();
    infoBar.domId = "infoBar";
    infoBar.classList.add("margin");

    let textIn = parent.createElement();
    textIn.domId = "textInHolder";
    textIn.classList.add("margin");
    textIn.innerHTML = '<textarea id="textIn"></textarea>';

    let sendButton = parent.createElement();
    sendButton.domId = "sendButton";
    sendButton.classList.add("margin");
    sendButton.innerHTML = `<svg class="sendLabel no-select" width="24" height="24" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg" version="1.1" preserveAspectRatio="xMinYMin">
<use xlink:href="#img-send-disabled"></use>
</svg>`;

    infoBar.appendChild(textIn);
    infoBar.appendChild(sendButton);

    chat.appendChild(nickname);
    chat.appendChild(userList);
    chat.appendChild(textOut);
    chat.appendChild(infoBar);

    parent.appendChild(chat);

    if (persistentData) {
        chat.call("ChatModel", "loadPersistentData", persistentData);
    }

    return parent;
}

export const chat = {
    expanders: [ChatModel, ChatView, UserListView],
    functions: [beChat]
};
