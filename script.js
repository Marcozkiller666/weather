/**
 * Weather Scenery Application
 * Enhanced modular JavaScript with improved architecture
 */

class WeatherScenery {
  constructor() {
    // API Configuration
    this.WTTR_BASE = 'https://wttr.in';
    this.WTTR_FORMAT = '%l|%C|%t|%h|%P|%w|%p|%S|%s|%T|%m|%M|%Z|%f|%u';
    this.IPAPI_URL = 'https://ipapi.co/json/';

    // Canvas and context
    this.canvas = document.getElementById('scene');
    this.ctx = this.canvas.getContext('2d');
    this.flashEl = document.getElementById('flash');

    // UI Elements
    this.initUIElements();

    // Scene state
    this.initSceneState();

    // Animation and timing
    this.raf = null;
    this.startTime = performance.now();
    this.lastTickMs = performance.now();

    // Weather state
    this.currentQuery = '';
    this.mode = 'clear';
    this.isNight = false;
    this.moonPhase = 0.5;

    // Visual effects state
    this.nightBlend = 0;
    this.targetNight = 0;
    this.cloudCover = 0;
    this.windVel = 0;
    this.windDir = { dx: 0, dy: 0 };

    // Thunder effects
    this.lastFlash = 0;
    this.bolt = null;

    // Constants
    this.NIGHT_LERP = 0.06;
    this.DPR = Math.min(2, window.devicePixelRatio || 1);

    this.init();
  }

  initUIElements() {
    this.elements = {
      cityInput: document.getElementById('cityInput'),
      cityBtn: document.getElementById('cityBtn'),
      statLocation: document.getElementById('statLocation'),
      statTemp: document.getElementById('statTemp'),
      statPressure: document.getElementById('statPressure'),
      statHumidity: document.getElementById('statHumidity'),
      statWind: document.getElementById('statWind'),
      statPerp: document.getElementById('statPerp'),
      statUV: document.getElementById('statUV'),
      statTime: document.getElementById('statTime')
    };
  }

  initSceneState() {
    this.W = 0;
    this.H = 0;
    this.particles = [];
    this.clouds = [];
    this.trees = [];
    this.stars = [];
    this.shootingStars = [];
    this.birds = [];
  }

  async init() {
    this.setupEventListeners();
    await this.detectCityViaIP();
    await this.fetchWeather(this.currentQuery);
    this.setupPeriodicUpdate();
    setTimeout(() => this.resize(), 50);
  }

