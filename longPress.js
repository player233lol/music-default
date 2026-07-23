var longPressTimer = null;
var longPressTarget = null;
var longPressStartX = 0, longPressStartY = 0;
var LONG_PRESS_MS = 500;

function showSamplePicker(noteIndex) {
    var overlay = document.createElement('div');
    overlay.className = 'sample-picker-overlay';
    var box = document.createElement('div');
    box.className = 'sample-picker-box';
    box.innerHTML = '<h3>选择音色</h3><ul></ul><div class="cancel-btn">取消</div>';
    var ul = box.querySelector('ul');

    var noneLi = document.createElement('li');
    noneLi.style.color = '#999';
    noneLi.style.fontStyle = 'italic';
    var noneDot = document.createElement('span');
    noneDot.style.display = 'inline-block';
    noneDot.style.width = '16px';
    noneDot.style.height = '16px';
    noneDot.style.borderRadius = '4px';
    noneDot.style.background = '#cccccc';
    noneLi.prepend(noneDot);
    noneLi.appendChild(document.createTextNode('#None (静音)'));
    noneLi.addEventListener('click', function(e) {
        e.stopPropagation();
        if (customNotes[noteIndex]) {
            customNotes[noteIndex].customSampleIndex = -1;
            customNotes[noteIndex].customPitchOffset = 0;
            refreshWaterfall2();
            saveState();
            document.body.removeChild(overlay);
        }
    });
    ul.appendChild(noneLi);

    customSamples.forEach(function(s, idx) {
        var li = document.createElement('li');
        var dot = document.createElement('span');
        dot.style.display = 'inline-block';
        dot.style.width = '16px';
        dot.style.height = '16px';
        dot.style.borderRadius = '4px';
        dot.style.background = s.color || '#aaa';
        li.prepend(dot);
        var pitchName = (function() {
            var midi = s.basePitch || 60;
            var oct = Math.floor(midi / 12) - 1;
            var ni = midi % 12;
            return noteNames[ni] + oct;
        })();
        li.appendChild(document.createTextNode('#Note'+idx+': '+s.fileName+' (基准:'+pitchName+')'));
        li.addEventListener('click', function(e) {
            e.stopPropagation();
            if (customNotes[noteIndex]) {
                customNotes[noteIndex].customSampleIndex = idx;
                customNotes[noteIndex].customPitchOffset = 0;
                refreshWaterfall2();
                saveState();
                document.body.removeChild(overlay);
            }
        });
        ul.appendChild(li);
    });

    box.querySelector('.cancel-btn').addEventListener('click', function() {
        document.body.removeChild(overlay);
    });
    overlay.addEventListener('click', function(e) {
        if (e.target === overlay) document.body.removeChild(overlay);
    });
    overlay.appendChild(box);
    document.body.appendChild(overlay);
    box.style.position = 'absolute';
    box.style.top = '50%';
    box.style.left = '50%';
    box.style.transform = 'translate(-50%, -50%)';
}

function setupLongPress() {
    var el = layer2;
    if (!el) return;
    el.addEventListener('contextmenu', function(e) { e.preventDefault(); });

    var start = function(e) {
        var target = e.target.closest && e.target.closest('.note-block') || e.target;
        if (!target || !target.classList.contains('note-block')) {
            clearLongPress();
            return;
        }
        var noteIdx = parseInt(target.dataset.noteIndex);
        if (isNaN(noteIdx) || !customNotes[noteIdx]) {
            clearLongPress();
            return;
        }
        var clientX = e.clientX || (e.touches && e.touches[0] && e.touches[0].clientX) || 0;
        var clientY = e.clientY || (e.touches && e.touches[0] && e.touches[0].clientY) || 0;
        longPressStartX = clientX;
        longPressStartY = clientY;
        longPressTarget = target;
        longPressTimer = setTimeout(function() {
            var idx = parseInt(longPressTarget.dataset.noteIndex);
            if (!isNaN(idx) && customNotes[idx]) {
                showSamplePicker(idx);
            }
            clearLongPress();
        }, LONG_PRESS_MS);
    };

    var move = function(e) {
        var clientX = e.clientX || (e.touches && e.touches[0] && e.touches[0].clientX) || 0;
        var clientY = e.clientY || (e.touches && e.touches[0] && e.touches[0].clientY) || 0;
        if (Math.abs(clientX - longPressStartX) > 10 || Math.abs(clientY - longPressStartY) > 10) {
            clearLongPress();
        }
    };

    var end = function() { clearLongPress(); };

    var clearLongPress = function() {
        if (longPressTimer) {
            clearTimeout(longPressTimer);
            longPressTimer = null;
        }
        longPressTarget = null;
    };

    el.addEventListener('mousedown', start);
    el.addEventListener('touchstart', start, { passive: true });
    el.addEventListener('mousemove', move);
    el.addEventListener('touchmove', move, { passive: true });
    el.addEventListener('mouseup', end);
    el.addEventListener('touchend', end);
    el.addEventListener('mouseleave', end);
    el.addEventListener('touchcancel', end);
}
