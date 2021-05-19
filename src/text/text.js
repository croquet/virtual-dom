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

import {canonicalizeKeyboardEvent} from "./text-commands.js";
import {Doc, Warota} from "./warota.js";
import {eof} from "./wrap.js";
import {Element, ElementView} from "../element.js";

function randomColor(viewId) {
    let h = Math.floor(parseInt(viewId, 36) / (10 ** 36 / 360));
    let s = "40%";
    let l = "40%";
    return `hsl(${h}, ${s}, ${l})`;
}

export class TextElement extends Element {
    static types() {
        return {"Warota.Doc": Doc};
    }

    static viewClass() {return TextView;}

    init() {
        super.init();
        this.doc = new Doc();
        this.doc.load([]);
        // this.doc.load([
        // {text: "ab c ke eke ekeke ekek eke ek eke ke ek eke ek ek ee  ke kee ke", style: {size: 24}},
        // ]);

        this.content = {runs: [], selections: {}, undoStacks: {}, timezone: 0, queue: [], editable: true};
        this.subscribe(this.id, "editEvents", "receiveEditEvents");
        this.subscribe(this.id, "accept", "publishAccept");
        this.subscribe(this.id, "undoRequest", "undoRequest");
        this.subscribe(this.id, "setWidth", "setWidth");
        this.subscribe(this.sessionId, "view-exit", "viewExit");

        this.setStyleClasses(`
.text-no-select {
    user-select: none;
    -webkit-user-select: none;
    -moz-user-select: none;
}

.text-div {
    width: 100%;
    white-space: nowrap;
    pointer-events: none;
}
        `);
    }

    bePartsBinPrototype() {
        super.bePartsBinPrototype();
        this.setWidth(200);
    }

    setWidth(pixelWidth) {
        let cssWidth = pixelWidth + "px";
        this.style.setProperty("width", cssWidth);
    }

    load(stringOrArray) {
        let runs;
        if (typeof stringOrArray === "string") {
            runs = [{text: stringOrArray}];
        } else {
            runs = stringOrArray;
        }
        this.doc.load(runs);
        this.publishChanged();
        this.needsUpdate();
    }

    save() {
        return {runs: this.doc.runs, defaultFont: this.doc.defaultFont, defaultSize: this.doc.defaultSize};
    }

    loadAndReset(string) {
        let runs = [{text: string}];
        this.content = {runs: runs, selections: {}, undoStacks: {}, timezone: 0, queue: [], editable: true};
        this.doc.load(runs);
        this.publishChanged();
        this.needsUpdate();
    }

    receiveEditEvents(events) {
        let [timezone, hasDone] = this.doc.receiveEditEvents(events, this.content, this.doc);
        if (hasDone) {
            this.publishChanged();
        }

        this.publish(this.id, "screenUpdate", timezone);
        this.needsUpdate();
    }

    publishAccept() {
        this.publish(this.id, "text", {ref: this.asElementRef(), text: this.doc.plainText()});
    }

    publishChanged() {
        this.publish(this.id, "changed", {ref: this.asElementRef()});
    }

    viewExit(viewId) {
        // we might have to clear the events of Warota in the view?
        delete this.content.selections[viewId];
        this.needsUpdate();
    }

    undoRequest(user) {
        let event;
        let queue = this.content.queue;
        for (let i = queue.length - 1; i >= 0; i--) {
            let e = queue[i];
            if (e.user.id === user.id && (e.type !== "snapshot" && e.type !== "select")) {
                event = queue[i];
                break;
            }
        }
        if (!event) {return;}

        let timezone = this.doc.undoEvent(event, this.content, this.doc);
        this.publish(this.id, "screenUpdate", timezone);
    }

    setDefault(font, size) {
        return this.doc.setDefault(font, size);
    }

    styleAt(index) {
        return this.doc.styleAt(index);
    }

    get value() {
        return this.doc.plainText();
    }

    set value(text) {
        return this.load(text);
    }
}

TextElement.register("TextElement");

