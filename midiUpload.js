// MIDI 解析（独立函数）
function parseMIDI(arrayBuffer) {
    const data = new Uint8Array(arrayBuffer);
    let offset = 0;
    const readUint32 = () => { const v = (data[offset]<<24)|(data[offset+1]<<16)|(data[offset+2]<<8)|data[offset+3]; offset+=4; return v>>>0; };
    const readUint16 = () => { const v = (data[offset]<<8)|data[offset+1]; offset+=2; return v; };
    const readVarLen = () => { let v=0,b; do{ b=data[offset++]; v=(v<<7)|(b&0x7f); }while(b&0x80); return v; };
    const headerId = String.fromCharCode(data[offset],data[offset+1],data[offset+2],data[offset+3]); offset+=4;
    if(headerId!=='MThd') throw new Error('无效MIDI文件');
    const headerLen=readUint32(); const format=readUint16(); const numTracks=readUint16(); const ticksPerQuarter=readUint16();
    if(headerLen>6) offset+=(headerLen-6);
    const allTrackEvents=[]; let totalTicks=0;
    for(let t=0;t<numTracks;t++){
        const trackId=String.fromCharCode(data[offset],data[offset+1],data[offset+2],data[offset+3]); offset+=4;
        if(trackId!=='MTrk') throw new Error('轨道'+t+'缺少MTrk');
        const trackLen=readUint32(); const trackEnd=offset+trackLen;
        const events=[]; let runningStatus=null, absTicks=0;
        while(offset<trackEnd){
            const delta=readVarLen(); absTicks+=delta;
            let status=data[offset];
            if(status<0x80){ if(runningStatus===null){offset++; continue;} status=runningStatus; } else{ offset++; runningStatus=status; }
            const eventType=status&0xf0, channel=status&0x0f;
            if(status===0xff){ const metaType=data[offset++]; const len=readVarLen(); const start=offset;
                if(metaType===0x51 && len===3){ const tempo=(data[offset]<<16)|(data[offset+1]<<8)|data[offset+2]; events.push({type:'tempo',ticks:absTicks,tempo}); }
                offset=start+len; runningStatus=null; }
            else if(status===0xf0||status===0xf7){ const len=readVarLen(); offset+=len; runningStatus=null; }
            else if(eventType===0x80||eventType===0x90){ const pitch=data[offset++], vel=data[offset++];
                events.push({type:(eventType===0x90 && vel>0)?'noteOn':'noteOff', ticks:absTicks, channel, pitch, velocity:vel}); }
            else if(eventType===0xc0){ events.push({type:'programChange',ticks:absTicks,channel,program:data[offset++]}); }
            else if(eventType===0xb0){ events.push({type:'controlChange',ticks:absTicks,channel,controller:data[offset++],value:data[offset++]}); }
            else if(eventType===0xe0){ const lsb=data[offset++], msb=data[offset++]; events.push({type:'pitchBend',ticks:absTicks,channel,value:(msb<<7)|lsb}); }
            else if(eventType===0xd0||eventType===0xa0){ offset+=2; }
            else{ if(offset<trackEnd) offset++; }
        }
        if(absTicks>totalTicks) totalTicks=absTicks;
        allTrackEvents.push(events);
        offset=trackEnd;
    }
    let allTempoEvents=[];
    allTrackEvents.forEach(trk=>trk.forEach(e=>{ if(e.type==='tempo') allTempoEvents.push(e); }));
    allTempoEvents.sort((a,b)=>a.ticks-b.ticks);
    let currentTempo=500000, lastTick=0, lastSeconds=0;
    const tickToSecondsMap=[{startTick:0,startSeconds:0,tempo:currentTempo}];
    allTempoEvents.forEach(te=>{
        const td=te.ticks-lastTick; const sd=(td/ticksPerQuarter)*(currentTempo/1000000);
        lastSeconds+=sd; tickToSecondsMap.push({startTick:te.ticks,startSeconds:lastSeconds,tempo:te.tempo});
        lastTick=te.ticks; currentTempo=te.tempo;
    });
    const finalS=lastSeconds+((totalTicks-lastTick)/ticksPerQuarter)*(currentTempo/1000000);
    const tickToSeconds=(tick)=>{
        let seg=tickToSecondsMap[0];
        for(let i=tickToSecondsMap.length-1;i>=0;i--) if(tick>=tickToSecondsMap[i].startTick){ seg=tickToSecondsMap[i]; break; }
        return seg.startSeconds+((tick-seg.startTick)/ticksPerQuarter)*(seg.tempo/1000000);
    };
    let channelProg=new Array(16).fill(0);
    const noteStacks=Array.from({length:16},()=>({}));
    const notes=[];
    let allFlat=[]; allTrackEvents.forEach(trk=>allFlat.push(...trk));
    allFlat.sort((a,b)=>a.ticks-b.ticks);
    allFlat.forEach(ev=>{
        if(ev.type==='programChange') channelProg[ev.channel]=ev.program;
        else if(ev.type==='noteOn'){
            const stack=noteStacks[ev.channel]; if(!stack[ev.pitch]) stack[ev.pitch]=[];
            stack[ev.pitch].push({startTick:ev.ticks,velocity:ev.velocity,program:channelProg[ev.channel]});
        } else if(ev.type==='noteOff'){
            const stack=noteStacks[ev.channel];
            if(stack[ev.pitch]&&stack[ev.pitch].length){
                const on=stack[ev.pitch].shift(); const st=tickToSeconds(on.startTick), et=tickToSeconds(ev.ticks);
                if(et>st && on.velocity>0) notes.push({startTime:st,endTime:et,pitch:ev.pitch,velocity:on.velocity,channel:ev.channel,program:on.program});
            }
        }
    });
    noteStacks.forEach((stack,ch)=>{
        Object.keys(stack).forEach(p=>{
            while(stack[p].length){
                const on=stack[p].shift(); const st=tickToSeconds(on.startTick);
                const et=Math.min(st+0.5,finalS);
                if(et>st && on.velocity>0) notes.push({startTime:st,endTime:et,pitch:parseInt(p),velocity:on.velocity,channel:ch,program:on.program});
            }
        });
    });
    notes.sort((a,b)=>a.startTime-b.startTime);
    notes.forEach(n=>{ const config=getConfigForProgram(n.program); n.color=config.color; n.waveform=config.waveform; n.config=config; });
    const instSet=new Map(); notes.forEach(n=>{ if(!instSet.has(n.program)) instSet.set(n.program,getConfigForProgram(n.program)); });
    return {numTracks,totalSeconds:finalS,notes,instrumentSet:instSet};
}

