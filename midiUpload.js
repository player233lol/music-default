function parseMIDI(arrayBuffer) {
    var data = new Uint8Array(arrayBuffer);
    var offset = 0;
    var readUint32 = function() { var v = (data[offset]<<24)|(data[offset+1]<<16)|(data[offset+2]<<8)|data[offset+3]; offset+=4; return v>>>0; };
    var readUint16 = function() { var v = (data[offset]<<8)|data[offset+1]; offset+=2; return v; };
    var readVarLen = function() { var v=0,b; do{ b=data[offset++]; v=(v<<7)|(b&0x7f); }while(b&0x80); return v; };
    var headerId = String.fromCharCode(data[offset],data[offset+1],data[offset+2],data[offset+3]); offset+=4;
    if(headerId!=='MThd') throw new Error('无效MIDI文件');
    var headerLen=readUint32(); var format=readUint16(); var numTracks=readUint16(); var ticksPerQuarter=readUint16();
    if(headerLen>6) offset+=(headerLen-6);
    var allTrackEvents=[]; var totalTicks=0;
    for(var t=0;t<numTracks;t++){
        var trackId=String.fromCharCode(data[offset],data[offset+1],data[offset+2],data[offset+3]); offset+=4;
        if(trackId!=='MTrk') throw new Error('轨道'+t+'缺少MTrk');
        var trackLen=readUint32(); var trackEnd=offset+trackLen;
        var events=[]; var runningStatus=null, absTicks=0;
        while(offset<trackEnd){
            var delta=readVarLen(); absTicks+=delta;
            var status=data[offset];
            if(status<0x80){ if(runningStatus===null){offset++; continue;} status=runningStatus; } else{ offset++; runningStatus=status; }
            var eventType=status&0xf0, channel=status&0x0f;
            if(status===0xff){ var metaType=data[offset++]; var len=readVarLen(); var start=offset;
                if(metaType===0x51 && len===3){ var tempo=(data[offset]<<16)|(data[offset+1]<<8)|data[offset+2]; events.push({type:'tempo',ticks:absTicks,tempo}); }
                offset=start+len; runningStatus=null; }
            else if(status===0xf0||status===0xf7){ var len2=readVarLen(); offset+=len2; runningStatus=null; }
            else if(eventType===0x80||eventType===0x90){ var pitch=data[offset++], vel=data[offset++];
                events.push({type:(eventType===0x90 && vel>0)?'noteOn':'noteOff', ticks:absTicks, channel:channel, pitch:pitch, velocity:vel}); }
            else if(eventType===0xc0){ events.push({type:'programChange',ticks:absTicks,channel:channel,program:data[offset++]}); }
            else if(eventType===0xb0){ events.push({type:'controlChange',ticks:absTicks,channel:channel,controller:data[offset++],value:data[offset++]}); }
            else if(eventType===0xe0){ var lsb=data[offset++], msb=data[offset++]; events.push({type:'pitchBend',ticks:absTicks,channel:channel,value:(msb<<7)|lsb}); }
            else if(eventType===0xd0||eventType===0xa0){ offset+=2; }
            else{ if(offset<trackEnd) offset++; }
        }
        if(absTicks>totalTicks) totalTicks=absTicks;
        allTrackEvents.push(events);
        offset=trackEnd;
    }
    var allTempoEvents=[];
    allTrackEvents.forEach(function(trk){ trk.forEach(function(e){ if(e.type==='tempo') allTempoEvents.push(e); }); });
    allTempoEvents.sort(function(a,b){ return a.ticks-b.ticks; });
    var currentTempo=500000, lastTick=0, lastSeconds=0;
    var tickToSecondsMap=[{startTick:0,startSeconds:0,tempo:currentTempo}];
    allTempoEvents.forEach(function(te){
        var td=te.ticks-lastTick; var sd=(td/ticksPerQuarter)*(currentTempo/1000000);
        lastSeconds+=sd; tickToSecondsMap.push({startTick:te.ticks,startSeconds:lastSeconds,tempo:te.tempo});
        lastTick=te.ticks; currentTempo=te.tempo;
    });
    var finalS=lastSeconds+((totalTicks-lastTick)/ticksPerQuarter)*(currentTempo/1000000);
    var tickToSeconds=function(tick){
        var seg=tickToSecondsMap[0];
        for(var i=tickToSecondsMap.length-1;i>=0;i--) if(tick>=tickToSecondsMap[i].startTick){ seg=tickToSecondsMap[i]; break; }
        return seg.startSeconds+((tick-seg.startTick)/ticksPerQuarter)*(seg.tempo/1000000);
    };
    var channelProg=new Array(16).fill(0);
    var noteStacks=Array.from({length:16},function(){ return {}; });
    var notes=[];
    var allFlat=[]; allTrackEvents.forEach(function(trk){ allFlat.push.apply(allFlat, trk); });
    allFlat.sort(function(a,b){ return a.ticks-b.ticks; });
    allFlat.forEach(function(ev){
        if(ev.type==='programChange') channelProg[ev.channel]=ev.program;
        else if(ev.type==='noteOn'){
            var stack=noteStacks[ev.channel]; if(!stack[ev.pitch]) stack[ev.pitch]=[];
            stack[ev.pitch].push({startTick:ev.ticks,velocity:ev.velocity,program:channelProg[ev.channel]});
        } else if(ev.type==='noteOff'){
            var stack2=noteStacks[ev.channel];
            if(stack2[ev.pitch]&&stack2[ev.pitch].length){
                var on=stack2[ev.pitch].shift(); var st=tickToSeconds(on.startTick), et=tickToSeconds(ev.ticks);
                if(et>st && on.velocity>0) notes.push({startTime:st,endTime:et,pitch:ev.pitch,velocity:on.velocity,channel:ev.channel,program:on.program});
            }
        }
    });
    noteStacks.forEach(function(stack,ch){
        Object.keys(stack).forEach(function(p){
            while(stack[p].length){
                var on=stack[p].shift(); var st=tickToSeconds(on.startTick);
                var et=Math.min(st+0.5,finalS);
                if(et>st && on.velocity>0) notes.push({startTime:st,endTime:et,pitch:parseInt(p),velocity:on.velocity,channel:ch,program:on.program});
            }
        });
    });
    notes.sort(function(a,b){ return a.startTime-b.startTime; });
    notes.forEach(function(n){ var config=getConfigForProgram(n.program); n.color=config.color; n.waveform=config.waveform; n.config=config; });
    var instSet=new Map(); notes.forEach(function(n){ if(!instSet.has(n.program)) instSet.set(n.program,getConfigForProgram(n.program)); });
    return {numTracks:numTracks,totalSeconds:finalS,notes:notes,instrumentSet:instSet};
}

