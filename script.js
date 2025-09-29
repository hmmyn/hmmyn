// Hmmyn - Minimal orb with HTMLAudio warm + Web Audio; hidden picker fallback

class HmmynOrb {
	constructor() {
		this.isRunning = false;
		this.isPaused = false;
		this.orb = document.getElementById('orb');
		this.filePick = document.getElementById('filePick');
		this.welcomeText = document.getElementById('welcomeText');
		this.celestialMenu = document.getElementById('celestialMenu');
		
		this.orbPosition = 0;
		this.animationId = null;
		this.mouseTimeout = null;
		this.maxDistance = 0;

		// Sine motion parameters (smooth turnarounds)
		this.cycleTimeSec = 4.5; // gentle, not too fast
		this.angularVelRadPerSec = (Math.PI * 2) / this.cycleTimeSec;
		this.startEpochMs = 0; // timestamp origin for RAF
		this.phaseOffsetRad = 0; // keeps continuity on pause/resume
		this.lastAngleRad = 0;

		// HTMLAudio (warm autoplay muted)
		this.elemAudio = null;
		this.htmlEarlyLoopSec = 2.0; // restart ~2s before natural end

		// Web Audio
		this.audioCtx = null;
		this.gainNode = null;
		this.bufferSource = null;
		this.musicBuffer = null; // cache decoded buffer
		this.webAudioCandidates = ['track.mp3.mp3'];
		
		this.init();
	}
	
	init() {
		this.updateMaxDistance();
		window.addEventListener('resize', () => this.updateMaxDistance());
		
		this.orb.addEventListener('click', () => this.toggleOrb());
		this.orb.addEventListener('touchstart', (e) => { e.preventDefault(); this.toggleOrb(); }, { passive: false });
		
		// Stop orb when clicking anywhere on screen (even if paused)
		document.addEventListener('click', (e) => {
			if ((this.isRunning || this.isPaused) && !this.orb.contains(e.target)) {
				this.stopOrb();
			}
		});
		
		// Show elements on mouse movement
		document.addEventListener('mousemove', () => this.showElements());

		// Ensure audio is unlocked on first user interaction (some browsers need this)
		document.addEventListener('click', async () => {
			try { await this.initAudioCtxIfNeeded(); } catch {}
			if (this.elemAudio) {
				try { this.elemAudio.muted = false; const p = this.elemAudio.play(); if (p && p.catch) p.catch(()=>{}); } catch {}
			}
		}, { once: true });
		
		if (this.filePick) {
			this.filePick.addEventListener('change', (e) => this.onPickFile(e));
		}
		// Warm media element
		this.elemAudio = new Audio('track.mp3.mp3');
		this.elemAudio.loop = true; // keep native looping; we'll still restart slightly early
		this.elemAudio.preload = 'auto';
		this.elemAudio.muted = true;
		this.elemAudio.autoplay = true;
		try { this.elemAudio.load(); } catch {}
		try { const p = this.elemAudio.play(); if (p && p.catch) p.catch(()=>{}); } catch {}

		// Manual early loop handler for HTMLAudio (guard against rapid retriggers)
		this._lastHtmlLoopAt = 0;
		this.elemAudio.addEventListener('timeupdate', () => {
			try {
				if (!this.isRunning) return; // don't auto-loop when orb is stopped/paused
				const dur = isFinite(this.elemAudio.duration) ? this.elemAudio.duration : NaN;
				const now = performance.now();
				if (!isNaN(dur) && dur - this.elemAudio.currentTime <= this.htmlEarlyLoopSec) {
					if (now - this._lastHtmlLoopAt > 500) { // avoid thrash within 0.5s window
						this._lastHtmlLoopAt = now;
						this.elemAudio.currentTime = 0;
						if (this.elemAudio.paused) { const p = this.elemAudio.play(); if (p && p.catch) p.catch(()=>{}); }
					}
				}
			} catch {}
		});
	}

	updateMaxDistance() {
		const orbSize = this.orb ? this.orb.offsetWidth : 200;
		// Restore wider travel for better tracking (90% of available half-span)
		const halfSpan = (window.innerWidth - orbSize) / 2;
		this.maxDistance = Math.max(0, halfSpan * 0.9);
	}

	async onPickFile(e) {
		const file = e.target.files && e.target.files[0];
		if (!file) return;
		try {
			const buf = await file.arrayBuffer();
			await this.initAudioCtxIfNeeded();
			this.musicBuffer = await this.audioCtx.decodeAudioData(buf);
			// Start immediately if running
			if (this.isRunning) await this.startMusicWebAudioWithBuffer(this.musicBuffer);
		} catch {}
	}

	async initAudioCtxIfNeeded() {
		if (!this.audioCtx) {
			const AudioCtx = window.AudioContext || window.webkitAudioContext;
			if (!AudioCtx) return false;
			this.audioCtx = new AudioCtx();
			this.gainNode = this.audioCtx.createGain();
			this.gainNode.gain.value = 1.0;
			this.gainNode.connect(this.audioCtx.destination);
		}
		if (this.audioCtx.state === 'suspended') { try { await this.audioCtx.resume(); } catch {} }
		return true;
	}

	buildAbsoluteUrl(fileName) {
		const base = document.location.href.replace(/[^/]+$/, '');
		return base + fileName + `?t=${Date.now()}`;
	}

	async fetchAndDecode(fileName) {
		try {
			const url = this.buildAbsoluteUrl(fileName);
			const resp = await fetch(url, { cache: 'no-store' });
			if (!resp.ok) return null;
			const data = await resp.arrayBuffer();
			if (!this.audioCtx) return null;
			try { return await this.audioCtx.decodeAudioData(data); } catch { return null; }
		} catch { return null; }
	}

