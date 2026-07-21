// ========== 全局变量 ==========
const noteNames = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];
function getMidiNumber(octave, noteIndex) { return (octave + 1) * 12 + noteIndex; }

let allNotes = [];
let customNotes = [];
let usedInstruments = new Map();
let totalDuration = 0;
let audioCtx = null;
let masterGain = null;
let customSamples = [];
const sampleColors = ['#e53e3e','#dd6b20','#d69e2e','#3182ce','#6b46c1','#00a3c4','#805ad5','#38b2ac','#d53f8c','#c05621'];
const lookAhead = 3.4;
let midiFileBase64 = null;
let midiFileName = '';  // 存储MIDI文件名（不含扩展名）

// 播放器状态
const player1 = { isPlaying: false, animationId: null, scheduledNotes: new Set(), activeOscillators: [], playStartTime: 0, logicalStartOffset: 0, currentLogicalTime: 0 };
const player2 = { isPlaying: false, animationId: null, scheduledNotes: new Set(), activeOscillators: [], playStartTime: 0, logicalStartOffset: 0, currentLogicalTime: 0 };

// DOM 引用（全局）
const uploadArea = document.getElementById('uploadArea');
const fileInput = document.getElementById('fileInput');
const fileNameEl = document.getElementById('fileName');
const legendRow = document.getElementById('legendRow');
const legendContent = document.getElementById('legendContent');
const trackCountEl = document.getElementById('trackCount');
const noteCountEl = document.getElementById('noteCount');
const durationDisplayEl = document.getElementById('durationDisplay');
const bpmDisplayEl = document.getElementById('bpmDisplay');
const wavUploadArea = document.getElementById('wavUploadArea');
const wavFileInput = document.getElementById('wavFileInput');
const sampleListDiv = document.getElementById('sampleList');
const btnExportCustom = document.getElementById('btnExportCustom');
const btnResetAll = document.getElementById('btnResetAll');

const vis1 = document.getElementById('visualizerOriginal');
const layer1 = document.getElementById('notesLayer1');
const grid1 = document.getElementById('gridLines1');
const playLine1 = document.getElementById('playLine1');
const btnPlay1 = document.getElementById('btnPlay1');
const btnPlayText1 = document.getElementById('btnPlayText1');
const btnReset1 = document.getElementById('btnReset1');
const timeDisplay1 = document.getElementById('timeDisplay1');
const progress1 = document.getElementById('progress1');
const progressTime1 = document.getElementById('progressTime1');

const vis2 = document.getElementById('visualizerCustom');
const layer2 = document.getElementById('notesLayer2');
const grid2 = document.getElementById('gridLines2');
const playLine2 = document.getElementById('playLine2');
const btnPlay2 = document.getElementById('btnPlay2');
const btnPlayText2 = document.getElementById('btnPlayText2');
const btnReset2 = document.getElementById('btnReset2');
const timeDisplay2 = document.getElementById('timeDisplay2');
const progress2 = document.getElementById('progress2');
const progressTime2 = document.getElementById('progressTime2');

// ========== 工具函数 ==========
function getInstrumentGroup(p) {
    if(p<=7) return 'piano'; if(p<=15) return 'chromatic'; if(p<=23) return 'organ';
    if(p<=31) return 'guitar'; if(p<=39) return 'bass'; if(p<=47) return 'strings';
    if(p<=55) return 'ensemble'; if(p<=63) return 'brass'; if(p<=71) return 'reed';
    if(p<=79) return 'pipe'; if(p<=87) return 'synth_lead'; if(p<=95) return 'synth_pad';
    if(p<=103) return 'synth_fx'; if(p<=111) return 'ethnic'; if(p<=119) return 'percussive';
    return 'sfx';
}
const instrumentConfig = {
    piano:{color:'#e53e3e',name:'钢琴',waveform:'triangle',attack:0.008,decay:0.4,sustain:0.15},
    chromatic:{color:'#dd6b20',name:'打击旋律',waveform:'square',attack:0.003,decay:0.25,sustain:0.05},
    organ:{color:'#d69e2e',name:'风琴',waveform:'square',attack:0.04,decay:0.15,sustain:0.7},
    guitar:{color:'#3182ce',name:'吉他',waveform:'triangle',attack:0.004,decay:0.55,sustain:0.08},
    bass:{color:'#6b46c1',name:'贝斯',waveform:'sawtooth',attack:0.01,decay:0.35,sustain:0.25},
    strings:{color:'#00a3c4',name:'弦乐',waveform:'sawtooth',attack:0.12,decay:0.3,sustain:0.6},
    ensemble:{color:'#805ad5',name:'合奏',waveform:'sawtooth',attack:0.08,decay:0.25,sustain:0.55},
    brass:{color:'#d69e2e',name:'铜管',waveform:'sawtooth',attack:0.03,decay:0.25,sustain:0.5},
    reed:{color:'#e53e3e',name:'簧片',waveform:'sawtooth',attack:0.04,decay:0.3,sustain:0.45},
    pipe:{color:'#38b2ac',name:'管乐',waveform:'triangle',attack:0.06,decay:0.2,sustain:0.5},
    synth_lead:{color:'#d53f8c',name:'合成主音',waveform:'sawtooth',attack:0.015,decay:0.3,sustain:0.4},
    synth_pad:{color:'#6b46c1',name:'合成铺底',waveform:'sine',attack:0.2,decay:0.4,sustain:0.7},
    synth_fx:{color:'#e53e3e',name:'合成特效',waveform:'square',attack:0.01,decay:0.5,sustain:0.1},
    ethnic:{color:'#c05621',name:'民族乐器',waveform:'triangle',attack:0.02,decay:0.35,sustain:0.3},
    percussive:{color:'#718096',name:'打击音高',waveform:'square',attack:0.001,decay:0.15,sustain:0.02},
    sfx:{color:'#a0aec0',name:'音效',waveform:'sine',attack:0.01,decay:0.5,sustain:0.2},
};
function getConfigForProgram(p){ return instrumentConfig[getInstrumentGroup(p)] || instrumentConfig.piano; }

function arrayBufferToBase64(buffer) {
    const bytes = new Uint8Array(buffer);
    let binary = '';
    for (let i = 0; i < bytes.byteLength; i++) binary += String.fromCharCode(bytes[i]);
    return btoa(binary);
}
function base64ToArrayBuffer(base64) {
    const binary = atob(base64);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
    return bytes.buffer;
}

// ========== 本地存储 ==========
function saveState() {
    try {
        const state = {
            midiBase64: midiFileBase64,
            midiFileName: midiFileName,
            samples: customSamples.map(s => ({
                fileName: s.fileName,
                color: s.color,
                basePitch: s.basePitch,
                bufferBase64: s.bufferBase64 || null
            })),
            customNotesAssign: customNotes.map(n => ({
                customSampleIndex: n.customSampleIndex,
                customPitchOffset: n.customPitchOffset,
                customVolumeScale: n.customVolumeScale
            }))
        };
        localStorage.setItem('soundmaker_state', JSON.stringify(state));
    } catch(e) {}
}

function loadState() {
    const raw = localStorage.getItem('soundmaker_state');
    if (!raw) return null;
    try { return JSON.parse(raw); } catch(e) { return null; }
}

function clearState() {
    localStorage.removeItem('soundmaker_state');
}
