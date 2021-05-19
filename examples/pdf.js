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

class PDFModel {
    init() {
        this.reset();
        this.subscribe(this.id, "addAsset", "addAsset");
        this.subscribe(this.id, "setPageNumber", "pageNumber");
        this.subscribe(this.id, "pdfInfo", "pdfInfo");
        this.subscribe(this.id, "viewInfo", "viewInfo");
        this.subscribe(this.id, "setScale", "scale");
        this.subscribe(this.id, "setOffsetX", "offsetX");
        this.subscribe(this.id, "setOffsetY", "offsetY");

        this.setup();
    }

    reset() {
        this._set("pageNumber", 1);

        this._set("viewport", {
            scale : 1,
            offsetX : 0,
            offsetY : 0,
            rotation : 0,
        });
    }

    addAsset(asset) {
        this._set("asset", asset);
        this.publish(this.id, "asset", asset);
    }

    setup() {
        this.setStyleClasses(`
.pdf-button {
    border: 1px solid black;
    border-radius: 4px;
    font-size: 15px;
    margin: 10px;
}

.pdf-button:hover {
    border-style: dotted;
}
`);

        let scroller = this.querySelector("#scroller");
        if (!scroller) {
            let myInfo = this.asElementRef();
            this.style.setProperty("display", "flex");
            this.style.setProperty("flex-direction", "column");
            this.style.setProperty("border", "4px groove black");
            scroller = this.createElement();
            scroller.domId = "scroller";
            scroller.style.setProperty("width", "800px");
            scroller.style.setProperty("height", "600px");
            scroller.style.setProperty("overflow", "scroll");
            scroller._set("_parent", myInfo);

            let canvas = this.querySelector("#canvas");
            canvas = this.createElement("CanvasElement");
            canvas.domId = "canvas";
            canvas.setExtent(800, 600);
            canvas._set("_parent", myInfo);

            scroller.appendChild(canvas);
            this.appendChild(scroller);

            let control = this.createElement();
            control.style.setProperty("display", "flex");
            control.style.setProperty("background-color", "#cccccc");
            control.style.setProperty("border", "4px groove black");
            // control._set("_parent", myInfo);

            let first = this.createElement();
            first.classList.add("pdf-button");
            first.setCode(this.getLibrary("widgets.Button"));
            first.call("Button", "beButton", "First", "<<", "black");
            first.addDomain(null, "first");
            this.subscribe(first.id, "first", "first");

            let prev = this.createElement("div");
            prev.innerHTML = "&lt;";
            prev.classList.add("pdf-button");
            prev.setCode(this.getLibrary("widgets.Button"));
            prev.call("Button", "beButton", "Prev", "<", "black");
            prev.addDomain(null, "prev");
            this.subscribe(prev.id, "prev", "prev");

            let next = this.createElement("div");
            next.innerHTML = "&gt;";
            next.classList.add("pdf-button");
            next.setCode(this.getLibrary("widgets.Button"));
            next.call("Button", "beButton", "Next", ">", "black");
            next.addDomain(null, "next");
            this.subscribe(next.id, "next", "next");

            let scale = this.createElement("TextElement");
            scale.classList.add("no-select");
            scale.value = "100%";
            scale.setWidth(40);

            control.appendChild(first);
            control.appendChild(prev);
            control.appendChild(next);
            control.appendChild(scale);
            this.appendChild(control);
        }
    }

    pdfInfo(info) {
        // {numPages, viewBox}
        this._set("pdfInfo", info);
    }

    viewInfo(info) {
        let newInfo = {...info};
        if (!info.scale) {
            newInfo.scale = this._get("viewport").scale;
        }
        delete newInfo.viewId;
        this._set("viewport", newInfo);
        this.publish(this.id, "viewInfoChanged", info);
    }

    pageNumber(pageNumber) {
        let info = this._get("pdfInfo");
        let p = Math.min(Math.max(1, pageNumber), info.numPages);
        this._set("pageNumber", p);
        this.publish(this.id, "pageNumber", p);
    }

