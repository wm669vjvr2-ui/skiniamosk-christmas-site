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
    pauseJourney();
  }
  document.addEventListener('visibilitychange', reflectVisibility);
  if ('IntersectionObserver' in window) {
    const observer = new IntersectionObserver(entries => {
      heroVisible = entries[0].isIntersecting;
      reflectVisibility();
    });
    observer.observe(document.getElementById('main'));
  }
  reflectVisibility();



  // Original SVG choreography: one falling star leaves the hero and follows a
  // continuous trail. Native document scrolling is never intercepted.
  const journey = document.getElementById('star-journey');
  const track = document.getElementById('journey-track');
  const trail = document.getElementById('journey-trail');
  const follower = document.getElementById('travelling-star');
  const lamplight = document.getElementById('travelling-light');
  const glow = document.getElementById('journey-glow');
  const glowCore = document.getElementById('journey-glow-core');
  const fade = document.getElementById('journey-fade');
  const softening = document.getElementById('route-soften');
  const sparks = document.getElementById('journey-sparks');
  const clearance = document.getElementById('reading-clearance');
  const clearanceField = document.getElementById('reading-clearance-field');
  const clearanceText = document.getElementById('reading-clearance-text');
  const svgNS = 'http://www.w3.org/2000/svg';
  const sparkNodes = Array.from({length:7}, (_, index) => {
    const group = document.createElementNS(svgNS, 'g');
    const dot = document.createElementNS(svgNS, 'circle');
    dot.setAttribute('r', String(index % 2 ? 1.1 : .7));
    dot.setAttribute('class', 'journey-spark');
    group.append(dot);
    sparks.append(group);
    return group;
  });
  const hero = document.getElementById('main');
  const scenes = Array.from(document.querySelectorAll('.story-scene'));
  let geometry = null;
  let renderFrame = 0;
  let rebuildFrame = 0;
  let displayedLength = null;
  let previousTime = null;
  let snapPosition = true;
  let previousScroll = scrollY;

  function pointAtLength(length, data = geometry) {
    const value = Math.min(data.total, Math.max(0, length));
    const index = Math.min(data.points.length - 2, Math.floor(value / data.step));
    const a = data.points[index], b = data.points[index + 1];
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
    const {total, startY, endY, heroHeight, contacts} = geometry;
    if (scrollY > 3) root.dataset.journeyStarted = 'true';
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
    const transform = `translate(${point.x.toFixed(2)} ${point.y.toFixed(2)})`;
    follower.setAttribute('transform', transform);
    lamplight.setAttribute('transform', transform);
    trail.setAttribute('stroke-dashoffset', String(total - length));
    // Only the last short part of the route emits light. The page-space mask
    // leaves a dark safety margin around every reading block.
    const tail = Math.min(length, 200);
    const tailStart = pointAtLength(length - tail);
    fade.setAttribute('x1', String(tailStart.x));
    fade.setAttribute('y1', String(tailStart.y));
    fade.setAttribute('x2', String(point.x));
    fade.setAttribute('y2', String(point.y));
    [glow, glowCore].forEach(path => {
      path.setAttribute('stroke-dasharray', `${Math.max(.01, tail)} ${total}`);
      path.setAttribute('stroke-dashoffset', String(tail - length));
    });
    const glowBounds = {left:point.x, right:point.x, top:point.y, bottom:point.y};
    // Include the entire luminous tail, not only the shorter sparkle positions.
    // Leave room for the full blur so no filter edge can cut a straight line.
    for (let sample = 0; sample <= 12; sample++) {
      const position = pointAtLength(length - tail * sample / 12);
      glowBounds.left = Math.min(glowBounds.left, position.x);
      glowBounds.right = Math.max(glowBounds.right, position.x);
      glowBounds.top = Math.min(glowBounds.top, position.y);
      glowBounds.bottom = Math.max(glowBounds.bottom, position.y);
    }
    sparkNodes.forEach((spark, index) => {
      const distance = 20 + index * 23;
      spark.setAttribute('visibility', length > distance ? 'visible' : 'hidden');
      spark.setAttribute('opacity', String(Math.pow(Math.max(0, 1 - distance / Math.max(1, tail)), 1.5)));
      const position = pointAtLength(length - distance);
      glowBounds.left = Math.min(glowBounds.left, position.x);
      glowBounds.right = Math.max(glowBounds.right, position.x);
      glowBounds.top = Math.min(glowBounds.top, position.y);
      glowBounds.bottom = Math.max(glowBounds.bottom, position.y);
      spark.setAttribute('transform', `translate(${position.x.toFixed(2)} ${position.y.toFixed(2)})`);
    });
    softening.setAttribute('x', String(glowBounds.left - 64));
    softening.setAttribute('y', String(glowBounds.top - 64));
    softening.setAttribute('width', String(glowBounds.right - glowBounds.left + 128));
    softening.setAttribute('height', String(glowBounds.bottom - glowBounds.top + 128));
    contacts.forEach(contact => {
      if (targetY >= contact.y - 110) contact.element.classList.add('is-seen');
      const touching = Math.abs(point.y - contact.y) < 34 && Math.abs(point.x - contact.x) < 40;
      contact.element.classList.toggle('is-lit', touching);
    });
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
    knots.slice(1).forEach((p, i) => {
      const previous = knots[i];
      const midpointY = previous.y + (p.y - previous.y) * .5;
      d += ` C ${previous.x} ${midpointY}, ${p.x} ${midpointY}, ${p.x} ${p.y}`;
    });
    journey.setAttribute('viewBox', `0 0 ${width} ${height}`);
    journey.setAttribute('height', String(height));
    track.setAttribute('d', d);
    trail.setAttribute('d', d);
    glow.setAttribute('d', d);
    glowCore.setAttribute('d', d);
    clearance.setAttribute('width', String(width));
    clearance.setAttribute('height', String(height));
    clearanceField.setAttribute('width', String(width));
    clearanceField.setAttribute('height', String(height));
    clearanceText.replaceChildren();
    const readingBlocks = document.querySelectorAll('.masthead, .headline, .hero .eyebrow, .hero-quote, .hero-event, .invitation-footer, .scene-copy, .audience-section h2, .audience-copy, .closing-quote, #countdown-title, .event-date, .countdown-values, .event-contacts, .closing-signature, .back-to-top, .organization-details');
    readingBlocks.forEach(element => {
      const box = element.getBoundingClientRect();
      if (!box.width || !box.height) return;
      const padding = compact ? 13 : 20;
      const feather = 24;
      const x = box.left - padding, y = box.top + scrollY - padding;
      const w = box.width + padding * 2, h = box.height + padding * 2;
      const addRect = (left, top, width, height, edge) => {
        const rect = document.createElementNS(svgNS, 'rect');
        rect.setAttribute('x', String(left)); rect.setAttribute('y', String(top));
        rect.setAttribute('width', String(width)); rect.setAttribute('height', String(height));
        rect.setAttribute('class', edge ? 'reading-feather' : 'reading-core');
        if (edge) rect.setAttribute('fill', `url(#reading-fade-${edge})`);
        clearanceText.append(rect);
      };
      addRect(x, y, w, h);
      // Text stays fully protected; only the outside of its safety margin fades.
      addRect(x - feather, y, feather, h, 'left');
      addRect(x + w, y, feather, h, 'right');
      addRect(x, y - feather, w, feather, 'top');
      addRect(x, y + h, w, feather, 'bottom');
      addRect(x - feather, y - feather, feather, feather, 'tl');
      addRect(x + w, y - feather, feather, feather, 'tr');
      addRect(x - feather, y + h, feather, feather, 'bl');
      addRect(x + w, y + h, feather, feather, 'br');
    });
    const total = track.getTotalLength();
    trail.setAttribute('stroke-dasharray', String(total));
    const points = [];
    const segments = Math.min(4096, Math.max(256, Math.ceil(total / 3)));
    for (let i = 0; i <= segments; i++) {
      const length = total * i / segments;
      const point = track.getPointAtLength(length);
      points.push({x:point.x, y:point.y, length});
    }
    geometry = {points,total,startY,endY,contacts,width,step:total / segments,heroHeight:Math.max(1,hero.offsetHeight)};
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
  window.addEventListener('resize', requestRebuild, {passive:true});
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
  function tick() {
    const remaining = timestamp - Date.now();
    if (remaining <= 0) {
      values.hidden = true;
      pending.hidden = false;
      pending.textContent = 'Время встречи настало';
      if (timer) clearInterval(timer);
      return;
    }
    pending.hidden = true;
    values.hidden = false;
    const days = Math.floor(remaining / 86400000);
    const hours = Math.floor(remaining / 3600000) % 24;
    const minutes = Math.floor(remaining / 60000) % 60;
    const seconds = Math.floor(remaining / 1000) % 60;
    daysNode.textContent = String(days);
    daysLabel.textContent = plural(days);
    hoursNode.textContent = String(hours).padStart(2, '0');
    minutesNode.textContent = String(minutes).padStart(2, '0');
    secondsNode.textContent = String(seconds).padStart(2, '0');
    values.setAttribute('aria-label', `${days} ${plural(days)}, ${hours} ${plural(hours, ['час', 'часа', 'часов'])}, ${minutes} ${plural(minutes, ['минута', 'минуты', 'минут'])}, ${seconds} ${plural(seconds, ['секунда', 'секунды', 'секунд'])} до встречи`);
  }
  tick();
  if (timestamp > Date.now()) timer = setInterval(tick, 1000);
  document.addEventListener('visibilitychange', () => { if (!document.hidden) tick(); });
  window.addEventListener('pagehide', () => { if (timer) clearInterval(timer); });
  window.addEventListener('pageshow', event => {
    if (event.persisted) {
      tick();
      if (timestamp > Date.now()) timer = setInterval(tick, 1000);
    }
  });
})();
