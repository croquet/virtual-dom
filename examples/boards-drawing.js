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

class Draw {
    init() {
        this.subscribe(this.id, 'line', 'Draw.line');

        this.subscribe(this.sessionId, "clear", "Draw.clear");

        if (!this.querySelector("#canvas")) {
            let canvas = this.createElement("CanvasElement");
            canvas.setViewCode("drawing.DrawCanvasView");
            canvas.domId = "canvas";
            canvas.style.setProperty("-cards-direct-manipulation", true);
            // canvas.style.setProperty("-cards-retain-pixels", true);
            canvas.style.setProperty("-cards-resize-callback", "DrawCanvasView.resizeCanvas");
            this.appendChild(canvas);
            canvas._set("_parent", this.asElementRef());
        }

        this._set("_useSetExtent", ["Draw", "setExtent"]);
    }

    line(data) {
        if (!this._get("lines")) {
            this._set("lines", []);
        }
        this._get("lines").push(data);
        this.publish(this.id, 'drawLine', data);
    }

    setExtent(width, height) {
        this.style.setProperty("width", width + "px");
        this.style.setProperty("height", height + "px");
        let canvas = this.querySelector("#canvas");
        canvas.setExtent(width, height);
    }

    clear() {
        this._set("lines", null);
        this.publish(this.id, "clear");
    }
}

class DrawCanvasView {
    resizeCanvas() {
        if (this.callback) {
            let split = this.callback.split(".");
            this.parentNode.call(split[0], split[1]);
        }
    }
}

class DrawView {
    init() {
        this.subscribe(this.model.id, 'drawLine', 'DrawView.drawLine');
        this.subscribe(this.model.id, 'clear', 'DrawView.clear');
        this.initDraw();
        console.log("DrawView.init");
    }

    initDraw() {
        if (!this.canvas) {
            let canvas = this.querySelector("#canvas");
            canvas.dom.addEventListener('pointerdown', (evt) => this.pointerDown(evt));
            this.pointerMoveHandler = (e) => this.pointerMove(e);
            this.pointerUpHandler = (e) => this.pointerUp(e);
            this.canvas = canvas;
            this.canvas.callback = "DrawView.resizeCanvas";
        }
        if (!this.model._get("lines")) {return;}
        this.clear();
        this.model._get("lines").forEach(data => {
            this.drawLine(data);
        });

    }

    resizeCanvas() {
        this.initDraw();
    }

    pointerDown(evt) {
        if (evt.buttons !== 1) {return;}
        evt.preventDefault();
        this.canvas.setPointerCapture(evt.pointerId);

        let offsetX = evt.offsetX;
        let offsetY = evt.offsetY;
        this.lastPoint = {x: offsetX, y: offsetY};

        this.canvas.dom.addEventListener("pointermove", this.pointerMoveHandler);
        this.canvas.dom.addEventListener("pointerup", this.pointerUpHandler);
    }

    pointerMove(evt) {
        evt.preventDefault();
        if (evt.target !== this.canvas.dom) {return;}
        if (this.lastPoint) {
            let p = {x: evt.offsetX, y: evt.offsetY};
            this.publish(this.model.id, 'line', {command: 'line', from: this.lastPoint, to: p});
            this.lastPoint = p;
        }
    }

    pointerUp(evt) {
        this.canvas.dom.removeEventListener("pointermove", this.pointerMoveHandler);
        this.canvas.dom.removeEventListener("pointerup", this.pointerUpHandler);
        this.releaseAllPointerCapture();
    }

    ensureCanvas() {
        if (!this.canvas) {
            this.canvas = this.querySelector("#canvas");
        }
        return this.canvas;
    }

    drawLine(data) {
        this.ensureCanvas();
        let canvas = this.canvas.dom;
        let ctx = canvas.getContext('2d');
        ctx.lineWidth = 2;
        ctx.strokeStyle = 'black';
        ctx.beginPath();
        ctx.moveTo(data.from.x, data.from.y);
        ctx.lineTo(data.to.x, data.to.y);
        ctx.stroke();
    }

    clear() {
        this.ensureCanvas();
        let canvas = this.canvas.dom;
        let ctx = canvas.getContext('2d');
        ctx.clearRect(0, 0, canvas.width, canvas.height);
    }
}

class ClearButton {
    init() {
        this.addEventListener("click", "ClearButton.click");
        this.setStyleString(`.no-select {
    user-select: none;
    -webkit-user-select: none;
    -moz-user-select: none;
}

.icon {
    width: 36px;
    height: 36px;
    margin-top: 8px;
    margin-left: 10px;
    padding: 2px;
    border-radius: 3px;
    background-color: #E6E6E6;
    background-repeat: no-repeat;
    background-size: contain;
    background-position: center;
}

.icon:hover {
    background-color: #F2F2F2;
    box-shadow: 0 0.5px 4px rgba(0,0,0,0.2);
}

`);

        this.classList.add("icon");
        this.style.setProperty("background-image", "url(./assets/icons/trash-can.svg)");
    }

    click() {
        this.publish(this.sessionId, "clear");
    }
}

function beDrawing(parent, json) {
    let draw = parent.createElement();
    draw.domId = "draw";
    draw.setCode("drawing.Draw");
    draw.setViewCode("drawing.DrawView");
    draw.style.setProperty("border", "1px solid black");
    draw.call("Draw", "setExtent", 400, 400);
    parent.appendChild(draw);

    let clear = parent.createElement();
    clear.domId = "clear";
    clear.setCode("drawing.ClearButton");
    parent.appendChild(clear);

    return parent;
}

export const drawing = {
    expanders: [
        Draw, DrawView, DrawCanvasView, ClearButton
    ],
    functions: [beDrawing]
};
