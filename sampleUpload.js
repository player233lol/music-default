function addSampleFromBuffer(buffer, name, base64Data, basePitch) {
    if (customSamples.length >= 10) { alert('最多支持10个音色'); return false; }
    var idx = customSamples.length;
    var color = sampleColors[idx % sampleColors.length];
    customSamples.push({ buffer: buffer, fileName: name, basePitch: basePitch || 60, color: color,
        bufferBase64: base64Data });
    renderSamples();
    if (allNotes.length > 0) {
        var needUpdate = false;
        customNotes.forEach(function(n) {
            if (n.customSampleIndex === -1 || n.customSampleIndex === undefined) {
                n.customSampleIndex = 0;
                needUpdate = true;
            }
        });
        if (needUpdate) { refreshWaterfall2();
            saveState(); }
    }
    return true;
}

function addSample(buffer, name) {
    var base64 = arrayBufferToBase64(buffer);
    return addSampleFromBuffer(buffer, name, base64, 60);
}

function removeSample(idx) {
    customSamples.splice(idx, 1);
    customNotes.forEach(function(n) {
        if (n.customSampleIndex === idx) n.customSampleIndex = customSamples.length > 0 ? 0 : -1;
        else if (n.customSampleIndex > idx) n.customSampleIndex--;
    });
    renderSamples();
    if (allNotes.length > 0) { refreshWaterfall2();
        saveState(); }
}

function renderSamples() {
    sampleListDiv.innerHTML = '';
    customSamples.forEach(function(s, i) {
        var div = document.createElement('div');
        div.className = 'sample-item';
        var hasBuffer = !!s.buffer;
        var pitchName = (function() {
            var midi = s.basePitch || 60;
            var oct = Math.floor(midi / 12) - 1;
            var ni = midi % 12;
            return noteNames[ni] + oct;
        })();
        div.innerHTML = '<div class="sample-color" style="background:' + s.color + '">#Note' + i +
            '</div><div class="sample-info"><span>' + s.fileName +
            '</span><span class="base-pitch" data-index="' + i + '">基准: ' + pitchName +
            '</span>' + (hasBuffer ? '' :
                '<span style="color:#ef4444;font-size:12px;">(缺失)</span>') +
            '</div><div class="sample-delete">✕</div>';
        var pitchSpan = div.querySelector('.base-pitch');
        pitchSpan.addEventListener('click', function(e) {
            e.stopPropagation();
            var idx = parseInt(this.dataset.index);
            showBasePitchPicker(idx);
        });
        div.querySelector('.sample-delete').onclick = function(e) { e.stopPropagation();
            removeSample(i); };
        sampleListDiv.appendChild(div);
    });
}

function showBasePitchPicker(sampleIndex) {
    var s = customSamples[sampleIndex];
    if (!s) return;
    var overlay = document.createElement('div');
    overlay.className = 'sample-picker-overlay';
    var box = document.createElement('div');
    box.className = 'sample-picker-box';
    box.innerHTML = '<h3>选择基准音</h3><ul></ul><div class="cancel-btn">取消</div>';
    var ul = box.querySelector('ul');
    var octaves = [3, 4, 5, 6];

    // 使用 let 修复闭包问题
    for (let oct of octaves) {
        for (let ni = 0; ni < 12; ni++) {
            let midi = getMidiNumber(oct, ni);
            let name = noteNames[ni] + oct;
            var li = document.createElement('li');
            li.textContent = name;
            if (midi === s.basePitch) li.style.fontWeight = 'bold';
            li.addEventListener('click', function(e) {
                e.stopPropagation();
                customSamples[sampleIndex].basePitch = midi;
                renderSamples();
                if (allNotes.length > 0) { refreshWaterfall2();
                    saveState(); }
                document.body.removeChild(overlay);
            });
            ul.appendChild(li);
        }
    }

    box.querySelector('.cancel-btn').addEventListener('click', function() { document.body.removeChild(overlay); });
    overlay.addEventListener('click', function(e) { if (e.target === overlay) document.body.removeChild(overlay); });
    overlay.appendChild(box);
    document.body.appendChild(overlay);
    box.style.position = 'absolute';
    box.style.top = '50%';
    box.style.left = '50%';
    box.style.transform = 'translate(-50%, -50%)';
}

// 原有 WAV 上传事件（已在外层绑定，但保留以防万一）
// 如果您的 default.html 中已经绑定了这些事件，则无需重复
// 此处仅声明函数，事件绑定已在 default.html 的初始化脚本中完成
