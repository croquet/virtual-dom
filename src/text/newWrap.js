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

export const eof = String.fromCharCode(26); // "^Z"

export function isNewline(str) {
    return  !!/[\n\r]/.test(str);
}

export function equalStyle(prev, next, defaultFont, defaultSize) {
    if (!prev && !next) {return true;}

    if (!prev) {
        return next.font === defaultFont && next.size === defaultSize
            && !next.color && !next.bold && !next.italic;
    }
    if (!next) {
        return prev.font === defaultFont && prev.size === defaultSize
            && !prev.color && !prev.bold && !prev.italic;
    }

    return (prev.font || defaultFont) === (next.font || defaultFont)
        && (prev.size || defaultSize) === (next.size || defaultSize)
        && (prev.color === next.color)
        && (!!prev.bold === !!next.bold)
        && (!!prev.italic === !!next.italic);
}

let fontRegistry = {
    measureText(word, font, size) {
        return {width: word.text.length * 20, height: 50, ascent: 40};
    },
    getInfo(font, fontSize) {
        return {common: {lineHeight: 50}};
    }
};

class MetricCache {
    constructor() {
        this.cache = [new Map()]; // [Map]
        this.maxMaps = 4;
        this.limit = 256;
    }

    makeKey(word, font, size) {
        let obj = {font, size, style: word.style, styles: word.styles, text: word.text};
        // JSONifying it still may not be stable, but it is okay to have multiple entries
        // for the "same" word
        return JSON.stringify(obj);
    }

    lookup(key) {
        for (let i = 0; i < this.cache.length; i++) {
            let v = this.cache[i].get(key);
            if (v) {return {...v};}
        }
        return null;
    }

    update(key, entry) {
        // assumes that lookup returned null previously
        let m = this.cache[this.cache.length - 1];
        m.set(key, entry);
        if (m.size >= this.limit) {
            if (this.cache.length === this.maxMaps) {
                let r = Math.floor(Math.random() * this.cache.length);
                this.cache.splice(r, 1);
            }
            this.cache.push(new Map());
        }
    }
}

class DomFontRegistry {
    spanFor(text, style) {
        let span = document.createElement("span");
        span.textContent = text;
        if (style) {
            if (style.font) {
                span.style.setProperty("font-family", style.font);
            }
            if (style.size) {
                span.style.setProperty("font-size", style.size + "px");
            }
            if (style.bold) {
                span.style.setProperty("font-weight", "700");
            }
            if (style.italic) {
                span.style.setProperty("font-style", "italic");
            }
        }
        return span;
    }

    measureText(word, font, size) {
        this.ensureMeasureDiv();
        this.div.style.setProperty("font-family", font);
        this.div.style.setProperty("font-size", size + "px");
        let str = word.text;
        if (str === "") {
            this.div.textContent = "";
            let a = this.div.getBoundingClientRect();
            return {width: a.width, height: a.height, ascent: a.height / 2};
        }

        if (str === " " || str === eof) {
            let span = this.spanFor("a a", word.style);
            this.div.appendChild(span);
            let a = this.div.getBoundingClientRect();
            span.remove();
            span = this.spanFor("aa", word.style);
            this.div.appendChild(span);
            let b = this.div.getBoundingClientRect();
            span.remove();
            return {width: a.width - b.width, height: a.height, ascent: a.height / 2};
        }
        if (isNewline(str)) {
            let tmpWord = {...word};
            tmpWord.text = " ";
            let rect = this.measureText(tmpWord, font, size);
            rect.width = 0;
            return rect;
        }
        if (str === "\t") {
            let span = this.spanFor("m", null);
            this.div.appendChild(span);
            // this.div.classList.add("tab");
            let a = this.div.getBoundingClientRect();
            // this.div.classList.remove("tab");
            span.remove();
            return {width: 20, height: a.height, ascent: a.height / 2};
        }

        if (word.styles) {
            this.div.textContent = "";
            for (let i = 0; i < word.styles.length; i++) {
                let partialStyle = word.styles[i];
                if (partialStyle.start >= word.text.length) {break;}
                let span = this.spanFor(word.text.slice(partialStyle.start, partialStyle.end), partialStyle.style);
                this.div.appendChild(span);
            }

            let a = this.div.getBoundingClientRect();

            while (this.div.lastChild) {
                this.div.lastChild.remove();
            }

            return {width: a.width, height: a.height, ascent: a.height / 2};
        }

        if (word.style) {
            this.div.textContent = "";
            let span = this.spanFor(word.text, word.style);
            this.div.appendChild(span);
            let a = this.div.getBoundingClientRect();

            while (this.div.lastChild) {
                this.div.lastChild.remove();
            }
            return {width: a.width, height: a.height, ascent: a.height / 2};
        }

        let span = this.spanFor(word.text, word.style);
        this.div.appendChild(span);
        let a = this.div.getBoundingClientRect();
        span.remove();
        return {width: a.width, height: a.height, ascent: a.height / 2};
    }

