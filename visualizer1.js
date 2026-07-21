function buildGridLines(container){ container.innerHTML=''; for(var i=1;i<8;i++){ var l=document.createElement('div'); l.className='grid-line'; l.style.top=(i/8*100)+'%'; container.appendChild(l); } }

function updateNoteBlocks(layer, wrapper, notesArray, currentTime, isCustom){
    var h = wrapper.clientHeight, w = wrapper.clientWidth;
    if(h<=0||w<=0) return;
    var playY = 10, bottom = h-4, usable = bottom-playY;
    var visible = [];
    var future = currentTime + lookAhead;
    notesArray.forEach(function(n,i){ if(n.endTime >= currentTime-0.1 && n.startTime <= future+0.5) visible.push(Object.assign({}, n, {_idx:i})); });
    if(isCustom && visible.length === 0){ layer.innerHTML = ''; return; }
    var minP=127, maxP=0;
    if(visible.length){ visible.forEach(function(n){ if(n.pitch<minP) minP=n.pitch; if(n.pitch>maxP) maxP=n.pitch; }); }
    else{ minP=36; maxP=96; }
    var pMin = Math.max(0, minP-4), pMax = Math.min(127, maxP+4), range = pMax-pMin || 12;
    var existing = new Map();
    [].slice.call(layer.children).forEach(function(c){ var idx = parseInt(c.dataset.noteIndex); if(!isNaN(idx)) existing.set(idx, c); });
    var used = new Set();
    visible.forEach(function(note){
        var idx = note._idx; used.add(idx);
        var block = existing.get(idx);
        var startY = playY + usable * ((note.startTime - currentTime) / lookAhead);
        var endY = playY + usable * ((note.endTime - currentTime) / lookAhead);
        var csY = Math.max(-30, Math.min(h+30, startY));
        var ceY = Math.max(-30, Math.min(h+30, endY));
        var bh = Math.max(4, ceY-csY);
        var xFrac = (note.pitch - pMin) / range;
        var xPos = xFrac * (w-20) + 4;
        var bw = Math.max(8, w/range*0.8);
        var isCurrentlyPlaying = (note.startTime <= currentTime && note.endTime > currentTime);
        var bgColor;
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
    existing.forEach(function(block, idx){
        if(!used.has(idx)){
            block.style.opacity = '0';
            setTimeout(function(){ if(block.parentNode) block.remove(); }, 250);
        }
    });
}

function refreshWaterfall1(){ updateNoteBlocks(layer1, vis1, allNotes, player1.currentLogicalTime, false); }
