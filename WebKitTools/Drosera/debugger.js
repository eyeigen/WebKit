/*
 * Copyright (C) 2006 Apple Computer, Inc.  All rights reserved.
 * Copyright (C) 2006 David Smith (catfish.man@gmail.com)
 * Copyright (C) 2006 Vladimir Olexa (vladimir.olexa@gmail.com)
 *
 * Redistribution and use in source and binary forms, with or without
 * modification, are permitted provided that the following conditions
 * are met:
 *
 * 1.  Redistributions of source code must retain the above copyright
 *     notice, this list of conditions and the following disclaimer. 
 * 2.  Redistributions in binary form must reproduce the above copyright
 *     notice, this list of conditions and the following disclaimer in the
 *     documentation and/or other materials provided with the distribution. 
 * 3.  Neither the name of Apple Computer, Inc. ("Apple") nor the names of
 *     its contributors may be used to endorse or promote products derived
 *     from this software without specific prior written permission. 
 *
 * THIS SOFTWARE IS PROVIDED BY APPLE AND ITS CONTRIBUTORS "AS IS" AND ANY
 * EXPRESS OR IMPLIED WARRANTIES, INCLUDING, BUT NOT LIMITED TO, THE IMPLIED
 * WARRANTIES OF MERCHANTABILITY AND FITNESS FOR A PARTICULAR PURPOSE ARE
 * DISCLAIMED. IN NO EVENT SHALL APPLE OR ITS CONTRIBUTORS BE LIABLE FOR ANY
 * DIRECT, INDIRECT, INCIDENTAL, SPECIAL, EXEMPLARY, OR CONSEQUENTIAL DAMAGES
 * (INCLUDING, BUT NOT LIMITED TO, PROCUREMENT OF SUBSTITUTE GOODS OR SERVICES;
 * LOSS OF USE, DATA, OR PROFITS; OR BUSINESS INTERRUPTION) HOWEVER CAUSED AND
 * ON ANY THEORY OF LIABILITY, WHETHER IN CONTRACT, STRICT LIABILITY, OR TORT
 * (INCLUDING NEGLIGENCE OR OTHERWISE) ARISING IN ANY WAY OUT OF THE USE OF
 * THIS SOFTWARE, EVEN IF ADVISED OF THE POSSIBILITY OF SUCH DAMAGE.
 */

var files = new Array();
var filesLookup = new Object();
var scripts = new Array();
var currentFile = -1;
var currentRow = null;
var currentStack = null;
var currentCallFrame = null;
var lastStatement = null;
var frameLineNumberStack = new Array();
var previousFiles = new Array();
var nextFiles = new Array();
var isResizingColumn = false;
var draggingBreakpoint = null;
var steppingOut = false;
var steppingOver = false;
var steppingStack = 0;
var pauseOnNextStatement = false;
var pausedWhileLeavingFrame = false;
var consoleWindow = null;
var enabledBreakpoint = "break";
var breakpointEditorHTML = '<div class="top">Edit Breakpoint:<label><input type="checkbox" onclick="window.parent.toggleBreakpointForEditor(this.parentNode.parentNode.parentNode)"></input>Enable</label><button class="save" onclick="window.parent.saveBreakpointForEditor(this.parentNode.parentNode)">Save</button></div><div class="bottom"><label for="editorCondition">Condition:</label><div class="condition"></div></div>';
var pendingAction = null;

ScriptCallFrame = function (functionName, index, row)
{
    this.functionName = functionName;
    this.index = index;
    this.row = row;
    this.localVariableNames = null;
}

ScriptCallFrame.prototype.valueForScopeVariable = function (name)
{
    return DebuggerDocument.valueForScopeVariableNamed_inCallFrame_(name, this.index);
}

ScriptCallFrame.prototype.loadVariables = function ()
{
    if (!this.localVariableNames)
        this.localVariableNames = DebuggerDocument.localScopeVariableNamesForCallFrame_(this.index);

    var variablesTable = document.getElementById("variablesTable");
    variablesTable.innerHTML = "";

    for(var i = 0; i < this.localVariableNames.length; i++) {
        var tr = document.createElement("tr");
        var td = document.createElement("td");
        td.innerText = this.localVariableNames[i];
        td.className = "variable";
        tr.appendChild(td);

        td = document.createElement("td");
        td.innerText = this.valueForScopeVariable(this.localVariableNames[i]);
        tr.appendChild(td);
        tr.addEventListener("click", selectVariable, true);

        variablesTable.appendChild(tr);
    }
}

function sleep(numberMillis) {
    var now = new Date();
    var exitTime = now.getTime() + numberMillis;
    while (true) {
        now = new Date();
        if (now.getTime() > exitTime)
            return;
    }
}

function headerMouseDown(element) {
    if (!isResizingColumn) 
        element.style.background = "url(glossyHeaderPressed.png) repeat-x";
}

function headerMouseUp(element) {
    element.style.background = "url(glossyHeader.png) repeat-x";
}

function headerMouseOut(element) {
    element.style.background = "url(glossyHeader.png) repeat-x";
}