export class TextView extends ElementView {
    constructor(model) {
        super(model);
        this.subscribe(this.model.id, "screenUpdate", "screenUpdate");
        this.divs = [];

        this.widgets = {};

        let holder = document.createElement("div");
        holder.id = "holder";
        this.holder = holder;
        this.holder.style.setProperty("position", "relative");

        this.dom.style.setProperty("overflow", "hidden");

        holder.innerHTML = `
     <div class="textPane" style="width: 100%; height: 100%; position: absolute;"></div>
     <div class="selectionPane" style="position: absolute; top: 0px; left: 0px; width: 0px; height: 0px"></div>
`;

        this.dom.appendChild(holder);

        this.text = holder.querySelector(".textPane");
        this.selectionPane = holder.querySelector(".selectionPane");

        this.hiddenInput = document.createElement("input");
        this.hiddenInput.style.setProperty("position", "absolute");
        this.hiddenInput.style.setProperty("left", "-120px"); //-100
        this.hiddenInput.style.setProperty("top", "-120px");  // -100
        this.hiddenInput.style.setProperty("transform", "scale(0)"); // to make sure the user never sees a flashing caret, for example on iPad/Safari
        this.hiddenInput.style.setProperty("z-order", "10");

        this.hiddenInput.style.setProperty("width", "100px");
        this.hiddenInput.style.setProperty("height", "100px");

        document.body.appendChild(this.hiddenInput);
        this.setup();
        // this.test();
    }

    test() {
        // this.warota.insert(user, [{text: cEvt.key}]);
    }

    setup() {
        let margin = this.model.style.getPropertyValue("-cards-text-margin");
        let font = this.model.doc.defaultFont;
        let fontSize = this.model.doc.defaultSize;
        let options = {width: 800, height: 800, font, fontSize};
        if (margin) {
            let ary = margin.split(" ");
            options.margins = {};
            ["top", "right", "bottom", "left"].forEach((n, i) => {
                options.margins[n] = parseFloat(ary[i]);
            });
            this.text.style.setProperty("margin", margin);
        }

        this.singleLine = this.model.style.getPropertyValue("-cards-text-singleLine");

        if (this.singleLine) {
            options.singleLine = true;
        }

        this.warota = new Warota(options, this.model.doc);
        this.options = options;

        this.user = {id: this.viewId, color: randomColor(this.viewId)};
        this.selections = {}; // {user: {bar: div, boxes: []}}

        this.dom.addEventListener("pointerdown", evt => {
            evt.stopPropagation();
            window.topView.grabber.capturePointer(evt.pointerId, evt.target);
            this.pointerDown(this.cookEvent(evt));
        }, true);

        this.text.addEventListener("pointerdown", evt => {
            evt.stopPropagation();
            window.topView.grabber.capturePointer(evt.pointerId, evt.target);
            this.pointerDown(this.cookEvent(evt));
        }, true);
        this.text.addEventListener("pointermove", evt => {
            evt.stopPropagation();
            this.pointerMove(this.cookEvent(evt));
        }, true);
        this.text.addEventListener("pointerup", evt => {
            evt.stopPropagation();
            this.pointerUp(this.cookEvent(evt));
        }, true);
        this.dom.addEventListener("pointerup", evt => {
            evt.stopPropagation();
            this.pointerUp(this.cookEvent(evt));
        }, true);
        this.dom.addEventListener("dblclick", evt => {
            evt.stopPropagation();
            // have not implemented but needs to filter it.
            // this.dblclick(this.cookEvent(evt));
        }, true);
        this.text.key = this.dom.key;

        this.dom.addEventListener("pointercancel", (evt) => this.pointerUp(this.cookEvent(evt)));
        this.dom.addEventListener("lostpointercapture", (evt) => this.pointerUp(this.cookEvent(evt)));

        this.hiddenInput.addEventListener("input", evt => this.input(evt), true);
        this.hiddenInput.addEventListener("keydown", evt => this.keyDown(evt), true);

        this.hiddenInput.addEventListener("copy", evt => this.copy(evt));
        this.hiddenInput.addEventListener("cut", evt => this.cut(evt));
        this.hiddenInput.addEventListener("paste", evt => this.paste(evt));

        this.subscribe(this.viewId, "synced", "synced");
        this.isSynced = false;
        this.screenUpdate(this.warota.timezone);
        this.isSynced = true;
    }

    detach() {
        super.detach();
        console.log("textview detach");
        if (this.hiddenInput) {
            this.hiddenInput.remove();
        }
    }

