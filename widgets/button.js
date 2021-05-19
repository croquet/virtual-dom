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

export class Button {
    beButton(state, label, cls, title) {
        this.addEventListener("click", "Button.click");
        this._set("buttonState", state);
        this._set("title", title);
        this.setButtonState(state, label, cls, title);
    }

    beViewButton(state, label, cls, title) {
        this._set("label", label);
        this._set("class", cls);
        this._set("buttonState", state);
        this._set("title", title);
        this.addViewCode("widgets.ButtonView");
    }

    beImmediateViewButton(domId, trait, method) {
        // this is certainly the worst kind of mixing different abstraction...
        this._set("immediateDomId", domId);
        this._set("immediateTrait", trait);
        this._set("immediateMethod", method);
    }

    enablePressHold() {
        this._set("presshold", true);
    }

    setButtonState(state, label, cls, title) {
        this._set("label", label);
        this._set("class", cls);
        this._set("buttonState", state);

        if (typeof title === "string") {
            this._set("title", title);
        }
        title = this._get("title");
        if (typeof title === "string") {
            this.style.setProperty("-cards-dom-title", title);
        }

        if (label.startsWith("<svg")) {
            let html = `<div style="display: flex" class="no-select ${cls || ''}">${label}</div>`;
            this.dom.innerHTML = html;
        } else if (label.endsWith(".svg")) {
            let iconPath = "./assets/icons/";
            this.innerHTML = `<div class="no-select ${cls || ''}" style="background-image: url(${iconPath}${label});"></div>`;
        } else if (label.endsWith(".svgIcon")) {
            let name = "img-" + label.slice(0, label.length - ".svgIcon".length);
            let html = `<div style="display: flex" class="no-select ${cls || ''}"><svg viewBox="0 0 24 24" class="icon-svg"><use href="#${name}"></use></svg></div>`;
            this.innerHTML = html;
        } else {
            this.innerHTML = `<span class="no-select ${cls || ''}">${label}</span>`;
        }
    }

    click() {
        this.publishToAll();
    }
}

export class ButtonView {
    init() {
        this.addEventListener("click", "ButtonView.click");
        let model = this.model;
        this.setButtonState(model._get("buttonState"), model._get("label"), model._get("class"), model._get("title"));

        if (this.model._get("presshold")) {
            this.enablePressHold();
        }
    }

    setButtonState(state, label, cls, title) {
        if (label.startsWith("<svg")) {
            let html = `<div style="display: flex" class="no-select ${cls || ''}">${label}</div>`;
            this.dom.innerHTML = html;
        } else if (label.endsWith(".svg")) {
            let iconPath = "./assets/icons/";
            this.dom.innerHTML = `<div class="no-select ${cls || ''}" style="background-image: url(${iconPath}${label});"></div>`;
        } else if (label.endsWith(".svgIcon")) {
            let name = "img-" + label.slice(0, label.length - ".svgIcon".length);
            let html = `<div style="display: flex" class="no-select ${cls || ''}"><svg viewBox="0 0 24 24" class="icon-svg"><use href="#${name}"></use></svg></div>`;
            this.dom.innerHTML = html;
        } else {
            this.dom.innerHTML = `<span class="no-select ${cls || ''}">${label}</span>`;
        }
        this.dom.setAttribute("buttonState", state);

        if (typeof title === "string") {
            this.dom.title = title;
        }
    }

    click() {
        if (this.model._get("presshold") && this.pressed) {return;}
        this.pressed = false;

        if (this.model._get("immediateDomId")) {
            let view = window.topView.querySelector(`#${this.model._get("immediateDomId")}`);
            if (view) {
                let trait = this.model._get("immediateTrait");
                let method = this.model._get("immediateMethod");
                view.call(trait, method);
            }
            return;
        }
        this.publishToAll();
    }

    getButtonState() {
        return this.dom.getAttribute("buttonState");
    }

    pressHold() {
        this.publishToAll(true);
    }