function filesDividerDragStart(event) 
{
    dividerDragStart(document.getElementById("filesDivider"), filesDividerDrag, filesDividerDragEnd, event, "col-resize");
}

function filesDividerDragEnd(event) 
{
    dividerDragEnd(document.getElementById("filesDivider"), filesDividerDrag, filesDividerDragEnd, event);
}

function filesDividerDrag(event) 
{
    var element = document.getElementById("filesDivider");
    if (document.getElementById("filesDivider").dragging == true) {
        var masterMain = document.getElementById("masterMain");
        var main = document.getElementById("main");
        var fileBrowser = document.getElementById("fileBrowser");
        var x = event.clientX + window.scrollX;
        var delta = element.dragLastX - x;
        var newWidth = constrainedWidthFromElement(fileBrowser.clientWidth - delta, masterMain, 0.1, 0.9);
        if ((fileBrowser.clientWidth - delta) == newWidth) // the width wasn't constrained
            element.dragLastX = x;
        fileBrowser.style.width = newWidth + "px";
        main.style.left = newWidth + "px";
        event.preventDefault();
    }
}

function dividerDragStart(element, dividerDrag, dividerDragEnd, event, cursor) {
    element.dragging = true;
    element.dragLastY = event.clientY + window.scrollY;
    element.dragLastX = event.clientX + window.scrollX;
    document.addEventListener("mousemove", dividerDrag, true);
    document.addEventListener("mouseup", dividerDragEnd, true);
    document.body.style.cursor = cursor;
    event.preventDefault();
}

function dividerDragEnd(element, dividerDrag, dividerDragEnd, event) {
    element.dragging = false;
    document.removeEventListener("mousemove", dividerDrag, true);
    document.removeEventListener("mouseup", dividerDragEnd, true);
    document.body.style.cursor = null;
}

function dividerDrag(event) {
    var element = document.getElementById("divider");
    if (document.getElementById("divider").dragging == true) {
        var main = document.getElementById("main");
        var top = document.getElementById("info");
        var bottom = document.getElementById("body");
        var y = event.clientY + window.scrollY;
        var delta = element.dragLastY - y;
        var newHeight = constrainedHeightFromElement(top.clientHeight - delta, main);
        if ((top.clientHeight - delta) == newHeight) // the height wasn't constrained
            element.dragLastY = y;
        top.style.height = newHeight + "px";
        bottom.style.top = newHeight + "px";
        event.preventDefault();
    }
}

function sourceDividerDragStart(event) {
    dividerDragStart(document.getElementById("divider"), dividerDrag, sourceDividerDragEnd, event, "row-resize");
}

function sourceDividerDragEnd(event) {
    dividerDragEnd(document.getElementById("divider"), dividerDrag, sourceDividerDragEnd, event);
}

function infoDividerDragStart(event) {
    dividerDragStart(document.getElementById("infoDivider"), infoDividerDrag, infoDividerDragEnd, event, "col-resize");
}

function infoDividerDragEnd(event) {
    dividerDragEnd(document.getElementById("infoDivider"), infoDividerDrag, infoDividerDragEnd, event);
}

function infoDividerDrag(event) {
    var element = document.getElementById("infoDivider");
    if (document.getElementById("infoDivider").dragging == true) {
        var main = document.getElementById("main");
        var leftPane = document.getElementById("leftPane");
        var rightPane = document.getElementById("rightPane");
        var x = event.clientX + window.scrollX;
        var delta = element.dragLastX - x;
        var newWidth = constrainedWidthFromElement(leftPane.clientWidth - delta, main);
        if ((leftPane.clientWidth - delta) == newWidth) // the width wasn't constrained
            element.dragLastX = x;
        leftPane.style.width = newWidth + "px";
        rightPane.style.left = newWidth + "px";
        event.preventDefault();
    }
}

function columnResizerDragStart(event) {
    isResizingColumn = true;
    dividerDragStart(document.getElementById("variableColumnResizer"), columnResizerDrag, columnResizerDragEnd, event, "col-resize");
}

function columnResizerDragEnd(event) {
    isResizingColumn = false;
    dividerDragEnd(document.getElementById("variableColumnResizer"), columnResizerDrag, columnResizerDragEnd, event);
}

function columnResizerDrag(event) {
    var element = document.getElementById("variableColumnResizer");
    if (element.dragging == true) {
        var main = document.getElementById("rightPane");
        var variableColumn = document.getElementById("variable");
        var rules = document.defaultView.getMatchedCSSRules(variableColumn, "");
        for (var i = 0; i < rules.length; i++) {
            if (rules[i].selectorText == ".variable") {
                var columnRule = rules[i];
                break;
            }
        }

        var x = event.clientX + window.scrollX;
        var delta = element.dragLastX - x;
        var newWidth = constrainedWidthFromElement(variableColumn.clientWidth - delta, main);
        if ((variableColumn.clientWidth - delta) == newWidth) // the width wasn't constrained
            element.dragLastX = x;
        columnRule.style.width = newWidth + "px";
        element.style.left = newWidth + "px";
        event.preventDefault();
    }
}

