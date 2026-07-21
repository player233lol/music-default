var noteNames = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];
function getMidiNumber(octave, noteIndex) { return (octave + 1) * 12 + noteIndex; }

var allNotes = [];
var customNotes = [];
var usedInstruments = new Map();
var totalDuration = 0;
var audioCtx = null;
var masterGain = null;
var customSamples = [];
var sampleColors = ['#e53e3e','#dd6b20','#d69e2e','#3182ce','#6b46c1','#00a3c4','#805ad5','#38b2ac','#d53f8c','#c05621'];
var lookAhead = 3.4;
var midiFileBase64 = null;
var midiFileName = '';

var player1 = { isPlaying: false, animationId: null, scheduledNotes: new Set(), activeOscillators: [], playStartTime: 0, logicalStartOffset: 0, currentLogicalTime: 0 };
var player2 = { isPlaying: false, animationId: null, scheduledNotes: new Set(), activeOscillators: [], playStartTime: 0, logicalStartOffset: 0, currentLogicalTime: 0 };

var uploadArea = document.getElementById('uploadArea');
var fileInput = document.getElementById('fileInput');
var fileNameEl = document.getElementById('fileName');
var legendRow = document.getElementById('legendRow');
var legendContent = document.getElementById('legendContent');
var trackCountEl = document.getElementById('trackCount');
var noteCountEl = document.getElementById('noteCount');
var durationDisplayEl = document.getElementById('durationDisplay');
var bpmDisplayEl = document.getElementById('bpmDisplay');
var wavUploadArea = document.getElementById('wavUploadArea');
var wavFileInput = document.getElementById('wavFileInput');
var sampleListDiv = document.getElementById('sampleList');
var btnExportCustom = document.getElementById('btnExportCustom');
var btnResetAll = document.getElementById('btnResetAll');

var vis1 = document.getElementById('visualizerOriginal');
var layer1 = document.getElementById('notesLayer1');
var grid1 = document.getElementById('gridLines1');
var playLine1 = document.getElementById('playLine1');
var btnPlay1 = document.getElementById('btnPlay1');
var btnPlayText1 = document.getElementById('btnPlayText1');
var btnReset1 = document.getElementById('btnReset1');
var timeDisplay1 = document.getElementById('timeDisplay1');
var progress1 = document.getElementById('progress1');
var progressTime1 = document.getElementById('progressTime1');

var vis2 = document.getElementById('visualizerCustom');
var layer2 = document.getElementById('notesLayer2');
var grid2 = document.getElementById('gridLines2');
var playLine2 = document.getElementById('playLine2');
var btnPlay2 = document.getElementById('btnPlay2');
var btnPlayText2 = document.getElementById('btnPlayText2');
var btnReset2 = document.getElementById('btnReset2');
var timeDisplay2 = document.getElementById('timeDisplay2');
var progress2 = document.getElementById('progress2');
var progressTime2 = document.getElementById('progressTime2');

function getInstrumentGroup(p) {
    if(p<=7) return 'piano'; if(p<=15) return 'chromatic'; if(p<=23) return 'organ';
    if(p<=31) return 'guitar'; if(p<=39) return 'bass'; if(p<=47) return 'strings';
    if(p<=55) return 'ensemble'; if(p<=63) return 'brass'; if(p<=71) return 'reed';
    if(p<=79) return 'pipe'; if(p<=87) return 'synth_lead'; if(p<=95) return 'synth_pad';
    if(p<=103) return 'synth_fx'; if(p<=111) return 'ethnic'; if(p<=119) return 'percussive';
    return 'sfx';
}
var instrumentConfig = {
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
    var bytes = new Uint8Array(buffer);
    var binary = '';
    for (var i = 0; i < bytes.byteLength; i++) binary += String.fromCharCode(bytes[i]);
    return btoa(binary);
}
function base64ToArrayBuffer(base64) {
    var binary = atob(base64);
    var bytes = new Uint8Array(binary.length);
    for (var i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
    return bytes.buffer;
}

function saveState() {
    try {
        var state = {
            midiBase64: midiFileBase64,
            midiFileName: midiFileName,
            samples: customSamples.map(function(s) {
                return {
                    fileName: s.fileName,
                    color: s.color,
                    basePitch: s.basePitch,
                    bufferBase64: s.bufferBase64 || null
                };
            }),
            customNotesAssign: customNotes.map(function(n) {
                return {
                    customSampleIndex: n.customSampleIndex,
                    customPitchOffset: n.customPitchOffset,
                    customVolumeScale: n.customVolumeScale
                };
            })
        };
        localStorage.setItem('soundmaker_state', JSON.stringify(state));
    } catch(e) {}
}

function loadState() {
    var raw = localStorage.getItem('soundmaker_state');
    if (!raw) return null;
    try { return JSON.parse(raw); } catch(e) { return null; }
}

function clearState() {
    localStorage.removeItem('soundmaker_state');
}
