function scheduleNoteForPlayer(note, when, playerState){
    if (note.customSampleIndex === -1) return;
    if(!audioCtx||!masterGain) return;
    var useSample = (note.customSampleIndex != null && customSamples[note.customSampleIndex] && customSamples[note.customSampleIndex].buffer);
    var vol = (note.velocity/127) * ((note.customVolumeScale||100)/100);
    var duration = Math.max(0.03, note.endTime - note.startTime);
    var gain = audioCtx.createGain(); gain.connect(masterGain);
    var sourceNode;
    if(useSample){
        var sample = customSamples[note.customSampleIndex];
        var src = audioCtx.createBufferSource();
        src.buffer = sample.buffer;
        var base = sample.basePitch||60, target = note.pitch + (note.customPitchOffset||0);
        var pitchRate = Math.pow(2, (target-base)/12);
        var sampleDuration = sample.buffer.duration;
        var stretchRate = sampleDuration / duration;
        var rate = pitchRate * stretchRate;
        src.playbackRate.value = rate;
        gain.gain.setValueAtTime(vol, when);
        gain.gain.setValueAtTime(0.001, when+duration+0.05);
        src.connect(gain);
        src.start(when);
        src.stop(when+duration);
        sourceNode = src;
    } else {
        var config = note.config || getConfigForProgram(note.program);
        var osc = audioCtx.createOscillator(); osc.type = config.waveform;
        var freq = 440*Math.pow(2,(note.pitch+(note.customPitchOffset||0)-69)/12);
        osc.frequency.setValueAtTime(freq, when);
        gain.gain.setValueAtTime(0,when);
        gain.gain.linearRampToValueAtTime(vol*0.9, when+0.005);
        gain.gain.setValueAtTime(vol*0.9, when+duration-0.03);
        gain.gain.linearRampToValueAtTime(0.001, when+duration);
        osc.connect(gain); osc.start(when); osc.stop(when+duration+0.05);
        sourceNode = osc;
    }
    playerState.activeOscillators.push({source:sourceNode, gain:gain});
    var cleanTime = (when+duration+0.1)*1000;
    setTimeout(function() {
        var idx = playerState.activeOscillators.findIndex(function(r){ return r.source === sourceNode; });
        if(idx >= 0) playerState.activeOscillators.splice(idx, 1);
    }, Math.max(100, cleanTime - performance.now()));
}

function stopPlayerSound(playerState){
    playerState.activeOscillators.forEach(function(r) {
        try { r.source.stop(); } catch(e) {}
        try { r.source.disconnect(); } catch(e) {}
        try { r.gain.disconnect(); } catch(e) {}
    });
    playerState.activeOscillators = [];
    playerState.scheduledNotes.clear();
}

var isDraggingProgress1 = false;
var isDraggingProgress2 = false;

function updateProgress1() {
    if (!isDraggingProgress1) {
        var val = Math.min(totalDuration, Math.max(0, player1.currentLogicalTime));
        progress1.value = val;
        var mins = Math.floor(val/60), secs = Math.floor(val%60);
        progressTime1.textContent = mins + ':' + String(secs).padStart(2,'0');
    }
}
function updateProgress2() {
    if (!isDraggingProgress2) {
        var val = Math.min(totalDuration, Math.max(0, player2.currentLogicalTime));
        progress2.value = val;
        var mins = Math.floor(val/60), secs = Math.floor(val%60);
        progressTime2.textContent = mins + ':' + String(secs).padStart(2,'0');
    }
}

progress1.addEventListener('input', function(e) {
    var val = parseFloat(e.target.value);
    if (totalDuration > 0) {
        player1.currentLogicalTime = Math.min(totalDuration, Math.max(0, val));
        player1.logicalStartOffset = player1.currentLogicalTime;
        if (player1.isPlaying) {
            pausePlayer(player1, btnPlay1, btnPlayText1, playLine1, timeDisplay1);
        }
        refreshWaterfall1();
        updateTimeDisplay(player1.currentLogicalTime, timeDisplay1);
        var mins = Math.floor(val/60), secs = Math.floor(val%60);
        progressTime1.textContent = mins + ':' + String(secs).padStart(2,'0');
    }
});
progress1.addEventListener('pointerdown', function() { isDraggingProgress1 = true; });
progress1.addEventListener('pointerup', function() { isDraggingProgress1 = false; });
progress1.addEventListener('pointerleave', function() { isDraggingProgress1 = false; });