  setupEventListeners() {
    // Window events
    window.addEventListener('resize', () => this.resize());

    // UI events
    this.elements.cityBtn.addEventListener('click', () => {
      this.currentQuery = this.elements.cityInput.value.trim();
      this.fetchWeather(this.currentQuery);
    });

    this.elements.cityInput.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        this.currentQuery = this.elements.cityInput.value.trim();
        this.fetchWeather(this.currentQuery);
      }
    });

    // Add input validation and user feedback
    this.elements.cityInput.addEventListener('input', (e) => {
      const value = e.target.value.trim();
      if (value.length > 50) {
        e.target.value = value.substring(0, 50);
      }
    });
  }

  setupPeriodicUpdate() {
    // Update weather every 10 minutes
    setInterval(() => this.fetchWeather(this.currentQuery), 10 * 60 * 1000);
  }

  resize() {
    this.DPR = Math.min(2, window.devicePixelRatio || 1);
    this.W = Math.floor(window.innerWidth * this.DPR);
    this.H = Math.floor(window.innerHeight * this.DPR);
    
    this.canvas.width = this.W;
    this.canvas.height = this.H;
    this.canvas.style.width = window.innerWidth + 'px';
    this.canvas.style.height = window.innerHeight + 'px';
    
    this.ctx.setTransform(this.DPR, 0, 0, this.DPR, 0, 0);
    this.initSceneObjects();
  }

  // Weather API Methods
  async detectCityViaIP() {
    try {
      const response = await fetch(this.IPAPI_URL, { 
        cache: 'no-store',
        signal: AbortSignal.timeout(5000) // 5 second timeout
      });
      
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      
      const info = await response.json();
      const city = info?.city?.trim();
      
      if (city) {
        this.currentQuery = city;
        this.elements.cityInput.value = city;
        this.updateLocationDisplay(`Detected: ${city}`);
      }
    } catch (err) {
      console.warn('City auto-detect failed:', err.message);
      this.updateLocationDisplay('Location detection failed');
    }
  }

  buildWttrUrl(query) {
    const q = (query || '').trim();
    const target = q ? `${this.WTTR_BASE}/${encodeURIComponent(q)}` : this.WTTR_BASE;
    return `${target}?format=${encodeURIComponent(this.WTTR_FORMAT)}`;
  }

  async fetchWeather(query = this.currentQuery) {
    const url = this.buildWttrUrl(query);
    this.showLoadingState();

    try {
      const response = await fetch(url, { 
        cache: 'no-store',
        signal: AbortSignal.timeout(10000) // 10 second timeout
      });
      
      const text = await response.text();
      
      if (!response.ok) {
        this.showError(`Weather service error: ${response.status}`);
        throw new Error(`HTTP ${response.status}: ${text}`);
      }

      this.parseWeatherData(text, query);
      
    } catch (err) {
      console.warn('Weather fetch failed:', err.message);
      this.showError('Unable to fetch weather data');
      this.setFallbackMode();
    } finally {
      this.resize();
      this.startAnimation();
    }
  }

  parseWeatherData(text, query) {
    if (text.toLowerCase().includes("unknown location")) {
      this.showError("Location not found. Please try a different city.");
      return;
    }

    if (text.toLowerCase().includes("ran out of our datasource capacity")) {
      this.showError("Weather service temporarily unavailable. Please try again later.");
      return;
    }

    const line = text.split('\n').find(l => l.trim().length > 0) || text;
    const parts = line.split('|').map(p => p.trim());

    const weatherData = {
      location: parts[0] || (query || 'Unknown location'),
      condition: parts[1] || '',
      temperature: parts[2] || '—',
      humidity: parts[3] || '—',
      pressure: parts[4] || '—',
      wind: parts[5] || '—',
      precipitation: parts[6] || '—',
      sunrise: parts[7] || null,
      sunset: parts[8] || null,
      time: parts[9] || null,
      moonEmoji: parts[10] || '',
      moonDay: parts[11] || null,
      timezone: parts[12] || '',
      feelsLike: parts[13] || '—',
      uvIndex: parts[14] || '—'
    };

    this.updateWeatherDisplay(weatherData);
    this.updateSceneMode(weatherData);
  }

  updateWeatherDisplay(data) {
    // Location with marquee for long names
    const locationText = `${data.location}: ${data.condition}`;
    this.updateLocationDisplay(locationText);

    // Weather stats
    this.elements.statTemp.textContent = `${data.temperature}(${data.feelsLike})`;
    this.elements.statPressure.textContent = data.pressure;
    this.elements.statHumidity.textContent = data.humidity;
    this.elements.statWind.textContent = data.wind;
    this.elements.statPerp.textContent = `${data.precipitation}/3hs`;
    this.elements.statUV.textContent = data.uvIndex;

    // Time display
    this.updateTimeDisplay(data.time);

    // Parse wind data for scene effects
    this.parseWindData(data.wind);
  }

  updateLocationDisplay(text) {
    this.elements.statLocation.textContent = text;
    
    // Check if text overflows and add marquee effect
    requestAnimationFrame(() => {
      if (this.elements.statLocation.scrollWidth > this.elements.statLocation.clientWidth) {
        this.elements.statLocation.innerHTML = `<marquee behavior="scroll" direction="left" scrollamount="2">${text}</marquee>`;
      }
    });
  }

  updateTimeDisplay(timeStr) {
    if (!timeStr) {
      this.elements.statTime.textContent = '--:--:--';
      return;
    }

    // Clean up timezone offset
    let displayTime = timeStr;
    if (timeStr.includes('+')) {
      displayTime = timeStr.split('+')[0];
    } else if (timeStr.includes('-')) {
      displayTime = timeStr.split('-')[0];
    }
    
    this.elements.statTime.textContent = displayTime;
  }

  parseWindData(windText) {
    if (!windText || windText === '—') return;

    // Extract wind direction and speed
    const arrow = windText[0];
    const velMatch = windText.match(/(\d+(?:\.\d+)?)/);

    if (velMatch) {
      this.windVel = parseFloat(velMatch[1]);
    }

    const directions = {
      "↑": { dx: 0, dy: 1 },
      "↓": { dx: 0, dy: -1 },
      "→": { dx: 1, dy: 0 },
      "←": { dx: -1, dy: 0 },
      "↗": { dx: Math.SQRT1_2, dy: Math.SQRT1_2 },
      "↘": { dx: Math.SQRT1_2, dy: -Math.SQRT1_2 },
      "↙": { dx: -Math.SQRT1_2, dy: -Math.SQRT1_2 },
      "↖": { dx: -Math.SQRT1_2, dy: Math.SQRT1_2 }
    };

    if (directions[arrow]) {
      this.windDir = directions[arrow];
    }
  }

  updateSceneMode(data) {
    // Determine time of day
    this.determineTimeOfDay(data.time, data.sunrise, data.sunset);

    // Set weather mode
    this.mode = this.interpretCondition(data.condition);
    
    // Update moon phase
    this.updateMoonPhase(data.moonDay, data.moonEmoji);

    // Apply theme
    this.applyTheme();

    // Set night blend target for smooth transition
    this.targetNight = this.isNight ? 1 : 0;
  }

  determineTimeOfDay(timeStr, sunriseStr, sunsetStr) {
    const currentMinutes = this.parseTimeToMinutes(timeStr);
    const sunriseMinutes = this.parseTimeToMinutes(sunriseStr);
    const sunsetMinutes = this.parseTimeToMinutes(sunsetStr);

    if (currentMinutes !== null && sunriseMinutes !== null && sunsetMinutes !== null) {
      this.isNight = (currentMinutes < sunriseMinutes) || (currentMinutes >= sunsetMinutes);
    } else if (currentMinutes !== null) {
      const hour = Math.floor(currentMinutes / 60);
      this.isNight = hour < 6 || hour >= 19;
    } else {
      // Fallback to local time
      const now = new Date();
      const hour = now.getHours();
      this.isNight = hour < 6 || hour >= 19;
    }
  }

  parseTimeToMinutes(timeStr) {
    if (!timeStr) return null;
    
    const match = String(timeStr).match(/(\d{1,2}):(\d{2})/);
    if (!match) return null;

    let hours = parseInt(match[1], 10);
    const minutes = parseInt(match[2], 10);
    
    const ampmMatch = String(timeStr).match(/([APap]\.?M\.?)/);
    if (ampmMatch) {
      const ampm = ampmMatch[1].toLowerCase().replace(/\./g, '');
      if (ampm === 'pm' && hours < 12) hours += 12;
      if (ampm === 'am' && hours === 12) hours = 0;
    }

    if (hours >= 0 && hours < 24 && minutes >= 0 && minutes < 60) {
      return hours * 60 + minutes;
    }
    
    return null;
  }

  interpretCondition(conditionText) {
    const text = (conditionText || '').toLowerCase();
    
    if (/thunder|storm|lightning/.test(text)) return 'thunder';
    if (/snow|sleet|blizzard|flurries/.test(text)) return 'snow';
    if (/drizzle/.test(text)) return 'drizzle';
    if (/rain|shower|showers/.test(text)) return 'rain';
    if (/cloud|overcast|fog|mist/.test(text)) return 'cloudy';
    
    return 'clear';
  }

  updateMoonPhase(moonDayStr, moonEmoji) {
    // Calculate moon phase from moon day
    if (moonDayStr) {
      const dayNumber = parseInt(moonDayStr.replace(/[^\d]/g, ''), 10);
      if (!Number.isNaN(dayNumber)) {
        const lunarMonth = 29.53;
        const normalized = ((dayNumber - 1) % Math.ceil(lunarMonth)) / lunarMonth;
        this.moonPhase = Math.max(0, Math.min(1, normalized));
        return;
      }
    }

    // Fallback to emoji mapping
    const emojiMap = {
      '🌑': 0, '🌒': 0.125, '🌓': 0.25, '🌔': 0.375,
      '🌕': 0.5, '🌖': 0.625, '🌗': 0.75, '🌘': 0.875
    };
    
    if (moonEmoji && emojiMap[moonEmoji[0]]) {
      this.moonPhase = emojiMap[moonEmoji[0]];
    }
  }

  applyTheme() {
    document.body.className = '';
    
    let themeClass = 'theme-' + this.mode;
    if (this.mode !== 'snow' && this.mode !== 'thunder') {
      themeClass += this.isNight ? '-night' : '-day';
    }
    
    document.body.classList.add(themeClass);
  }

  showLoadingState() {
    this.elements.statLocation.textContent = 'Loading weather data...';
    this.elements.statLocation.classList.add('loading');
    
    // Reset all values to loading state
    const loadingValues = {
      statTemp: '--°C(--°C)',
      statPressure: '--hPa',
      statHumidity: '--%',
      statWind: '--km/h',
      statPerp: '--mm/3hs',
      statUV: '--',
      statTime: '--:--:--'
    };

    Object.entries(loadingValues).forEach(([key, value]) => {
      this.elements[key].textContent = value;
    });
  }

  showError(message) {
    this.elements.statLocation.textContent = message;
    this.elements.statLocation.classList.remove('loading');
  }

  setFallbackMode() {
    this.mode = 'clear';
    this.isNight = false;
    this.targetNight = 0;
    this.moonPhase = 0.5;
    this.applyTheme();
  }

  // Scene Animation Methods
  initSceneObjects() {
    this.initClouds();
    this.initParticles();
    this.initTrees();
    this.initStars();
    
    // Clear dynamic objects
    this.shootingStars = [];
    this.birds = [];
  }

  initClouds() {
    this.clouds = [];
    const cloudCount = ['cloudy', 'rain', 'thunder'].includes(this.mode) ? 6 : 3;
    
    for (let i = 0; i < cloudCount; i++) {
      this.clouds.push({
        x: Math.random() * window.innerWidth,
        y: Math.random() * (window.innerHeight * 0.35),
        scale: 0.6 + Math.random() * 1.0,
        speed: 0.15 + Math.random() * 0.6,
        opacity: 0.35 + Math.random() * 0.5,
        puffCount: 3 + Math.floor(Math.random() * 3)
      });
    }
  }

  initParticles() {
    this.particles = [];
    
    switch (this.mode) {
      case 'rain':
      case 'thunder':
        const rainDensity = Math.floor((window.innerWidth / 1000) * 300);
        for (let i = 0; i < rainDensity; i++) {
          this.particles.push(this.createRaindrop(true));
        }
        break;
        
      case 'drizzle':
        const drizzleDensity = Math.floor((window.innerWidth / 1000) * 90);
        for (let i = 0; i < drizzleDensity; i++) {
          this.particles.push(this.createRaindrop(false));
        }
        break;
        
      case 'snow':
        const snowDensity = Math.floor((window.innerWidth / 1000) * 120);
        for (let i = 0; i < snowDensity; i++) {
          this.particles.push(this.createSnowflake());
        }
        break;
    }
  }

  createRaindrop(heavy = true) {
    return {
      type: 'rain',
      x: Math.random() * window.innerWidth,
      y: Math.random() * window.innerHeight,
      vy: (heavy ? 4.0 : 2.0) + Math.random() * 3.0,
      len: 8 + Math.random() * 18,
      alpha: 0.4 + Math.random() * 0.5
    };
  }

  createSnowflake() {
    return {
      type: 'snow',
      x: Math.random() * window.innerWidth,
      y: Math.random() * window.innerHeight,
      vx: Math.random() * 0.8 - 0.4,
      vy: 0.4 + Math.random(),
      r: 1 + Math.random() * 3,
      alpha: 0.6 + Math.random() * 0.4
    };
  }

  initTrees() {
    this.trees = [];
    const groundTop = Math.round(window.innerHeight * 0.78);
    const treeCount = Math.max(3, Math.floor(window.innerWidth / 220));
    
    for (let i = 0; i < treeCount; i++) {
      const baseX = Math.round((i + 0.5) * (window.innerWidth / treeCount) + (Math.random() * 60 - 30));
      const trunkHeight = 70 + Math.random() * 60;
      const crownRadius = 28 + Math.random() * 22;
      const baseY = groundTop + 36 + Math.round(Math.random() * 18);

      this.trees.push({
        x: baseX,
        baseY,
        trunkHeight,
        crownRadius,
        sway: 0,
        swayPhase: Math.random() * Math.PI * 2,
        swaySpeed: 0.6 + Math.random() * 0.8,
        swayAmplitude: 0.02 + Math.random() * 0.03,
        lean: (Math.random() - 0.5) * 0.06
      });
    }
  }

  initStars() {
    this.stars = [];
    const area = window.innerWidth * window.innerHeight;
    const starCount = Math.max(12, Math.floor(area / 80000));
    const maxY = Math.round(window.innerHeight * 0.55);
    
    for (let i = 0; i < starCount; i++) {
      this.stars.push({
        x: Math.random() * window.innerWidth,
        y: Math.random() * maxY,
        radius: 0.4 + Math.random() * 1.6,
        baseOpacity: 0.35 + Math.random() * 0.75,
        phase: Math.random() * Math.PI * 2,
        twinkleSpeed: 0.002 + Math.random() * 0.002
      });
    }
  }

  // Animation Loop
  startAnimation() {
    if (this.raf) cancelAnimationFrame(this.raf);
    this.startTime = performance.now();
    this.lastTickMs = performance.now();
    this.raf = requestAnimationFrame((time) => this.animate(time));
  }

  animate(currentTime) {
    const deltaTime = Math.max(0, currentTime - this.lastTickMs);
    this.lastTickMs = currentTime;

    // Update night blend for smooth day/night transitions
    this.nightBlend = this.lerp(this.nightBlend, this.targetNight, this.NIGHT_LERP);

    // Update cloud cover based on weather mode
    this.updateCloudCover();

    // Calculate visibility factors
    const starVisibility = this.nightBlend * (1 - this.cloudCover);

    // Clear and render scene
    this.clearCanvas();
    
    // Render scene elements
    this.drawStars(currentTime, starVisibility);
    this.drawSunOrMoon(currentTime);
    this.drawClouds(currentTime);
    this.updateShootingStars(deltaTime);
    this.drawParticles(currentTime);
    this.drawGround();
    this.updateBirds(deltaTime, currentTime, starVisibility);
    this.drawTrees(currentTime);
    this.handleThunderEffects(currentTime);

    // Continue animation
    this.raf = requestAnimationFrame((time) => this.animate(time));
  }

  updateCloudCover() {
    const baseCover = {
      clear: 0.05,
      cloudy: 0.7,
      drizzle: 0.55,
      rain: 0.85,
      thunder: 0.95,
      snow: 0.6
    };

    const avgOpacity = this.clouds.length > 0 
      ? this.clouds.reduce((sum, cloud) => sum + (cloud.opacity || 0), 0) / this.clouds.length 
      : 0;

    this.cloudCover = Math.max(0, Math.min(1, 
      (baseCover[this.mode] || 0.05) * 0.7 + avgOpacity * 0.4
    ));
  }

  clearCanvas() {
    this.ctx.clearRect(0, 0, window.innerWidth, window.innerHeight);
  }

  // Utility Methods
  lerp(start, end, factor) {
    return start + (end - start) * factor;
  }

  // Drawing Methods (simplified versions - full implementations would be here)
  drawStars(time, visibility) {
    if (!this.stars || visibility < 0.01) return;

    this.ctx.save();
    for (const star of this.stars) {
      const twinkle = 0.5 + 0.5 * Math.sin(time * star.twinkleSpeed + star.phase);
      const alpha = star.baseOpacity * twinkle * visibility;
      
      if (alpha > 0.005) {
        this.ctx.beginPath();
        this.ctx.fillStyle = `rgba(255,255,255,${alpha.toFixed(3)})`;
        this.ctx.arc(star.x, star.y, star.radius, 0, Math.PI * 2);
        this.ctx.fill();
      }
    }
    this.ctx.restore();
  }

  drawSunOrMoon(time) {
    // Simplified sun/moon positioning based on time
    const now = new Date();
    const hour = now.getHours() + now.getMinutes() / 60;
    const progress = Math.max(0, Math.min(1, (hour - 4) / 16));
    
    const x = 0.12 * window.innerWidth + progress * 0.76 * window.innerWidth;
    const arc = Math.sin(progress * Math.PI);
    const y = 0.05 * window.innerHeight + (1 - arc) * 0.35 * window.innerHeight;
    const radius = Math.max(15, Math.min(70, window.innerWidth * 0.05));

    if (this.nightBlend < 0.99) this.drawSun(x, y, radius);
    if (this.nightBlend > 0.01) this.drawMoon(x, y, radius);
  }

  drawSun(x, y, radius) {
    this.ctx.save();
    this.ctx.globalAlpha = 1 - this.nightBlend;
    
    // Sun glow
    const glow = this.ctx.createRadialGradient(x, y, radius * 0.2, x, y, radius * 1.2);
    glow.addColorStop(0, '#fffbe0');
    glow.addColorStop(0.4, '#fff1a3');
    glow.addColorStop(1, '#f6b60000');
    
    this.ctx.fillStyle = glow;
    this.ctx.beginPath();
    this.ctx.arc(x, y, radius * 1.05, 0, Math.PI * 2);
    this.ctx.fill();

    // Sun core
    const core = this.ctx.createRadialGradient(x, y, radius * 0.1, x, y, radius);
    core.addColorStop(0, '#fff');
    core.addColorStop(1, '#ffd24a');
    
    this.ctx.fillStyle = core;
    this.ctx.beginPath();
    this.ctx.arc(x, y, radius, 0, Math.PI * 2);
    this.ctx.fill();

    this.ctx.restore();
  }

  drawMoon(x, y, radius) {
    this.ctx.save();
    this.ctx.globalAlpha = this.nightBlend;
    
    // Moon surface
    const moonGradient = this.ctx.createRadialGradient(
      x - radius * 0.18, y - radius * 0.12, radius * 0.06,
      x, y, radius
    );
    moonGradient.addColorStop(0, '#f0f0f0');
    moonGradient.addColorStop(1, '#cfcfd1');

    this.ctx.fillStyle = moonGradient;
    this.ctx.beginPath();
    this.ctx.arc(x, y, radius, 0, Math.PI * 2);
    this.ctx.fill();

    // Moon phase shadow (simplified)
    const illumination = 1 - Math.abs(1 - 2 * this.moonPhase);
    if (illumination < 0.99) {
      const shadowWidth = radius * (1 - illumination) * 2;
      const shadowX = this.moonPhase <= 0.5 ? x - radius * 0.9 : x + radius * 0.9;
      
      this.ctx.fillStyle = '#0b1020'; // Use night sky color
      this.ctx.beginPath();
      this.ctx.ellipse(shadowX, y - radius / 1.3, shadowWidth, radius * 1.3, 0, 0, Math.PI * 2);
      this.ctx.fill();
    }

    this.ctx.restore();
  }

  drawClouds(time) {
    for (const cloud of this.clouds) {
      this.ctx.save();
      
      const dimFactor = 1 - this.nightBlend * 0.6;
      this.ctx.globalAlpha = cloud.opacity * dimFactor;
      
      // Cloud color changes with time of day
      const brightness = Math.round(255 - this.nightBlend * 50);
      this.ctx.fillStyle = `rgba(${brightness},${brightness},${brightness},0.88)`;

      const scale = 110 * cloud.scale;
      const baseX = cloud.x;
      const baseY = cloud.y;

      // Draw cloud puffs
      for (let i = 0; i < cloud.puffCount; i++) {
        const offsetX = (i - (cloud.puffCount - 1) / 2) * (scale * 0.5);
        const offsetY = (i % 2) * (scale * 0.08);
        
        this.ctx.beginPath();
        this.ctx.ellipse(
          baseX + offsetX, 
          baseY + offsetY, 
          scale * (0.9 - i * 0.08), 
          scale * 0.45, 
          0, 0, Math.PI * 2
        );
        this.ctx.fill();
      }

      this.ctx.restore();

      // Move cloud
      cloud.x += cloud.speed * (this.isNight ? 0.4 : 0.85);
      if (cloud.x > window.innerWidth + 200) {
        cloud.x = -200;
      }
    }
  }

  drawParticles(time) {
    if (!this.particles || this.particles.length === 0) return;

    if (['rain', 'thunder', 'drizzle'].includes(this.mode)) {
      this.ctx.lineWidth = 1.2;
      this.ctx.lineCap = 'round';

      for (const particle of this.particles) {
        let wind = 0;
        
        if (this.mode === 'thunder') {
          wind = Math.sin(time * 0.01 + particle.x) * 1.5;
        } else if (this.mode === 'rain') {
          wind = Math.sin(time * 0.002 + particle.x) * 0.6;
        }

        const x = particle.x + wind;
        const y = particle.y;
        const alpha = particle.alpha * (1 - this.nightBlend * 0.35);

        this.ctx.strokeStyle = `rgba(255,255,255,${alpha})`;
        this.ctx.beginPath();
        this.ctx.moveTo(x, y);
        this.ctx.lineTo(x - wind * 0.6, y + particle.len);
        this.ctx.stroke();

        // Update particle position
        particle.x += wind * 0.4;
        particle.y += particle.vy;

        // Reset particle when it goes off screen
        if (particle.y > window.innerHeight + 20) {
          particle.y = -20;
          particle.x = Math.random() * window.innerWidth;
        }
      }
    } else if (this.mode === 'snow') {
      for (const particle of this.particles) {
        this.ctx.globalAlpha = particle.alpha * (1 - this.nightBlend * 0.25);
        this.ctx.fillStyle = 'rgba(255,255,255,0.95)';
        this.ctx.beginPath();
        this.ctx.arc(particle.x, particle.y, particle.r, 0, Math.PI * 2);
        this.ctx.fill();

        // Update snowflake position
        particle.x += particle.vx + Math.sin((this.startTime + particle.x) * 0.0005) * 0.2;
        particle.y += particle.vy;

        // Reset snowflake when it goes off screen
        if (particle.y > window.innerHeight + 10) {
          particle.y = -10;
          particle.x = Math.random() * window.innerWidth;
        }
      }
      this.ctx.globalAlpha = 1;
    }
  }

  drawGround() {
    const groundTop = Math.round(window.innerHeight * 0.78);

    this.ctx.save();

    // Back ground layer
    this.ctx.beginPath();
    this.ctx.moveTo(0, window.innerHeight);
    this.ctx.lineTo(0, groundTop + 30);
    this.ctx.quadraticCurveTo(window.innerWidth * 0.25, groundTop - 40, window.innerWidth * 0.5, groundTop + 10);
    this.ctx.quadraticCurveTo(window.innerWidth * 0.75, groundTop + 60, window.innerWidth, groundTop + 20);
    this.ctx.lineTo(window.innerWidth, window.innerHeight);
    this.ctx.closePath();
    this.ctx.fillStyle = '#6aa84f';
    this.ctx.fill();

    // Front ground layer
    this.ctx.beginPath();
    this.ctx.moveTo(0, window.innerHeight);
    this.ctx.lineTo(0, groundTop + 50);
    this.ctx.quadraticCurveTo(window.innerWidth * 0.2, groundTop + 10, window.innerWidth * 0.5, groundTop + 30);
    this.ctx.quadraticCurveTo(window.innerWidth * 0.8, groundTop + 60, window.innerWidth, groundTop + 40);
    this.ctx.lineTo(window.innerWidth, window.innerHeight);
    this.ctx.closePath();
    this.ctx.fillStyle = '#487a3a';
    this.ctx.fill();

    this.ctx.restore();
  }

  drawTrees(time) {
    const windInfluence = this.windVel * Math.abs(this.windDir.dx) * 0.0663333 + 0.05;
    const windFactor = Math.min(windInfluence, 20);

    for (const tree of this.trees) {
      const timeInSeconds = time * 0.001 * tree.swaySpeed;
      const baseAmplitude = tree.swayAmplitude;
      const windAmplitude = baseAmplitude * (1 + windFactor * 2.2);
      const targetAngle = Math.sin(timeInSeconds + tree.swayPhase) * windAmplitude + tree.lean;
      
      // Smooth sway interpolation
      tree.sway = this.lerp(tree.sway, targetAngle, 0.08);

      this.ctx.save();
      this.ctx.translate(tree.x, tree.baseY);
      this.ctx.rotate(tree.sway);

      // Draw trunk
      this.ctx.fillStyle = '#5b3a21';
      this.ctx.fillRect(-6, -tree.trunkHeight, 12, tree.trunkHeight);

      // Draw crown (multiple overlapping circles)
      const crownY = -tree.trunkHeight - tree.crownRadius * 0.2;
      this.ctx.fillStyle = '#2e7d32';

      // Multiple crown layers for depth
      this.ctx.beginPath();
      this.ctx.ellipse(-tree.crownRadius * 0.25, crownY, tree.crownRadius * 0.95, tree.crownRadius * 0.8, 0, 0, Math.PI * 2);
      this.ctx.fill();

      this.ctx.beginPath();
      this.ctx.ellipse(tree.crownRadius * 0.4, crownY + tree.crownRadius * 0.05, tree.crownRadius * 0.9, tree.crownRadius * 0.85, 0, 0, Math.PI * 2);
      this.ctx.fill();

      this.ctx.beginPath();
      this.ctx.ellipse(0, crownY - tree.crownRadius * 0.25, tree.crownRadius * 0.85, tree.crownRadius * 0.8, 0, 0, Math.PI * 2);
      this.ctx.fill();

      // Add highlight
      this.ctx.fillStyle = 'rgba(255,255,255,0.06)';
      this.ctx.beginPath();
      this.ctx.ellipse(-tree.crownRadius * 0.35, crownY - tree.crownRadius * 0.15, tree.crownRadius * 0.45, tree.crownRadius * 0.3, 0, 0, Math.PI * 2);
      this.ctx.fill();

      this.ctx.restore();
    }
  }

  // Simplified implementations for birds and shooting stars
  updateShootingStars(deltaTime) {
    // Spawn shooting stars occasionally during night
    const starVisibility = this.nightBlend * (1 - this.cloudCover);
    if (starVisibility > 0.12 && Math.random() < 0.05 * (deltaTime / 1000)) {
      this.spawnShootingStar();
    }

    // Update and draw existing shooting stars
    this.ctx.save();
    this.ctx.globalCompositeOperation = 'lighter';
    
    for (let i = this.shootingStars.length - 1; i >= 0; i--) {
      const star = this.shootingStars[i];
      const deltaSeconds = deltaTime / 1000;
      
      star.x += star.vx * deltaSeconds;
      star.y += star.vy * deltaSeconds;
      star.life -= deltaTime;

      const alpha = Math.max(0, star.life / star.ttl) * 0.95 * Math.min(1, (1 - this.cloudCover) * this.nightBlend * 1.25);
      
      if (alpha > 0.005) {
        const tailX = star.x - (star.vx / Math.hypot(star.vx, star.vy)) * star.length;
        const tailY = star.y - (star.vy / Math.hypot(star.vx, star.vy)) * star.length;
        
        const gradient = this.ctx.createLinearGradient(tailX, tailY, star.x, star.y);
        gradient.addColorStop(0, `rgba(255,255,255,0)`);
        gradient.addColorStop(0.6, `rgba(255,255,255,${alpha * 0.18})`);
        gradient.addColorStop(1, `rgba(255,255,255,${alpha})`);
        
        this.ctx.strokeStyle = gradient;
        this.ctx.lineWidth = 2 + Math.random() * 1.4;
        this.ctx.beginPath();
        this.ctx.moveTo(tailX, tailY);
        this.ctx.lineTo(star.x, star.y);
        this.ctx.stroke();
        
        // Star head
        this.ctx.fillStyle = `rgba(255,255,255,${alpha})`;
        this.ctx.beginPath();
        this.ctx.arc(star.x, star.y, 1 + Math.random() * 2.2, 0, Math.PI * 2);
        this.ctx.fill();
      }

      // Remove expired or off-screen shooting stars
      if (star.life <= 0 || star.x > window.innerWidth + 200 || star.y > window.innerHeight + 200) {
        this.shootingStars.splice(i, 1);
      }
    }
    
    this.ctx.restore();
  }

  spawnShootingStar() {
    const startX = Math.random() * (window.innerWidth * 0.9);
    const startY = Math.random() * (window.innerHeight * 0.35);
    const speed = 900 + Math.random() * 800;
    const angle = (20 + Math.random() * 40) * Math.PI / 180;
    const vx = Math.cos(angle) * speed;
    const vy = Math.sin(angle) * speed;
    const ttl = 600 + Math.random() * 900;

    this.shootingStars.push({
      x: startX,
      y: startY,
      vx,
      vy,
      life: ttl,
      ttl,
      length: 60 + Math.random() * 140
    });
  }

  updateBirds(deltaTime, time, starVisibility) {
    // Simplified bird system - spawn and update birds during daytime
    const dayFactor = Math.max(0, 1 - this.nightBlend);
    const clearFactor = Math.max(0, 1 - this.cloudCover);
    const spawnFactor = 0.25 + 0.75 * clearFactor;
    const spawnRate = 0.45 * dayFactor * spawnFactor * (deltaTime / 1000);

    if (Math.random() < spawnRate) {
      this.spawnBird();
    }

    // Limit bird count
    const maxBirds = Math.floor(window.innerWidth / 220 * (1 - this.cloudCover));
    if (this.birds.length > maxBirds) {
      this.birds.splice(0, this.birds.length - maxBirds);
    }

    // Update and draw birds
    this.ctx.save();
    for (let i = this.birds.length - 1; i >= 0; i--) {
      const bird = this.birds[i];
      const deltaSeconds = deltaTime / 1000;
      
      bird.x += bird.vx * deltaSeconds;
      bird.y += bird.vy * deltaSeconds;
      bird.wingPhase += deltaSeconds * bird.flapSpeed;

      // Calculate visibility with fog effects
      const baseAlpha = (0.35 + bird.depth * 0.65) * Math.max(0.15, dayFactor * clearFactor);
      bird.alpha = Math.max(0, Math.min(1, baseAlpha * (0.6 + Math.abs(Math.sin(bird.wingPhase)) * 0.4)));

      const fog = Math.max(0, Math.min(1, this.cloudCover));
      const alphaMultiplier = 1 - fog * 0.7;
      const grey = Math.round(30 + fog * 70);

      if (bird.alpha > 0.02) {
        this.ctx.save();
        this.ctx.translate(bird.x, bird.y);
        
        const direction = bird.vx >= 0 ? -1 : 1;
        this.ctx.scale(direction, 1);

        const finalAlpha = Math.max(0, Math.min(1, bird.alpha * alphaMultiplier));
        this.ctx.globalAlpha = finalAlpha;
        this.ctx.lineWidth = Math.max(1, bird.size * 0.11);
        this.ctx.strokeStyle = `rgba(${grey},${grey},${grey},0.95)`;

        const flap = Math.sin(bird.wingPhase) * 0.7;
        
        // Draw wings
        this.ctx.beginPath();
        this.ctx.moveTo(-bird.size * 0.95, 0);
        this.ctx.quadraticCurveTo(-bird.size * 0.3, -bird.size * 0.62 * (0.5 + 0.6 * flap * (0.6 + bird.depth * 0.4)), bird.size * 0.22, -bird.size * 0.18);
        this.ctx.stroke();
        
        this.ctx.beginPath();
        this.ctx.moveTo(-bird.size * 0.95, 0);
        this.ctx.quadraticCurveTo(-bird.size * 0.3, bird.size * 0.62 * (0.5 + 0.6 * -flap * (0.6 + bird.depth * 0.4)), bird.size * 0.22, bird.size * 0.18);
        this.ctx.stroke();

        this.ctx.restore();
      }

      // Remove off-screen birds
      if (bird.x < -220 || bird.x > window.innerWidth + 220 || bird.y < -120 || bird.y > window.innerHeight + 120) {
        this.birds.splice(i, 1);
      }
    }
    this.ctx.restore();
  }

  spawnBird() {
    const depth = Math.random();
    const size = 6 + depth * 18;
    const baseSpeed = 45;
    const speed = baseSpeed + depth * 200 * (0.8 + Math.random() * 0.4);
    const flapSpeed = 10 + (1 - depth) * 12 + Math.random() * 4;
    const fromLeft = Math.random() < 0.6;
    const startX = fromLeft ? -60 - Math.random() * 120 : window.innerWidth + 60 + Math.random() * 120;
    const skyTop = 40;
    const skyBottom = Math.max(60, window.innerHeight * 0.45);
    const y = skyTop + (1 - depth) * (skyBottom * 0.7) + Math.random() * (skyBottom * 0.3);
    const vy = (Math.random() - 0.5) * 8;
    const vx = (fromLeft ? 1 : -1) * speed;

    this.birds.push({
      x: startX,
      y,
      vx,
      vy,
      size,
      wingPhase: Math.random() * Math.PI * 2,
      flapSpeed,
      alpha: Math.min(1, 0.45 + depth * 0.6),
      depth
    });
  }

  handleThunderEffects(time) {
    if (this.mode !== 'thunder') return;

    // Random thunder flashes
    if (time - this.lastFlash > 2200 && Math.random() < 0.012) {
      this.lastFlash = time;
      this.createThunderFlash();
      
      if (Math.random() < 0.5) {
        this.createLightningBolt();
      }
    }

    // Draw lightning bolt if active
    if (this.bolt && this.bolt.life > 0) {
      this.ctx.save();
      this.ctx.globalCompositeOperation = 'screen';
      this.ctx.lineWidth = 3;
      this.ctx.strokeStyle = 'rgba(255,255,255,0.95)';
      this.ctx.beginPath();
      this.ctx.moveTo(this.bolt.points[0].x, this.bolt.points[0].y);
      
      for (const point of this.bolt.points) {
        this.ctx.lineTo(point.x, point.y);
      }
      
      this.ctx.stroke();
      this.ctx.restore();
      
      this.bolt.life -= 16;
    } else {
      this.bolt = null;
    }
  }

  createThunderFlash() {
    this.flashEl.style.transition = 'none';
    this.flashEl.style.background = 'rgba(255,255,255,0.92)';
    
    setTimeout(() => {
      this.flashEl.style.transition = 'background 700ms ease-out';
      this.flashEl.style.background = 'transparent';
    }, 60);
  }

  createLightningBolt() {
    const startX = Math.random() * window.innerWidth * 0.75 + window.innerWidth * 0.1;
    const startY = Math.random() * window.innerHeight * 0.35 + 20;
    const segments = 5 + Math.floor(Math.random() * 6);
    const points = [{ x: startX, y: startY }];

    for (let i = 1; i < segments; i++) {
      points.push({
        x: startX + (Math.random() * 200 - 100),
        y: startY + i * (window.innerHeight * 0.8 / segments) + (Math.random() * 40 - 20)
      });
    }

    this.bolt = { points, life: 120 };
  }
}

// Initialize the application when DOM is loaded
document.addEventListener('DOMContentLoaded', () => {
  window.weatherScenery = new WeatherScenery();
});

// Export for potential module usage
if (typeof module !== 'undefined' && module.exports) {
  module.exports = WeatherScenery;
}