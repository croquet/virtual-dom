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

class TextModel {
    init() {
        let text = this.querySelector("#textElement");
        if (!text) {
            text = this.createElement("TextElement");
            text.domId = "text";
            text.classList.add("text");

            text.style.setProperty("-cards-text-margin", "4px 4px 4px 4px");
            text.setDefault("OpenSans", 16);
            text.style.setProperty("width", "600px");
            text.style.setProperty("height", "400px");
            text.style.setProperty("position", "relative");
            text.style.setProperty("background-color", "white");
            text.setViewCode("text.FrameView");
            text.setWidth(600);
            text.setViewCode(["text.FrameView", "text.FontLoader"]);
            this.appendChild(text);
        }

        this.subscribe(this.id, "save", "TextModel.savePersistentData");
    }

    loadPersistentData(data) {
        let text = this.querySelector("#text");
        if (text) {
            text.load(data);
        }
    }

    savePersistentData() {
        let text = this.querySelector("#text");
        let top = this.wellKnownModel("modelRoot");
        if (!text || !top) {return;}
        let func = () => text.doc.save();
        top.persistSession(func);
    }
}

class TextView {
    init() {
        if (!this.loop) {
            this.loop = true;
            this.future(60 * 1000).call("TextView", "save");
        }
    }

    save() {
        this.publish(this.model.id, "save");
        this.future(60 * 1000).call("TextView", "save");
    }
}

class FontLoader {
    init() {
        let spec = [
            {name: "OpenSans",
             url: "./assets/fonts/open-sans-v17-latin-ext_latin-regular.woff2",
             descriptor: {style: "normal", weight: "400"}
            },
            {name: "OpenSans",
             url: "./assets/fonts/open-sans-v17-latin-ext_latin-italic.woff2",
             descriptor: {style: "italic", weight: "400"}
            },
            {name: "OpenSans",
             url: "./assets/fonts/open-sans-v17-latin-ext_latin-700.woff2",
             descriptor: {style: "normal", weight: "700"}
            },
            {name: "OpenSans",
             url: "./assets/fonts/open-sans-v17-latin-ext_latin-700italic.woff2",
             descriptor: {style: "italic", weight: "700"}
            }
        ];

        let ps = spec.map((info) => {
            let ff = new FontFace(info.name, `url(${info.url})`, info.descriptor);
            document.fonts.add(ff);
            return ff.load();
        });

        Promise.all(ps).then((fonts) => {
            console.log(fonts);
            this.synced(true);
        });
    }
}

class WidgetModel {
    init() {
        if (!this._get("initialized")) {
            this._set("initialized", true);
            let panel = this.createElement("div");
            panel.classList.add("text-menu-top");

            let boldButton = this.createElement();
            boldButton.domId = "boldButton";
            boldButton.classList.add("text-face-button");
            boldButton.setCode("widgets.Button");
            boldButton.call("Button", "beViewButton", "Off", "<b style='font-family: serif'>B</b>", "text-face-bold", "Bold");
            boldButton.addDomain(this.id, "bold");

            let italicButton = this.createElement();
            italicButton.domId = "italicButton";
            italicButton.classList.add("text-face-button");
            italicButton.setCode("widgets.Button");
            italicButton.call("Button", "beViewButton", "Off", "<i style='font-family: serif'>I</i>", "text-face-italic", "Italic");
            italicButton.addDomain(this.id, "italic");

            let size = this.createElement();
            size.domId = "size";
            size.innerHTML = "size";
            size.classList.add("text-menu-item");
            let color = this.createElement();
            color.domId = "color";
            color.innerHTML = "color";
            color.classList.add("text-menu-item");

            panel.appendChild(boldButton);
            panel.appendChild(italicButton);
            panel.appendChild(size);
            panel.appendChild(color);

            this.appendChild(panel);
        }
    }
}

class WidgetView {
    init() {
        let size = this.querySelector("#size");
        size.dom.addEventListener("click", (evt) => this.launchSizeMenu(evt));
        let color = this.querySelector("#color");
        color.dom.addEventListener("click", (evt) => this.launchColorMenu(evt));

        let boldButton = this.querySelector("#boldButton");
        boldButton.dom.addEventListener("click", (evt) => this.bold(evt));

        let italicButton = this.querySelector("#italicButton");
        italicButton.dom.addEventListener("click", (evt) => this.italic(evt));

        let target = window.topView.querySelector(`#${this.model._get("text")}`);
        this.subscribe(target.id, "selectionUpdated", "WidgetView.selectionUpdated");

        let selection = this.getSelection();
        this.hasBoxSelection = !!(selection && (selection.start !== selection.end));
        this.selectionUpdated(true);
        console.log("WidgetView.init");
    }