progress2.addEventListener('input', function(e) {
    var val = parseFloat(e.target.value);
    if (totalDuration > 0) {
        player2.currentLogicalTime = Math.min(totalDuration, Math.max(0, val));
        player2.logicalStartOffset = player2.currentLogicalTime;
        if (player2.isPlaying) {
            pausePlayer(player2, btnPlay2, btnPlayText2, playLine2, timeDisplay2);
        }
        refreshWaterfall2();
        updateTimeDisplay(player2.currentLogicalTime, timeDisplay2);
        var mins = Math.floor(val/60), secs = Math.floor(val%60);
        progressTime2.textContent = mins + ':' + String(secs).padStart(2,'0');
    }
});
progress2.addEventListener('pointerdown', function() { isDraggingProgress2 = true; });
progress2.addEventListener('pointerup', function() { isDraggingProgress2 = false; });
progress2.addEventListener('pointerleave', function() { isDraggingProgress2 = false; });

function animationLoop1(){
    if(!player1.isPlaying || !audioCtx) return;
    var now = audioCtx.currentTime;
    player1.currentLogicalTime = now - player1.playStartTime + player1.logicalStartOffset;
    if(player1.currentLogicalTime >= totalDuration && totalDuration > 0){
        pausePlayer(player1, btnPlay1, btnPlayText1, playLine1, timeDisplay1);
        player1.currentLogicalTime = totalDuration;
        refreshWaterfall1(); updateTimeDisplay(player1.currentLogicalTime, timeDisplay1);
        updateProgress1();
        return;
    }
    refreshWaterfall1();
    updateProgress1();
    var scheduleWindow = 0.08;
    for(var i=0; i<allNotes.length; i++){
        if(player1.scheduledNotes.has(i)) continue;
        var n = allNotes[i];
        if(n.startTime <= player1.currentLogicalTime + scheduleWindow && n.startTime > player1.currentLogicalTime - 0.02){
            var delay = n.startTime - player1.currentLogicalTime;
            if(delay >= -0.01) scheduleNoteForPlayer(n, audioCtx.currentTime + Math.max(0, delay), player1);
            player1.scheduledNotes.add(i);
        }
        if(n.startTime > player1.currentLogicalTime + scheduleWindow + 0.1) break;
    }
    updateTimeDisplay(player1.currentLogicalTime, timeDisplay1);
    player1.animationId = requestAnimationFrame(animationLoop1);
}
function animationLoop2(){
    if(!player2.isPlaying || !audioCtx) return;
    var now = audioCtx.currentTime;
    player2.currentLogicalTime = now - player2.playStartTime + player2.logicalStartOffset;
    if(player2.currentLogicalTime >= totalDuration && totalDuration > 0){
        pausePlayer(player2, btnPlay2, btnPlayText2, playLine2, timeDisplay2);
        player2.currentLogicalTime = totalDuration;
        refreshWaterfall2(); updateTimeDisplay(player2.currentLogicalTime, timeDisplay2);
        updateProgress2();
        return;
    }
    refreshWaterfall2();
    updateProgress2();
    var scheduleWindow = 0.08;
    for(var i=0; i<customNotes.length; i++){
        if(player2.scheduledNotes.has(i)) continue;
        var n = customNotes[i];
        if(n.startTime <= player2.currentLogicalTime + scheduleWindow && n.startTime > player2.currentLogicalTime - 0.02){
            var delay = n.startTime - player2.currentLogicalTime;
            if(delay >= -0.01) scheduleNoteForPlayer(n, audioCtx.currentTime + Math.max(0, delay), player2);
            player2.scheduledNotes.add(i);
        }
        if(n.startTime > player2.currentLogicalTime + scheduleWindow + 0.1) break;
    }
    updateTimeDisplay(player2.currentLogicalTime, timeDisplay2);
    player2.animationId = requestAnimationFrame(animationLoop2);
}

function updateTimeDisplay(time, element){
    var ct = Math.max(0, time);
    var cm = Math.floor(ct/60), cs = Math.floor(ct%60);
    var tm = Math.floor(totalDuration/60), ts = Math.floor(totalDuration%60);
    element.textContent = String(cm).padStart(2,'0')+':'+String(cs).padStart(2,'0')+' / '+String(tm).padStart(2,'0')+':'+String(ts).padStart(2,'0');
}