    setKey(key) {
        super.setKey(key);
        this.text.key = key;
    }

    setWidth(pixels) {
        this.publish(this.model.id, "setWidth", pixels);
        this.width(pixels);
    }

    width(pixels) {
        this.text.style.setProperty("width", pixels + "px");
        this.warota.width(pixels);
        this.screenUpdate(this.warota.timezone);
    }

    synced(value) {
        this.isSynced = value;
        if (!this.isSynced) {return;}
        this.warota.resetMeasurer();
        this.screenUpdate(this.warota.timezone);
    }

    accept() {
        this.publish(this.model.id, "accept");
    }

    apply(time, elem, world) {
        super.apply(time, elem, world);
        let w = elem.style.getPropertyValue("width");
        this.width(parseInt(w, 10));

        if (this.lastValues["enterToAccept"] !== this.model._get("enterToAccept")) {
            let accept = this.model._get("enterToAccept");
            this.lastValues["enterToAccept"] = accept;
            if (accept) {
                this.dom.style.setProperty("overflow", "hidden");
                this.text.style.setProperty("overflow", "hidden");
            } else {
                this.dom.style.removeProperty("overflow");
                this.text.style.removeProperty("overflow");
            }
        }
        this.screenUpdate(this.warota.timezone);
    }

    cookEvent(evt) {
        evt.preventDefault();
        let x = evt.offsetX;
        let y = evt.offsetY;
        let margins = this.warota.margins;
        if (margins) {
            x += margins.left;
            y += margins.top;
        }
        return {x, y, target: evt.target.key};
    }

    pointerDown(evt) {
        this.hiddenInput.focus();
        this.warota.mouseDown(evt.x, evt.y, evt.y, this.user);
        this.changed();
    }

    pointerMove(evt) {
        this.warota.mouseMove(Math.max(evt.x, 0), evt.y, evt.y, this.user);
        this.changed();
    }

    pointerUp(evt) {
        this.warota.mouseUp(evt.x, evt.y, evt.y, this.user);
        this.changed();
        window.topView.grabber.releasePointer();
    }

    newCanonicalizeEvent(evt) {
        if (evt.type === "input" && evt.inputType === "insertText" && !evt.isComposing) {
            let key = this.hiddenInput.value;
            this.hiddenInput.value = "";
            let spec = {
                keyCombo: "",
                key: key,
                shiftKey: false,
                altKey: false,
                ctrlKey: false,
                metaKey: false,
                altGraphKey: false,
                isFunctionKey: false,
                isModified: false,
                onlyModifiers: false,
                onlyShiftModifier: null,
                type: evt.type,
                keyCode: evt.keyCode
            };
            return spec;
        }
        return null;
    }

    eventFromField() {
        let key = this.hiddenInput.value;
        this.hiddenInput.value = "";
        let spec = {
            keyCombo: "",
            key: key,
            shiftKey: false,
            altKey: false,
            ctrlKey: false,
            metaKey: false,
            altGraphKey: false,
            isFunctionKey: false,
            isModified: false,
            onlyModifiers: false,
            onlyShiftModifier: null,
            type: "",
            keyCode: 0
        };
        return spec;
    }

    simpleInput(text, evt) {
        let user = this.user;
        let selection = this.model.content.selections[this.viewId];
        let style = this.model.styleAt(Math.max(selection ? selection.start - 1 : 0, 0));

        this.warota.insert(user, [{text, style}]);
        this.changed(true);
        evt.preventDefault();
        return true;
    }

    input(evt) {
        let cEvt = this.newCanonicalizeEvent(evt);
        if (!cEvt) {return false;}
        let user = this.user;
        let selection = this.model.content.selections[this.viewId];
        let style = this.model.styleAt(Math.max(selection ? selection.start - 1 : 0, 0));
        this.warota.insert(user, [{text: cEvt.key, style: style}]);
        this.changed(true);
        evt.preventDefault();
        return true;
    }