function loadMIDIFromBuffer(arrayBuffer, fileName) {
    try {
        var parsed = parseMIDI(arrayBuffer);
        allNotes = parsed.notes; totalDuration = parsed.totalSeconds; usedInstruments = parsed.instrumentSet;
        allNotes.forEach(function(n,i){ n._index = i; });
        midiFileBase64 = arrayBufferToBase64(arrayBuffer);
        midiFileName = fileName.replace(/\.[^.]+$/, '');
        buildCustomNotes();
        trackCountEl.textContent = parsed.numTracks; noteCountEl.textContent = allNotes.length;
        var dm = Math.floor(totalDuration/60), ds = Math.floor(totalDuration%60);
        durationDisplayEl.textContent = dm+'分'+ds+'秒';
        bpmDisplayEl.textContent = '~'+(Math.round((allNotes.length>0?60/(totalDuration/Math.max(1,allNotes.length/4)):120)/5)*5);
        btnPlay1.disabled=false; btnReset1.disabled=false;
        btnPlay2.disabled=false; btnReset2.disabled=false;
        btnExportCustom.disabled = false;
        btnResetAll.disabled = false;
        updateLegend();
        resetPlayer(player1, btnPlay1, btnPlayText1, playLine1, timeDisplay1);
        resetPlayer(player2, btnPlay2, btnPlayText2, playLine2, timeDisplay2);
        layer1.innerHTML=''; layer2.innerHTML='';
        buildGridLines(grid1); buildGridLines(grid2);
        progress1.max = totalDuration || 1;
        progress2.max = totalDuration || 1;
        refreshWaterfall1(); refreshWaterfall2();
        if (fileName) {
            fileNameEl.textContent = fileName;
            uploadArea.classList.add('has-file');
        }
        saveState();
    } catch(err) { alert('MIDI解析失败: '+err.message); resetAll(); }
}