function startPlayer(playerState, btn, btnText, line, timeDisp){
    if(!allNotes.length) return;
    initAudio();
    if(audioCtx.state === 'suspended') audioCtx.resume().then(function(){ startPlayerInternal(playerState, btn, btnText, line, timeDisp); });
    else startPlayerInternal(playerState, btn, btnText, line, timeDisp);
}
function startPlayerInternal(playerState, btn, btnText, line, timeDisp){
    if(playerState.isPlaying) return;
    playerState.isPlaying = true;
    playerState.scheduledNotes.clear();
    stopPlayerSound(playerState);
    if(playerState.currentLogicalTime >= totalDuration && totalDuration > 0){
        playerState.currentLogicalTime = 0;
        playerState.logicalStartOffset = 0;
    }
    playerState.playStartTime = audioCtx.currentTime;
    playerState.logicalStartOffset = playerState.currentLogicalTime;
    btn.classList.add('paused-state');
    btnText.textContent = '暂停';
    line.style.background = '#22c55e';
    if(playerState === player1) { refreshWaterfall1(); updateProgress1(); player1.animationId = requestAnimationFrame(animationLoop1); }
    else { refreshWaterfall2(); updateProgress2(); player2.animationId = requestAnimationFrame(animationLoop2); }
}
function pausePlayer(playerState, btn, btnText, line, timeDisp){
    if(!playerState.isPlaying) return;
    playerState.isPlaying = false;
    if(playerState.animationId) { cancelAnimationFrame(playerState.animationId); playerState.animationId = null; }
    if(audioCtx) playerState.currentLogicalTime = audioCtx.currentTime - playerState.playStartTime + playerState.logicalStartOffset;
    playerState.logicalStartOffset = playerState.currentLogicalTime;
    stopPlayerSound(playerState);
    playerState.scheduledNotes.clear();
    btn.classList.remove('paused-state');
    btnText.textContent = '播放';
    line.style.background = '#f59e0b';
    if(playerState === player1) { refreshWaterfall1(); updateProgress1(); }
    else { refreshWaterfall2(); updateProgress2(); }
    updateTimeDisplay(playerState.currentLogicalTime, timeDisp);
}
function resetPlayer(playerState, btn, btnText, line, timeDisp){
    if(playerState.isPlaying){ playerState.isPlaying = false; if(playerState.animationId) cancelAnimationFrame(playerState.animationId); }
    stopPlayerSound(playerState);
    playerState.scheduledNotes.clear();
    playerState.currentLogicalTime = 0;
    playerState.logicalStartOffset = 0;
    playerState.playStartTime = 0;
    btn.classList.remove('paused-state');
    btnText.textContent = '播放';
    line.style.background = '#1e293b';
    if(playerState === player1) { refreshWaterfall1(); updateProgress1(); }
    else { refreshWaterfall2(); updateProgress2(); }
    updateTimeDisplay(0, timeDisp);
}

btnPlay1.addEventListener('click', function(){ if(!allNotes.length) return; initAudio(); player1.isPlaying ? pausePlayer(player1, btnPlay1, btnPlayText1, playLine1, timeDisplay1) : startPlayer(player1, btnPlay1, btnPlayText1, playLine1, timeDisplay1); });
btnReset1.addEventListener('click', function(){ resetPlayer(player1, btnPlay1, btnPlayText1, playLine1, timeDisplay1); });
btnPlay2.addEventListener('click', function(){ if(!customNotes.length) return; initAudio(); player2.isPlaying ? pausePlayer(player2, btnPlay2, btnPlayText2, playLine2, timeDisplay2) : startPlayer(player2, btnPlay2, btnPlayText2, playLine2, timeDisplay2); });
btnReset2.addEventListener('click', function(){ resetPlayer(player2, btnPlay2, btnPlayText2, playLine2, timeDisplay2); });

document.addEventListener('keydown', function(e) {
    if(e.code === 'Space' && e.target === document.body){
        e.preventDefault();
        if(allNotes.length){
            initAudio();
            player1.isPlaying ? pausePlayer(player1, btnPlay1, btnPlayText1, playLine1, timeDisplay1) : startPlayer(player1, btnPlay1, btnPlayText1, playLine1, timeDisplay1);
        }
    }
});