    getSelection() {
        let target = window.topView.querySelector(`#${this.model._get("text")}`);
        return target.model.content.selections[this.viewId];
    }

    dismissMenu() {
        if (this.menu) {
            this.menu.remove();
            this.menu = null;
        }
    }

    launchSizeMenu(evt) {
        if (this.menu) {
            this.dismissMenu();
            return;
        }
        this.menu = this.makeSizeMenu();
        this.dom.appendChild(this.menu);
    }

    launchColorMenu(evt) {
        if (this.menu) {
            this.dismissMenu();
            return;
        }
        this.menu = this.makeColorMenu();
        this.dom.appendChild(this.menu);
    }

    makeSizeMenu() {
        return this.makeMenu(["8", "12", "16", "20", "24"]);
    }

    makeColorMenu() {
        return this.makeMenu(["black", "blue", "green", "red"]);
    }

    makeMenu(items) {
        let select = document.createElement("div");
        select.classList.add("text-menu", "no-select");

        items.forEach((value) => {
            let opt = this.makeMenuItem(null, value, value);
            select.appendChild(opt);
        });

        let div = document.createElement("div");
        div.classList.add("text-menu-holder");
        div.appendChild(select);
        return div;
    }

    makeMenuItem(assetName, value, label) {
        let opt = document.createElement("div");

        if (value === null) {
            opt.classList.add("no-select", "text-menu-title");
            opt.innerHTML = `<span>${label}</span>`;
            return opt;
        }
        opt.classList.add("no-select", "text-menu-item");

        let html = "";
        if (assetName) {
            let sectionName = "img-" + assetName;
            html = `<div class="frame-menu-icon"><svg viewBox="0 0 24 24" class="frame-menu-icon-svg"><use href="#${sectionName}"></use></svg></div>`;
        }
        html += `<span class="text-menu-label">${label}</span>`;
        opt.innerHTML = html;
        opt.value = value;
        opt.addEventListener("click", (evt) => this.menuSelected(evt), true);
        return opt;
    }

    menuSelected(evt) {
        let value = evt.currentTarget.value;
        let target = window.topView.querySelector(`#${this.model._get("text")}`);
        let style;

        if (/^[0-9]/.test(value)) {
            value = parseInt(value, 10);
            style = {size: value};
        } else {
            style = {color: value};
        }

        target.mergeStyle(style);
    }

    selectionUpdated(firstTime) {
        let hadBoxSelection = this.hasBoxSelection;

        let target = window.topView.querySelector(`#${this.model._get("text")}`);
        let selection = target.model.content.selections[this.viewId];
        this.hasBoxSelection = !!(selection && (selection.start !== selection.end));

        if (selection) {
            let style = target.model.styleAt(selection.start);

            let state = style && style.italic ? "On" : "Off";
            let italicButton = this.querySelector("#italicButton");
            italicButton.call("ButtonView", "setButtonState", state, italicButton.model._get("label"), italicButton.model._get("class"), italicButton.model._get("title"));

            state = style && style.bold ? "On" : "Off";
            let boldButton = this.querySelector("#boldButton");
            boldButton.call("ButtonView", "setButtonState", state, boldButton.model._get("label"), boldButton.model._get("class"), boldButton.model._get("title"));
        }

        if (!firstTime && hadBoxSelection === this.hasBoxSelection) {return;}

        if (firstTime || (hadBoxSelection && !this.hasBoxSelection)) {
            this.dismissMenu();
            this.dom.style.setProperty("display", "none");
            return;
        }

        let rect = target.dom.getBoundingClientRect();
        let rects = target.warota.selectionRects(selection);
        this.dom.style.removeProperty("display");

        let x = rect.left + (rects[0].left + (rects[0].width / 2));
        let y = rect.top + (rects[0].top + rects[0].height + 5);

        this.dom.style.setProperty("position", "absolute");
        this.dom.style.setProperty("left", x + "px");
        this.dom.style.setProperty("top", y + "px");
    }

    bold() {
        console.log("bold");
        let target = window.topView.querySelector(`#${this.model._get("text")}`);
        let button = this.querySelector("#boldButton");
        let state = button.dom.getAttribute("buttonState") !== "On";
        let style;

        style = {bold: state};
        target.mergeStyle(style);
        button.call("ButtonView", "setButtonState", state, button.model._get("label"), button.model._get("class"), button.model._get("title"));
    }

