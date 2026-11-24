(() => {
  'use strict';
  const root = document.documentElement;
  root.dataset.fontMetrics = typeof FontFace !== 'undefined' && 'ascentOverride' in FontFace.prototype ? 'native' : 'legacy';
  const media = matchMedia('(prefers-reduced-motion: reduce)');
  let heroVisible = true;
  let refreshJourney = () => {};
  let pauseJourney = () => {};

  function reflectMotion() {
    root.dataset.motionOff = String(media.matches);
    refreshJourney();
  }
  root.dataset.enhanced = 'true';
  media.addEventListener('change', reflectMotion);
  reflectMotion();

  function reflectVisibility() {
    root.dataset.offscreen = String(document.hidden || !heroVisible);
    root.dataset.pageHidden = String(document.hidden);
  }
  // The hero observer only controls its ambient stars. Crossing that boundary
  // must not rebuild/snap the page-wide guide halfway through its first turn.
  document.addEventListener('visibilitychange', () => {
    reflectVisibility();
    pauseJourney();
  });
  if ('IntersectionObserver' in window) {
    const observer = new IntersectionObserver(entries => {
      heroVisible = entries[0].isIntersecting;
      reflectVisibility();
    });
    observer.observe(document.getElementById('main'));
  }
  reflectVisibility();



  // The route is static. Movable light is drawn into a small local canvas,
  // so scrolling never invalidates a document-sized SVG filter or mask.
  const journey = document.getElementById('star-journey');
  const route = document.getElementById('journey-route');
  const track = document.getElementById('journey-track');
  const follower = document.getElementById('travelling-star');
  const light = document.getElementById('journey-light');
  const tailLength = 200;
  const lightSize = tailLength + 64;
  let lightContext;
  let lightBrush;

  function drawLight(length, point) {
    if (lightContext === undefined) lightContext = light.getContext('2d');
    if (!lightContext) return;
    const compact = geometry.width <= 640;
    const steps = compact ? 12 : 20;
    const tail = Math.min(length, tailLength);
    const samples = [];
    let left = point.x;
    for (let i = 0; i < steps; i++) {
      const sample = pointAtLength(length - tail + tail * i / steps);
      left = Math.min(left, sample.x);
      samples.push(sample);
    }
    samples.push(point);
    left = Math.floor(left) - 32;
    const top = Math.floor(samples[0].y) - 32;
    const scale = compact ? 1 : Math.min(window.devicePixelRatio || 1, 1.5);
    const pixels = Math.round(lightSize * scale);
    if (light.width !== pixels || light.height !== pixels) {
      light.width = light.height = pixels;
      light.style.width = light.style.height = `${lightSize}px`;
    }
    light.style.transform = `translate3d(${left}px,${top}px,0)`;
    const ctx = lightContext;
    ctx.setTransform(scale, 0, 0, scale, 0, 0);
    ctx.clearRect(0, 0, lightSize, lightSize);
    if (!lightBrush) {
      lightBrush = document.createElement('canvas');
      lightBrush.width = lightBrush.height = 64;
      const brush = lightBrush.getContext('2d');
      const gradient = brush.createRadialGradient(32, 32, 0, 32, 32, 32);
      gradient.addColorStop(0, '#ffd58a');
      gradient.addColorStop(.45, '#ffd58a65');
      gradient.addColorStop(1, '#ffd58a00');
      brush.fillStyle = gradient;
      brush.fillRect(0, 0, 64, 64);
    }
    ctx.translate(-left, -top);
    samples.forEach(({x, y}, i) => {
      ctx.globalAlpha = .09 * (i / steps) ** 1.7;
      ctx.drawImage(lightBrush, x - 23, y - 23, 46, 46);
    });
    ctx.globalAlpha = .28;
    ctx.drawImage(lightBrush, point.x - 30, point.y - 30, 60, 60);
    ctx.globalAlpha = 1;
    if (tail > .1) {
      const start = samples[0];
      const gradient = ctx.createLinearGradient(start.x, start.y, point.x, point.y);
      gradient.addColorStop(0, '#f7e6ca00');
      gradient.addColorStop(.45, '#f7e6ca20');
      gradient.addColorStop(1, '#f7e6ca72');
      ctx.strokeStyle = gradient;
      ctx.lineWidth = 1;
      ctx.lineCap = 'round';
      ctx.beginPath();
      ctx.moveTo(start.x, start.y);
      for (let i = 1; i < samples.length; i++) ctx.lineTo(samples[i].x, samples[i].y);
      ctx.stroke();
      ctx.fillStyle = '#f7e6ca';
      const spacing = compact ? 44 : 30;
      for (let distance = 24; distance < tail; distance += spacing) {
        const spark = pointAtLength(length - distance);
        ctx.globalAlpha = .34 * (1 - distance / tail);
        ctx.fillRect(spark.x - .65, spark.y - .65, 1.3, 1.3);
      }
    }

    // Only intersecting text blocks erase light. Feathering happens inside the
    // same bounded surface, with the body text kept completely clear.
    ctx.globalCompositeOperation = 'destination-out';
    ctx.fillStyle = '#000';
    ctx.globalAlpha = .18;
    for (const box of geometry.readingBoxes) {
      if (box.right + 20 < left || box.left - 20 > left + lightSize ||
          box.bottom + 20 < top || box.top - 20 > top + lightSize) continue;
      for (let feather = 20; feather > 0; feather -= 4) {
        ctx.fillRect(box.left - feather, box.top - feather,
          box.right - box.left + feather * 2, box.bottom - box.top + feather * 2);
      }
      ctx.globalAlpha = 1;
      ctx.fillRect(box.left, box.top, box.right - box.left, box.bottom - box.top);
      ctx.globalAlpha = .18;
    }
    ctx.globalAlpha = 1;
    ctx.globalCompositeOperation = 'source-over';
  }

  const hero = document.getElementById('main');
  const scenes = Array.from(document.querySelectorAll('.story-scene'));
  let geometry = null;
  let renderFrame = 0;
  let rebuildFrame = 0;
  let displayedLength = null;
  let previousTime = null;
  let snapPosition = true;
  let previousScroll = scrollY;
  let paintedLength = null;
  let litContact = null;

  function pointAtLength(length, data = geometry) {
    const value = Math.min(data.total, Math.max(0, length));
    let lo = 0, hi = data.points.length - 1;
    while (hi - lo > 1) {
      const mid = (lo + hi) >> 1;
      if (data.points[mid].length < value) lo = mid; else hi = mid;
    }
    const a = data.points[lo], b = data.points[hi];
    const t = (value - a.length) / Math.max(.0001, b.length - a.length);
    return {x:a.x + (b.x - a.x) * t, y:a.y + (b.y - a.y) * t};
  }

  function lengthAtY(y, data = geometry) {
    const {points} = data;
    if (y <= points[0].y) return 0;
    if (y >= points[points.length - 1].y) return data.total;
    let lo = 0, hi = points.length - 1;
    while (hi - lo > 1) {
      const mid = Math.floor((lo + hi) / 2);
      if (points[mid].y < y) lo = mid; else hi = mid;
    }
    const a = points[lo], b = points[hi];
    const t = Math.min(1, Math.max(0, (y - a.y) / Math.max(.0001, b.y - a.y)));
    return a.length + (b.length - a.length) * t;
  }

  function cancelJourney() {
    if (renderFrame) cancelAnimationFrame(renderFrame);
    if (rebuildFrame) cancelAnimationFrame(rebuildFrame);
    renderFrame = rebuildFrame = 0;
    previousTime = null;
  }

  function updateJourney(time) {
    renderFrame = 0;
    if (!geometry || media.matches || document.hidden) {
      previousTime = null;
      return;
    }
    const {startY, endY, heroHeight, contacts} = geometry;
    if (scrollY > 3 && root.dataset.journeyStarted !== 'true') {
      root.dataset.journeyStarted = 'true';
      paintedLength = null;
    }
    // Keep the star in view instead of tying its speed to the full page height.
    // Ease its viewport anchor from the hero seed to the reading area.
    const handoff = Math.min(1, Math.max(0, scrollY / (heroHeight * .5)));
    const anchorY = startY + (innerHeight * .45 - startY) * handoff;
    const targetY = Math.min(endY, Math.max(startY, scrollY + anchorY));
    const targetLength = lengthAtY(targetY);
    const dt = previousTime === null ? 1000 / 60 : Math.min(32, Math.max(1, time - previousTime));
    previousTime = time;
    if (snapPosition || displayedLength === null) {
      displayedLength = targetLength;
      snapPosition = false;
    } else {
      displayedLength += (targetLength - displayedLength) * (1 - Math.exp(-dt / 40));
      // Ease wheel steps without letting the guide fall behind the reading area.
      const maxLag = Math.min(32, innerHeight * .04);
      const shownY = pointAtLength(displayedLength).y;
      if (shownY < targetY - maxLag) displayedLength = lengthAtY(targetY - maxLag);
      if (shownY > targetY + maxLag) displayedLength = lengthAtY(targetY + maxLag);
    }
    const settling = Math.abs(targetLength - displayedLength) > .05;
    if (!settling) displayedLength = targetLength;
    const length = displayedLength;
    const point = pointAtLength(length);
    if (length !== paintedLength) {
      follower.style.transform = `translate3d(${(point.x - 11).toFixed(2)}px,${(point.y - 16.5).toFixed(2)}px,0)`;
      if (root.dataset.journeyStarted === 'true') drawLight(length, point);
      paintedLength = length;
    }
    let nextLitContact = null;
    for (const contact of contacts) {
      if (!contact.seen && targetY >= contact.y - 110) {
        contact.seen = true;
        contact.element.classList.add('is-seen');
      }
      if (Math.abs(point.y - contact.y) < 34 && Math.abs(point.x - contact.x) < 40) {
        nextLitContact = contact.element;
      }
    }
    if (nextLitContact !== litContact) {
      if (litContact) litContact.classList.remove('is-lit');
      if (nextLitContact) nextLitContact.classList.add('is-lit');
      litContact = nextLitContact;
    }
    if (settling) renderFrame = requestAnimationFrame(updateJourney);
    else previousTime = null;
  }
  function requestJourney() {
    // An instant anchor/Home/End jump should land correctly, not fly through
    // several offscreen sections. Ordinary scrolling gets a short easing.
    if (Math.abs(scrollY - previousScroll) > innerHeight * .75) snapPosition = true;
    previousScroll = scrollY;
    if (!renderFrame && !media.matches && !document.hidden) renderFrame = requestAnimationFrame(updateJourney);
  }
  function rebuildJourney() {
    rebuildFrame = 0;
    if (document.hidden || media.matches) return;
    if (renderFrame) cancelAnimationFrame(renderFrame);
    renderFrame = 0;
    previousTime = null;
    const previousPoint = geometry && displayedLength !== null ? pointAtLength(displayedLength) : null;
    const previousWidth = geometry && geometry.width;
    const width = document.documentElement.clientWidth;
    const compact = width <= 640;
    const position = element => element.getBoundingClientRect().top + scrollY;
    const startY = hero.offsetHeight * .23;
    const end = document.getElementById('countdown');
    const height = Math.ceil(end.getBoundingClientRect().bottom + scrollY);
    const closing = end.querySelector('.closing-angel');
    const closingAnchor = closing.querySelector('.symbol-touchpoint').getBoundingClientRect();
    const endY = closingAnchor.top + scrollY + closingAnchor.height * .5;
    const knots = [{x: width * .81, y: startY}];
    // Stay outside the hero typography before crossing to the first drawing.
    knots.push({x:width - 14, y:hero.offsetHeight - 18});
    const contacts = [];
    scenes.forEach((scene, index) => {
      const art = scene.querySelector('.scene-art');
      const anchor = art.querySelector('.symbol-touchpoint').getBoundingClientRect();
      const artBox = art.getBoundingClientRect();
      const copyBox = scene.querySelector('.scene-copy').getBoundingClientRect();
      const top = position(scene);
      const bottom = top + scene.offsetHeight;
      const x = anchor.left + anchor.width * .5;
      const y = anchor.top + scrollY + anchor.height * .5;
      contacts.push({x, y, element:art});
      const clearance = compact ? 26 : 56;
      const leftRail = Math.max(14, copyBox.left - clearance);
      const rightRail = Math.min(width - 14, copyBox.right + clearance);
      const exitsRight = scene.dataset.pathSide === 'right';
      // Cross diagonally through the illustration above the text, then follow
      // the outside margin until the next illustration changes the direction.
      const entryX = index === 0 ? width - 14 : (exitsRight ? leftRail : rightRail);
      const exitX = exitsRight ? rightRail : leftRail;
      knots.push({x:entryX, y:top + 16});
      knots.push({x, y});
      knots.push({x:exitX, y:artBox.bottom + scrollY + 26});
      knots.push({x:exitX, y:bottom - 24});
    });
    const audience = document.querySelector('.audience-section');
    const edgeX = compact ? 12 : width * .1;
    knots.push({x:edgeX, y:position(audience) + 24});
    knots.push({x:edgeX, y:position(audience) + audience.offsetHeight - 24});
    knots.push({x: closingAnchor.left + closingAnchor.width * .5, y: endY});
    contacts.push({x:closingAnchor.left + closingAnchor.width * .5, y:endY, element:closing});
    let d = `M ${knots[0].x} ${knots[0].y}`;
    let total = 0;
    const points = [{...knots[0], length:0}];
    knots.slice(1).forEach((p, i) => {
      const previous = knots[i];
      const dx = p.x - previous.x;
      const dy = p.y - previous.y;
      const midpointY = previous.y + dy * .5;
      d += ` C ${previous.x} ${midpointY}, ${p.x} ${midpointY}, ${p.x} ${p.y}`;
      // Sample the same cubic in JS. Vertical rails need only their endpoints.
      const samples = dx === 0 ? 1 : Math.min(128, Math.max(24, Math.ceil(Math.abs(dx) / 8)));
      let last = previous;
      for (let j = 1; j <= samples; j++) {
        const t = j / samples;
        const u = 1 - t;
        const x = previous.x + dx * t * t * (3 - 2 * t);
        const y = previous.y + dy * (1.5 * u * t + t ** 3);
        total += Math.hypot(x - last.x, y - last.y);
        last = {x, y, length:total};
        points.push(last);
      }
    });
    const padding = compact ? 13 : 20;
    const readingBoxes = [];
    const blocks = document.querySelectorAll('.masthead, .headline, .hero .eyebrow, .hero-quote, .hero-event, .invitation-footer, .scene-copy, .audience-section h2, .audience-copy, .closing-quote, #countdown-title, .event-date, .countdown-values, .event-contacts, .closing-signature, .back-to-top, .organization-details');
    for (const element of blocks) {
      const box = element.getBoundingClientRect();
      if (box.width && box.height) readingBoxes.push({
        left:box.left - padding, right:box.right + padding,
        top:box.top + scrollY - padding, bottom:box.bottom + scrollY + padding
      });
    }
    route.setAttribute('viewBox', `0 0 ${width} ${height}`);
    route.setAttribute('height', String(height));
    track.setAttribute('d', d);
    geometry = {points,total,startY,endY,contacts,width,readingBoxes,heroHeight:Math.max(1,hero.offsetHeight)};
    paintedLength = null;
    displayedLength = previousPoint ? lengthAtY(previousPoint.y) : null;
    if (previousWidth !== width || displayedLength === null) snapPosition = true;
    // Render the measured position before revealing the SVG; no origin flash.
    updateJourney(performance.now());
    journey.removeAttribute('hidden');
  }
  function requestRebuild() {
    if (!rebuildFrame && !document.hidden && !media.matches) rebuildFrame = requestAnimationFrame(rebuildJourney);
  }
  refreshJourney = () => {
    snapPosition = true;
    if (media.matches) cancelJourney();
    requestRebuild();
  };
  pauseJourney = () => {
    if (document.hidden) cancelJourney();
    else { snapPosition = true; requestRebuild(); }
  };
  window.addEventListener('scroll', requestJourney, {passive:true});
  window.addEventListener('resize', () => {
    if (!geometry || geometry.width !== root.clientWidth || !('ResizeObserver' in window)) requestRebuild();
    else requestJourney();
  }, {passive:true});
  window.addEventListener('pageshow', () => { snapPosition = true; requestRebuild(); });
  window.addEventListener('pagehide', cancelJourney);
  if ('ResizeObserver' in window) {
    const observer = new ResizeObserver(requestRebuild);
    [hero, ...scenes, document.querySelector('.audience-section'), document.getElementById('countdown')].forEach(element => observer.observe(element));
  }
  document.fonts.ready.then(requestRebuild);
  requestRebuild();

  const countdown = document.getElementById('countdown');
  const iso = countdown.dataset.eventDate;
  // Confirmed concert start, including its explicit Moscow timezone offset.
  const timestamp = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(Z|[+-]\d{2}:\d{2})$/.test(iso) ? Date.parse(iso) : NaN;
  if (!Number.isFinite(timestamp)) return;

  const pending = document.getElementById('countdown-pending');
  const values = document.getElementById('countdown-values');
  const daysNode = document.getElementById('count-days');
  const daysLabel = document.getElementById('count-days-label');
  const hoursNode = document.getElementById('count-hours');
  const minutesNode = document.getElementById('count-minutes');
  const secondsNode = document.getElementById('count-seconds');
  const plural = (n, forms = ['день', 'дня', 'дней']) => n % 100 >= 11 && n % 100 <= 14 ? forms[2] : n % 10 === 1 ? forms[0] : n % 10 >= 2 && n % 10 <= 4 ? forms[1] : forms[2];
  let timer;
  let timerVisible = true;
  function tick() {
    if (document.hidden) return;
    const remaining = timestamp - Date.now();
    if (remaining <= 0) {
      values.hidden = true;
      pending.hidden = false;
      pending.textContent = 'Время встречи настало';
      stopTimer();
      return;
    }
    pending.hidden = true;
    values.hidden = false;
    const days = Math.floor(remaining / 86400000);
    const hours = Math.floor(remaining / 3600000) % 24;
    const minutes = Math.floor(remaining / 60000) % 60;
    const seconds = Math.floor(remaining / 1000) % 60;
    setText(daysNode, String(days));
    setText(daysLabel, plural(days));
    setText(hoursNode, String(hours).padStart(2, '0'));
    setText(minutesNode, String(minutes).padStart(2, '0'));
    setText(secondsNode, String(seconds).padStart(2, '0'));
    values.setAttribute('aria-label', `${days} ${plural(days)}, ${hours} ${plural(hours, ['час', 'часа', 'часов'])}, ${minutes} ${plural(minutes, ['минута', 'минуты', 'минут'])}, ${seconds} ${plural(seconds, ['секунда', 'секунды', 'секунд'])} до встречи`);
  }
  function setText(element, text) {
    if (element.textContent !== text) element.textContent = text;
  }
  function stopTimer() {
    clearInterval(timer);
    timer = undefined;
  }
  function syncTimer() {
    if (document.hidden || !timerVisible) {
      stopTimer();
      return;
    }
    tick();
    if (timer === undefined && timestamp > Date.now()) timer = setInterval(tick, 1000);
  }
  // Set a useful initial value, then only tick near the end of the invitation.
  tick();
  if ('IntersectionObserver' in window) {
    timerVisible = false;
    const observer = new IntersectionObserver(([entry]) => {
      timerVisible = entry.isIntersecting;
      syncTimer();
    }, {rootMargin:'120px 0px'});
    observer.observe(countdown);
  } else syncTimer();
  document.addEventListener('visibilitychange', syncTimer);
  window.addEventListener('pagehide', stopTimer);
  window.addEventListener('pageshow', syncTimer);
})();