function loadMIDIFile(file){
    var reader = new FileReader();
    reader.onload = function(e) {
        var arrayBuffer = e.target.result;
        loadMIDIFromBuffer(arrayBuffer, file.name);
    };
    reader.readAsArrayBuffer(file);
}

function buildCustomNotes(){
    var oldCustom = customNotes.length === allNotes.length ? customNotes : [];
    var defaultIdx;
    if (customSamples.length === 0) {
        defaultIdx = -1;
    } else {
        defaultIdx = 0;
    }
    customNotes = allNotes.map(function(note, i) {
        var old = oldCustom[i] || {};
        var idx;
        if (old.customSampleIndex !== undefined && old.customSampleIndex < customSamples.length) {
            idx = old.customSampleIndex;
        } else if (old.customSampleIndex === -1) {
            idx = -1;
        } else {
            idx = defaultIdx;
        }
        var newNote = Object.assign({}, note, {_index: i});
        newNote.customSampleIndex = idx;
        newNote.customPitchOffset = old.customPitchOffset || 0;
        newNote.customVolumeScale = old.customVolumeScale || 100;
        return newNote;
    });
}

function updateLegend(){
    if(usedInstruments.size===0){ legendRow.style.display='none'; return; }
    legendRow.style.display='flex';
    var html=''; var count=0;
    usedInstruments.forEach(function(cfg){ if(count<12) html+='<span class="legend-item"><span class="legend-dot" style="background:'+cfg.color+';"></span>'+cfg.name+'</span>'; count++; });
    if(count>12) html+='<span class="legend-item">…</span>';
    legendContent.innerHTML=html;
}

function resetAll(){
    stopPlayerSound(player1); stopPlayerSound(player2);
    if(player1.isPlaying){ player1.isPlaying=false; if(player1.animationId) cancelAnimationFrame(player1.animationId); }
    if(player2.isPlaying){ player2.isPlaying=false; if(player2.animationId) cancelAnimationFrame(player2.animationId); }
    allNotes=[]; customNotes=[]; usedInstruments.clear(); totalDuration=0; midiFileBase64=null; midiFileName='';
    customSamples = [];
    player1.currentLogicalTime=0; player2.currentLogicalTime=0;
    layer1.innerHTML=''; layer2.innerHTML='';
    fileNameEl.textContent=''; uploadArea.classList.remove('has-file');
    btnPlay1.disabled=true; btnReset1.disabled=true;
    btnPlay2.disabled=true; btnReset2.disabled=true;
    btnExportCustom.disabled = true;
    btnResetAll.disabled = true;
    btnPlay1.classList.remove('paused-state'); btnPlayText1.textContent='播放';
    btnPlay2.classList.remove('paused-state'); btnPlayText2.textContent='播放';
    playLine1.style.background='#1e293b'; playLine2.style.background='#1e293b';
    trackCountEl.textContent='-'; noteCountEl.textContent='-'; durationDisplayEl.textContent='-'; bpmDisplayEl.textContent='-';
    timeDisplay1.textContent='00:00 / 00:00'; timeDisplay2.textContent='00:00 / 00:00';
    progress1.value = 0; progress1.max = 1; progressTime1.textContent = '0:00';
    progress2.value = 0; progress2.max = 1; progressTime2.textContent = '0:00';
    legendRow.style.display='none';
    sampleListDiv.innerHTML = '';
    clearState();
}