    next() {
        this.pageNumber(this._get("pageNumber") + 1);
    }

    prev() {
        this.pageNumber(this._get("pageNumber") - 1);
    }

    first() {
        this.pageNumber(1);
    }

    scale(scale) {
        let oldObj = this._get("viewport");
        let newObj = {...oldObj, scale};
        this._set("viewport", newObj);
        this.publish(this.id, "viewport", newObj);
    }

    offsetX(offsetX) {
        let oldObj = this._get("viewport");
        let newObj = {...oldObj, offsetX};
        this._set("viewport", newObj);
        this.publish(this.id, "viewport", newObj);
    }

    offsetY(offsetY) {
        let oldObj = this._get("viewport");
        let newObj = {...oldObj, offsetY};
        this._set("viewport", newObj);
        this.publish(this.id, "viewport", newObj);
    }
}

class PDFView {
    init() {
        this.subscribe(this.model.id, "asset", "asset");
        this.subscribe(this.model.id, "pageNumber", "pageNumber");
        this.subscribe(this.model.id, "viewport", "viewport");
        this.subscribe(this.model.id, "viewInfoChanged", "viewInfoChanged");

        if (this.model._get("standalone")) {
            this.addEventListener("drop", "drop");
        }

        if (this.model._get("asset")) {
            this.asset(this.model._get("asset"));
        }
    }

    asset(asset) {
        Croquet.Data.fetch(this.sessionId, asset.handle).then((data) => {
            this.data(data);
        });
    }

    data(data) {
        if (!window.pdfjsLib) {
            let script = document.createElement("script");
            script.src = "https://cdn.jsdelivr.net/npm/pdfjs-dist@2.3.200/build/pdf.min.js";
            script.onload = () => {
                script.remove();
                this.getPDF(data);
            };
            document.body.appendChild(script);
        } else {
            this.getPDF(data);
        }
    }

    getPDF(data) {
        this.loadingTask = window.pdfjsLib.getDocument(new Uint8Array(data));
        this.loadingTask.promise.then(pdf => {
            this.pdf = pdf;
            // this.publish("pdf", "update", pdf);
            this.getPage();
        });
    }

    getPage() {
        if (this.pdf) {
            this.pdf.getPage(this.model._get("pageNumber"))
                .then(page => {
                    this.page = page;
                    let viewport = this.page.getViewport({scale: 1.0});
                    this.publish(this.model.id, "pdfInfo", {numPages: this.pdf.numPages, viewBox: viewport.viewBox});
                    this.renderRequest();
                });
        }
    }

    pageNumber() {
        this.getPage();
    }

    viewInfoChanged(info) {
        if (!this.scroller) {return;}
        if (info.viewId === this.viewId) {return;}
        this.setScroll(info.offsetX, info.offsetY, info.scale, null, false);
    }

    renderRequest() {
        if (this.rendering) {return;}
        this.render();
    }

    render() {
        window.pdfView = this;
        if (!this.canvas) {
            this.canvas = this.querySelector("#canvas");
        }

        if (!this.scroller) {
            this.scroller = this.querySelector("#scroller");
            this.scroller.dom.addEventListener("wheel", (evt) => this.wheel(evt), true);
            this.scroller.scale = 1;
            this.scroller.scrollTime = 0;
        }

        if (this.page) {
            if (!this.rendering) {
                this.rendering = true;

                let modelViewport = this.model._get("viewport");
                let viewport = this.page.getViewport({scale: this.scroller.scale});

                // this.publish("viewport", "update", viewport);

                // viewport.transform[4] += this.scroller.scrollLeft * viewport.width;
                // viewport.transform[5] += this.scroller.scrollTop * viewport.height;
                this.canvas.dom.width = viewport.width;
                this.canvas.dom.height = viewport.height;

                this.renderingTask = this.page.render({
                    canvasContext : this.canvas.dom.getContext("2d"),
                    viewport,
                });
                this.renderingTask.promise
                    .then(() => {
                        this.rendering = false;
                    });
            }
        }
    }

