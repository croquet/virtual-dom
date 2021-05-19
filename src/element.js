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
import {Style} from "./timeObject.js";
import {M, V, createSession, isLocal, getElement} from "./mock.js";
import {Library} from "./library.js";

let setFontLastLoadedTime = null;

// let now = 0;

let isProxy = Symbol("isProxy");

function newProxy(object, handler, trait) {
    if (object[isProxy] && object._trait === trait) {
        return object;
    }
    return new Proxy(object, {
        get(target, property) {
            if (property === isProxy) {return true;}
            if (property === "_target") {return object;}
            if (property === "_trait") {return trait;}
            if (trait && trait.hasOwnProperty(property)) {
                return new Proxy(trait[property], {
                    apply: function(_target, thisArg, argumentList) {
                        return trait[property].apply(thisArg, argumentList);
                    }
                });
            }
            return target[property];
        },
    });
}

function asKey(arg1) {
    // historically, a key was a pair of island id and element id.
    // however we simplied it to be just the element id now.
    // Still the concept of "key" is here to distinguish it
    // as a different type from simple id.

    if (typeof arg1 === "string") {
        return arg1;
    }
    return arg1.elementId;
}

function shortId(id) {
    if (id.indexOf("/") >= 0) {
        id = id.slice(id.indexOf("/") + 1);
    }
    return id;
}

function removeStyle(id) {
    let old = document.querySelector(`#style${id}`);
    if (old) {old.remove();}
}

class ElementRef {
    constructor(elementId) {
        this.elementId = elementId;
    }

    asElementRef() {
        return this;
    }

    equals(other) {
        return other.elementId === this.elementId;
    }

    asKey() {
        return asKey(this);
    }
}

export class TopModel extends M {
    init(options, persistentData) {
        super.init(options, persistentData);
        this.userManager = {};
        this.containerExtent = {width: "1024px", height: "768px"};

        this.subscribe(this.sessionId, "windowResized", "windowResized");

        this.subscribe(this.sessionId, "view-join", "viewJoin");
        this.subscribe(this.sessionId, "view-exit", "viewExit");
    }

    viewJoin(viewId) {
        this.userManager[viewId] = viewId;
        if (isLocal) {
            this.publish(this.sessionId, "localUserJoin", viewId);
        }
    }

    viewExit(viewId) {
        delete this.userManager[viewId];
        this.publish(this.sessionId, "userList", null, true);
    }

    windowResized(obj) {
        this.containerExtent = obj;
        this.publish(this.sessionId, "resizeWindow");
    }

    appendChild() {console.log("noop");}

    static types() {
        return {
            Style: {
                cls: Style,
                write: (c) => {
                    return c.values;
                },
                read: (obj) => {
                    let t = new Style();
                    t.values = obj;
                    return t;
                }
            },
            ElementRef: {
                cls: ElementRef,
                write: (c) => {
                    return {elementId: c.elementId};
                },
                read: (obj) => {
                    return new ElementRef(obj.elementId);
                }
            },
        };
    }
}

TopModel.register("TopModel");

export class Element extends M {
    init(_options) {
        super.init();
        this._childNodes = []; // [ElementRef]
        this._parentNode = undefined; // ElementRef
        this._style = new Style();
        this._domId = undefined; // string
        this._classList = [];
        this._innerHTML = undefined; // the part of HTML that does not respond to events.
        this.eventListeners = {};

        this.code = []; // [code|libraryName];
        this.viewCode = []; // [code|libraryName];
        this.me = {}; // stored values
        this.listeners = []; // [{scope}]
        this.$handlers = {};
        this.worldState = null;
        this.subscriptions = {};
        /*
        if (options && options.code) {
            this.beWorld();
            this.options = {};
            this.options.autoSleep = options.autoSleep;
            this.options.tps = options.tps;
            this.options.step = options.step;
            this.library = options.library; // revisit this
            if (typeof options.library === "object" && options.library.constructor.name !== "Library") {
                this.library = new Library();
                this.library.library = options.library.library;
            }

            this.future(1).evaluate(options.code, options.json, options.projectCode);
        }
        */
    }

    static viewClass() {return ElementView;}

    get elementId() {
        return this.id;
    }

    future(tOffset = 0) {
        let self = this;
        if (this[isProxy]) {
            self = this._target;
        }
        let func = M.prototype.future;
        return func.call(self, tOffset);
    }

    asElementRef() {
        return new ElementRef(this.elementId);
    }

    newElementRef(elementId) {
        // arg is elementId<string>
        return new ElementRef(elementId);
    }

    subscribe(scope, event, methodName) {
        const topic = scope + ":" + event;

        let trait = this._trait;
        if (trait) {
            trait = trait.constructor.name;
        }

        let fullMethodName;
        if (methodName.indexOf(".") >= 1 || !trait) {
            fullMethodName = methodName;
        } else {
            fullMethodName = `${trait}.${methodName}`;
        }

        if (this.subscriptions[topic]) {
            if (this.subscriptions[topic] === fullMethodName) {
                // console.log('already subscribed');
                return;
            }
            this.unsubscribe(scope, event);
        }

        this.subscriptions[topic] = fullMethodName;

        super.subscribe(scope, event, fullMethodName);
    }

    // features for the world (i.e., top-level) element
    evaluate(str, json, projectCode, persistentData) {
        if (json) {
            json = JSON.parse(json);
        } else {
            json = {};
        }

        let func = new Function(str)();
        func(this, json, persistentData);
        let child;
        if (projectCode) {
            let cFunc = new Function(projectCode)();
            child = cFunc(this, null);
            this.publish(this.sessionId, "addProject", this.asElementRef(), true);
        }
        return child;
    }

    beWorld() {
        this.isWorld = true;
        this.objects = {[this.elementId]: this.id};
        this.$dirtyElements = null;
        this.worldState = this;
        this.beWellKnownAs("worldModel");

        this.subscribe(this.id, "domEvent", "domEvent");
    }

    needsUpdate() {
        this.getWorldState().addDirtyElement(this);
        //this.publish(this.sessionId, 'requestUpdate');
    }

    addDirtyElement(elem) {
        if (!this.$dirtyElements) {return;}
        this.$dirtyElements[elem.elementId] = elem.elementId;
    }

    changedElements(flag) {
        if (!this.$dirtyElements || flag) {
            this.$dirtyElements = this.objects;
        }
        let keys = Object.keys(this.$dirtyElements);
        this.$dirtyElements = {};
        return {time: this.now(), elementIds: keys};
    }

    // display scene management

