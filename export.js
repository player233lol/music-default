btnExportCustom.addEventListener('click', async () => {
    if (!customNotes.length) return;
    btnExportCustom.disabled = true;
    btnExportCustom.textContent = '渲染中…';
    try {
        const offlineCtx = new OfflineAudioContext(2, 44100 * Math.ceil(totalDuration + 1), 44100);
        const masterGain = offlineCtx.createGain();
        masterGain.gain.value = 0.9;
        masterGain.connect(offlineCtx.destination);

        customNotes.forEach(note => {
            if (note.customSampleIndex === -1) return;
            const when = note.startTime;
            const dur = Math.max(0.1, note.endTime - note.startTime);
            const vol = (note.velocity / 127) * ((note.customVolumeScale || 100) / 100);
            const gain = offlineCtx.createGain();
            gain.connect(masterGain);

            const sampleIdx = note.customSampleIndex;
            const hasSample = (sampleIdx != null && customSamples[sampleIdx] && customSamples[sampleIdx].buffer);
            if (hasSample) {
                const sample = customSamples[sampleIdx];
                const src = offlineCtx.createBufferSource();
                src.buffer = sample.buffer;
                const basePitch = sample.basePitch || 60;
                const targetPitch = note.pitch + (note.customPitchOffset || 0);
                let rate = Math.pow(2, (targetPitch - basePitch) / 12);
                const sampleDur = sample.buffer.duration;
                if (dur > sampleDur && sampleDur > 0) {
                    rate *= sampleDur / dur;
                }
                src.playbackRate.value = rate;
                gain.gain.setValueAtTime(vol, when);
                gain.gain.setValueAtTime(0.001, when + dur + 0.05);
                src.connect(gain);
                src.start(when);
                src.stop(when + dur);
            } else {
                const config = note.config || getConfigForProgram(note.program);
                const osc = offlineCtx.createOscillator();
                osc.type = config.waveform;
                const freq = 440 * Math.pow(2, (note.pitch + (note.customPitchOffset || 0) - 69) / 12);
                osc.frequency.setValueAtTime(freq, when);
                gain.gain.setValueAtTime(0, when);
                gain.gain.linearRampToValueAtTime(vol, when + 0.005);
                gain.gain.setValueAtTime(vol, when + dur - 0.03);
                gain.gain.linearRampToValueAtTime(0.001, when + dur);
                osc.connect(gain);
                osc.start(when);
                osc.stop(when + dur + 0.05);
            }
        });

        const renderedBuffer = await offlineCtx.startRendering();
        const mp3encoder = new lamejs.Mp3Encoder(2, 44100, 128);
        const left = renderedBuffer.getChannelData(0);
        const right = renderedBuffer.getChannelData(1);
        const mp3Data = [];
        const sampleBlockSize = 1152;

        for (let i = 0; i < left.length; i += sampleBlockSize) {
            const leftChunk = left.subarray(i, i + sampleBlockSize);
            const rightChunk = right.subarray(i, i + sampleBlockSize);
            const leftInt = new Int16Array(leftChunk.length);
            const rightInt = new Int16Array(rightChunk.length);
            for (let j = 0; j < leftChunk.length; j++) {
                leftInt[j] = Math.max(-32768, Math.min(32767, leftChunk[j] * 32767));
                rightInt[j] = Math.max(-32768, Math.min(32767, rightChunk[j] * 32767));
            }
            const mp3buf = mp3encoder.encodeBuffer(leftInt, rightInt);
            if (mp3buf.length > 0) {
                mp3Data.push(mp3buf);
            }
        }

        const mp3buf = mp3encoder.flush();
        if (mp3buf.length > 0) {
            mp3Data.push(new Uint8Array(mp3buf));
        }

        const blob = new Blob(mp3Data, { type: 'audio/mp3' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');

        let fileName = midiFileName || 'output';
        if (customSamples.length > 0 && customSamples[0].fileName) {
            const sampleName = customSamples[0].fileName.replace(/\.[^.]+$/, '');
            fileName = sampleName + '_' + fileName;
        }
        a.download = fileName + '.mp3';

        a.href = url;
        a.click();
        URL.revokeObjectURL(url);

    } catch (err) {
        alert('导出失败: ' + err.message);
    }
    btnExportCustom.disabled = false;
    btnExportCustom.textContent = '⬇️ 导出 MP3（自定义音色）';
});

btnResetAll.addEventListener('click', () => {
    if (!confirm('确定要重置所有工作吗？所有数据将被清除。')) return;
    resetAll();
});
