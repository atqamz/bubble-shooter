// ── audio.js ── Procedural BGM + SFX via Tone.js ──────────────────────────────
// All audio is generated algorithmically. No samples required.

let audioReady = false;

// ── Master chain ──
const masterComp = new Tone.Compressor(-12, 4).toDestination();
const masterVol  = new Tone.Volume(-4).connect(masterComp);
const reverbBus  = new Tone.Reverb({ decay: 2.5, wet: 0.3 }).connect(masterVol);
const delayBus   = new Tone.FeedbackDelay("8n.", 0.35);
delayBus.wet.value = 0.25;
delayBus.connect(reverbBus);

// ── BGM Instruments ──

// Kick
const kick = new Tone.MembraneSynth({
    pitchDecay: 0.06, octaves: 6, oscillator: { type: "sine" },
    envelope: { attack: 0.001, decay: 0.3, sustain: 0, release: 0.1 }
}).connect(masterVol);
kick.volume.value = -2;

// Sub bass
const bass = new Tone.MonoSynth({
    oscillator: { type: "sawtooth" },
    filter: { Q: 2, type: "lowpass", rolloff: -24 },
    envelope: { attack: 0.01, decay: 0.2, sustain: 0.6, release: 0.3 },
    filterEnvelope: { attack: 0.02, decay: 0.15, sustain: 0.2, release: 0.3, baseFrequency: 60, octaves: 2.5 }
}).connect(masterVol);
bass.volume.value = -6;

// Hi-hat (noise burst)
const hatFilter = new Tone.Filter(8000, "bandpass").connect(masterVol);
const hat = new Tone.NoiseSynth({
    noise: { type: "white" },
    envelope: { attack: 0.001, decay: 0.06, sustain: 0, release: 0.02 }
}).connect(hatFilter);
hat.volume.value = -14;

// Open hat
const ohatFilter = new Tone.Filter(7000, "bandpass").connect(masterVol);
const ohat = new Tone.NoiseSynth({
    noise: { type: "white" },
    envelope: { attack: 0.001, decay: 0.18, sustain: 0, release: 0.08 }
}).connect(ohatFilter);
ohat.volume.value = -16;

// Arp lead
const arp = new Tone.PolySynth(Tone.FMSynth, {
    harmonicity: 2, modulationIndex: 1.5,
    oscillator: { type: "triangle" },
    envelope: { attack: 0.005, decay: 0.15, sustain: 0.1, release: 0.4 },
    modulation: { type: "square" },
    modulationEnvelope: { attack: 0.01, decay: 0.1, sustain: 0.2, release: 0.3 }
}).connect(delayBus);
arp.volume.value = -14;

// Pad / drone
const pad = new Tone.PolySynth(Tone.Synth, {
    oscillator: { type: "sine4" },
    envelope: { attack: 1.5, decay: 2, sustain: 0.5, release: 3 }
}).connect(reverbBus);
pad.volume.value = -18;

// Snare (noise + tone body)
const snareBody = new Tone.MembraneSynth({
    pitchDecay: 0.02, octaves: 4,
    envelope: { attack: 0.001, decay: 0.12, sustain: 0, release: 0.05 }
}).connect(masterVol);
snareBody.volume.value = -10;
const snareNoise = new Tone.NoiseSynth({
    noise: { type: "pink" },
    envelope: { attack: 0.001, decay: 0.13, sustain: 0, release: 0.05 }
}).connect(masterVol);
snareNoise.volume.value = -12;

// ── SFX Instruments (separate from BGM) ──
const sfxBus = new Tone.Volume(-2).connect(masterComp);

const shootSynth = new Tone.Synth({
    oscillator: { type: "sine" },
    envelope: { attack: 0.001, decay: 0.08, sustain: 0, release: 0.05 }
}).connect(sfxBus);