	async startMusicWebAudioWithBuffer(buffer) {
		const ok = await this.initAudioCtxIfNeeded();
		if (!ok) return;
		if (this.bufferSource) { try { this.bufferSource.stop(); } catch {} this.bufferSource.disconnect(); this.bufferSource = null; }
		this.bufferSource = this.audioCtx.createBufferSource();
		this.bufferSource.buffer = buffer;
		// Implement early loop with explicit loop points when available
		const playBuffer = this.bufferSource.buffer;
		if (playBuffer) {
			const duration = playBuffer.duration || 0;
			const earlyEnd = Math.max(0, duration - 2.0);
			this.bufferSource.loop = true;
			this.bufferSource.loopStart = 0;
			this.bufferSource.loopEnd = earlyEnd > 0 ? earlyEnd : duration;
		} else {
			this.bufferSource.loop = true;
		}
		this.bufferSource.connect(this.gainNode);
		try { this.bufferSource.start(0); } catch {}
	}

	async startMusicWebAudio() {
		if (!this.musicBuffer) {
			this.musicBuffer = await this.fetchAndDecode('track.mp3.mp3');
		}
		if (this.musicBuffer) {
			await this.startMusicWebAudioWithBuffer(this.musicBuffer);
			return true;
		}
		return false;
	}

	async startMusic() {
		// Try the warmed HTMLAudio element by unmuting
		if (this.elemAudio) {
			try {
				this.elemAudio.muted = false;
				this.elemAudio.currentTime = 0;
				this.elemAudio.volume = 1.0;
				const p = this.elemAudio.play();
				if (p && p.then) { await p; return; }
				return;
			} catch {}
		}
		// Fall back to Web Audio
		const ok = await this.startMusicWebAudio();
		if (!ok) {
			// As last resort, prompt hidden picker once
			if (this.filePick) this.filePick.click();
		}
	}

	stopMusic() {
		if (this.elemAudio) { try { this.elemAudio.pause(); this.elemAudio.muted = true; this.elemAudio.currentTime = 0; } catch {} }
		if (this.bufferSource) { try { this.bufferSource.stop(); } catch {} this.bufferSource.disconnect(); this.bufferSource = null; }
	}
	
	toggleOrb() {
		if (this.isRunning) {
			this.pauseOrb();
		} else if (this.isPaused) {
			this.resumeOrb();
		} else {
			this.startOrb();
		}
	}
	
	async startOrb() {
		this.isRunning = true;
		this.isPaused = false;
		this.orb.classList.add('active');
		this.hideElements();
		await this.startMusic();
		this.startEpochMs = 0; // set on first RAF
		this.phaseOffsetRad = 0; // start centered
		this.animationId = requestAnimationFrame((ts) => this.animateOrb(ts));
	}

	pauseOrb() {
		this.isRunning = false;
		this.isPaused = true;
		if (this.animationId) { cancelAnimationFrame(this.animationId); this.animationId = null; }
		// Keep current transform; store phase for smooth resume
		this.phaseOffsetRad = this.lastAngleRad;
	}

	resumeOrb() {
		this.isRunning = true;
		this.isPaused = false;
		this.hideElements();
		this.startEpochMs = 0; // will rebase timing, preserving phaseOffsetRad
		this.animationId = requestAnimationFrame((ts) => this.animateOrb(ts));
	}
	
	stopOrb() {
		this.isRunning = false;
		this.isPaused = false;
		this.orb.classList.remove('active');
		if (this.animationId) { cancelAnimationFrame(this.animationId); this.animationId = null; }
		this.orbPosition = 0;
		this.phaseOffsetRad = 0;
		this.startEpochMs = 0;
		this.orb.style.transform = 'translate3d(0px, 0px, 0px)';
		this.stopMusic();
		this.showElements();
	}
	
	animateOrb(timestamp) {
		if (!this.isRunning) return;
		if (!this.maxDistance) this.updateMaxDistance();
		const ts = timestamp || performance.now();
		if (!this.startEpochMs) this.startEpochMs = ts;
		const tSec = (ts - this.startEpochMs) / 1000;
		const angle = this.phaseOffsetRad + this.angularVelRadPerSec * tSec;
		this.lastAngleRad = angle;
		this.orbPosition = Math.sin(angle) * this.maxDistance;
		const snappedX = Math.round(this.orbPosition);
		this.orb.style.transform = `translate3d(${snappedX}px, 0px, 0px)`;
		this.animationId = requestAnimationFrame((nextTs) => this.animateOrb(nextTs));
	}
	
	hideElements() {
		if (this.welcomeText) {
			this.welcomeText.classList.add('faded');
		}
		if (this.celestialMenu) {
			this.celestialMenu.classList.add('faded');
		}
	}
	
	showElements() {
		// Clear any existing timeout
		if (this.mouseTimeout) {
			clearTimeout(this.mouseTimeout);
		}
		
		// Show elements immediately
		if (this.welcomeText) {
			this.welcomeText.classList.remove('faded');
		}
		if (this.celestialMenu) {
			this.celestialMenu.classList.remove('faded');
		}
		
		// Hide elements again after 3 seconds of no mouse movement
		this.mouseTimeout = setTimeout(() => {
			if (this.isRunning) {
				this.hideElements();
			}
		}, 3000);
	}
}

// Initialize

document.addEventListener('DOMContentLoaded', () => {
	new HmmynOrb();
});
