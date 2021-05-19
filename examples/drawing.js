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
        this.subscribe(this.id, "line", "line");
        this.subscribe(this.sessionId, "color", "color");
        this.subscribe(this.sessionId, "clear", "clear");

        this.subscribe(this.id, "pointerUp", "savePersistentData");
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

    clear() {
        this._set("lines", null);
        this.savePersistentData();
        this.publish(this.id, "cleared");
    }

    loadPersistentData(data) {
        this._set("lines", data);
    }

    savePersistentData() {
        let top = this.wellKnownModel("modelRoot");
        let func = () => this._get("lines");
        top.persistSession(func);
    }

}

class DrawView {
    init() {
        this.addEventListener("pointerdown", "pointerDown");
        this.subscribe(this.model.id, "drawLine", "drawLine");
        this.subscribe(this.model.id, "cleared", "clear");
        this.initDraw();
    }

    initDraw() {
        if (!this.model._get("lines")) {return;}
        this.clear();
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

        this.addEventListener("pointermove", "pointerMove");
        this.addEventListener("pointerup", "pointerUp");
    }

    pointerMove(evt) {
        if (this.lastPoint) {
            let p = {x: evt.offsetX, y: evt.offsetY};
            this.publish(this.model.id, "line", {command: "line", from: this.lastPoint, to: p});
            this.lastPoint = p;
        }
    }

    pointerUp(_evt) {
        this.removeEventListener("pointermove", "pointerMove");
        this.removeEventListener("pointerup", "pointerUp");
        this.lastPoint = null;
        this.releaseAllPointerCapture();
        this.publish(this.model.id, "pointerUp");
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

    clear() {
        let canvas = this.dom;
        let ctx = canvas.getContext('2d');
        ctx.clearRect(0, 0, canvas.width, canvas.height);
    }
}

class Color {
    init() {
        this.addEventListener("click", "color");
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

class ClearButton {
    init() {
        this.addEventListener("click", "click");
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
    background-image: url("./assets/icons/trash-can.svg");
}

.icon:hover {
    background-color: #F2F2F2;
    box-shadow: 0 0.5px 4px rgba(0,0,0,0.2);
}

`);

        this.classList.add("icon");
    }

    click() {
        this.publish(this.sessionId, "clear");
    }
}

function beDrawing(parent, json, persistentData) {
    let top = parent.createElement();
    let canvas = parent.createElement("CanvasElement");

    canvas.setCode("drawing.DrawModel");
    canvas.setViewCode("drawing.DrawView");
    canvas.style.setProperty("border", "1px solid gray");

    let color = parent.createElement();
    color.setCode("drawing.Color");

    color.style.setProperty("width", "40px");
    color.style.setProperty("height", "40px");
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

    let clear = parent.createElement();
    clear.domId = "clear";
    clear.setCode("drawing.ClearButton");
    parent.appendChild(clear);
    if (persistentData) {
        canvas.call("DrawModel", "loadPersistentData", persistentData);
    }
    return parent;
}

export const drawing = {
    expanders: [DrawModel, DrawView, Color, ClearButton],
    functions: [beDrawing]
};
