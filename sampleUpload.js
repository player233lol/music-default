// 添加采样（从 buffer）
function addSampleFromBuffer(buffer, name, base64Data, basePitch) {
    if(customSamples.length >= 10){ alert('最多支持10个音色'); return false; }
    const idx = customSamples.length;
    const color = sampleColors[idx%sampleColors.length];
    customSamples.push({buffer, fileName: name, basePitch: basePitch || 60, color: color, bufferBase64: base64Data});
    renderSamples();
    if(allNotes.length > 0){
        const wasEmpty = customNotes.length === 0 || customNotes.every(n => n.customSampleIndex === -1);
        if(customNotes.length === 0) buildCustomNotes();
        else if (wasEmpty) {
            customNotes.forEach(n => { n.customSampleIndex = 0; });
        } else {
            customNotes.forEach(n => {
                if (n.customSampleIndex === -1) n.customSampleIndex = 0;
            });
        }
        refreshWaterfall2();
        saveState();
    }
    return true;
}

function addSample(buffer, name){
    const base64 = arrayBufferToBase64(buffer);
    const basePitch = 60;
    return addSampleFromBuffer(buffer, name, base64, basePitch);
}

function removeSample(idx){
    customSamples.splice(idx,1);
    if(customNotes.length){
        customNotes.forEach(note => {
            if(note.customSampleIndex === idx) note.customSampleIndex = customSamples.length > 0 ? 0 : -1;
            else if(note.customSampleIndex > idx) note.customSampleIndex--;
        });
    }
    renderSamples();
    if(allNotes.length > 0) { refreshWaterfall2(); saveState(); }
}

function renderSamples(){
    sampleListDiv.innerHTML = '';
    customSamples.forEach((s,i) => {
        const div = document.createElement('div'); div.className = 'sample-item';
        const hasBuffer = !!s.buffer;
        const pitchName = (() => {
            const midi = s.basePitch || 60;
            const oct = Math.floor(midi / 12) - 1;
            const ni = midi % 12;
            return noteNames[ni] + oct;
        })();
        div.innerHTML = `<div class="sample-color" style="background:${s.color}">#Note${i}</div>
                 <div class="sample-info">
                    <span>${s.fileName}</span>
                    <span class="base-pitch" data-index="${i}">基准: ${pitchName}</span>
                    ${hasBuffer ? '' : '<span style="color:#ef4444;font-size:12px;">(缺失)</span>'}
                 </div>
                 <div class="sample-delete">✕</div>`;
        const pitchSpan = div.querySelector('.base-pitch');
        pitchSpan.addEventListener('click', (e) => {
            e.stopPropagation();
            const idx = parseInt(pitchSpan.dataset.index);
            showBasePitchPicker(idx);
        });
        div.querySelector('.sample-delete').onclick = (e) => { e.stopPropagation(); removeSample(i); };
        sampleListDiv.appendChild(div);
    });
}

function showBasePitchPicker(sampleIndex) {
    const s = customSamples[sampleIndex];
    if (!s) return;
    const overlay = document.createElement('div');
    overlay.className = 'sample-picker-overlay';
    const box = document.createElement('div');
    box.className = 'sample-picker-box';
    box.innerHTML = `<h3>选择基准音</h3><ul></ul><div class="cancel-btn">取消</div>`;
    const ul = box.querySelector('ul');
    const octaves = [3,4,5,6];
    octaves.forEach(oct => {
        for (let ni = 0; ni < 12; ni++) {
            const midi = getMidiNumber(oct, ni);
            const name = noteNames[ni] + oct;
            const li = document.createElement('li');
            li.textContent = name;
            if (midi === s.basePitch) li.style.fontWeight = 'bold';
            li.addEventListener('click', (e) => {
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
    box.querySelector('.cancel-btn').addEventListener('click', () => {
        document.body.removeChild(overlay);
    });
    overlay.addEventListener('click', (e) => {
        if (e.target === overlay) document.body.removeChild(overlay);
    });
    overlay.appendChild(box);
    document.body.appendChild(overlay);
    box.style.position = 'absolute';
    box.style.top = '50%';
    box.style.left = '50%';
    box.style.transform = 'translate(-50%, -50%)';
}

// WAV 上传事件
wavUploadArea.addEventListener('click', () => wavFileInput.click());
wavFileInput.addEventListener('change', () => {
    const file = wavFileInput.files[0]; if(!file) return;
    if(customSamples.length >= 10){
        alert('最多支持10个音色');
        wavFileInput.value = '';
        return;
    }
    initAudio();
    const reader = new FileReader();
    reader.onload = (e) => {
        const arrayBuffer = e.target.result;
        audioCtx.decodeAudioData(arrayBuffer).then(buf => {
            addSample(buf, file.name);
            wavFileInput.value = '';
        }).catch(() => alert('WAV解码失败'));
    };
    reader.readAsArrayBuffer(file);
});