function constrainedWidthFromElement(width, element, constrainLeft, constrainRight) {
    if (constrainLeft === undefined) constrainLeft = 0.25;
    if (constrainRight === undefined) constrainRight = 0.75;
    
    if (width < element.clientWidth * constrainLeft)
        width = element.clientWidth * constrainLeft;
    else if (width > element.clientWidth * constrainRight)
        width = element.clientWidth * constrainRight;
    return width;
}

function constrainedHeightFromElement(height, element) {
    if (height < element.clientHeight * 0.25)
        height = element.clientHeight * 0.25;
    else if (height > element.clientHeight * 0.75)
        height = element.clientHeight * 0.75;
    return height;
}

function loaded() {
    document.getElementById("divider").addEventListener("mousedown", sourceDividerDragStart, false);
    document.getElementById("infoDivider").addEventListener("mousedown", infoDividerDragStart, false);
    document.getElementById("filesDivider").addEventListener("mousedown", filesDividerDragStart, false);
    document.getElementById("variableColumnResizer").addEventListener("mousedown", columnResizerDragStart, false);
}

function isPaused() {
    return DebuggerDocument.isPaused();
}

function pause() {
    DebuggerDocument.pause();
}

function resume()
{
    if (currentRow) {
        currentRow.removeStyleClass("current");
        currentRow = null;
    }

    var stackframeTable = document.getElementById("stackframeTable");
    stackframeTable.innerHTML = ""; // clear the content
    var variablesTable = document.getElementById("variablesTable");
    variablesTable.innerHTML = ""; // clear the content
    currentStack = null;
    currentCallFrame = null;

    pauseOnNextStatement = false;
    pausedWhileLeavingFrame = false;
    steppingOut = false;
    steppingOver = false;
    steppingStack = 0;

    DebuggerDocument.resume();
}

function stepInto()
{
    pauseOnNextStatement = false;
    steppingOut = false;
    steppingOver = false;
    steppingStack = 0;
    DebuggerDocument.stepInto();
}

function stepOver()
{
    pauseOnNextStatement = false;
    steppingOver = true;
    steppingStack = 0;
    DebuggerDocument.resume();
}

function stepOut()
{
    pauseOnNextStatement = pausedWhileLeavingFrame;
    steppingOver = false;
    steppingStack = 0;
    steppingOut = true;
    DebuggerDocument.resume();
}

Element.prototype.removeStyleClass = function(className) {
    if (this.hasStyleClass(className))
        this.className = this.className.replace(className, "");
}

Element.prototype.addStyleClass = function(className) {
    if (!this.hasStyleClass(className))
        this.className += (this.className.length ? " " + className : className);
}

Element.prototype.hasStyleClass = function(className) {
    return this.className.indexOf(className) != -1;
}

function breakpointAction(event)
{
    var row = event.target.parentNode;
    var file = files[currentFile];
    var lineNum = parseInt(event.target.title);
    
    if (row.hasStyleClass("breakpoint")) {
        if (!pendingAction)
            pendingAction = setTimeout(toggleBreakpoint, DebuggerDocument.doubleClickMilliseconds(), row, file, lineNum);  
    } else
        createBreakpoint(row, file, lineNum);
}

function createBreakpoint(row, file, lineNum)
{
    row.addStyleClass("breakpoint");
    row.removeStyleClass("disabled");
    file.breakpoints[lineNum] = enabledBreakpoint;
    file.disabledBreakpoints[lineNum] = null;
}

function toggleBreakpointEditor(event)
{
    if (pendingAction) {
        clearTimeout(pendingAction);
        pendingAction = null;
    }
    var row = event.target.parentNode;
    var file = files[currentFile];
    var lineNum = parseInt(event.target.title);
    if (row.hasStyleClass("breakpoint")) {
        var editor = file.breakpointEditors[lineNum];
        if (!editor) {
            var sourcesDocument = document.getElementById("sources").contentDocument;
            editor = sourcesDocument.createElement("div");
            editor.className = "editor";
            editor.id = lineNum;
            editor.innerHTML = breakpointEditorHTML;

            // set the enabled checkbox to the correct state
            editor.getElementsByTagName("input")[0].checked = !row.hasStyleClass("disabled");
            
            // set the condition field to reflect the breakpoint
            setConditionFieldText(editor, lineNum);
            
            row.childNodes[1].appendChild(editor);
            file.breakpointEditors[lineNum] = editor; 
        } else {
            row.childNodes[1].removeChild(editor);
            file.breakpointEditors[lineNum] = null;
        }
    }
}

function setConditionFieldText(editor, lineNum)
{
    var conditionField = editor.childNodes[1].childNodes[1];
    var functionBody = files[currentFile].breakpoints[lineNum];
    if (!functionBody || functionBody == "break")
        functionBody = "";
    else {
        var startIndex = functionBody.indexOf("{") + 1;
        var endIndex = functionBody.lastIndexOf("}");
        functionBody = functionBody.substring(startIndex, endIndex);
    }
    conditionField.innerText = functionBody;
}