    keyDown(evt) {
        let cEvt;
        if (evt.key === "Enter") {
            if (this.hiddenInput.value !== "") {
                this.hiddenInput.value = "";
                //cEvt = this.eventFromField();
            } else {
                cEvt = canonicalizeKeyboardEvent(evt);
            }
        } else {
            cEvt = canonicalizeKeyboardEvent(evt);
        }

        let user = this.user;
        if (!cEvt) {return true;}

        if (cEvt.onlyModifiers) {return true;}

        // what has to happen here is that the kinds of keycombo that browser need to pass
        // through, and the kinds that the editor handles are different.
        // We need to separated them, and for the latter, the text commands list has
        // to be tested here.
        if (cEvt.keyCombo === "Meta-S" || cEvt.keyCombo === "Ctrl-S") {
            this.accept();
            evt.preventDefault();
            return true;
        }

        if (cEvt.keyCombo === "Meta-Z" || cEvt.keyCombo === "Ctrl-Z") {
            this.undo();
            evt.preventDefault();
            return true;
        }

        if (cEvt.keyCode === 13) {
            if (this.model._get("enterToAccept")) {
                evt.preventDefault();
                this.accept();
                return true;
            }
            return this.simpleInput("\n", evt);
        }
        if (cEvt.keyCode === 32) {
            return this.simpleInput(" ", evt);
        }
        if (cEvt.keyCode === 9) {
            return this.simpleInput("\t", evt);
        }

        const handled = this.warota.handleKey(user, cEvt.keyCode, cEvt.shiftKey, cEvt.ctrlKey || cEvt.metaKey);

        if (!handled && !(cEvt.ctrlKey || cEvt.metaKey)) {
            this.warota.insert(user, [{text: cEvt.key}]);
            this.changed(true);
            evt.preventDefault();
            return true;
        }
        if (handled) {
            evt.preventDefault();
            this.changed(true);
        }
        return false;
    }

    copy(evt) {
        let text = this.warota.selectionText(this.user);
        evt.clipboardData.setData("text/plain", text);
        evt.preventDefault();
        return true;
    }

    cut(evt) {
        this.copy(evt);
        this.warota.insert(this.user, [{text: ""}]);//or something else to keep undo sane?
        this.changed(true);
        return true;
    }

    paste(evt) {
        let pasteChars = evt.clipboardData.getData("text");
        this.warota.insert(this.user, [{text: pasteChars}]);
        evt.preventDefault();
        this.changed(true);
        return true;
    }

    undo() {
        this.publish(this.model.id, "undoRequest", this.user);
    }

    changed(toScroll) {
        let events = this.warota.events;
        this.warota.resetEvents();
        if (events.length > 0) {
            this.scrollNeeded = !this.singleLine && toScroll;
            this.publish(this.model.id, "editEvents", events);
        }
    }

    screenUpdate(timezone) {
        this.warota.timezone = timezone;
        if (!this.isSynced) {return;}
        this.warota.layout();
        this.showText();
        this.showSelections();
        this.setHeight();
        if (this.scrollNeeded) {
            this.scrollNeeded = false;
            this.scrollSelectionToView();
        }
    }

    ensureDiv(index) {
        let div;
        if (index < this.divs.length) {
            div = this.divs[index];
            while (div.firstChild) {
                div.lastChild.remove();
            }
        } else {
            div = document.createElement("div");
            div.classList.add("text-no-select", "text-div", "no-pointer");
            this.text.appendChild(div);
            this.divs[index] = div;
        }
        return div;
    }

    spanFor(text, style) {
        let span = document.createElement("span");
        span.classList.add("text-no-select");
        if (style) {
            if (style.color) {
                span.style.setProperty("color", style.color);
            }
            if (style.size) {
                span.style.setProperty("font-size", style.size + "px");
            }
            if (style.font) {
                span.style.setProperty("font-family", style.font);
            }
            if (style.bold) {
                span.style.setProperty("font-weight", "700");
            }
            if (style.italic) {
                span.style.setProperty("font-style", "italic");
            }
        }
        if (text === " " || text === "\n" || text === "\r") {
            span.textContent = "\u00a0";
        } else if (text === "\t") {
            span.classList.add("tab");
        } else if (text === eof) {
            return null;
        } else {
            span.textContent = text;
        }
        return span;
    }

    showText() {
        let last;
        this.warota.lines.forEach((a, index) => {
            last = index;
            let div = this.ensureDiv(index);

            a.forEach(w => {
                if (w.styles) {
                    // multi style in a word
                    w.styles.forEach((s) => {
                        let {start, end, style} = s;
                        let span = this.spanFor(w.text.slice(start, end), style);
                        if (span) {div.appendChild(span);}
                    });
                } else {
                    let span = this.spanFor(w.text, w.style);
                    if (span) {div.appendChild(span);}
                }
            });
        });
        for (let i = last + 1; i < this.divs.length; i++) {
            this.divs[i].remove();
        }
        this.divs.splice(last + 1);
    }

