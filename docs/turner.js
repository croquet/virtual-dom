/* globals Croquet */

class SimplePageModel extends Croquet.Model {
    init() {
        this.location = null;
        this.subscribe(this.id, "position", this.position);
    }

    position(data) {
        this.location = data; // {ratio, viewId}
        this.publish(this.id, "setPosition", data);
    }

    log(data) {
        console.log(data);
    }
}

SimplePageModel.register("SimplePageModel");

class SimplePageView extends Croquet.View {
    constructor(model) {
        super(model);
        this.model = model;
        this.subscribe(this.model.id, "setPosition", this.setPosition);
        this.subscribe(this.viewId, "synced", this.synced);
        window.document.onscroll = evt => this.scroll(evt);
        this.ratio = 0; // where this view thinks where my scroll position ratio  is
        this.receivedRatio = 0; // where the last received ratio;
        this.lastSetTime = 0;
        this.lastPublishTime = 0;
        this.toBePublished = null;
        if (this.model.location) {
            this.lastPublishTime = Date.now();
            this.setPosition(this.model.location);
        }
    }

    detach() {
        super.detach();
        window.document.onscroll = null;
    }

    initCroquetMessenger() {
        if (!Croquet.Messenger) {return;}
        Croquet.Messenger.setReceiver(this);
        if (window.parent !== window) {
            Croquet.Messenger.startPublishingPointerMove();
        }
        Croquet.Messenger.on("userCursor", "handleUserCursor");
        Croquet.Messenger.send("userCursorRequest");
    }

    synced(data) {
        if (data) {
            let body = window.document.body;
            let ratio = body.scrollTop / body.scrollHeight;
            this.ratio = ratio;
            console.log("synced", ratio);
        }
    }

    setPosition(data) {
        let {ratio, viewId} = data;
        if (viewId === this.viewId) {return;}
        let body = window.document.body;
        body.scrollTop = Math.floor(body.scrollHeight * ratio);
        this.receivedRatio = ratio;
        this.lastSetTime = Date.now();

        // console.log("set", ratio, body.scrollTop, this.lastSetTime);
    }

    scroll(evt) {
        let body = window.document.body;
        let ratio = body.scrollTop / body.scrollHeight;
        if (Math.abs(this.ratio - ratio) < 0.001) {return;}
        let now = Date.now();
        // console.log("lastSetTime", this.lastSetTime, now - this.lastSetTime);
        if (now - this.lastSetTime < 50) {return;}
        this.toBePublished = ratio;
        let diff = now - this.lastPublishTime;
        // console.log("ratio", this.ratio, ratio, diff);
        if (diff < 30) {
            if (!this.timer) {
                this.timer = window.setTimeout(() => this.publishPosition(), 30);
            }
            return;
        }
        this.lastPublishTime = now;
        this.publishPosition();
    }

    publishPosition() {
        this.timer = null;
        if (this.toBePublished === null) {return;}
        // console.log("publish", this.toBePublished);
        this.publish(this.model.id, "position", {ratio: this.toBePublished, viewId: this.viewId});
        this.toBePublished = null;
    }

    handleUserCursor(data) {
        window.document.body.style.setProperty("cursor", data);
    }
}