function toggleBreakpointForEditor(editor)
{
    var file = files[currentFile];
    var lineNum = parseInt(editor.id);
    row = file.element.firstChild.childNodes.item(lineNum - 1);
    toggleBreakpoint(row, file, lineNum);
}

function saveBreakpointForEditor(editor)
{
    var file = files[currentFile];
    var lineNum = parseInt(editor.id);
    row = file.element.firstChild.childNodes.item(lineNum - 1);
    file.breakpoints[lineNum] = "__drosera_breakpoint_conditional_func = function() { " + editor.childNodes[1].childNodes[1].innerText + " }; __drosera_breakpoint_conditional_func();";
    row.childNodes[1].removeChild(editor);
    file.breakpointEditors[lineNum] = null;
}

function toggleBreakpoint(row, file, lineNum)
{
    pendingAction = null;
    if (row.hasStyleClass("disabled"))
        row.removeStyleClass("disabled");    
    else
        row.addStyleClass("disabled");
    
    var hack = row.offsetTop; // force a relayout if needed.
    
    var temp = file.breakpoints[lineNum];
    file.breakpoints[lineNum] = file.disabledBreakpoints[lineNum];
    file.disabledBreakpoints[lineNum] = temp;
    var editor = file.breakpointEditors[lineNum];
    if (editor) {
        editor.childNodes[0].childNodes[1].childNodes[0].checked = !row.hasStyleClass("disabled");
        setConditionFieldText(editor, lineNum);
    }
}

function moveBreakPoint(event)
{
    if (event.target.parentNode.hasStyleClass("breakpoint")) {
        draggingBreakpoint = event.target;
        draggingBreakpoint.started = false;
        draggingBreakpoint.dragLastY = event.clientY + window.scrollY;
        draggingBreakpoint.dragLastX = event.clientX + window.scrollX;
        var sourcesDocument = document.getElementById("sources").contentDocument;
        sourcesDocument.addEventListener("mousemove", breakpointDrag, true);
        sourcesDocument.addEventListener("mouseup", breakpointDragEnd, true);
        sourcesDocument.body.style.cursor = "default";
    }
}

function breakpointDrag(event)
{
    var sourcesDocument = document.getElementById("sources").contentDocument;
    if (!draggingBreakpoint) {
        sourcesDocument.removeEventListener("mousemove", breakpointDrag, true);
        sourcesDocument.removeEventListener("mouseup", breakpointDragEnd, true);
        sourcesDocument.body.style.cursor = null;
        return;
    }

    var x = event.clientX + window.scrollX;
    var y = event.clientY + window.scrollY;
    var deltaX = draggingBreakpoint.dragLastX - x;
    var deltaY = draggingBreakpoint.dragLastY - y;
    if (draggingBreakpoint.started || deltaX > 4 || deltaY > 4 || deltaX < -4 || deltaY < -4) {
    
        if (!draggingBreakpoint.started) {
            var node = draggingBreakpoint.parentNode;
            draggingBreakpoint.isDisabled = node.hasStyleClass("disabled");
            node.removeStyleClass("breakpoint");
            node.removeStyleClass("disabled");
            
            var lineNum = parseInt(draggingBreakpoint.title);
            var file = files[currentFile];
            
            var editor = file.breakpointEditors[lineNum];
            if (editor) {
                node.childNodes[1].removeChild(editor);
                file.breakpointEditors[lineNum] = null;
            }
            
            draggingBreakpoint.started = true;
                        
            if (draggingBreakpoint.isDisabled)
                draggingBreakpoint.breakFunction = files[currentFile].disabledBreakpoints[lineNum];
            else
                draggingBreakpoint.breakFunction = files[currentFile].breakpoints[lineNum];
            file.breakpoints[lineNum] = null;
            file.disabledBreakpoints[lineNum] = null;

            var dragImage = sourcesDocument.createElement("img");
            if (draggingBreakpoint.isDisabled)
                dragImage.src = "breakPointDisabled.tif";
            else
                dragImage.src = "breakPoint.tif";
            dragImage.id = "breakpointDrag";
            dragImage.style.top = y - 8 + "px";
            dragImage.style.left = x - 12 + "px";
            sourcesDocument.body.appendChild(dragImage);
        } else {
            var dragImage = sourcesDocument.getElementById("breakpointDrag");
            if (!dragImage) {
                sourcesDocument.removeEventListener("mousemove", breakpointDrag, true);
                sourcesDocument.removeEventListener("mouseup", breakpointDragEnd, true);
                sourcesDocument.body.style.cursor = null;
                return;
            }

            dragImage.style.top = y - 8 + "px";
            dragImage.style.left = x - 12 + "px";
            if (x > 40)
                dragImage.style.visibility = "hidden";
            else
                dragImage.style.visibility = null;
        }

        draggingBreakpoint.dragLastX = x;
        draggingBreakpoint.dragLastY = y;
    }
}