    ensureMeasureDiv() {
        if (this.div) {return;}
        this.div = document.createElement('div');
        this.div.classList.add("text-div");
        this.div.style.setProperty("position", "absolute");
        this.div.style.setProperty("left", "0px");
        this.div.style.setProperty("top", "-600px");
        this.div.style.setProperty("visibility", "hidden");
        this.div.style.setProperty("width", "auto");
        this.div.style.setProperty("height", "auto");
        this.div.style.setProperty("white-space", "nowrap");
        document.body.appendChild(this.div);
    }

    getInfo(font, fontSize) {
        return {common: {lineHeight: fontSize}};
    }
}

fontRegistry = new DomFontRegistry();

export class Measurer {
    constructor() {
        this.cache = new MetricCache();
    }

    measureText(word, font, size) {
        let key = this.cache.makeKey(word, font, size);
        let m = this.cache.lookup(key);
        if (m) {return m;}
        m = fontRegistry.measureText(word, font, size);
        this.cache.update(key, m);
        return m;
    }

    lineHeight(font, fontSize) {
        return fontRegistry.getInfo(font, fontSize).common.lineHeight;
    }
}

export class Wrap {
    splitWords(runs, defaultFont, defaultSize) {
        // returns words and lines.

        const isSpace = str => !!(/[ \f\n\r\t\v\u00A0\u2028\u2029]/.test(str));

        let push = (obj, style, ss) => {
            if (ss && ss.length > 1) {
                words.push(Object.assign(obj, {styles: ss}));
            } else if (ss && ss.length === 1) {
                words.push(Object.assign(obj, {style: ss[0].style}));
            } else if (style) {
                words.push(Object.assign(obj, {style}));
            } else {
                words.push(obj);
            }
        };

        let stylePush = (ss, newOne) => {
            if (!ss) {
                return [newOne];
            }
            let last = ss[ss.length - 1];
            if (!equalStyle(last.style, newOne.style, defaultFont, defaultSize)) {
                ss.push(newOne);
                return ss;
            }
            last.end = newOne.end;
            return ss;
        };

        let words = [];

        let isInWord;
        let start = 0;
        let leftOver = "";
        let styles = null;
        let style;
        let thisWord;

        for (let i = 0; i < runs.length - 1; i++) { // eof is at the end
            if (isInWord === undefined) {isInWord = !isSpace(runs[0].text[0]);}
            let run = runs[i];
            let text = run.text;
            style = run.style;

            if (!isInWord) {
                isInWord = !isSpace(text[0]);
            }

            let wordStart = 0;
            for (let j = 0; j < text.length; j++) {
                if (start === 0 && i === 0 && j === 0) {continue;}
                if (isInWord) {
                    if (isSpace(text[j])) {
                        thisWord = text.slice(wordStart, j);
                        let spaceAtHead = leftOver.length > 0 && thisWord.length === 0;
                        if (leftOver.length > 0) {
                            if (thisWord.length > 0) {
                                let newOne = {start: leftOver.length, end: leftOver.length + thisWord.length, style};
                                styles = stylePush(styles, newOne);
                            }
                            thisWord = leftOver + thisWord;
                            leftOver = "";
                        }
                        push({start, end: start + thisWord.length, text: thisWord}, spaceAtHead ? null : style, styles);
                        start += thisWord.length;
                        wordStart = j;
                        isInWord = false;
                        styles = null;
                    }
                } else {
                    if (j > 0) {
                        push({start, end: start + 1, text: text[j - 1], style, styles});
                        start += 1;
                        wordStart += 1;
                    }
                    if (!isSpace(text[j])) {
                        isInWord = true;
                    }
                }
            }
            // end of a run. the style ends here, but a word may continue
            // when a partial word has a different style
            thisWord = text.slice(wordStart, text.length);

            // but then, this word may be just a whitespace
            if (thisWord.length === 1 && isSpace(thisWord)) {
                push({start, end: start + 1, text: thisWord, style, styles});
                start += 1;
            } else {
                let fragment = {start: leftOver.length, end: leftOver.length + thisWord.length, style};
                styles = stylePush(styles, fragment);
                leftOver += thisWord;
            }
        }
        // the last word in the entire text.
        // the special case here is that the style for left over,
        // and the 'fragment' may just be the same as style.  If that is the case,
        // it simply creates a run with one style
        let eofPos = start;
        if (leftOver.length > 0) {
            eofPos = start + leftOver.length;
            let word = {start, end: eofPos, text: leftOver};
            if (styles && styles.length === 1 && equalStyle(style, styles[0].style, defaultFont, defaultSize)) {
                push(word, style);
            } else {
                push(word, null, styles);
            }
        }
        push({start: eofPos, end: eofPos + 1, text: eof});
        return words;
    }