    createElement(cls) {
        if (typeof cls === "string") {
            cls = Element.knownElements[cls];
        }
        if (!cls) {
            cls = Element;
        }
        let m = cls.create();
        let world = this.worldState;
        m.worldState = world;
        world.objects[m.elementId] = m.id;
        world.addDirtyElement(m);
        return m;
    }

    removeElement(elem) {
        delete this.objects[elem.elementId];
        this.addDirtyElement(elem);
    }

    insertBefore(elemOrEntry, referenceElemOrEntry) {
        // the argumennt can be either an actual Element, or an ElementRef
        // The latter form is considered to be canonical.

        let children = this._childNodes.slice();

        let refRef = referenceElemOrEntry.asElementRef();
        let index = children.findIndex((entry) => entry.equals(refRef));

        if (index < 0) {
            index = children.length;
        }

        let ref = elemOrEntry.asElementRef();
        let child = getElement(ref);

        let fromParent = child && child._parentNode;
        if (fromParent) {
            this.moveChild(fromParent, ref, index);
            return;
        }

        children.splice(index, 0, ref);
        this._childNodes = children;

        this.setParentOf(child, this);
        this.needsUpdate();
    }

    insertFirst(elemOrEntry) {
        // a hack to add an element at index 0

        // the argumennt can be either an actual Element, or an ElementRef.
        // The latter form is considered to be canonical.

        let ref = elemOrEntry.asElementRef();
        let children = this._childNodes.slice();

        let child = getElement(ref);

        let fromParent = child && child._parentNode;
        if (fromParent) {
            this.moveChild(fromParent, ref, 0);
            return;
        }

        children.unshift(ref);
        this._childNodes = children;

        this.setParentOf(child, this);
        this.needsUpdate();
        //if (this.isWorld) {elem.topChild = true;}
    }

    appendChild(elemOrEntry) {
        // the argumennt can be either an actual Element, or an ElementRef.
        // The latter form is considered to be canonical.

        let ref = elemOrEntry.asElementRef();
        let children = this._childNodes.slice();

        let child = getElement(ref);

        let fromParent = child && child._parentNode;
        if (fromParent) {
            this.moveChild(fromParent, ref, children.length);
            return;
        }

        children.push(ref);
        this._childNodes = children;

        this.setParentOf(child, this);
        this.needsUpdate();
        //if (this.isWorld) {elem.topChild = true;}
    }

    setParentOf(elem, parent) {
        // private, should be only called by appendChild() or removeChild()
        let obj = parent ? parent.asElementRef() : null;
        elem._parentNode = obj;
        this.needsUpdate();
    }

    remove() {
        let parent = this._parentNode;
        parent = getElement(parent);
        if (!parent) {return;}
        parent.removeChild(this.asElementRef());
    }

    removeChild(entry) {
        let children = this._childNodes;
        let ref = entry.asElementRef();
        let ind = children.findIndex(c => c.equals(ref));

        if (ind >= 0) {
            let childRef = children[ind];
            let newChildren = children.slice();
            newChildren.splice(ind, 1);
            this._childNodes = newChildren;

            let child = getElement(childRef);
            if (child) {// reconsider if this is happening multiple times due to view->model message
                child.destroyAll();
                this.setParentOf(child, null);
            }
            this.needsUpdate();
        }
    }

    moveChild(fromParentEntry, entry, toIndex) {
        // fromIndex is the actual index where this element is.  toIndex is where the element will be, *as if the element is not in the same list*
        let entryRef = entry.asElementRef();

        if (this.asElementRef().equals(fromParentEntry)) {
            let children = this._childNodes;

            let fromIndex = children.findIndex((e) => e.equals(entryRef));
            if (fromIndex < 0) {return;}
            if (fromIndex === toIndex || fromIndex + 1 === toIndex) {return;}
            let shift = toIndex > fromIndex + 1;
            children.splice(fromIndex, 1);
            if (shift) {toIndex--;}
            children.splice(toIndex, 0, entryRef);
            this._childNodes = children;
            this.needsUpdate();
            return;
        }

        let fromParent = getElement(fromParentEntry);
        if (!fromParent) {return;}

        let children = this._childNodes.slice();
        children.splice(toIndex, 0, entry);
        this._childNodes = children;
        this.needsUpdate();

        fromParent.removeChild(entry);
    }

    getParentNode() {
        let parentInfo = this._parentNode;
        if (!parentInfo) {return null;}
        return getElement(parentInfo);
    }

    get parentNode() {
        return this.getParentNode();
    }

    getChildNodes() {
        return this._childNodes.map(entry => getElement(entry));
    }

    get childNodes() {
        return this.getChildNodes();
    }

    destroy() {
        let world = this.getWorldState();
        world.removeElement(this);
        super.destroy();
    }

    destroyAll() {
        let children = this._childNodes;
        for (let i = 0; i < children.length; i++) {
            let childEntry = children[i];
            let child = getElement(childEntry);
            if (child) {// reconsider if this is happening multiple times due to view->model message
                child.destroyAll();
            }
        }
        this.destroy();
    }

    // query world
    getWorldState() {
        return this.worldState;
    }

    getElement(ref) {
        return getElement(ref);
    }

    // accessors

    get style() {
        let that = this;
        return {
            setProperty(name, value) {
                that._style.setProperty(name, value);
                that.needsUpdate();
            },
            getPropertyValue(name) {
                return that._style.getPropertyValue(name);
            },
            removeProperty(name) {
                let value = that._style.removeProperty(name);
                that._style.removeProperty(name);
                that.needsUpdate();
                return value;
            }
        };
    }

    get classList() {
        let that = this;
        return {
            add(...names) {
                let current = that.getClassList();
                let newOne = current.slice();
                names.forEach(n => {
                    if (!current.includes(n)) {
                        newOne.push(n);
                    }
                });
                that.setClassList(newOne);
            },

            remove(...names) {
                let current = that.getClassList();
                let newOne = [];
                current.forEach(n => {
                    if (!names.includes(n)) {
                        newOne.push(n);
                    }
                });
                that.setClassList(newOne);
            },

            replace(oldToken, newToken) {
                let current = that.getClassList();
                let newOne = current.slice();
                let ind = newOne.findIndex(oldToken);
                if (ind >= 0) {
                    newOne[ind] = newToken;
                }
                that.setClassList(newOne);
            },
            contains(token) {
                let current = that.getClassList();
                return current.includes(token);
            }
        };
    }

    setTransform(value) {
        let t = value;
        if (typeof t === "string") {
            t = t.split(",").map(e => parseFloat(e));
        }
        this._style.setTransform(t);
        this.needsUpdate();
    }

    getTransform() {
        return this._style.getTransform();
    }

    set domId(name) {
        this._domId = name;
        this.needsUpdate();
    }