    enablePressHold() {
        this.pressHoldDuration = 1000;
        this.startTime = Number.MAX_VALUE;
        this.pressHoldEvent = new CustomEvent("pressHold");
        this.pressingDownHandler = (evt) => this.pressingDown(evt);
        this.notPressingDownHandler = (evt) => this.notPressingDown(evt);

        this.dom.addEventListener("pointerdown", this.pressingDownHandler);

        this.dom.addEventListener("pointerup", this.notPressingDownHandler);
        this.dom.addEventListener("pointercancel", this.notPressingDownHandler);
        this.dom.addEventListener("pointerleave", this.notPressingDownHandler);

        this.dom.addEventListener("pressHold", (evt) => this.pressHold(evt));
    }

    pressingDown(evt) {
        requestAnimationFrame(() => this.timer());
        this.startTime = Date.now();
        evt.preventDefault();
        this.pressed = false;
    }

    notPressingDown(_evt) {
        cancelAnimationFrame(this.timerID);
        this.startTime = Number.MAX_VALUE;
    }

    timer() {
        let now = Date.now();
        if ((now - this.startTime) < this.pressHoldDuration) {
            this.timerID = requestAnimationFrame(() => this.timer());
        } else {
            this.held = true;
            this.dom.dispatchEvent(this.pressHoldEvent);
        }
    }
}

export class DOMButton {
    constructor(elem, receiver) {
        this.elem = elem;
        this.receiver = receiver;
        this.pressHold = false;
    }

    enablePressHold(flag) {
        if (this.pressHold === flag) {return;}
        this.pressHold = flag;

        if (flag) {
            this.pressHoldDuration = 400;
            this.startTime = Number.MAX_VALUE;
            this.pressHoldEvent = new CustomEvent("pressHold");

            if (this.receiver.pointerEnter) {
                this.pointerEnterHandler = this.receiver.pointerEnter;
                this.dom.addEventListener("pointerenter", this.pointerEnterHandler, false);
            }

            this.pressingDownHandler =
                this.receiver.pressingDown || ((evt) => this.pressingDown(evt));
            this.dom.addEventListener("pointerdown", this.pressingDownHandler, false);

            this.pointerUpHandler =
                this.receiver.pointerUp || ((evt) => this.pointerUp(evt));
            this.dom.addEventListener("pointerup", this.pointerUpHandler, false);

            this.notPressingDownHandler =
                this.receiver.notPressingDown || ((evt) => this.notPressingDown(evt));
            this.dom.addEventListener("pointerleave", this.notPressingDownHandler, false);

            this.pressHoldHandler =
                this.receiver.pressHold || ((evt) => this.pressHold(evt));
            this.dom.addEventListener("pressHold", this.pressHoldHandler, false);

            this.held = false;
            return;
        }
        if (this.pointerEnterHandler) {
            this.dom.removeEventListener("pointerenter", this.pointerEnterHandler, false);
            delete this.pointerEnterHandler;
        }
        if (this.pressingDownHandler) {
            this.dom.removeEventListener("pointerdown", this.pressingDownHandler, false);
            delete this.pressingDownHandler;
        }
        if (this.pointerUpHandler) {
            this.dom.removeEventListener("pointerup", this.pointerUpHandler, false);
            delete this.pointerUpHandler;
        }
        if (this.notPressingDownHandler) {
            this.dom.removeEventListener("pointerleave", this.notPressingDownHandler, false);
            delete this.notPressingDownHandler;
        }
        if (this.pressHoldHandler) {
            this.dom.removeEventListener("presshold", this.pressHoldHandler, false);
            delete this.pressHoldHandler;
        }
    }

    pressingDown(evt) {
        if (evt.buttons !== 1) { return; }

        requestAnimationFrame(() => this.timer());
        this.startTime = Date.now();
        evt.preventDefault();
        this.held = false;
        let rect = this.dom.getBoundingClientRect();
        this.pressingPosition = { x: rect.right + 10, y: rect.top + 10 };
    }

    notPressingDown(_evt) {
        cancelAnimationFrame(this.timerID);
        this.startTime = Number.MAX_VALUE;
    }

    pointerUp(evt) {
        this.notPressingDown(evt);
        if (!this.held) this.click();
    }

    timer() {
        let now = Date.now();
        if ((now - this.startTime) < this.pressHoldDuration) {
            this.timerID = requestAnimationFrame(() => this.timer());
        } else {
            this.pressed = true;
            this.dom.dispatchEvent(this.pressHoldEvent);
        }
    }

    click() {
        if (this.pressHold && this.held) {return;}
        this.helpd = false;
        this.receiver.click();
    }
}