const impactSynth = new Tone.MembraneSynth({
    pitchDecay: 0.03, octaves: 3,
    envelope: { attack: 0.001, decay: 0.15, sustain: 0, release: 0.08 }
}).connect(sfxBus);

const clearSynth = new Tone.PolySynth(Tone.Synth, {
    oscillator: { type: "triangle" },
    envelope: { attack: 0.005, decay: 0.2, sustain: 0, release: 0.3 }
}).connect(new Tone.FeedbackDelay("16n", 0.2).connect(sfxBus));
clearSynth.volume.value = -4;

const comboSynth = new Tone.FMSynth({
    harmonicity: 3, modulationIndex: 10,
    envelope: { attack: 0.001, decay: 0.25, sustain: 0, release: 0.2 },
    modulationEnvelope: { attack: 0.001, decay: 0.1, sustain: 0, release: 0.1 }
}).connect(sfxBus);

const bombNoise = new Tone.NoiseSynth({
    noise: { type: "brown" },
    envelope: { attack: 0.001, decay: 0.5, sustain: 0, release: 0.3 }
}).connect(new Tone.Filter(400, "lowpass").connect(sfxBus));
bombNoise.volume.value = 2;

const bombTone = new Tone.MembraneSynth({
    pitchDecay: 0.08, octaves: 8,
    envelope: { attack: 0.001, decay: 0.6, sustain: 0, release: 0.3 }
}).connect(sfxBus);
bombTone.volume.value = 0;

const dropSynth = new Tone.Synth({
    oscillator: { type: "sawtooth" },
    envelope: { attack: 0.001, decay: 0.3, sustain: 0, release: 0.1 }
}).connect(new Tone.Filter(2000, "lowpass").connect(sfxBus));
dropSynth.volume.value = -6;

// ── BGM Sequencing ──
// Key: C minor
const BASS_NOTES = ["C1", "C1", "Eb1", "G1", "Ab1", "G1", "Eb1", "D1"];
const ARP_NOTES = [
    ["C4","Eb4","G4"], ["C4","Eb4","G4"], ["Bb3","D4","F4"], ["Bb3","D4","F4"],
    ["Ab3","C4","Eb4"], ["Ab3","C4","Eb4"], ["G3","Bb3","D4"], ["G3","Bb3","D4"]
];
const PAD_CHORDS = [["C3","Eb3","G3","Bb3"], ["Ab2","C3","Eb3","G3"]];

let loopsStarted = false;

function scheduleBGM() {
    if (loopsStarted) return;
    loopsStarted = true;
    const bpm = 128;
    Tone.Transport.bpm.value = bpm;

    // Kick: four-on-the-floor with ghost hits
    new Tone.Sequence((time, vel) => {
        if (vel > 0) kick.triggerAttackRelease("C1", "16n", time, vel);
    }, [1, 0, 0.3, 0, 1, 0, 0.3, 0.15, 1, 0, 0.3, 0, 1, 0, 0.4, 0], "16n").start(0);

    // Snare on 2 and 4
    new Tone.Sequence((time, vel) => {
        if (vel > 0) {
            snareBody.triggerAttackRelease("C3", "32n", time, vel * 0.6);
            snareNoise.triggerAttackRelease("32n", time, vel);
        }
    }, [0, 0, 0, 0, 1, 0, 0, 0, 0, 0, 0, 0, 1, 0, 0, 0.4], "16n").start(0);

    // Hats: syncopated 16ths
    new Tone.Sequence((time, vel) => {
        if (vel > 0) hat.triggerAttackRelease("32n", time, vel);
        if (vel === 0.5) ohat.triggerAttackRelease("16n", time, 0.4);
    }, [0.8, 0.3, 0.5, 0.3, 0.8, 0.3, 0.6, 0.4, 0.8, 0.3, 0.5, 0.3, 0.9, 0.4, 0.5, 0.3], "16n").start(0);

    // Bass line: 8th notes following pattern
    let bassIdx = 0;
    new Tone.Loop((time) => {
        bass.triggerAttackRelease(BASS_NOTES[bassIdx % BASS_NOTES.length], "8n", time);
        bassIdx++;
    }, "8n").start(0);

    // Arp: random from chord tones, 16th note rhythm
    let arpIdx = 0;
    new Tone.Loop((time) => {
        const chordIdx = Math.floor(arpIdx / 4) % ARP_NOTES.length;
        const chord = ARP_NOTES[chordIdx];
        const note = chord[Math.floor(Math.random() * chord.length)];
        if (Math.random() > 0.3) {
            arp.triggerAttackRelease(note, "32n", time, 0.3 + Math.random() * 0.3);
        }
        arpIdx++;
    }, "16n").start("1m"); // Start after 1 bar buildup

    // Pad: slow chord changes every 2 bars
    let padIdx = 0;
    new Tone.Loop((time) => {
        const chord = PAD_CHORDS[padIdx % PAD_CHORDS.length];
        pad.triggerAttackRelease(chord, "1m", time, 0.4);
        padIdx++;
    }, "2m").start("2m"); // Start after 2 bars
}