    get domId() {
        return this._domId;
    }

    setCode(stringOrArray, notCallInit) {
        if (!stringOrArray) {
            console.log("code is empty for ", this);
            return;
        }

        let array;
        let result = [];
        if (typeof stringOrArray === "string") {
            array = [stringOrArray];
        } else {
            array = stringOrArray;
        }

        this.code = array;
        array.forEach((str) => {
            let trimmed = str.trim();
            let source;
            if (trimmed.length === 0) {return;}
            if (/^class[ \t]/.test(trimmed)) {
                source = trimmed;
            } else {
                source = this.getLibrary(trimmed);
            }

            if (!source) {
                console.log(`code specified as ${trimmed} is empty for`, this);
            }

            let code = `let x = ${source}; return x;`;
            let cls = new Function("getElement", code)(getElement);
            if (typeof cls !== "function") {
                console.log("error occured while compiling");
                return;
            }
            result.push(cls);
        });

        if (!this.$handlers) {
            this.$handlers = {};
        }
        let myHandler = this.$handlers;

        Object.keys(myHandler).forEach((k) => {
            if (myHandler[k] && myHandler["_" + k]) {
                delete myHandler[k];
                delete myHandler["_" + k];
            }
        });

        result.forEach((cls) => {
            let name = cls.name;
            myHandler[name] = cls.prototype;
            myHandler["_" + name] = cls;
            if (!notCallInit && cls.prototype.init) {
                this.call(cls.name, "init");
            }
        });
    }

    getCode() {
        return this.code;
    }

    addCode(stringOrArray) {
        if (!stringOrArray) {
            console.log("additional code is empty for ", this);
            return;
        }

        let array;
        if (typeof stringOrArray === "string") {
            array = [stringOrArray];
        } else {
            array = stringOrArray;
        }

        let codeList = this.getCode().slice();
        for (let i = 0; i < array.length; i++) {
            let newCode = array[i];
            if (codeList.indexOf(newCode) >= 0) {continue;}
            if (newCode.startsWith("class")) {
                let str = `let x = ${newCode}; return x;`;
                let cls = new Function("getElement", str)(getElement);
                for (let k = 0; k < codeList.length; k++) {
                    let old = codeList[k];
                    if (old.startsWith("class")) {
                        let oldStr = `let x = ${old}; return x;`;
                        let oldCls = new Function("getElement", oldStr)(getElement);
                        if (oldCls.name === cls.name) {
                            codeList.splice(k, 1);
                        }
                    }
                }
            }
        }
        codeList = codeList.concat(array);
        this.setCode(codeList);
    }

    setViewCode(stringOrArray) {
        if (!stringOrArray) {
            console.log("code is empty for ", this);
            return;
        }

        let array;
        if (typeof stringOrArray === "string") {
            array = [stringOrArray];
        } else {
            array = stringOrArray;
        }
        this.viewCode = array;
        this.needsUpdate();
    }

    getViewCode() {
        return this.viewCode;
    }

    addViewCode(stringOrArray) {
        if (!stringOrArray) {
            console.log("additional code is empty for ", this);
            return;
        }

        let array;
        if (typeof stringOrArray === "string") {
            array = [stringOrArray];
        } else {
            array = stringOrArray;
        }
        let old = this.getViewCode();
        array = old.concat(array);
        this.setViewCode(array);
    }

    setStyleString(str) {
        this._style.setStyleString(str);
        this.needsUpdate();
    }

    getStyleString() {
        return this._style.getStyleString();
    }

    setStyleClasses(str) {
        this._style.setClasses(str);
    }

    addStyleClasses(str) {
        let old = this.getStyleClasses() || "";
        this._style.setClasses(old + "\n" + str);
    }

    getStyleClasses() {
        return this._style.getClasses();
    }

    setClassList(array) {
        this._classList = array;
        this.needsUpdate();
    }

    getClassList() {
        return this._classList;
    }

    setScriptingInfo(string) {
        let domIdLabelStart = string.indexOf("id:\n");
        let domIdLabelEnd = domIdLabelStart + ("id:\n").length;
        let clsStringStart = string.indexOf("classes:\n");
        let clsStringEnd = clsStringStart + "classes:\n".length;
        let propsLabelStart = string.indexOf("props:\n");
        let propsLabelEnd = propsLabelStart + "props:\n".length;

        let idStr = string.slice(domIdLabelEnd, clsStringStart);
        let clsString = string.slice(clsStringEnd, propsLabelStart);
        let propsStr = string.slice(propsLabelEnd);

        this.domId = idStr.trim();

        let propStrs = propsStr.split("\n");
        propStrs.forEach(str => {
            let ind = str.indexOf(": ");
            if (ind < 1) {return;}
            let k = str.slice(0, ind);
            let v = JSON.parse(str.slice(ind + 2));
            this._set(k, v);
        });

        let clsStrs = clsString.split(",").map(s => s.trim()).filter(s => s.length > 0);
        this.setClassList(clsStrs);
    }

    getScriptingInfo() {
        let domId = this.domId;
        let myValues = this.me;
        let props = [];
        Object.keys(myValues).forEach(k => {
            let v = myValues[k];
            if (v === undefined) {
                return;
            }
            props.push(k + ": " + JSON.stringify(v));
        });

        let propStr = props.join("\n");
        let clsString = this.getClassList().join(",");

        return `id:
${domId || ""}
classes:
${clsString}
props:
${propStr}
`;
    }

    set innerHTML(str) {
        this.setInnerHTML(str);
    }

    get innerHTML() {
        return this._innerHTML;
    }

    setInnerHTML(str) {
        this._innerHTML = str;
        this.needsUpdate();
        return str;
    }

    getListenersInfo() {
        let listeners = this.listeners;
        if (listeners.length === 0) {
            return undefined;
        }
        return JSON.stringify(listeners);
    }

    setListenersInfo(str) {
        if (!str) {return;}
        let array = JSON.parse(str);
        this.listeners = array;
    }

    // events

    addEventListener(evtName, spec, useCapture) {
        let trait = this._trait;
        if (trait) {
            trait = trait.constructor.name;
        }

        let fullSpec;
        if (spec.indexOf(".") >= 1 || !trait) {
            fullSpec = spec;
        } else if (trait) {
            fullSpec = `${trait}.${spec}`;
        }

        let listeners = {...this.eventListeners};
        listeners[evtName] = {spec: fullSpec, useCapture};
        this.eventListeners = listeners;
        this.needsUpdate();
    }

    removeEventListener(evtName, _spec) {
        let listeners = {...this.eventListeners};
        delete listeners[evtName];
        this.eventListeners = listeners;
        this.needsUpdate();
    }

    // scripting support

