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

class MiniBrowser {
    init() {
        let iframe = this.querySelector("#iframe");
        if (!iframe) {
            this.style.setProperty("background-color", "white");
            this.style.setProperty("display", "flex");
            this.style.setProperty("flex-direction", "column");
            this.style.setProperty("align-items", "center");
            this.style.setProperty("user-select", "none");

            if (!this._get("useExternalAddress")) {
                let address = this.createElement("TextElement");
                address.domId = "address";
                address.style.setProperty("-cards-text-margin", "0px 4px 0px 4px");
                address.style.setProperty("-cards-text-singleLine", true);

                address.style.setProperty("height", "22px");
                address.style.setProperty("width", "80%");
                address.style.setProperty("border", "1px solid black");
                address.style.setProperty("margin", "4px");
                address._set("enterToAccept", true);
                this.subscribe(address.id, "text", "urlFromText");
                this.appendChild(address);

                let button = this.createElement();
                button.setViewCode("minibrowser.QRView");
                button.style.setProperty("position", "absolute");
                button.style.setProperty("top", "5px");
                button.style.setProperty("right", "4px");
                button.style.setProperty("width", "24px");
                button.style.setProperty("height", "24px");
                button.style.setProperty("background-image", `url(${this.getLibrary("minibrowser.QRIcon").iconString()})`);
                button.style.setProperty("background-size", "24px 24px");
                this.appendChild(button);
            }

            iframe = this.createElement("IFrameElement");
            iframe.domId = "iframe";
            iframe.classList.add("boards-iframe", "no-select");
            iframe.style.setProperty("width", "100%");
            iframe.style.setProperty("flex-grow", "10");
            iframe.style.setProperty("border", "0px solid gray");

            iframe._set("allow", "camera; microphone; encrypted-media");
            iframe._set("sandbox", "allow-forms allow-modals allow-orientation-lock allow-pointer-lock allow-presentation allow-same-origin allow-scripts");
            this.appendChild(iframe);

            this.cover = this.createElement();
            this.cover.domId = "iframeCover";
            this.cover.classList.add("boards-iframeCover", "no-select");
            this.cover.style.setProperty("width", "100%");
            this.cover.style.setProperty("height", "100%");
            this.cover.style.setProperty("position", "absolute");
            this.appendChild(this.cover);

            this._set("_useSetExtent", ["MiniBrowser", "setExtent"]);
            this._set("menuItems", [
                {value: "OpenInANewTab", label: "Open in a New Tab", traits: null, method: "openTab"}, // a method of FrameMenuView
                {value: "BeTransparent", label: "Be transparent", traits: null, method: "beTransparent", asset: "make-trans"}, // ditto
            ]);
        }

        this.subscribe(this.id, "beTransparent", "updateTransparency"); // published by a FrameMenuView
        console.log("MiniBrowser.init");
    }

    setExtent(width, height) {
        if (width === undefined && height === undefined) {
            width = parseFloat(this.style.getPropertyValue("width"));
            height = parseFloat(this.style.getPropertyValue("height"));
        }
        this.style.setProperty("width", width + "px");
        this.style.setProperty("height", height + "px");

        let address = this.getAddressBar();
        if (address) {
            address.setWidth(width - 112); // @@ hack - we'd like to let the field size itself, but text element seems to need an absolute width value
        }
    }

    getAddressBar() {
        if (!this._get("useExternalAddress")) {
            return this.querySelector("#address");
        }
        let info = this._get("addressBarInfo");
        if (!info) {return null;}
        return this.getElement(info);
    }

    getURL() {
        let iframe = this.querySelector("#iframe");
        return iframe && iframe._get("src");
    }

    updateTransparency(flag) {
        // invoked with a flag value when handling "beTransparent" event
        // from FrameMenuView, or without a flag just to get the MiniBrowser
        // to bring its style into line with the current setting and
        // publish an event to make the MiniBrowserView tell the
        // embedded app.
        if (flag !== undefined) {
            this._set("transparent", flag);
            let items = this._get("menuItems");
            function updateMenuItems(menuItems) {
                let index = menuItems.findIndex(m => m.method === "beTransparent" || m.method === "beOpaque");
                return [
                    ...menuItems.slice(0, index),
                    {value: flag ? "BeOpaque" : "BeTransparent",
                     label: flag ? "Be opaque" : "Be transparent",
                     method: flag ? "beOpaque" : "beTransparent",
                     asset: flag ? "make-opaque" : "make-trans"
                    },
                    ...menuItems.slice(index + 1)];
            }
            this._set("menuItems", updateMenuItems(items));
        }
        let iframe = this.querySelector("#iframe");
        if (this._get("transparent") && iframe && iframe._get("src")) {
            this.style.setProperty("background-color", "#FFFFFF02");
        } else {
            this.style.setProperty("background-color", "white");
        }
        this.publish(this.id, "updateTransparency"); // subscribed to by MiniBrowserView
    }

    urlFromText(data) {
        this.url(data.text);
    }