function breakpointDragEnd(event)
{
    var sourcesDocument = document.getElementById("sources").contentDocument;
    sourcesDocument.removeEventListener("mousemove", breakpointDrag, true);
    sourcesDocument.removeEventListener("mouseup", breakpointDragEnd, true);
    sourcesDocument.body.style.cursor = null;

    var dragImage = sourcesDocument.getElementById("breakpointDrag");
    if (!dragImage)
        return;
        
    dragImage.parentNode.removeChild(dragImage);

    var x = event.clientX + window.scrollX;
    if (x > 40 || !draggingBreakpoint)
        return;

    var y = event.clientY + window.scrollY;
    var rowHeight = draggingBreakpoint.parentNode.offsetHeight;
    var row = Math.ceil(y / rowHeight);
    if (row <= 0)
        row = 1;

    var file = files[currentFile];
    var table = file.element.firstChild;
    if (row > table.childNodes.length)
        return;

    var tr = table.childNodes.item(row - 1);
    if (!tr)
        return;
        
    if (draggingBreakpoint.isDisabled) {
        tr.addStyleClass("disabled");
        file.disabledBreakpoints[row] = draggingBreakpoint.breakFunction;
        file.breakpoints[row] = null;
    } else {
        file.disabledBreakpoints[row] = null;
        file.breakpoints[row] = draggingBreakpoint.breakFunction;
    }

    tr.addStyleClass("breakpoint");
    
    draggingBreakpoint = null;
}

function totalOffsetTop(element, stop)
{
    var currentTop = 0;
    while (element.offsetParent) {
        currentTop += element.offsetTop
        element = element.offsetParent;
        if (element == stop)
            break;
    }
    return currentTop;
}

function switchFile()
{
    var filesSelect = document.getElementById("files");
    fileClicked(filesSelect.options[filesSelect.selectedIndex].value, false);
    loadFile(filesSelect.options[filesSelect.selectedIndex].value, true);
}

function syntaxHighlight(code)
{
    var keywords = { 'abstract': 1, 'boolean': 1, 'break': 1, 'byte': 1, 'case': 1, 'catch': 1, 'char': 1, 'class': 1, 'const': 1, 'continue': 1, 'debugger': 1, 'default': 1, 'delete': 1, 'do': 1, 'double': 1, 'else': 1, 'enum': 1, 'export': 1, 'extends': 1, 'false': 1, 'final': 1, 'finally': 1, 'float': 1, 'for': 1, 'function': 1, 'goto': 1, 'if': 1, 'implements': 1, 'import': 1, 'in': 1, 'instanceof': 1, 'int': 1, 'interface': 1, 'long': 1, 'native': 1, 'new': 1, 'null': 1, 'package': 1, 'private': 1, 'protected': 1, 'public': 1, 'return': 1, 'short': 1, 'static': 1, 'super': 1, 'switch': 1, 'synchronized': 1, 'this': 1, 'throw': 1, 'throws': 1, 'transient': 1, 'true': 1, 'try': 1, 'typeof': 1, 'var': 1, 'void': 1, 'volatile': 1, 'while': 1, 'with': 1 };

    function echoChar(c) {
        if (c == '<')
            result += '&lt;';
        else if (c == '>')
            result += '&gt;';
        else if (c == '&')
            result += '&amp;';
        else if (c == '\t')
            result += '    ';
        else
            result += c;
    }

    function isDigit(number) {
        var string = "1234567890";
        if (string.indexOf(number) != -1)
            return true;
        return false;
    }

    function isHex(hex) {
        var string = "1234567890abcdefABCDEF";
        if (string.indexOf(hex) != -1)
            return true;
        return false;
    }

    function isLetter(letter) {
        var string = "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ";
        if (string.indexOf(letter) != -1)
            return true;
        return false;
    }

    var result = "";
    var cPrev = "";
    var c = "";
    var cNext = "";
    for (var i = 0; i < code.length; i++) {
        cPrev = c;
        c = code.charAt(i);
        cNext = code.charAt(i + 1);

        if (c == "/" && cNext == "*") {
            result += "<span class=\"comment\">";
            echoChar(c);
            echoChar(cNext);
            for (i += 2; i < code.length; i++) {
                c = code.charAt(i);
                if (c == "\n")
                    result += "</span>";
                echoChar(c);
                if (c == "\n")
                    result += "<span class=\"comment\">";
                if (cPrev == "*" && c == "/")
                    break;
                cPrev = c;
            }
            result += "</span>";
            continue;
        } else if (c == "/" && cNext == "/") {
            result += "<span class=\"comment\">";
            echoChar(c);
            echoChar(cNext);
            for (i += 2; i < code.length; i++) {
                c = code.charAt(i);
                if (c == "\n")
                    break;
                echoChar(c);
            }
            result += "</span>";
            echoChar(c);
            continue;
        } else if (c == "\"" || c == "'") {
            var instringtype = c;
            var stringstart = i;
            result += "<span class=\"string\">";
            echoChar(c);
            for (i += 1; i < code.length; i++) {
                c = code.charAt(i);
                if (stringstart < (i - 1) && cPrev == instringtype && code.charAt(i - 2) != "\\")
                    break;
                echoChar(c);
                cPrev = c;
            }
            result += "</span>";
            echoChar(c);
            continue;
        } else if (c == "0" && cNext == "x" && (i == 0 || (!isLetter(cPrev) && !isDigit(cPrev)))) {
            result += "<span class=\"number\">";
            echoChar(c);
            echoChar(cNext);
            for (i += 2; i < code.length; i++) {
                c = code.charAt(i);
                if (!isHex(c))
                    break;
                echoChar(c);
            }
            result += "</span>";
            echoChar(c);
            continue;
        } else if ((isDigit(c) || ((c == "-" || c == ".") && isDigit(cNext))) && (i == 0 || (!isLetter(cPrev) && !isDigit(cPrev)))) {
            result += "<span class=\"number\">";
            echoChar(c);
            for (i += 1; i < code.length; i++) {
                c = code.charAt(i);
                if (!isDigit(c) && c != ".")
                    break;
                echoChar(c);
            }
            result += "</span>";
            echoChar(c);
            continue;
        } else if (isLetter(c) && (i == 0 || !isLetter(cPrev))) {
            var keyword = c;
            var cj = "";
            for (var j = i + 1; j < i + 12 && j < code.length; j++) {
                cj = code.charAt(j);
                if (!isLetter(cj))
                    break;
                keyword += cj;
            }

            if (keywords[keyword]) {
                result += "<span class=\"keyword\">" + keyword + "</span>";
                i += keyword.length - 1;
                continue;
            }
        }

        echoChar(c);
    }

    return result;
}