    querySelector(string) {
        // This version assumes the string starts with # and only works for looking up dom id
        if (string[0] !== "#") {return null;}
        let id = string.slice(1);

        let query = (me) => {
            if (me._domId === id) {return me;}
            let children = me._childNodes;
            for (let i = 0; i < children.length; i++) {
                let ref = children[i];
                let child = this.getElement(ref);
                let result = query(child);
                if (result) {return result;}
            }
            return null;
        };

        return query(this);
    }

    getLibrary(path) {
        let split = path.split(".");
        if (split.length <= 1) {
            return null;
        }

        let lib;
        let base = split[0];
        let current = this;
        while (current) {
            lib = current._get("library");
            if (lib && lib.has(base)) {
                return lib.get(path);
            }
            let parent = current.parentNode;
            if (parent) {
                current = parent;
            } else {
                break;
            }
        }

        lib = Library.getGlobalLibrary();
        return lib.get(path);
    }

    _set(name, value) {
        let old = this.me;
        let newValues = {...old};
        newValues[name] = value;
        this.me = newValues;
        return value;
    }

    _get(name) {
        let old = this.me;
        return old[name];
    }

    _delete(name) {
        let old = this.me;
        let newValues = {...old};
        let value = old[name];
        delete newValues[name];
        this.me = newValues;
        return value;
    }

    domEvent(info) {
        let {elementId, evt, trait, method} = info;
        let world = this.getWorldState();
        let object = world.getElement(elementId);
        if (object) {
            object.call(trait, method, evt);
            this.needsUpdate();
        }
    }

    ensureMyHandler() {
        if (!this.$handlers) {
            this.$handlers = {};
            let maybeCode = this.getCode();
            if (maybeCode.length > 0) {// always an array
                this.setCode(maybeCode, true);
            }
            maybeCode = this.getViewCode();
            if (maybeCode.length > 0) {// always an array
                this.setViewCode(maybeCode);
            }
            maybeCode = this.getStyleString();
            if (maybeCode.length > 0) {
                this.setStyleString(maybeCode);
            }
        }
        return this.$handlers;
    }

    hasHandler(traitName) {
        let myHandler = this.ensureMyHandler();
        return !!myHandler[traitName];
    }

    bePartsBinPrototype() {
        this.style.setProperty("background-color", "white");
        this.style.setProperty("border", "1px solid black");
        this.style.setProperty("width", "50px");
        this.style.setProperty("height", "40px");
        this.style.setProperty("position", "absolute");
        this.style.setProperty("left", "0px");
        this.style.setProperty("top", "0px");
    }

    call(traitOrNull, name, ...values) {
        let myHandler = this.ensureMyHandler();
        let trait;
        let result;
        if (traitOrNull) {
            trait = myHandler[traitOrNull];
        }

        if (traitOrNull && !trait) {
            throw new Error(`an expander named ${traitOrNull} is not installed`);
        }

        let proxy = newProxy(this, myHandler, trait);
        try {
            let f = proxy[name];
            if (!f) {
                throw new Error(`a method named ${name} not found in ${traitOrNull || this}`);
            }
            result = f.apply(proxy, values);
        } catch (e) {
            console.error("an error occured in", this, traitOrNull, name, e);
        }
        return result;
    }

    // this is experimental to see when we'd need to add publish domain dynamically
    // so we can't use some id as scope, because it maybe different next time
    // the saved project is loaded.  it should be some "scope generator", so to speak,
    // to create the scope runtime.
    // it could be:
    //   "sessionId" => find the session and use its id.
    //   "world" => use getWorldState(), and use its id

    publishToAll(data) {
        let listeners = this.listeners;
        listeners.forEach(entry => {
            this.publish(entry.scope || this.id, entry.event, data);
        });
    }

    addDomain(scope, event) {
        let old = this.listeners;
        if (old.findIndex(e => e.scope === scope &&
                           e.event === event) >= 0) {
            return;
        }
        let newArray = old.slice();
        newArray.push({scope, event});
        this.listeners = newArray;
    }
}

Element.register("Element");

let topView = null;
let views = {}; // {'elementId': dom}
window.views = views;

let initers = {}; // {[viewId.traitName]: [view, traitName]}

export class TopView extends V {
    constructor(model) {
        super(model);
        this.model = model;

        this.ensureDom();

        topView = this;
        window.topView = topView;

        this.isSynced = false;
        this.pointerTracker = null;

        this.subscribe(this.viewId, "synced", "synced");

        this.subscribe(this.sessionId, "resizeWindow", "resizeWindow");
        document.addEventListener("drop", evt => evt.preventDefault());
        document.addEventListener("dragover", evt => evt.preventDefault());

        this.grabber = new GlobalPointerGrabber();

        this.initializer = [];

        this.detachCallbacks = [];
    }

    subscribe(scope, event, methodName) {
        if (isLocal) {
            return super.subscribe(scope, event, methodName);
        }
        return super.subscribe(scope, event, this[methodName]);
    }

    isRunningLocally() {
        return isLocal;
    }

    detach() {
        super.detach();
        for (let k in views) {
            views[k].dom.remove();
            views[k].detach();
        }

        this.pluggableDispatch("pointerTracker", "deleteAllPointers");

        views = {};
        window.views = views;

        if (this.dom.childNodes[0]) {
            this.dom.childNodes[0].remove();
        }

        this.hasChild = false;

        this.dom.remove();

        console.log("detach top");

        this.detachCallbacks.forEach((c) => {
            if (typeof c === "function") {
                c();
            } else {
                let {view, trait, method} = c;
                view.call(trait, method);
            }
        });
        this.detachCallbacks = [];

        if (this.grabber) {
            this.grabber.releasePointer();
            this.grabber = null;
        }
        // window.topView = null;
    }

    synced(value) {
        console.log(`top view synced(${value})`);
        this.isSynced = value;
    }

    ensureDom() {
        if (this.dom) {return;}
        document.body.style.setProperty("overscroll-behavior-x", "none");
        document.body.style.setProperty("overflow", "hidden");
        document.body.style.setProperty("height", "100%");
        document.body.style.setProperty("margin", "0");

        this.dom = document.createElement("div");
        this.dom.id = "toplevel";

        this.dom.style.setProperty("width", "100%");
        this.dom.style.setProperty("height", "100%");

        this.hasChild = false;

        let parent = document.querySelector("#croquet-root");
        if (!parent) {
            parent = document.body;
        }
        parent.appendChild(this.dom);

        window.onresize = () => this.throttledInvoke("resizeWindow", 200, () => this.localResizeWindow());
        this.localResizeWindow();
    }