    url(url, retry) {
        if (!url || !(url.trim())) {return;}
        let iframe = this.querySelector("#iframe");
        if (iframe) {
            let oldUrl = iframe._get("src");
            url = url.trim();
            if (url.length === 0) {
                // won't happen now, given the check above
                iframe._set("src", "");
                this.announceUrlChanged();
                this.updateTransparency();
                this.removeCover();
                return;
            }
            if (!url.startsWith("https://") && !url.startsWith("http://")) {
                url = window.location.protocol + "//" + url;
            }
            if (window.location.protocol === "https:" && url.startsWith("http://")) {
                url = window.location.protocol + "//" + url.slice("http://".length);
            }

            console.log("showing: " + url);
            let address = this.getAddressBar();
            if (address) {
                address.value = url;
            }

            if (!oldUrl) {
                iframe._set("src", url);
                this.announceUrlChanged();
                this.updateTransparency();
                this.removeCover();
                return;
            }

            let oldInd = oldUrl.indexOf("#");
            let oldPrefix = oldUrl.slice(0, oldInd);
            let newInd = url.indexOf("#");
            let newPrefix = url.slice(0, newInd);
            let maybeOnlyHashChange = oldPrefix === newPrefix;

            if (!maybeOnlyHashChange) {
                iframe._set("src", url);
                this.announceUrlChanged();
                this.updateTransparency();
                this.removeCover();
                return;
            }
            if (!retry) {
                iframe._set("src", "");
                this.future(250).call("MiniBrowser", "url", url, true);
            }
        }
    }

    announceUrlChanged() {
        this.publish(this.sessionId, "savePersistentData");

        // make sure the view knows that the url has changed
        this.publish(this.id, "urlChanged");
    }

    removeCover() {
        if (this.cover) {
            this.cover.remove();
            this.cover = null;
        }
    }

    comeUpFullyOnReload() {
        let iframe = this.querySelector("#iframe");
        if (!iframe) {return;}
        let width =  parseFloat(this.style.getPropertyValue("width"));
        let height =  parseFloat(this.style.getPropertyValue("height"));

        this.url(iframe._get("src"));
        this.setExtent(width, height);
    }
}

class MiniBrowserView {
    init() {
        this.appInfo = null;
        this.subscribe(this.model.id, "updateTransparency", "updateTransparency"); // published by MiniBrowser
        this.subscribe(this.model.id, "urlChanged", "urlChanged");

        // if the model has an empty url, open the address bar
        // for editing
        let url = this.model.call("MiniBrowser", "getURL");
        if (!url) {
            let addressBar = this.model.call("MiniBrowser", "getAddressBar");
            // the FrameAddressEditView that subscribes to this message
            // might not have been initialised yet
            this.future(100).publish(addressBar.id, "setEditState", true);
        }
        console.log("MiniBrowserView.init");
    }

    urlChanged() {
        let url = this.model.call("MiniBrowser", "getURL");
        this.appInfo = url
            ? { appName: "browser", label: "browser", iconName: "link.svgIcon", urlTemplate: null } // assume it's a non-q page, until we hear otherwise
            : null;
    }

    getLoadedURL() {
        // the url recorded by the iframe, which can be
        // subtly different from what's in the model
        let iframe = this.dom.querySelector("#iframe");
        return iframe && iframe.src;
    }

    setAppInfo(spec) {
        this.appInfo = spec;
    }

    getAppInfo() {
        return this.appInfo;
    }

    getMenuFavoriteItems() {
        let items = [];

        let url = this.getLoadedURL();
        if (!url) {return items;}

        let appInfo = this.appInfo;

        if (!appInfo) {return items;}
        let scaler = window.topView.querySelector("#scaler");
        let faves = scaler.call("PasteUpView", "getAppFavorites", appInfo.appName); // objects {  url, userName, sessionName  }
        let entry = faves.find(fave => fave.url === url);
        let { userName, sessionName } = entry || {};
        items.push(sessionName
            ? { label: "Remove session favorite", traits: null, method: "removeSessionFavorite", iconGenerator: "fave_menu_remove" }
            : { label: "Add session favorite", traits: null, method: "addSessionFavorite", iconGenerator: "fave_menu_add" });
        items.push(userName
            ? { label: "Remove user favorite", traits: null, localToView: true, method: "removeUserFavorite", iconGenerator: "fave_menu_remove" }
            : { label: "Add user favorite", traits: null, localToView: true, method: "addUserFavorite", iconGenerator: "fave_menu_add" });
        return items;
    }

    updateTransparency() {
        // sync with the transparency state held by the MiniBrowser, and
        // signal to the embedded app (if any, and if it is listening)
        let flag = this.model._get("transparent");
        let iframe = this.dom.querySelector("#iframe");

        if (Croquet.Messenger.ready) {
            Croquet.Messenger.send("transparency", flag, iframe.contentWindow);
        }
    }
}