function navFilePrevious(element)
{
    if (element.disabled)
        return;
    var lastFile = previousFiles.pop();
    if (currentFile != -1)
        nextFiles.unshift(currentFile);
    loadFile(lastFile, false);
}

function navFileNext(element)
{
    if (element.disabled)
        return;
    var lastFile = nextFiles.shift();
    if (currentFile != -1)
        previousFiles.push(currentFile);
    loadFile(lastFile, false);
}

function updateFunctionStack()
{
    var stackframeTable = document.getElementById("stackframeTable");
    stackframeTable.innerHTML = ""; // clear the content

    currentStack = new Array();
    var stack = DebuggerDocument.currentFunctionStack();
    for(var i = 0; i < stack.length; i++) {
        var tr = document.createElement("tr");
        var td = document.createElement("td");
        td.className = "stackNumber";
        td.innerText = i;
        tr.appendChild(td);

        td = document.createElement("td");
        td.innerText = stack[i];
        tr.appendChild(td);
        tr.addEventListener("click", selectStackFrame, true);

        stackframeTable.appendChild(tr);

        var frame = new ScriptCallFrame(stack[i], i, tr);
        tr.callFrame = frame;
        currentStack.push(frame);

        if (i == 0) {
            tr.addStyleClass("current");
            frame.loadVariables();
            currentCallFrame = frame;
        }
    }
}

function selectStackFrame(event)
{
    var stackframeTable = document.getElementById("stackframeTable");
    var rows = stackframeTable.childNodes;
    for (var i = 0; i < rows.length; i++)
        rows[i].removeStyleClass("current");
    this.addStyleClass("current");
    this.callFrame.loadVariables();
    currentCallFrame = this.callFrame;

    if (frameLineNumberInfo = frameLineNumberStack[this.callFrame.index - 1])
        jumpToLine(frameLineNumberInfo[0], frameLineNumberInfo[1]);
    else if (this.callFrame.index == 0)
        jumpToLine(lastStatement[0], lastStatement[1]);
}

function selectVariable(event)
{
    var variablesTable = document.getElementById("variablesTable");
    var rows = variablesTable.childNodes;
    for (var i = 0; i < rows.length; i++)
        rows[i].removeStyleClass("current");
    this.addStyleClass("current");
}