    localResizeWindow() {
        if (window.isMaster) {
            let rect = this.dom.getBoundingClientRect();
            this.publish(this.sessionId, "windowResized", {width: rect.width + "px", height: rect.height + "px"});
        } else {
            this.publish(this.sessionId, "localWindowResized");
        }
    }

    resizeWindow() {
        let extent = this.model.containerExtent;
        this.dom.style.setProperty("width", extent.width);
        this.dom.style.setProperty("height", extent.height);
    }

    pluggableDispatch(component, selector, data) {
        let entry = this[component];
        if (!entry) {console.warn(`dispatch not available for ${component}`);}
        return entry && entry.target.call(entry.trait, entry[selector], data);
    }

    grab(view, moveFuncOrSpec, upFuncOrSpec, forTouch) {
        this.grabber.grab(view, moveFuncOrSpec, upFuncOrSpec, forTouch);
    }

    ensureView(ref, world) {
        let key = ref.asKey();
        let elementId = ref.elementId;
        let view = views[key];

        if (view) {return view;}
        let model = world.getElement(elementId);
        let ViewClass = model.constructor.viewClass() || ElementView;
        view = new ViewClass(model);
        view.setKey(key);
        views[key] = view;
        return view;
    }

    removeView(key) {
        let view = views[key];
        if (!view) {return view;}
        view.detach();
        view.dom.remove();
        delete views[key];
        return view;
    }

    querySelector(string) {
        if (string[0] !== "#") {return null;}
        let elem = this.dom.querySelector(string);
        if (!elem) {return null;}
        let key = elem.key;
        if (!key) {return null;}
        return window.views[key];
    }

    requestFullUpdate() {
        this.fullUpdate = true;
    }

    requestUpdate() {
        let topChild;
        let topWorld;
        let world = this.model.wellKnownModel("worldModel");
        let info = world.changedElements(this.fullUpdate);
        info.elementIds.forEach((id) => {
            let elem = world.getElement(id);
            if (!elem) {
                // assume that elem is removed.
                this.removeView(asKey(id));
                let removeId = shortId(id);
                removeStyle(removeId);
                return;
            }
            let view = this.ensureView(new ElementRef(id), world);
            view.apply(info.time, elem, world);
            if (!this.hasChild && elem.topChild) {
                topChild = elem;
                topWorld = world;
            }
        });
        this.fullUpdate = false;
        if (topChild) {
            this.hasChild = true;
            let view = this.ensureView(new ElementRef(topChild.elementId), topWorld);
            this.dom.appendChild(view.dom);
        }

        for (let k in initers) {
            let entry = initers[k];
            entry[0].call(entry[1], "init");
        }
        initers = {};

        // try {
        //     for (let k in initers) {
        //         let entry = initers[k];
        //         entry[0].call(entry[1], "init");
        //     }
        // } finally {
        //     initers = {};
        // }

        // this is a mess but we allow one more round of initialization
        // there is no guarantee that the user code can be fully come up
        // just with these two levels, nor guaranteed to work

        if (this.initializer.length > 0 && !this.initializerTimer) {
            let myInitializer = [...this.initializer];
            this.initializer = [];
            this.initializerTimer = window.setTimeout(() => {
                myInitializer.forEach((triple) => {
                    let [view, trait, method] = triple;
                    view.call(trait, method);
                });
                this.initializerTimer = null;
            }, 500);
        }
    }

    requestInitialization(view, trait, method) {
        this.initializer.push([view, trait, method]);
    }

    displayStatus(string) {
        console.log(string);
    }

    displayWarning(string) {
        console.log(string);
    }

    displayError(string) {
        console.log(string);
    }

    update() {
        if (!this.isSynced) {return;}
        this.requestUpdate();
    }

    throttledInvoke(key, time, fn) {
        // timeout of -1 means run immediately
        if (time === -1) {
            fn();
            return;
        }

        // NB: for a given key, the function that will be invoked by
        // the timeout is the most recent one supplied to this method.
        if (!this.throttles) {this.throttles = {};}

        let spec = this.throttles[key];
        if (!spec) {spec = this.throttles[key] = {};}

        spec.fn = fn;

        if (spec.timeout) {return;}

        let current = Date.now();
        let timeRemaining = spec.lastInvoke ? spec.lastInvoke + time - current : 0;
        if (timeRemaining <= 0) {
            spec.lastInvoke = current;
            fn();
            return;
        }

        spec.timeout = setTimeout(() => {
            delete spec.timeout;
            spec.lastInvoke = Date.now();
            spec.fn();
        }, timeRemaining);
    }

    clearThrottledInvoke(key) {
        if (!this.throttles) {return;}

        let spec = this.throttles[key];
        if (spec && spec.timeout) {clearTimeout(spec.timeout);}
        delete this.throttles[key];
    }

    setLastFontLoadedTime(ms) {
        if (setFontLastLoadedTime) {
            setFontLastLoadedTime(ms);
        }
    }
}

function equal(a, b) {
    if (typeof a !== typeof b) {
        return false;
    }
    if (typeof a === "object") {
        if (a === null || b === null) {
            return a === b;
        }
        if (a.constructor !== b.constructor) {
            return false;
        }
        if (a.constructor === Array) {
            if (a.length !== b.length) {
                return false;
            }
            for (let i = 0; i < a.length; i++) {
                if (!equal(a[i], b[i])) {
                    return false;
                }
            }
            return true;
        }

        let aKey = Object.keys(a);
        let bKey = Object.keys(b);
        if (aKey.length !== bKey.length) {return false;}
        for (let k in a) {
            if (!equal(a[k] ,b[k])) {
                return false;
            }
        }
    }
    return a === b;
}

export class ElementView extends V {
    constructor(model) {
        super(model);
        this.model = model;
        this.dom = this.createDom();
        this.dom._cards = true;
        this.elementId = model.elementId;

        this.lastValues = {};
        this.viewHandlers = {};
        this.props = {};  // may have to saved in the model as the result of user interaction?
        this.eventListeners = {}; // {evtName: {func: function, spec: string, useCapture: boolean}}
        if (this.model.isWorld) {
            this.subscribe(this.viewId, "synced", "synced");
        }
    }

    detach() {
        super.detach();
        if (this.model.isWorld) {
            this.isSynced = false;
        }

        if (this._objectURL) {
            URL.revokeObjectURL(this._objectURL);
            this._objectURL = null;
        }

        let id = shortId(this.elementId);
        removeStyle(id);
    }

    createDom() {
        return document.createElement("div");
    }

    synced(value) {
        console.log("element view synced", value, this.model.elementId);
        this.isSynced = value;
    }