// ── Public API ──

function initAudio() {
    if (audioReady) return;
    audioReady = true;
    Tone.start();
    scheduleBGM();
}

function startMusic() {
    if (!audioReady) return;
    Tone.Transport.start("+0.05");
}

function stopMusic() {
    Tone.Transport.pause();
}

// ── SFX API ──

function playShoot() {
    if (!audioReady) return;
    try {
        const note = Tone.Frequency("C5").transpose(Math.floor(Math.random() * 12));
        shootSynth.triggerAttackRelease(note, "32n", undefined, 0.5);
    } catch(e) {}
}

function playImpact() {
    if (!audioReady) return;
    try {
        impactSynth.triggerAttackRelease("G2", "16n", undefined, 0.6);
    } catch(e) {}
}

function playClear(count) {
    if (!audioReady) return;
    try {
        // Rising arpeggio based on count
        const baseNotes = ["C4", "Eb4", "G4", "Bb4", "C5", "Eb5", "G5"];
        const n = Math.min(count || 3, baseNotes.length);
        for (let i = 0; i < n; i++) {
            Tone.Draw.schedule(() => {}, `+${i * 0.06}`);
            clearSynth.triggerAttackRelease(baseNotes[i], "16n", `+${i * 0.06}`, 0.5);
        }
    } catch(e) {}
}

function playCombo(multiplier) {
    if (!audioReady) return;
    try {
        // Higher pitch for higher combos
        const semi = Math.min((multiplier || 1) * 4, 24);
        const note = Tone.Frequency("C4").transpose(semi);
        comboSynth.triggerAttackRelease(note, "8n", undefined, 0.7);
    } catch(e) {}
}

function playBomb() {
    if (!audioReady) return;
    try {
        bombTone.triggerAttackRelease("C1", "4n", undefined, 1);
        bombNoise.triggerAttackRelease("8n", "+0.02", 1);
    } catch(e) {}
}

function playDrop() {
    if (!audioReady) return;
    try {
        const note = Tone.Frequency("C3").transpose(-Math.floor(Math.random() * 12));
        dropSynth.triggerAttackRelease(note, "8n", undefined, 0.4);
    } catch(e) {}
}

function playLevelUp() {
    if (!audioReady) return;
    try {
        const notes = ["C4", "E4", "G4", "C5"];
        notes.forEach((n, i) => {
            clearSynth.triggerAttackRelease(n, "8n", `+${i * 0.12}`, 0.6);
        });
    } catch(e) {}
}

function playGameOver() {
    if (!audioReady) return;
    try {
        stopMusic();
        const notes = ["G3", "Eb3", "C3", "G2"];
        notes.forEach((n, i) => {
            comboSynth.triggerAttackRelease(n, "4n", `+${i * 0.3}`, 0.5);
        });
    } catch(e) {}
}