    mergeRect(m1, m2) {
        if (!m1) {return m2;}
        if (!m2) {return m1;}
        return {
            width: m1.width + m2.width,
            height: Math.max(m1.height, m2.height),
            ascent: Math.max(m1.ascent, m2.ascent),
        };
    }

    wrap(runs, textWidth, measurer, defaultFont, defaultSize, margins) {
        // returns words and lines.

        if (!margins) {
            margins = {left: 0, top: 0, right: 0, bottom: 0};
        }

        const width = textWidth - margins.left - margins.right;

        let currentLine = [];
        let currentHeight = 0;
        let currentAscent = 0;
        let lines = []; // list of list of words

        let left = margins.left;
        let top = margins.top;

        let words = this.splitWords(runs, defaultFont, defaultSize);

        let pushLine = () => {
            if (currentLine.length === 0) {return;}
            currentLine.forEach(c => {
                c.ascent = currentAscent;
            });
            lines.push(currentLine);
            currentLine = [];
            left = margins.left;
            top += currentHeight;
            currentHeight = 0;
            currentAscent = 0;
        };

        for (let w = 0; w < words.length - 1; w++) {
            let word = words[w];
            let rect;

            if (isNewline(word.text)) {
                rect = measurer.measureText(word, defaultFont, defaultSize);
                if (w === words.length - 1) {
                    pushLine();
                } else {
                    currentHeight = Math.max(currentHeight, rect.height);
                    currentAscent = Math.max(currentAscent, rect.ascent);
                }
                rect.left = left;
                rect.top = top;
                Object.assign(word, rect);
                currentLine.push(word);
                pushLine();
                currentHeight = 0;
                currentAscent = 0;
                continue;
            }

            rect = measurer.measureText(word, defaultFont, defaultSize);
            currentHeight = Math.max(currentHeight, rect.height);
            currentAscent = Math.max(currentAscent, rect.ascent);

            if (rect.width + left > width) {
                pushLine();
            }
            rect.left = left;
            rect.top = top;
            Object.assign(word, rect);
            left += rect.width;
            currentLine.push(word);
        }

        pushLine();

        let word = words[words.length - 1];
        let rect = measurer.measureText(word, defaultFont, defaultSize);
        currentHeight = Math.max(currentHeight, rect.height);
        currentAscent = Math.max(currentAscent, rect.ascent);
        rect.left = margins.left;
        rect.top = top;
        Object.assign(word, rect);
        currentLine.push(word);
        pushLine();
        return [lines, words];
    }
}