    subscribe(scope, event, methodName) {
        if (isLocal) {
            return super.subscribe(scope, event, methodName);
        }

        if (methodName.indexOf(".") >= 1) {
            let split = methodName.split(".");
            let func = (data) => {
                this.call(split[0], split[1], data);
            };

            return super.subscribe(scope, event, func);
        }

        return super.subscribe(scope, event, this[methodName]);
    }

    hasHandler(traitName) {
        let myHandler = this.viewHandlers;
        return !!myHandler[traitName];
    }

    call(traitOrNull, name, ...values) {
        let myHandler = this.viewHandlers;
        let trait;
        let result;
        if (traitOrNull) {
            trait = myHandler[traitOrNull];
        }

        if (traitOrNull && !trait) {
            throw new Error(`an expander named ${traitOrNull} is not installed`);
        }

        let proxy = newProxy(this, myHandler, trait);
        try {
            let f = proxy[name];
            if (!f) {
                throw new Error(`a method named ${name} not found in ${traitOrNull || this}`);
            }
            result = f.apply(proxy, values);
        } catch (e) {
            console.error("an error occured in", this, traitOrNull, name, e);
        }
        return result;
    }

    eventKeyFromSpec(evtName, spec) {
        let trait = this._trait;
        if (trait) {
            trait = trait.constructor.name;
        }

        let fullSpec;
        if (spec.indexOf(".") >= 1 || !trait) {
            fullSpec = spec;
        } else if (trait) {
            fullSpec = `${trait}.${spec}`;
        }
        return [fullSpec, "_" + evtName + "_" + fullSpec];
    }

    addEventListener(evtName, spec) {
        let [fullSpec, key] = this.eventKeyFromSpec(evtName, spec);
        if (this.viewHandlers[key]) {
            console.log("most likely to be duplicate");
            this.removeEventListener(evtName, spec);
        }

        let split = fullSpec.split(".");
        let method;
        let trait;
        if (split[1]) {
            trait = split[0];
            method = split[1];
        } else {
            method = split[0];
        }
        let func = evt => {
            let cooked = evt;
            if (evt.type !== "drop" && evt.type !== "scroll") {
                cooked = this.cookEvent(evt);
            }
            this.call(trait, method, cooked);
        };

        this.viewHandlers[key] = func;
        this.dom.addEventListener(evtName, func);
    }

    removeEventListener(evtName, spec) {
        let [_fullSpec, key] = this.eventKeyFromSpec(evtName, spec);
        if (this.viewHandlers[key]) {
            this.dom.removeEventListener(evtName, this.viewHandlers[key]);
            delete this.viewHandlers[key];
        }
    }

    setKey(key) {
        this.dom.key = key;
    }

    querySelector(string) {
        if (string[0] !== "#") {return null;}
        let elem = this.dom.querySelector(string);
        if (!elem) {return null;}
        let key = elem.key;
        if (!key) {return null;}
        return window.views[key];
    }

    cookEvent(evt) {
        let target = evt.target.key;
        if (evt.type === "scroll") {
            return {target: target, type: "scroll"};
        }

        if (evt.type === "pointerover" ||
            evt.type === "pointerenter" ||
            evt.type === "pointerdown" ||
            evt.type === "pointermove" ||
            evt.type === "pointerup" ||
            evt.type === "pointercancel" ||
            evt.type === "pointerout" ||
            evt.type === "pointerleave" ||
            evt.type === "gotpointercapture" ||
            evt.type === "lostpointercapture") {

            let clientX = evt.clientX;
            let clientY = evt.clientY;
            let offsetX = evt.offsetX;
            let offsetY = evt.offsetY;

            if (evt.shiftKey) {
                evt.stopPropagation();
            }

            let result = {
                pointerId: evt.pointerId,
                buttons: evt.buttons,
                isPrimary: evt.isPrimary,
                type: evt.type, target: target, clientX, clientY,
                offsetX: offsetX, offsetY: offsetY, shiftKey: evt.shiftKey,
                stopPropagation: () => evt.stopPropagation(),
                preventDefault: () => evt.preventDefault()
            };
            if (evt.type === "wheel") {
                result.deltaX = evt.deltaX;
                result.deltaY = evt.deltaY;
            }
            return result;
        }

        if (evt.type === "mousedown" ||
            evt.type === "mousemove" || evt.type === "mouseup" ||
            evt.type === "click" || evt.type === "wheel" ||
            evt.type === "dblclick" ||
            evt.type === "touchstart" || evt.type === "touchmove" || evt.type === "touchend") {
            let theEvt = evt.touches && evt.touches[0] ? evt.touches[0] : evt;
            let clientX = theEvt.clientX;
            let clientY = theEvt.clientY;
            let offsetX = theEvt.offsetX;
            let offsetY = theEvt.offsetY;

            if (evt.shiftKey) {
                evt.stopPropagation();
            }

            let result = {
                touches: evt.touches, target: target, clientX, clientY,
                offsetX: offsetX, offsetY: offsetY,
                buttons: evt.buttons, shiftKey: evt.shiftKey,
                stopPropagation: () => evt.stopPropagation(),
                preventDefault: () => evt.preventDefault()
            };
            if (evt.type === "wheel") {
                result.deltaX = evt.deltaX;
                result.deltaY = evt.deltaY;
            }
            return result;
        }
        return {
            key: evt.key, target: target, metaKey: evt.metaKey, altKey: evt.altKey,
            ctrlKey: evt.ctrlKey, shiftKey: evt.shiftKey,
            stopPropagation: () => evt.stopPropagation(),
            preventDefault: () => evt.preventDefault()
        };
    }

