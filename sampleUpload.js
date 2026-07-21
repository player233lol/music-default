function addSampleFromBuffer(buffer, name, base64Data, basePitch) {
    if(customSamples.length >= 10){ alert('最多支持10个音色'); return false; }
    var idx = customSamples.length;
    var color = sampleColors[idx%sampleColors.length];
    customSamples.push({buffer:buffer, fileName:name, basePitch:basePitch || 60, color:color, bufferBase64:base64Data});
    renderSamples();
    if(allNotes.length > 0){
        var wasEmpty = customNotes.length === 0 || customNotes.every(function(n){ return n.customSampleIndex === -1; });
        if(customNotes.length === 0) buildCustomNotes();
        else if (wasEmpty) {
            customNotes.forEach(function(n){ n.customSampleIndex = 0; });
        } else {
            customNotes.forEach(function(n){
                if (n.customSampleIndex === -1) n.customSampleIndex = 0;
            });
        }
        refreshWaterfall2();
        saveState();
    }
    return true;
}

function addSample(buffer, name){
    var base64 = arrayBufferToBase64(buffer);
    var basePitch = 60;
    return addSampleFromBuffer(buffer, name, base64, basePitch);
}

function removeSample(idx){
    customSamples.splice(idx,1);
    if(customNotes.length){
        customNotes.forEach(function(note){
            if(note.customSampleIndex === idx) note.customSampleIndex = customSamples.length > 0 ? 0 : -1;
            else if(note.customSampleIndex > idx) note.customSampleIndex--;
        });
    }
    renderSamples();
    if(allNotes.length > 0) { refreshWaterfall2(); saveState(); }
}

function renderSamples(){
    sampleListDiv.innerHTML = '';
    customSamples.forEach(function(s,i){
        var div = document.createElement('div'); div.className = 'sample-item';
        var hasBuffer = !!s.buffer;
        var pitchName = (function() {
            var midi = s.basePitch || 60;
            var oct = Math.floor(midi / 12) - 1;
            var ni = midi % 12;
            return noteNames[ni] + oct;
        })();
        div.innerHTML = '<div class="sample-color" style="background:'+s.color+'">#Note'+i+'</div> <div class="sample-info"><span>'+s.fileName+'</span><span class="base-pitch" data-index="'+i+'">基准: '+pitchName+'</span>'+(hasBuffer ? '' : '<span style="color:#ef4444;font-size:12px;">(缺失)</span>')+'</div> <div class="sample-delete">✕</div>';
        var pitchSpan = div.querySelector('.base-pitch');
        pitchSpan.addEventListener('click', function(e) {
            e.stopPropagation();
            var idx = parseInt(this.dataset.index);
            showBasePitchPicker(idx);
        });
        div.querySelector('.sample-delete').onclick = function(e) { e.stopPropagation(); removeSample(i); };
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
    var octaves = [3,4,5,6];
    octaves.forEach(function(oct){
        for (var ni = 0; ni < 12; ni++) {
            var midi = getMidiNumber(oct, ni);
            var name = noteNames[ni] + oct;
            var li = document.createElement('li');
            li.textContent = name;
            if (midi === s.basePitch) li.style.fontWeight = 'bold';
            li.addEventListener('click', function(e) {
                e.stopPropagation();
                customSamples[sampleIndex].basePitch = midi;
                renderSamples();
                if (allNotes.length > 0) {
                    refreshWaterfall2();
                    saveState();
                }
                document.body.removeChild(overlay);
            });
            ul.appendChild(li);
        }
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

wavUploadArea.addEventListener('click', function() { wavFileInput.click(); });
wavFileInput.addEventListener('change', function() {
    var file = wavFileInput.files[0]; if(!file) return;
    if(customSamples.length >= 10){
        alert('最多支持10个音色');
        wavFileInput.value = '';
        return;
    }
    initAudio();
    var reader = new FileReader();
    reader.onload = function(e) {
        var arrayBuffer = e.target.result;
        audioCtx.decodeAudioData(arrayBuffer).then(function(buf) {
            addSample(buf, file.name);
            wavFileInput.value = '';
        }).catch(function() { alert('WAV解码失败'); });
    };
    reader.readAsArrayBuffer(file);
});
