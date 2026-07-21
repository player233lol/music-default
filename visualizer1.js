// 绘制网格
function buildGridLines(container){ container.innerHTML=''; for(let i=1;i<8;i++){ const l=document.createElement('div'); l.className='grid-line'; l.style.top=(i/8*100)+'%'; container.appendChild(l); } }

function updateNoteBlocks(layer, wrapper, notesArray, currentTime, isCustom){
    const h = wrapper.clientHeight, w = wrapper.clientWidth;
    if(h<=0||w<=0) return;
    const playY = 10, bottom = h-4, usable = bottom-playY;
    const visible = [];
    const future = currentTime + lookAhead;
    notesArray.forEach((n,i) => { if(n.endTime >= currentTime-0.1 && n.startTime <= future+0.5) visible.push({...n, _idx:i}); });
    if(isCustom && visible.length === 0){ layer.innerHTML = ''; return; }
    let minP=127, maxP=0;
    if(visible.length){ visible.forEach(n => { if(n.pitch<minP) minP=n.pitch; if(n.pitch>maxP) maxP=n.pitch; }); }
    else{ minP=36; maxP=96; }
    const pMin = Math.max(0, minP-4), pMax = Math.min(127, maxP+4), range = pMax-pMin || 12;
    const existing = new Map();
    [...layer.children].forEach(c => { const idx = parseInt(c.dataset.noteIndex); if(!isNaN(idx)) existing.set(idx, c); });
    const used = new Set();
    visible.forEach(note => {
        const idx = note._idx; used.add(idx);
        let block = existing.get(idx);
        const startY = playY + usable * ((note.startTime - currentTime) / lookAhead);
        const endY = playY + usable * ((note.endTime - currentTime) / lookAhead);
        const csY = Math.max(-30, Math.min(h+30, startY));
        const ceY = Math.max(-30, Math.min(h+30, endY));
        const bh = Math.max(4, ceY-csY);
        const xFrac = (note.pitch - pMin) / range;
        const xPos = xFrac * (w-20) + 4;
        const bw = Math.max(8, w/range*0.8);
        const isCurrentlyPlaying = (note.startTime <= currentTime && note.endTime > currentTime);
        let bgColor;
        if (isCustom && note.customSampleIndex === -1) {
            bgColor = '#cccccc';
        } else if (isCustom && note.customSampleIndex != null && customSamples[note.customSampleIndex]) {
            bgColor = customSamples[note.customSampleIndex].color;
        } else if (!isCustom) {
            bgColor = note.color;
        } else {
            bgColor = '#cccccc';
        }
        if(!block){
            block = document.createElement('div'); block.className = 'note-block';
            block.dataset.noteIndex = idx;
            block.style.backgroundColor = bgColor || '#aaa';
            layer.appendChild(block);
        } else {
            block.style.backgroundColor = bgColor || '#aaa';
        }
        if(isCurrentlyPlaying) block.classList.add('playing');
        else block.classList.remove('playing');
        block.style.left = xPos+'px'; block.style.top = csY+'px';
        block.style.width = bw+'px'; block.style.height = bh+'px';
        block.style.opacity = (csY > h+20 || ceY < playY-20) ? '0.15' : '1';
    });
    existing.forEach((block, idx) => {
        if(!used.has(idx)){
            block.style.opacity = '0';
            setTimeout(() => { if(block.parentNode) block.remove(); }, 250);
        }
    });
}

function refreshWaterfall1(){ updateNoteBlocks(layer1, vis1, allNotes, player1.currentLogicalTime, false); }
function refreshWaterfall2(){ updateNoteBlocks(layer2, vis2, customNotes, player2.currentLogicalTime, true); }

