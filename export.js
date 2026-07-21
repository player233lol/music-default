btnExportCustom.addEventListener('click', async function() {
    if (!customNotes.length) return;
    btnExportCustom.disabled = true;
    btnExportCustom.textContent = '渲染中…';
    try {
        var offlineCtx = new OfflineAudioContext(2, 44100 * Math.ceil(totalDuration + 1), 44100);
        var masterGain = offlineCtx.createGain();
        masterGain.gain.value = 0.9;
        masterGain.connect(offlineCtx.destination);

        customNotes.forEach(function(note) {
            if (note.customSampleIndex === -1) return;
            var when = note.startTime;
            var dur = Math.max(0.1, note.endTime - note.startTime);
            var vol = (note.velocity / 127) * ((note.customVolumeScale || 100) / 100);
            var gain = offlineCtx.createGain();
            gain.connect(masterGain);

            var sampleIdx = note.customSampleIndex;
            var hasSample = (sampleIdx != null && customSamples[sampleIdx] && customSamples[sampleIdx].buffer);
            if (hasSample) {
                var sample = customSamples[sampleIdx];
                var src = offlineCtx.createBufferSource();
                src.buffer = sample.buffer;
                var basePitch = sample.basePitch || 60;
                var targetPitch = note.pitch + (note.customPitchOffset || 0);
                var pitchRate = Math.pow(2, (targetPitch - basePitch) / 12);
                var sampleDur = sample.buffer.duration;
                var stretchRate = sampleDur / dur;
                var rate = pitchRate * stretchRate;
                src.playbackRate.value = rate;
                gain.gain.setValueAtTime(vol, when);
                gain.gain.setValueAtTime(0.001, when + dur + 0.05);
                src.connect(gain);
                src.start(when);
                src.stop(when + dur);
            } else {
                var config = note.config || getConfigForProgram(note.program);
                var osc = offlineCtx.createOscillator();
                osc.type = config.waveform;
                var freq = 440 * Math.pow(2, (note.pitch + (note.customPitchOffset || 0) - 69) / 12);
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

        var renderedBuffer = await offlineCtx.startRendering();
        var mp3encoder = new lamejs.Mp3Encoder(2, 44100, 128);
        var left = renderedBuffer.getChannelData(0);
        var right = renderedBuffer.getChannelData(1);
        var mp3Data = [];
        var sampleBlockSize = 1152;

        for (var i = 0; i < left.length; i += sampleBlockSize) {
            var leftChunk = left.subarray(i, i + sampleBlockSize);
            var rightChunk = right.subarray(i, i + sampleBlockSize);
            var leftInt = new Int16Array(leftChunk.length);
            var rightInt = new Int16Array(rightChunk.length);
            for (var j = 0; j < leftChunk.length; j++) {
                leftInt[j] = Math.max(-32768, Math.min(32767, leftChunk[j] * 32767));
                rightInt[j] = Math.max(-32768, Math.min(32767, rightChunk[j] * 32767));
            }
            var mp3buf = mp3encoder.encodeBuffer(leftInt, rightInt);
            if (mp3buf.length > 0) {
                mp3Data.push(mp3buf);
            }
        }

        var mp3buf = mp3encoder.flush();
        if (mp3buf.length > 0) {
            mp3Data.push(new Uint8Array(mp3buf));
        }

        var blob = new Blob(mp3Data, { type: 'audio/mp3' });
        var url = URL.createObjectURL(blob);
        var a = document.createElement('a');
        var fileName = midiFileName || 'output';
        if (customSamples.length > 0 && customSamples[0].fileName) {
            var sampleName = customSamples[0].fileName.replace(/\.[^.]+$/, '');
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

btnResetAll.addEventListener('click', function() {
    if (!confirm('确定要重置所有工作吗？所有数据将被清除。')) return;
    resetAll();
});