    updateChildNodes(time, elem) {
        let newChildren = elem._childNodes;
        if (equal(this.lastValues["childNodes"], newChildren)) {return;}
        this.lastValues["childNodes"] = newChildren;
        let childNodes = Array.from(this.dom.childNodes);

        // let us say the simple insertion or deletion case should work simply
        let i = 0;
        let newIndex = 0;
        let toRemove = [];

        let find = (col, key, ind) => {
            for (let x = ind; x < col.length; x++) {
                let e = col[x];
                let eKey = e.asKey();
                if (key === eKey) {return x;}
            }
            return -1;
        };

        while (true) {
            if (i >= childNodes.length) {break;}
            let newC = newChildren[newIndex];
            let child = childNodes[i];
            let key = child.key;
            if (!key) {break;}
            if (newC && key === newC.asKey()) {
                newIndex++;
                i++;
                continue;
            } else {
                let maybeAfter = find(newChildren, key, newIndex);
                let maybeThere = find(newChildren, key, 0);

                if (maybeAfter < 0 && maybeThere >= 0) {
                    // when a later element is still in collection
                    // but now in front of somebody, reset all
                    break;
                }
                if (maybeAfter >= 0) {
                    newIndex = maybeAfter + 1;
                    i++;
                } else {
                    toRemove.push(child);
                    i++;
                }
            }
        }

        let isSimple = i === childNodes.length && newIndex <= newChildren.length;
        if (isSimple) {
            i = 0;
            newIndex = 0;
            while (true) {
                if (newIndex >= newChildren.length && toRemove.length === 0) {break;}
                let newC = newChildren[newIndex];
                let child = childNodes[i];
                if (!child) {
                    // we ran out children.  Only to add new ones
                    let {elementId} = newC;
                    let world = this.model.wellKnownModel("worldModel");
                    let view = topView.ensureView(new ElementRef(elementId), world);
                    if (!view.model.topChild) {
                        this.dom.appendChild(view.dom); // why doesn't requestUpdate do it?
                        view.parentNode = this;
                    } else {
                        topView.dom.appendChild(view.dom);
                    }
                    newIndex++;
                    continue;
                }
                if (toRemove.length > 0 && toRemove[0] === child) {
                    let key = child.key;
                    child.remove();
                    toRemove.shift();
                    let view = views[key];
                    if (view) {view.detach();}
                    i++;
                    continue;
                }
                if (child.key === newC.asKey()) {
                    i++;
                    newIndex++;
                    continue;
                }
            }
            return;
        }

        childNodes.forEach(c => {
            if (c._cards) {c.remove();}
        });

        newChildren.forEach(obj => {
            let {elementId} = obj;

            let world = this.model.wellKnownModel("worldModel");
            let view = topView.ensureView(new ElementRef(elementId), world);
            if (!view.model.topChild) {
                this.dom.appendChild(view.dom);
                view.parentNode = this;
            } else {
                topView.dom.appendChild(view.dom);
            }
        });
    }

    apply(time, elem, world) {
        let value;

        value = elem._domId;
        if (this.lastValues["domId"] !== value) {
            this.lastValues["domId"] = value;
            this.dom.id = value;
        }

        value = elem._classList;
        if (!equal(this.lastValues["classList"], value)) {
            this.lastValues["classList"] = value;
            let current = this.dom.classList;
            for (let i = current.length - 1; i >= 0; i--) {
                this.dom.classList.remove(current[i]);
            }
            for (let i = 0; i < value.length; i++) {
                this.dom.classList.add(value[i]);
            }
        }

        this.updateChildNodes(time, elem, world);

        value = elem._innerHTML;
        if (typeof value === "string") {
            if (this.lastValues["innerHTML"] !== value) {
                this.lastValues["innerHTML"] = value;
                this.dom.innerHTML = value;
            }
        }

        value = elem.eventListeners;
        this.addDomEventListenersFor(elem, this, value);

        let style = elem._style.get().local;
        let lastStyle = {...this.lastValues["style"]};
        let newStyle = {};

        if (style["-cards-direct-manipulation"]) {
            value = elem._style.getTransform();
            if (!equal(this.lastValues["transform"], value)) {
                this.lastValues["transform"] = value;
                let [a, b, c, d, e, f] = value;
                this.dom.style.setProperty("transform", `matrix(${a}, ${b}, ${c}, ${d}, ${e}, ${f})`);
            }
            value = elem._style.getTransformOrigin();
            if (!equal(this.lastValues["transform-origin"], value)) {
                this.lastValues["transform-origin"] = value;
                this.dom.style.setProperty("transform-origin", value);
            }

            value = style.width;
            newStyle["width"] = value;
            delete lastStyle.width;
            if (!equal(lastStyle["width"], value)) {
                if (value !== undefined) {
                    let v = typeof value === "string" ? value : value + "px";
                    this.dom.style.setProperty("width", v);
                } else {
                    this.dom.style.removeProperty("width");
                }
            }

            value = style.height;
            newStyle["height"] = value;
            delete lastStyle.height;
            if (!equal(lastStyle["height"], value)) {
                if (value !== undefined) {
                    delete lastStyle.height;
                    let v = typeof value === "string" ? value : value + "px";
                    this.dom.style.setProperty("height", v);
                } else {
                    this.dom.style.removeProperty("height");
                }
            }
        }
        Object.keys(style).forEach((k) => {
            if (style["-cards-direct-manipulation"] && (k === "width" || k === "height")) {return;}
            if (k.startsWith("-cards-")) {
                newStyle[k] = style[k];
                return;
            }
            value = style[k];
            newStyle[k] = value;
            let eq = value === lastStyle[k];
            delete lastStyle[k];
            if (!eq) {
                this.dom.style.setProperty(k, value);
            }
        });

        // these lines that is here only for the first authoring system should not be here.
        let target = world._get("target");
        if (target && target.elementId === elem.elementId) {
            newStyle["background-color"] = "#9CC6E7";
            this.dom.style.setProperty("background-color", "#9CC6E7");
        }

        let key = "-cards-background-image-asset";
        if (!equal(lastStyle[key], style[key])) {
            let asset = style[key];
            newStyle[key] = style[key];
            Croquet.Data.fetch(this.sessionId, asset.handle).then((data) => {
                const blob = new Blob([data], {type: asset.type});
                if (this._objectURL) {
                    URL.revokeObjectURL(this._objectURL);
                }
                this._objectURL = URL.createObjectURL(blob);
                this.dom.style.setProperty("background-image", `url(${this._objectURL}`);
            });
        }

        this.lastValues["style"] = newStyle;
        for (let lastKey in lastStyle) {
            this.dom.style.removeProperty(lastKey);
        }

        let classes = elem._style.get().classes;
        if (this.lastValues["classes"] !== classes) {
            this.lastValues["classes"] = classes;

            let id = shortId(this.elementId);
            removeStyle(id);
            if (classes) {
                let e = document.createElement("style");
                e.innerHTML = classes;
                e.id = `style${id}`;
                document.body.appendChild(e);
            }
        }

        value = elem.viewCode;
        if (!equal(this.lastValues["viewCode"], value)) {
            this.lastValues["viewCode"] = value;
            this.addViewCode(elem, this, value);
        }
    }

