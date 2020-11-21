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

export default class MockContext {
    constructor() {
        this.filledRects = []; // [{x, y, w, h, style}]
        this.strokeRects = []; // [{x, y, w, h, style}]
        this.drawnStrings = []; // [{x, y, string, font, style}]

        this.fillStyle = 'black';
        this.originX = 0;
        this.originY = 0;
        this.lineWidth = 1;
        this.strokeStyle = 'black';
        this.textAlign = 'left';
        this.textBaseline = 'alphabetic';
        this.savedState = [];
        //[{fillStyle: style, originX, number, originY: number,
        //  lineWidth: number, strokeStyle: style,
        //  textAlign: string, textBaseline: string }]
        this.save();

    }

    makeStateObj() {
        return {fillStyle: this.fillStyle, originX: this.originX, originY: this.originY,
                lineWidth: this.lineWidth, strokeStyle: this.strokeStyle,
                textAlign: this.textAlign, textBaseline: this.textBaseline};
    }

    save() {
        this.savedState.push(this.makeStateObj());
    }

    restore() {
        let state = this.savedState.pop();
        this.fillStyle = state.fillStyle;
        this.originX = state.originX;
        this.originY = state.originY;
        this.lineWidth = state.lineWidth;
        this.strokeWidth = state.strokeWidth;
        this.textAlign = state.textAlign;
        this.textBaseline = state.textBaseline;
    }

    beginPath() {}
    moveTo() {}
    lineTo() {}
    quadraticCurveTo() {}
    closePath() {}

    fill() {
    }
    stroke() {}

    clearRect() {}

    fillRect(x, y, w, h) {
        this.filledRects.push({x: x, y: y, w: w, h: h, style: this.fillStyle});
    }

    strokeRect(x, y, w, h) {
        this.strokeRects.push({x: x, y: y, w: w, h: h, style: this.strokeStyle});
    }

    translate(x, y) {
        this.originX = x;
        this.originY = y;
    }

    fillText(str, left, baseline) {
        this.drawnStrings.push({x: left, y: baseline, string: str, font: this.font, style: this.fillStyle});
    }
}
