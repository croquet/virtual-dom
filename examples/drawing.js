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

class DrawModel {
    init() {
        this._set("color", "black");
        this.subscribe(this.id, "line", "DrawModel.line");
        this.subscribe(this.sessionId, "color", "DrawModel.color");
    }

    line(data) {
        if (!this._get("lines")) {
            this._set("lines", []);
        }
        let line = {...data, color: this._get("color")};
        this._get("lines").push(line);
        this.publish(this.id, "drawLine", line);
    }

    color(color) {
        this._set("color", color);
    }
}

class DrawView {
    init() {
        this.addEventListener("pointerdown", "DrawView.pointerDown");
        this.subscribe(this.model.id, "drawLine", "DrawView.drawLine");
        this.future(1).call("DrawView", "initDraw");
    }

    initDraw() {
        if (!this.model._get("lines")) {return;}
        this.model._get("lines").forEach(data => {
            this.drawLine(data);
        });
    }

    pointerDown(evt) {
        if (evt.buttons !== 1) {return;}
        this.setPointerCapture(evt.pointerId);

        let offsetX = evt.offsetX;
        let offsetY = evt.offsetY;
        this.lastPoint = {x: offsetX, y: offsetY};

        this.addEventListener("pointermove", "DrawView.pointerMove");
        this.addEventListener("pointerup", "DrawView.pointerUp");
    }

    pointerMove(evt) {
        if (this.lastPoint) {
            let p = {x: evt.offsetX, y: evt.offsetY};
            this.publish(this.model.id, "line", {command: "line", from: this.lastPoint, to: p});
            this.lastPoint = p;
        }
    }

    pointerUp(evt) {
        this.removeEventListener("pointermove", "DrawView.pointerMove");
        this.removeEventListener("pointerup", "DrawView.pointerUp");
        this.lastPoint = null;
        this.releaseAllPointerCapture();
    }

    drawLine(data) {
        let ctx = this.dom.getContext("2d");
        ctx.lineWidth = 2;
        ctx.strokeStyle = data.color;
        ctx.beginPath();
        ctx.moveTo(data.from.x, data.from.y);
        ctx.lineTo(data.to.x, data.to.y);
        ctx.stroke();
    }
}

class Color {
    init() {
        this.addEventListener("click", "Color.color");
        this.style.setProperty("background-color", "black");
    }

    randomColor() {
        let h = Math.floor(Math.random() * 360);
        let s = "100%";
        let l = "80%";
        return `hsl(${h}, ${s}, ${l})`;
    }

    color() {
        let color = this.randomColor();
        this.style.setProperty("background-color", color);
        this.publish(this.sessionId, "color", color);
    }
}

function beDrawing(parent, json) {
    let top = parent.createElement();
    let canvas = parent.createElement("CanvasElement");

    canvas.setCode(parent.getLibrary("drawing.DrawModel"));
    canvas.setViewCode(parent.getLibrary("drawing.DrawView"));

    let color = parent.createElement();
    color.setCode(parent.getLibrary("drawing.Color"));

    color.style.setProperty("width", "60");
    color.style.setProperty("height", "60px");
    color.style.setProperty("border-radius", "50%");

    color.domId = "color";
    color.setStyleClasses(`
#color:hover {
    border: 2px dotted white;
}

#color {
    border: 2px solid white;
}`);

    top.style.setProperty("display", "flex");
    top.style.setProperty("width", "550px");

    top.appendChild(canvas);
    top.appendChild(color);
    parent.appendChild(top);
    return parent;
}

export const drawing = {
    expanders: [DrawModel, DrawView, Color],
    functions: [beDrawing]
};