    addDomEventListenersFor(elem, view, listeners) {
        let elementId = elem.elementId;
        let toRemove = {...this.eventListeners};

        for (let k in listeners) {
            let obj = listeners[k];
            let spec = obj.spec;
            let useCapture = obj.useCapture;

            if (this.eventListeners[k] && this.eventListeners[k].spec === spec &&
                this.eventListeners[k].useCapture === useCapture) {
                delete toRemove[k];
                continue;
            }

            let trait, method;
            let split = spec.split(".");
            if (split.length > 1) {
                trait = split[0];
                method = split[1];
            } else {
                method = spec;
            }

            if (this.eventListeners[k] && (this.eventListeners[k].spec !== spec ||
                                           this.eventListeners[k].useCapture !== useCapture))  {
                view.dom.removeEventListener(k, this.eventListeners[k].func);
                delete this.eventListeners[k];
            }

            let func = evt => {
                evt.preventDefault();
                let cooked = this.cookEvent(evt);
                let world = elem.getWorldState();
                let modelId = elem.getElement(world.elementId).id;
                // ouch
                delete cooked.stopPropagation;
                delete cooked.preventDefault;
                this.publish(modelId, "domEvent", {elementId, evt: cooked, trait, method});
            };

            this.eventListeners[k] = {func, spec, useCapture};
            view.dom.addEventListener(k, func, useCapture);
            delete toRemove[k];
        }

        for (let k in toRemove) {
            view.dom.removeEventListener(k, this.eventListeners[k].func);
            delete this.eventListeners[k];
        }
    }

    addViewCode(elem, view, array) {
        let myHandler = this.viewHandlers;
        Object.keys(myHandler).forEach((k) => {
            if (myHandler[k] && myHandler["_" + k]) {
                delete myHandler[k];
                delete myHandler["_" + k];
            }
        });

        array.forEach((str) => {
            let trimmed = str.trim();
            let source;
            if (trimmed.length === 0) {return;}
            if (/^class[ \t]/.test(trimmed)) {
                source = trimmed;
            } else {
                source = this.model.getLibrary(trimmed);
            }

            if (!source) {
                console.log(`code specified as ${trimmed} is empty for`, this);
            }

            let code = `let x = ${source}; return x;`;
            let cls = new Function(code)();
            if (typeof cls !== "function") {
                console.log("error occured while compiling");
                return;
            }

            let name = cls.name;
            myHandler[name] = cls.prototype;
            myHandler["_" + name] = cls;
            if (cls.prototype.init) {
                initers[this.id + "." + name] = [this, name];
            }
        });
    }

    // this is experimental to see when we'd need to add publish domain dynamically
    publishToAll(data) {
        let listeners = this.model.listeners;
        listeners.forEach(entry => {
            this.publish(entry.scope || this.model.sessionId, entry.event, data);
        });
    }

    addDomain(scope, event) {
        let old = this.model.listeners;
        if (old.findIndex(e => e.scope === scope &&
                          e.event === event) >= 0) {
            return;
        }
        let newArray = old.slice();
        newArray.push({scope, event});
        this.listeners = newArray;
    }

    setPointerCapture(pointerId) {
        window.topView.grabber.capturePointer(pointerId, this.dom);
    }

    releasePointerCapture(pointerId) {
        window.topView.grabber.releasePointer(pointerId, this.dom);
    }

    releaseAllPointerCapture() {
        window.topView.grabber.releasePointer();
    }
}

class GlobalPointerGrabber {
    // only one instance and always attached to the TopView
    constructor() {
        this.move = null;
        this.up = null;
        this.target = null; // null, or string with a dot in the middle
        this.forTouch = false;
        this.pointerCaptureMap = new Map();
    }

    grab(view, moveFuncOrSpec, upFuncOrSpec, forTouch) {
        // console.log("grab", { view, moveFuncOrSpec, upFuncOrSpec});
        let removeListeners = () => {
            window.removeEventListener("mousemove", this.move, true);
            window.removeEventListener("mouseup", this.up);
            window.ondragstart = null;
            if (this.forTouch) {
                topView.dom.removeEventListener("touchmove", this.move, true);
                topView.dom.removeEventListener("touchend", this.up, true);
            }
        };

        if (this.up) {
            console.error("new grab with previous still defined");
            removeListeners();
        }

        let moveFunc;
        let upFunc;
        this.target = view.dom.key;
        this.forTouch = forTouch;

        if (typeof moveFuncOrSpec === "function") {
            moveFunc = moveFuncOrSpec;
        } else {
            let split = moveFuncOrSpec.split(".");
            moveFunc = (evt) => view.call(split[0], split[1], evt);
        }
        this.move = (evt) => {
            // note: in many of the grab cases we have so far, it's useful *not*
            // to prevent propagation of the move events - e.g., so that the scaler
            // will report pointer position during the drag.  callers wanting to
            // stop propagation can do so in their move function.
            moveFunc(evt);
        };

        if (typeof upFuncOrSpec === "function") {
            upFunc = upFuncOrSpec;
        } else {
            let split = upFuncOrSpec.split(".");
            upFunc = (evt) => view.call(split[0], split[1], evt);
        }
        this.up = (evt) => {
            evt.preventDefault();
            evt.stopPropagation();

            removeListeners();

            this.move = null;
            this.up = null;
            this.target = null;
            this.forTouch = false;

            upFunc(evt);
        };

        // see https://coderwall.com/p/79hkbw/js-mouse-events-that-work-even-when-mouse-is-moved-outside-the-window
        window.addEventListener("mousemove", this.move, true);
        window.addEventListener("mouseup", this.up);

        // on Chrome, at least, some drags outside the window can spuriously
        // start a drag event (with no contents).  catch and disable it.
        window.ondragstart = evt => {
            console.log("canceling spurious drag event");
            evt.preventDefault();
            evt.stopPropagation();
        };

        if (forTouch) {
            topView.dom.addEventListener("touchmove", this.move, true);
            topView.dom.addEventListener("touchend", this.up, true);
        }
    }

    capturePointer(pointerId, dom) {
        if (dom.setPointerCapture) {
            dom.setPointerCapture(pointerId);
            this.pointerCaptureMap.set(pointerId, dom);
        }
    }

    releasePointer(pointerId, maybeDom) {
        if (pointerId !== undefined) {
            let dom = this.pointerCaptureMap.get(pointerId);
            if (maybeDom !== dom) {console.log("inconsistent capture");}
            dom.releasePointerCapture(pointerId);
            this.pointerCaptureMap.delete(pointerId);
            return;
        }

        this.pointerCaptureMap.forEach((dom, k) => {
            dom.releasePointerCapture(k);
        });
        this.pointerCaptureMap.clear();
    }
}

export function start(sessionName = "elem", modelClass, viewClass, parameters = {}) {
    if (!parameters.options) parameters.options = {};
    parameters.options.sessionName = sessionName;
    parameters.options.appId = parameters.appId;

    return createSession(sessionName, modelClass || TopModel, viewClass || TopView, parameters);
}

export function setKnownElements(obj) {
    Element.knownElements = obj;
}

export function setFontLastLoadedTimeFunction(func) {
    setFontLastLoadedTime = func;
}