function loadFile(fileIndex, manageNavLists)
{
    var file = files[fileIndex];
    if (!file)
        return;

    if (currentFile != -1 && files[currentFile] && files[currentFile].element)
        files[currentFile].element.style.display = "none";

    if (!file.loaded) {
        var sourcesDocument = document.getElementById("sources").contentDocument;
        var sourcesDiv = sourcesDocument.body;
        var sourceDiv = sourcesDocument.createElement("div");
        sourceDiv.id = "file" + fileIndex;
        sourcesDiv.appendChild(sourceDiv);
        file.element = sourceDiv;

        var table = sourcesDocument.createElement("table");
        sourceDiv.appendChild(table);

        var normalizedSource = file.source.replace(/\r\n|\r/, "\n"); // normalize line endings
        var lines = syntaxHighlight(normalizedSource).split("\n");
        for( var i = 0; i < lines.length; i++ ) {
            var tr = sourcesDocument.createElement("tr");
            var td = sourcesDocument.createElement("td");
            td.className = "gutter";
            td.title = (i + 1);
            td.addEventListener("click", breakpointAction, true);
            td.addEventListener("dblclick", toggleBreakpointEditor, true);
            td.addEventListener("mousedown", moveBreakPoint, true);
            tr.appendChild(td);

            td = sourcesDocument.createElement("td");
            td.className = "source";
            td.innerHTML = (lines[i].length ? lines[i] : "&nbsp;");
            tr.appendChild(td);
            table.appendChild(tr);
        }

        file.loaded = true;
    }

    file.element.style.display = null;

    document.getElementById("filesPopupButtonContent").innerText = (file.url ? file.url : "(unknown script)");
    
    var filesSelect = document.getElementById("files");
    for (var i = 0; i < filesSelect.childNodes.length; i++) {
        if (filesSelect.childNodes[i].value == fileIndex) {
            filesSelect.selectedIndex = i;
            break;
        }
    }
    
    
    if (manageNavLists) {
        nextFiles = new Array();
        if (currentFile != -1)
            previousFiles.push(currentFile);
    }

    document.getElementById("navFileLeftButton").disabled = (previousFiles.length == 0);
    document.getElementById("navFileRightButton").disabled = (nextFiles.length == 0);

    currentFile = fileIndex;
}

function updateFileSource(source, url, force)
{
    var fileIndex = filesLookup[url];
    if (!fileIndex || !source.length)
        return;

    var file = files[fileIndex];
    if (force || file.source.length != source.length || file.source != source) {
        file.source = source;
        file.loaded = false;

        if (file.element) {
            file.element.parentNode.removeChild(file.element);
            file.element = null;
        }

        if (currentFile == fileIndex)
            loadFile(fileIndex, false);
    }
}

/**
* ParsedURL - this object chops up full URL into two parts: 
 * 1) The domain: everything from http:// to the end of the domain name
 * 2) The relative path: everything after the domain
 *
 * @param string url URL to be processed
 */
function ParsedURL(url)
{
    // Since we're getting the URL from the browser, we're safe to assume the URL is already well formatted
    // and so there is no need for more sophisticated regular expression here
    var url_parts = url.match(/(http[s]?:\/\/(www)?\.?(\w|\.|-)+\w(:\d{1,5})?)\/?(.*)/);
    
    // the domain here is considered the whole http://www.example.org:8000 string for display purposes
    this.domain = url_parts[1];
    // the relative path is everything following the domain
    this.relativePath = "/" + url_parts[5];
}

/**
* SiteBrowser - modifies the file tree via DOM as new files are being open
 *
 */
function SiteBrowser()
{
    var fileBrowser = document.getElementById("filesBrowserSites");
    
    this.addURL = function add(url, fileIndex)
    {
        var parsedURL = new ParsedURL(url);
        var divs = fileBrowser.getElementsByTagName("div");
        
        if (divs.length == 0) { 
            addNewDomain(parsedURL, fileIndex);
        } else {
            var isNew = true;
            for (var i = 0; i < divs.length; i++) {
                if (divs[i].id == parsedURL.domain) {
                    var uls = divs[i].getElementsByTagName("ul");
                    var ul = (uls.length > 0) ? uls[0] : document.createElement("ul");
                    var li = document.createElement("li");
                    
                    li.id = fileIndex;
                    li.addEventListener("click", fileBrowserMouseEvents, false);
                    li.title = li.innerText = parsedURL.relativePath ? parsedURL.relativePath : "/";
                    ul.appendChild(li);
                    isNew = false;
                    break;
                }
            }
            if (isNew) {
                addNewDomain(parsedURL, fileIndex);
            }
        }
    }
    
    this.selectInitialFile = function sf()
    {
        if (currentFile == -1)
            document.getElementById("1").className = "active";
    }
    
    function addNewDomain(parsedURL, fileIndex)
    {
        var div = document.createElement("div");
        var ul = document.createElement("ul");
        var li = document.createElement("li");
        
        div.id = div.innerText = div.title = parsedURL.domain;
        div.addEventListener("click", fileBrowserMouseEvents, false);
        // Maybe we can add some roll-overs here...
        //div.addEventListener("mouseover", fileBrowserMouseEvents, false);
        //div.addEventListener("mouseout", fileBrowserMouseEvents, false);
        li.id = fileIndex;
        li.addEventListener("click", fileBrowserMouseEvents, false);
        li.title = li.innerText = parsedURL.relativePath ? parsedURL.relativePath : "/";
        ul.appendChild(li);
        div.appendChild(ul);
        fileBrowser.appendChild(div);        
    }
}

function fileBrowserMouseEvents(event)
{
    switch (event.type)
    {
        case "click":
            // If we clicked on a site, collapse/expand it, if on a file, display it. Since we're only capturing this
            // event from either a DIV or LI element, we don't have to worry about any ambiguity
            (event.target.nodeName.toUpperCase() == "DIV") ? toggleCollapseSite(event) : fileClicked(event.target.id);
            break;
    }
}