    wheel(evt) {
        evt.preventDefault();
        evt.stopPropagation();

        let translationX = this.scroller.dom.scrollLeft;
        let translationY = this.scroller.dom.scrollTop;
        let scale = this.scroller.scale;

        let offsetX = evt.offsetX;
        let offsetY = evt.offsetY;

        function getType(dx, dy) {
            if (Math.floor(dx) === dx && Math.floor(dy) === dy) {
                if (Math.abs(dx) >= Math.abs(dy)) {
                    return "scrollX";
                }
                return "scrollY";
            }

            if ((dx === 0.0) && Math.abs(Math.floor(dy) - dy) > 0) {
                return "zoom";
            }
            return "none";
        }

        let type = getType(evt.deltaX, evt.deltaY);
        if (type === "zoom") {
            let diff = evt.deltaY / 300;
            let newScale = scale * (1 - diff);

            // make position in reference to this object
            let x = offsetX * scale - translationX;
            let y = offsetY * scale - translationY;

            let newX = offsetX * newScale - x;
            let newY = offsetY * newScale - y;

            this.setScroll(newX, newY, newScale, evt.timeStamp, true);
        } else if (type === "scrollX") {
            this.setScroll(translationX + evt.deltaX, translationY, null, evt.timeStamp, true);
        } else if (type === "scrollY") {
            this.setScroll(translationX, translationY + evt.deltaY, null, evt.timeStamp, true);
        }
    }

    setScroll(x, y, scale, timeStamp, publish) {
        this.scroller.dom.scrollLeft = x;
        this.scroller.dom.scrollTop = y;
        if (scale) {
            this.scroller.scale = scale;
            this.renderRequest();
        }
        if (publish) {
            // console.log("publishing", timeStamp > window.topView.lastPointer.scrollTime + 30);
            if (timeStamp > this.scroller.scrollTime + 100) {
                this.scroller.scrollTime = timeStamp;
                this.publish(this.model.id, "viewInfo", {viewId: this.viewId, offsetX: x, offsetY: y, scale: scale, rotation: 0});
            }
        }
    }

    async drop(evt) {
        // const dropPoint = {x: evt.offsetX, y: evt.offsetY};
        let load = async (name, type, item) => {
            const data = await new Promise(resolve => {
                const reader = new FileReader();
                reader.onload = () => resolve(reader.result);
                reader.readAsArrayBuffer(item.getAsFile());
            });
            const handle = await Croquet.Data.store(this.sessionId, data);
            const asset = {name: name, type, size: data.byteLength, handle};
            this.publish(this.model.id, "addAsset", asset);
        };

        const dt = evt.dataTransfer;
        for (let i = 0; i < dt.types.length; i++) {
            if (dt.types[i] === "Files") {
                load(dt.files[i].name, dt.types[i], dt.items[i]);
            } else {
                console.log("unknown drop type");
            }
        }
    }
}

function bePDF(parent, json) {
    let pdf = parent.createElement();
    pdf.style.setProperty("-cards-direct-manipulation", true);
    pdf.style.setProperty("width", "800px");
    pdf.style.setProperty("height", "600px");
    pdf.style.setProperty("background-color", "#001100");

    pdf.setTransform("1,0,0,1,0,0");
    pdf.setCode(parent.getLibrary("pdf.PDFModel"));
    pdf.setViewCode(parent.getLibrary("pdf.PDFView"));
    pdf._set("standalone", true);

    pdf.setStyleString(`
.no-select {
    user-select: none;
    -webkit-user-select: none;
    -moz-user-select: none;
}

.pdf-button {
    border: 1px solid black;
    border-radius: 4px;
    padding-left: 4px;
    padding-right: 4px;
}
`);
    
    parent.appendChild(pdf);
}

export const pdf = {
    expanders: [
        PDFModel, PDFView,
    ],
    functions: [bePDF]
};