    italic() {
        console.log("italic");
        let target = window.topView.querySelector(`#${this.model._get("text")}`);
        let button = this.querySelector("#italicButton");
        let state = button.dom.getAttribute("buttonState") !== "On";
        let style;

        style = {italic: state};
        target.mergeStyle(style);
        button.call("ButtonView", "setButtonState", state, button.model._get("label"), button.model._get("class"), button.model._get("title"));
    }
}

class FrameView {
    init() {
        if (window.parent !== window && !Croquet.Messenger.receiver) {
            Croquet.Messenger.setReceiver(this);
            Croquet.Messenger.startPublishingPointerMove();
            Croquet.Messenger.on("userInfo", "handleUserInfo");
            Croquet.Messenger.on("userCursor", "handleUserCursor");
            Croquet.Messenger.send("userInfoRequest");
            Croquet.Messenger.send("userCursorRequest");

            Croquet.Messenger.send("appReady");
            Croquet.Messenger.on("appInfoRequest", () => {
                Croquet.Messenger.send("appInfo", { appName: "text", label: "text", iconName: "text-fields.svgIcon", urlTemplate: "./apps/text.html?q=${q}" });
                });
        }

        this.resize();
        this.dom.setAttribute("resizable", "true");
        window.onresize = () => this.resize();
        console.log("FrameView.init");
    }

    handleUserCursor(data) {
        window.document.body.style.setProperty("cursor", data);
    }

    handleUserInfo(data) {
    }

    resize() {
        this.dom.style.setProperty("width", window.innerWidth + "px");
        this.dom.style.setProperty("height", window.innerHeight + "px");
        this.setWidth(window.innerWidth);
    }
}

function beText(parent, _json, persistentData) {
    let textModel = parent.createElement();
    textModel.domId = "textmodel";
    textModel.classList.add("textmodel");

    textModel.setCode("text.TextModel");
    textModel.setViewCode("text.TextView");

    parent.setStyleClasses(`

.no-select {
    user-select: none;
    -webkit-user-select: none;
    -moz-user-select: none;
}

.text-div {
   font-family: OpenSans;
   font-size: 16px;
}

.text[resizable="true"] {
   width: 100%;
   height: 100%;
}

.text-menu-top {
   display: flex;
   align-items: center;
   border: 1px solid black;
   corner-radius: 2px;
   background-color: white;
   box-shadow: 0 3px 6px 0 rgba(0,0,0,0.3), 0 4px 8px 0 rgba(0,0,0,0.2);
}

.text-menu-holder {
    opacity: 0.85;
    box-shadow: 0 1px 4px 0 rgba(0,0,0,0.3);
    border-radius: 4px 8px 8px 8px;
    width: fit-content;
    height: fit-content;
    overflow: hidden;
}

.text-menu {
    display: flex;
    flex-direction: column;
    padding-top: 6px;
    padding-bottom: 2px;
    background-color: #F2F2F2;
    border: 0px;

}

.text-menu-item {
    display: flex;
    align-items: center;
    padding-left: 4px;
    padding-right: 4px;
    padding-top: 1px;
    padding-bottom: 1px;
    margin-top: 1px;
    margin-bottom: 1px;
}

.text-menu-item:hover {
    background-color: white;
}

.text-menu-item:hover span {
    color: #008E94;
}

.text-menu-item {
   margin: 2px;
}

.text-face-button {
    display: flex;
    justify-content: center;
    width: 20px;
    height: 20px;
}

.text-face-button[buttonState="On"] {
    color: #00A3AC
}

.text-face-italic {
    margin-left: 2px;
}

.text-face-bold {
    display: flex;
    justify-content: center;
    width: 20px;
    height: 20px;
    margin-left: 4px;
}

`);

    parent.appendChild(textModel);

    let palette = parent.createElement();
    palette.domId = "palette";
    palette.setCode("text.WidgetModel");
    palette.setViewCode("text.WidgetView");
    palette._set("text", "text");
    parent.appendChild(palette);

    if (persistentData) {
        textModel.call("TextModel", "loadPersistentData", persistentData);
    }
    return parent;
}

export const text = {
    expanders: [FontLoader, TextModel, TextView, WidgetModel, WidgetView, FrameView],
    functions: [beText]
};