    setStyle(style) {
        this.warota.setStyle(this.user, style, false);
        this.changed();
    }

    mergeStyle(style) {
        this.warota.setStyle(this.user, style, true);
        this.changed();
    }

    setHeight() {
        this.text.style.setProperty("height", this.warota.docHeight + "px");
        this.holder.style.setProperty("height", this.warota.docHeight + "px");
    }

    ensureSelection(id) {
        let sel = this.selections[id];
        if (!sel) {
            let bar = document.createElement("div");
            bar.classList.add("caret");
            bar.style.setProperty("pointer-events", "none");
            bar.style.setProperty("position", "absolute");
            this.selectionPane.appendChild(bar);

            let boxes = [0, 1, 2].map(i => {
                let box = document.createElement("div");
                box.classList.add("selection");
                box.style.setProperty("visibility", "hidden");
                box.style.setProperty("pointer-events", "none");
                box.style.setProperty("position", "absolute");
                this.selectionPane.appendChild(box);
                return box;
            });

            sel = {bar, boxes};
            this.selections[id] = sel;
        }
        return sel;
    }

    showSelections() {
        let unused = {};
        for (let k in this.selections) {
            unused[k] = this.selections[k];
        }

        for (let k in this.model.content.selections) {
            delete unused[k];
            this.ensureSelection(k).boxes.forEach(box => box.style.setProperty("visibility", "hidden"));
            let selection = this.model.content.selections[k];
            let caret = this.ensureSelection(k).bar;

            if (selection.end === selection.start) {
                caret.style.removeProperty("visibility");
                let caretRect = this.warota.barRect(selection);
                caret.style.setProperty("left", caretRect.left + "px");
                caret.style.setProperty("top", caretRect.top + "px");
                caret.style.setProperty("width", caretRect.width + "px");
                caret.style.setProperty("height", caretRect.height + "px");
                caret.style.setProperty("background-color", selection.color);
                caret.style.setProperty("opacity", k === this.viewId ? "0.5" : "0.25");
            } else {
                caret.style.setProperty("visibility", "hidden");
                let rects = this.warota.selectionRects(selection);
                for (let i = 0; i < 3; i++) {
                    let box = this.ensureSelection(k).boxes[i];
                    let rect = rects[i];
                    if (rect) {
                        box.style.setProperty("left", rect.left + "px");
                        box.style.setProperty("top", rect.top + "px");
                        box.style.setProperty("width", rect.width + "px");
                        box.style.setProperty("height", rect.height + "px");
                        box.style.setProperty("background-color", selection.color);
                        box.style.setProperty("opacity", k === this.viewId ? "0.25" : "0.08");
                        box.style.removeProperty("visibility");
                    } else {
                        box.style.setProperty("visibility", "hidden");
                    }
                }
            }
        }
        for (let k in unused) {
            this.selections[k].bar.remove();
            this.selections[k].boxes.forEach(box => box.remove());
            delete this.selections[k];
        }
        this.publish(this.id, "selectionUpdated");
    }

    scrollSelectionToView() {
        let scrollTop = this.dom.scrollTop;
        let viewHeight = parseFloat(this.dom.style.getPropertyValue("height"));
        let selection = this.model.content.selections[this.viewId];
        if (!selection) {return;}
        if (selection.end !== selection.start) {return;}
        let caretRect = this.warota.barRect(selection);

        if (caretRect.top + caretRect.height > viewHeight + scrollTop) {
            this.dom.scrollTop = caretRect.top + caretRect.height - viewHeight;
        } else if (caretRect.top < scrollTop) {
            this.dom.scrollTop = caretRect.top;
        }
    }

    addWidget(name, dom) {
        if (this.widgets[name]) {
            this.removeWidget(name, dom);
        }
        this.widgets[name] = dom;
        this.selectionPane.appendChild(dom);
    }

    removeWidget(name, dom) {
        delete this.widgets[name];
        dom.remove();
    }
}