function fileClicked(fileId, shouldLoadFile)
{
    if (shouldLoadFile === undefined) shouldLoadFile = true;
    
    document.getElementById(currentFile).className = "passive";
    document.getElementById(fileId).className = "active";
    if (shouldLoadFile) 
        loadFile(fileId, false);
}

function toggleCollapseSite(event)
{
    var thisSite = document.getElementById(event.target.id);
    var siteFiles = thisSite.getElementsByTagName("ul");
    
    if (siteFiles[0].style.display == "block" || !siteFiles[0].style.display) {
        siteFiles[0].style.display = "none";
        thisSite.className = "collapsed"; 
    } else {
        siteFiles[0].style.display = "block";
        thisSite.className = "expanded";
    }
}

function didParseScript(source, fileSource, url, sourceId, baseLineNumber)
{
    var fileIndex = filesLookup[url];
    var file = files[fileIndex];
    var firstLoad = false;

    if (!fileIndex || !file) {
        fileIndex = files.length + 1;
        if (url.length)
            filesLookup[url] = fileIndex;

        file = new Object();
        file.scripts = new Array();
        file.breakpoints = new Array();
        file.disabledBreakpoints = new Array();
        file.breakpointEditors = new Array();
        file.source = (fileSource.length ? fileSource : source);
        file.url = (url.length ? url : null);
        file.loaded = false;

        files[fileIndex] = file;

        var filesSelect = document.getElementById("files");
        var option = document.createElement("option");
        files[fileIndex].menuOption = option;
        option.value = fileIndex;
        option.text = (file.url ? file.url : "(unknown script)");
        filesSelect.appendChild(option);

        var siteBrowser = new SiteBrowser();
        siteBrowser.addURL(file.url, fileIndex);
        siteBrowser.selectInitialFile();        
        
        firstLoad = true;
    }

    var sourceObj = new Object();
    sourceObj.file = fileIndex;
    sourceObj.baseLineNumber = baseLineNumber;
    file.scripts.push(sourceId);
    scripts[sourceId] = sourceObj;

    if (!firstLoad)
        updateFileSource((fileSource.length ? fileSource : source), url, false);

    if (currentFile == -1)
        loadFile(fileIndex, false);
}

function jumpToLine(sourceId, line)
{
    var script = scripts[sourceId];
    if (line <= 0 || !script)
        return;

    var file = files[script.file];
    if (!file)
        return;

    if (currentFile != script.file)
        loadFile(script.file, true);
    if (currentRow)
        currentRow.removeStyleClass("current");
    if (!file.element)
        return;
    if (line > file.element.firstChild.childNodes.length)
        return;

    currentRow = file.element.firstChild.childNodes.item(line - 1);
    if (!currentRow)
        return;

    currentRow.addStyleClass("current");

    var sourcesDiv = document.getElementById("sources");
    var sourcesDocument = document.getElementById("sources").contentDocument;
    var parent = sourcesDocument.body;
    var offset = totalOffsetTop(currentRow, parent);
    if (offset < (parent.scrollTop + 20) || offset > (parent.scrollTop + sourcesDiv.clientHeight - 20))
        parent.scrollTop = totalOffsetTop(currentRow, parent) - (sourcesDiv.clientHeight / 2) + 10;
}

function willExecuteStatement(sourceId, line, fromLeavingFrame)
{
    var script = scripts[sourceId];
    if (line <= 0 || !script)
        return;

    var file = files[script.file];
    if (!file)
        return;

    lastStatement = [sourceId, line];
    
    var breakpoint = file.breakpoints[line];
    var shouldBreak = breakpoint && (breakpoint == "break" || DebuggerDocument.evaluateScript_inCallFrame_(breakpoint, 0) == 1);
    
    if (pauseOnNextStatement || shouldBreak || (steppingOver && !steppingStack)) {
        pause();
        pauseOnNextStatement = false;
        pausedWhileLeavingFrame = fromLeavingFrame || false;
    }

    if (isPaused()) {
        updateFunctionStack();
        jumpToLine(sourceId, line);
    }
}

function didEnterCallFrame(sourceId, line)
{
    if (steppingOver || steppingOut)
        steppingStack++;

    if (lastStatement)
        frameLineNumberStack.unshift(lastStatement);
    willExecuteStatement(sourceId, line);
}

function willLeaveCallFrame(sourceId, line)
{
    if (line <= 0)
        resume();
    willExecuteStatement(sourceId, line, true);
    frameLineNumberStack.shift();
    if (!steppingStack)
        steppingOver = false;
    if (steppingOut && !steppingStack) {
        steppingOut = false;
        pauseOnNextStatement = true;
    }
    if ((steppingOver || steppingOut) && steppingStack >= 1)
        steppingStack--;
}

function exceptionWasRaised(sourceId, line)
{
    pause();
    updateFunctionStack();
    jumpToLine(sourceId, line);
}

function showConsoleWindow()
{
    if (!consoleWindow)
        consoleWindow = window.open("console.html", "console", "top=200, left=200, width=500, height=300, toolbar=yes, resizable=yes");
}