class QRView {
    init() {
        this.addEventListener("pointerup", "pointerUp");
        // this.dom.draggable = true;
        this.dom.addEventListener("dragstart", evt => this.startDrag(evt)); // we need the raw DOM event to work with
        this.dom.addEventListener("dragend", evt => this.endDrag(evt)); // we need the raw DOM event to work with
        this.dom.addEventListener("pointerdown", (evt) => this.pointerDown(evt));

        // console.log("QRView init");
    }

    pointerDown(evt) {
        evt.stopPropagation();
    }

    getBrowserView() {
        return this.parentNode.parentNode.querySelector("#miniBrowser");
    }

    getBrowser() {
        return this.getBrowserView().model;
    }

    getIframe() {
        let iframe = this.dom.parentNode.querySelector("#iframe");
        if (iframe) {return iframe;}

        return this.dom.parentNode.parentNode.querySelector("#iframe");
    }

    getLoadedURL() {
        let iframe = this.getIframe();
        return iframe ? iframe.src : "";
    }

    pointerUp(_evt) {
        if (this.qrElement) {
            this.dom.removeChild(this.qrElement);
            delete this.qrElement;
        } else {
            let url = this.getLoadedURL();
            if (!url) return;

            const { App } = Croquet;
            const qrDiv = this.qrElement = document.createElement("div");
            qrDiv.style.position = "absolute";
            qrDiv.style.width = "148px";
            qrDiv.style.height = "148px";
            qrDiv.style.backgroundColor = "white";
            qrDiv.style.top = "26px";
            qrDiv.style.left = "26px";
            qrDiv.style.zIndex = "10";

            App.sessionURL = url;
            const qrCanv = App.makeQRCanvas();
            qrCanv.style.position = "absolute";
            qrCanv.style.top = "10px";
            qrCanv.style.left = "10px";
            qrDiv.appendChild(qrCanv);
            this.dom.appendChild(qrDiv);
        }
    }

    startDrag(evt) {
        evt.stopPropagation();

        let url = this.getLoadedURL();
        if (!url || this.qrElement) {
            evt.preventDefault();
            return;
        }

        let browserView = this.getBrowserView();
        if (!browserView) return;

        let appInfo = browserView.call("MiniBrowserView", "getAppInfo");
        let dt = evt.dataTransfer;
        let { img, xOff, yOff } = window.topView.querySelector("#scaler").call("PasteUpView", "getDragImageDetails");
        dt.setDragImage(img, xOff, yOff);
        if (appInfo) {
            // encode the appInfo into the data type, to allow
            // Q to highlight an app on dragOver (during which
            // time it has access to the types, but not values).
            // use hex to get around the lowercasing of type
            // strings.
            let encoded = Array.from(JSON.stringify(appInfo)).map(ch => ch.charCodeAt(0).toString(16).padStart(2,"0")).join("");
            let faveType = `application/x.croquetfave.${encoded}`;
            let appData = JSON.stringify({ url, appInfo });
            dt.setData(faveType, appData);
        }
        dt.setData("text/uri-list", url);
        dt.setData("text/plain", url);
    }

    endDrag(evt) {
        evt.stopPropagation();
        // if (this.dragImg) {
        // this.dragImg.remove();
        // this.dragImg = null;
    // }
    }
}

class QRIcon {
    static iconString() {
        return "data:image/png;base64,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";
    }

    static defaultIcon() {
        return new Promise((resolve, reject) => {
            let img = new Image(80, 80);
            img.src = this.iconString();
            img.onload = () => resolve(img);
            img.onerror = reject;
        });
    }

    static defaultDragImage(optW, optH) {
        return this.defaultIcon().then((img) => {
            // coerce the default icon image into the requested size
            let canv = document.createElement("canvas");
            canv.width = optW || 32;
            canv.height = optH || 32;
            canv.getContext("2d").drawImage(img, 0, 0, canv.width, canv.height);
            let dataURL = canv.toDataURL();
            let sizedImg = new Image();
            sizedImg.src = dataURL;
            return sizedImg;
        });
    }
}

function beBrowser(parent, _json) {
    parent.setStyleClasses(`.no-select {
    user-select: none;
    -webkit-user-select: none;
    -moz-user-select: none;
}`);
    let holder = parent.createElement();
    holder.setCode("minibrowser.MiniBrowser");
    holder.setViewCode("minibrowser.MiniBrowserView");
    holder.style.setProperty("-cards-direct-manipulation", true);
    holder.style.setProperty("font-size", "12px");
    holder.call("MiniBrowser", "setExtent", 800, 600);
    holder.setTransform("1,0,0,1,0,0");
   
    holder.call("MiniBrowser", "removeCover");
    
    let address = holder.call("MiniBrowser", "getAddressBar");
    address.setDefault("san-serif", 12);
                              
    parent.appendChild(holder);
}

export const minibrowser = {
    expanders: [
        MiniBrowser, MiniBrowserView,
        QRView
    ],
    functions: [beBrowser],
    classes: [QRIcon]
};