function tryRestoreState() {
    var state = loadState();
    if (!state) return false;
    if (!state.midiBase64 || !state.samples) return false;
    try {
        var midiBuf = base64ToArrayBuffer(state.midiBase64);
        var parsed = parseMIDI(midiBuf);
        allNotes = parsed.notes; totalDuration = parsed.totalSeconds; usedInstruments = parsed.instrumentSet;
        allNotes.forEach(function(n,i){ n._index = i; });
        midiFileBase64 = state.midiBase64;
        midiFileName = state.midiFileName || '';

        customSamples = [];
        state.samples.forEach(function(s, idx) {
            var color = s.color || sampleColors[idx % sampleColors.length];
            var buffer = null;
            var bufferBase64 = s.bufferBase64 || null;
            customSamples.push({
                fileName: s.fileName,
                color: color,
                basePitch: s.basePitch || 60,
                bufferBase64: bufferBase64,
                buffer: null
            });
        });

        if (state.customNotesAssign && state.customNotesAssign.length === allNotes.length) {
            customNotes = allNotes.map(function(note, i) {
                var assign = state.customNotesAssign[i] || {};
                var idx;
                if (assign.customSampleIndex !== undefined && assign.customSampleIndex < customSamples.length) {
                    idx = assign.customSampleIndex;
                } else if (assign.customSampleIndex === -1) {
                    idx = -1;
                } else {
                    idx = customSamples.length > 0 ? 0 : -1;
                }
                var newNote = Object.assign({}, note, {_index: i});
                newNote.customSampleIndex = idx;
                newNote.customPitchOffset = assign.customPitchOffset || 0;
                newNote.customVolumeScale = assign.customVolumeScale || 100;
                return newNote;
            });
        } else {
            buildCustomNotes();
        }

        trackCountEl.textContent = parsed.numTracks; noteCountEl.textContent = allNotes.length;
        var dm = Math.floor(totalDuration/60), ds = Math.floor(totalDuration%60);
        durationDisplayEl.textContent = dm+'分'+ds+'秒';
        bpmDisplayEl.textContent = '~'+(Math.round((allNotes.length>0?60/(totalDuration/Math.max(1,allNotes.length/4)):120)/5)*5);
        btnPlay1.disabled=false; btnReset1.disabled=false;
        btnPlay2.disabled=false; btnReset2.disabled=false;
        btnExportCustom.disabled = false;
        btnResetAll.disabled = false;
        updateLegend();
        resetPlayer(player1, btnPlay1, btnPlayText1, playLine1, timeDisplay1);
        resetPlayer(player2, btnPlay2, btnPlayText2, playLine2, timeDisplay2);
        layer1.innerHTML=''; layer2.innerHTML='';
        buildGridLines(grid1); buildGridLines(grid2);
        progress1.max = totalDuration || 1;
        progress2.max = totalDuration || 1;
        refreshWaterfall1(); refreshWaterfall2();
        fileNameEl.textContent = '已恢复的工作';
        uploadArea.classList.add('has-file');
        renderSamples();

        if (customSamples.length > 0) {
            var decodePromises = customSamples.map(function(s, idx) {
                if (s.bufferBase64) {
                    return audioCtx.decodeAudioData(base64ToArrayBuffer(s.bufferBase64)).then(function(buf) {
                        customSamples[idx].buffer = buf;
                    }).catch(function() {});
                }
                return Promise.resolve();
            });
            Promise.all(decodePromises).then(function() {
                refreshWaterfall2();
                saveState();
            });
        }
        return true;
    } catch(e) { return false; }
}

function initAudio(){
    if(!audioCtx){ audioCtx=new(window.AudioContext||window.webkitAudioContext)(); masterGain=audioCtx.createGain(); masterGain.gain.value=0.7; masterGain.connect(audioCtx.destination); }
    if(audioCtx.state==='suspended') audioCtx.resume();
}