// 加载 MIDI
function loadMIDIFromBuffer(arrayBuffer, fileName) {
    try {
        const parsed = parseMIDI(arrayBuffer);
        allNotes = parsed.notes; totalDuration = parsed.totalSeconds; usedInstruments = parsed.instrumentSet;
        allNotes.forEach((n,i) => n._index = i);
        midiFileBase64 = arrayBufferToBase64(arrayBuffer);
        midiFileName = fileName.replace(/\.[^.]+$/, ''); // 去掉扩展名
        buildCustomNotes();
        trackCountEl.textContent = parsed.numTracks; noteCountEl.textContent = allNotes.length;
        const dm = Math.floor(totalDuration/60), ds = Math.floor(totalDuration%60);
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
    const reader = new FileReader();
    reader.onload = (e) => {
        const arrayBuffer = e.target.result;
        loadMIDIFromBuffer(arrayBuffer, file.name);
    };
    reader.readAsArrayBuffer(file);
}

// 构建自定义音符（调用时使用全局 customSamples）
function buildCustomNotes(){
    const oldCustom = customNotes.length === allNotes.length ? customNotes : [];
    let defaultIdx;
    if (customSamples.length === 0) {
        defaultIdx = -1;
    } else {
        defaultIdx = 0;
    }
    customNotes = allNotes.map((note, i) => {
        const old = oldCustom[i] || {};
        let idx;
        if (old.customSampleIndex !== undefined && old.customSampleIndex < customSamples.length) {
            idx = old.customSampleIndex;
        } else if (old.customSampleIndex === -1) {
            idx = -1;
        } else {
            idx = defaultIdx;
        }
        const newNote = {...note, _index: i};
        newNote.customSampleIndex = idx;
        newNote.customPitchOffset = old.customPitchOffset || 0;
        newNote.customVolumeScale = old.customVolumeScale || 100;
        return newNote;
    });
}

// 更新图例
function updateLegend(){
    if(usedInstruments.size===0){ legendRow.style.display='none'; return; }
    legendRow.style.display='flex';
    let html=''; let count=0;
    usedInstruments.forEach(cfg=>{ if(count<12) html+=`<span class="legend-item"><span class="legend-dot" style="background:${cfg.color};"></span>${cfg.name}</span>`; count++; });
    if(count>12) html+='<span class="legend-item">…</span>';
    legendContent.innerHTML=html;
}

// 重置全部
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

// 恢复状态
function tryRestoreState() {
    const state = loadState();
    if (!state) return false;
    if (!state.midiBase64 || !state.samples) return false;
    try {
        const midiBuf = base64ToArrayBuffer(state.midiBase64);
        const parsed = parseMIDI(midiBuf);
        allNotes = parsed.notes; totalDuration = parsed.totalSeconds; usedInstruments = parsed.instrumentSet;
        allNotes.forEach((n,i) => n._index = i);
        midiFileBase64 = state.midiBase64;
        midiFileName = state.midiFileName || '';

        customSamples = [];
        state.samples.forEach((s, idx) => {
            const color = s.color || sampleColors[idx % sampleColors.length];
            let buffer = null;
            let bufferBase64 = s.bufferBase64 || null;
            customSamples.push({
                fileName: s.fileName,
                color: color,
                basePitch: s.basePitch || 60,
                bufferBase64: bufferBase64,
                buffer: null
            });
        });

        if (state.customNotesAssign && state.customNotesAssign.length === allNotes.length) {
            customNotes = allNotes.map((note, i) => {
                const assign = state.customNotesAssign[i] || {};
                let idx;
                if (assign.customSampleIndex !== undefined && assign.customSampleIndex < customSamples.length) {
                    idx = assign.customSampleIndex;
                } else if (assign.customSampleIndex === -1) {
                    idx = -1;
                } else {
                    idx = customSamples.length > 0 ? 0 : -1;
                }
                const newNote = {...note, _index: i};
                newNote.customSampleIndex = idx;
                newNote.customPitchOffset = assign.customPitchOffset || 0;
                newNote.customVolumeScale = assign.customVolumeScale || 100;
                return newNote;
            });
        } else {
            buildCustomNotes();
        }

        trackCountEl.textContent = parsed.numTracks; noteCountEl.textContent = allNotes.length;
        const dm = Math.floor(totalDuration/60), ds = Math.floor(totalDuration%60);
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
            const decodePromises = customSamples.map((s, idx) => {
                if (s.bufferBase64) {
                    return audioCtx.decodeAudioData(base64ToArrayBuffer(s.bufferBase64)).then(buf => {
                        customSamples[idx].buffer = buf;
                    }).catch(() => {});
                }
                return Promise.resolve();
            });
            Promise.all(decodePromises).then(() => {
                refreshWaterfall2();
                saveState();
            });
        }

        return true;
    } catch(e) { return false; }
}

// 初始化音频
function initAudio(){
    if(!audioCtx){ audioCtx=new(window.AudioContext||window.webkitAudioContext)(); masterGain=audioCtx.createGain(); masterGain.gain.value=0.7; masterGain.connect(audioCtx.destination); }
    if(audioCtx.state==='suspended') audioCtx.resume();
}
