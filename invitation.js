(() => {
  'use strict';
  const root = document.documentElement;
  const control = document.getElementById('motion-toggle');
  const label = document.getElementById('motion-label');
  const media = matchMedia('(prefers-reduced-motion: reduce)');
  let paused = false;
  let heroVisible = true;
  let refreshJourney = () => {};

  function reflectMotion() {
    root.dataset.paused = String(paused || media.matches);
    control.disabled = media.matches;
    root.dataset.motionOff = String(paused || media.matches);
    refreshJourney();
    control.setAttribute('aria-pressed', String(paused));
    control.setAttribute('aria-label', media.matches ? 'Анимация отключена настройками устройства' : paused ? 'Возобновить падающие звёзды' : 'Остановить падающие звёзды');
    label.textContent = media.matches ? 'Без анимации' : paused ? 'Продолжить' : 'Пауза';
  }
  root.dataset.enhanced = 'true';
  control.hidden = false;
  control.addEventListener('click', () => { paused = !paused; reflectMotion(); });
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
    if (!geometry || paused || media.matches) return;
    const {points, total, startY, endY, maxScroll} = geometry;
    if (scrollY > 3) root.dataset.journeyStarted = 'true';
    const fraction = Math.min(1, Math.max(0, scrollY / maxScroll));
    const targetY = startY + (endY - startY) * fraction;
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
    scenes.forEach((scene, i) => {
      const x = compact ? (i % 2 ? 32 : 45) : width * (scene.dataset.pathSide === 'right' ? .80 : .20);
      const top = position(scene);
      knots.push({x, y: top + scene.offsetHeight * .48});
    });
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
    geometry = {points,total,startY,endY,maxScroll:Math.max(1,height - innerHeight)};
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

  // Copy is readable without JavaScript, reduced motion or observer support.
  if ('IntersectionObserver' in window) {
    const reveal = new IntersectionObserver(entries => {
      entries.forEach(entry => {
        if (entry.isIntersecting) {
          entry.target.classList.remove('is-waiting');
          reveal.unobserve(entry.target);
        }
      });
    }, {threshold:.22});
    document.querySelectorAll('.reveal-copy').forEach(copy => {
      copy.classList.add('is-waiting');
      reveal.observe(copy);
    });
  }

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
  const plural = n => n % 100 >= 11 && n % 100 <= 14 ? 'дней' : n % 10 === 1 ? 'день' : n % 10 >= 2 && n % 10 <= 4 ? 'дня' : 'дней';
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
    daysNode.textContent = String(days);
    daysLabel.textContent = plural(days);
    hoursNode.textContent = String(hours).padStart(2, '0');
    minutesNode.textContent = String(minutes).padStart(2, '0');
    values.setAttribute('aria-label', `${days} ${plural(days)}, ${hours} часов, ${minutes} минут до встречи`);
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
