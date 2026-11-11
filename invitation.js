(() => {
  'use strict';
  const root = document.documentElement;
  root.dataset.fontMetrics = typeof FontFace !== 'undefined' && 'ascentOverride' in FontFace.prototype ? 'native' : 'legacy';
  const media = matchMedia('(prefers-reduced-motion: reduce)');
  let heroVisible = true;
  let refreshJourney = () => {};

  function reflectMotion() {
    root.dataset.motionOff = String(media.matches);
    refreshJourney();
  }
  root.dataset.enhanced = 'true';
  media.addEventListener('change', reflectMotion);
  reflectMotion();

  function reflectVisibility() { root.dataset.offscreen = String(document.hidden || !heroVisible); }
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
  const hero = document.getElementById('main');
  const scenes = Array.from(document.querySelectorAll('.story-scene'));
  let geometry = null;
  let pendingFrame = false;
  let rebuildFrame = false;

  function updateJourney() {
    pendingFrame = false;
    if (!geometry || media.matches) return;
    const {points, total, startY, endY, heroHeight, contacts} = geometry;
    if (scrollY > 3) root.dataset.journeyStarted = 'true';
    // Keep the star in view instead of tying its speed to the full page height.
    // Ease its viewport anchor from the hero seed to the reading area.
    const handoff = Math.min(1, Math.max(0, scrollY / (heroHeight * .5)));
    const anchorY = startY + (innerHeight * .45 - startY) * handoff;
    const targetY = Math.min(endY, Math.max(startY, scrollY + anchorY));
    let lo = 0, hi = points.length - 1;
    while (hi - lo > 1) {
      const mid = Math.floor((lo + hi) / 2);
      if (points[mid].y < targetY) lo = mid; else hi = mid;
    }
    const a = points[lo], b = points[hi];
    const ratio = Math.min(1, Math.max(0, (targetY - a.y) / Math.max(.01, b.y - a.y)));
    const length = a.length + (b.length - a.length) * ratio;
    const point = track.getPointAtLength(length);
    follower.setAttribute('transform', `translate(${point.x.toFixed(2)} ${point.y.toFixed(2)})`);
    trail.setAttribute('stroke-dashoffset', String(total - length));
    contacts.forEach(contact => {
      if (targetY >= contact.y - 110) contact.element.classList.add('is-seen');
      const touching = Math.abs(point.y - contact.y) < 34 && Math.abs(point.x - contact.x) < 40;
      contact.element.classList.toggle('is-lit', touching);
    });
  }
  function requestJourney() {
    if (!pendingFrame) {
      pendingFrame = true;
      requestAnimationFrame(updateJourney);
    }
  }
  function rebuildJourney() {
    rebuildFrame = false;
    const width = document.documentElement.clientWidth;
    const compact = width <= 640;
    const position = element => element.getBoundingClientRect().top + scrollY;
    const startY = hero.offsetHeight * .23;
    const end = document.getElementById('countdown');
    const height = Math.ceil(end.getBoundingClientRect().bottom + scrollY);
    const closing = end.querySelector('.closing-star');
    const endY = position(closing) + closing.getBoundingClientRect().height * .5;
    const knots = [{x: width * .81, y: startY}];
    const contacts = [];
    scenes.forEach(scene => {
      const art = scene.querySelector('.scene-art');
      const anchor = art.querySelector('.symbol-touchpoint').getBoundingClientRect();
      const artBox = art.getBoundingClientRect();
      const top = position(scene);
      const bottom = top + scene.offsetHeight;
      const x = anchor.left + anchor.width * .5;
      const y = anchor.top + scrollY + anchor.height * .5;
      contacts.push({x, y, element:art});
      if (compact) {
        knots.push({x:32, y:top + 16});
        knots.push({x, y});
        knots.push({x:32, y:artBox.bottom + scrollY + 26});
        knots.push({x:32, y:bottom - 24});
      } else {
        knots.push({x, y:top + 60});
        knots.push({x, y});
        knots.push({x, y:bottom - 60});
      }
    });
    const audience = document.querySelector('.audience-section');
    const edgeX = compact ? 12 : width * .1;
    knots.push({x:edgeX, y:position(audience) + 24});
    knots.push({x:edgeX, y:position(audience) + audience.offsetHeight - 24});
    knots.push({x: width * .5, y: endY});
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
    const total = track.getTotalLength();
    trail.setAttribute('stroke-dasharray', String(total));
    const points = [];
    for (let i = 0; i <= 500; i++) {
      const length = total * i / 500;
      const point = track.getPointAtLength(length);
      points.push({y:point.y, length});
    }
    geometry = {points,total,startY,endY,contacts,heroHeight:Math.max(1,hero.offsetHeight)};
    journey.removeAttribute('hidden');
    updateJourney();
  }
  function requestRebuild() {
    if (!rebuildFrame) {
      rebuildFrame = true;
      requestAnimationFrame(rebuildJourney);
    }
  }
  refreshJourney = () => { requestRebuild(); };
  window.addEventListener('scroll', requestJourney, {passive:true});
  window.addEventListener('resize', requestRebuild, {passive:true});
  window.addEventListener('pageshow', requestRebuild);
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
