/* ===========================================================================
   bodyDiagram.js — draggable SVG limb-electrode placement diagram
   ---------------------------------------------------------------------------
   Draws a torso with the four limb electrodes (RA, LA, LL, RL) and lets the
   user physically drag them between the three limb positions, in any
   arrangement. RL (ground) is never involved in a swap and is not draggable.
   Electrodes start at the locations dictated by the given swap CLASS (0-5) —
   i.e. the "as recorded" mis-wiring — and turn from red (wrong spot) to green
   (correct spot) as they land on their true anatomical position. onChange(occupant)
   fires after every drop that actually changes the arrangement, passing the full
   slot->electrode mapping so callers can recompute the ECG for that exact wiring.
   Handles single swaps (classes 1-3) AND 3-cycles (classes 4-5).
   =========================================================================== */
(function (global) {
  'use strict';

  // Body locations (viewBox 0..200 x, 0..240 y). RL = right leg (ground).
  var LOC = {
    RA: { x: 44, y: 78 },
    LA: { x: 156, y: 78 },
    LL: { x: 132, y: 196 },
    RL: { x: 68, y: 196, color: '#94a3b8' }
  };
  var LIMB_SLOTS = ['RA', 'LA', 'LL'];

  // For each class, which electrode sits at [RA-loc, LA-loc, LL-loc] initially.
  // Mirrors src/class_consts.py CLASS_TO_PERM (RL is never involved).
  var CLASS_PERM = {
    0: ['RA', 'LA', 'LL'],
    1: ['LA', 'RA', 'LL'],
    2: ['LL', 'LA', 'RA'],
    3: ['RA', 'LL', 'LA'],
    4: ['LA', 'LL', 'RA'],
    5: ['LL', 'RA', 'LA']
  };

  var PERM_TO_CLASS = {};
  Object.keys(CLASS_PERM).forEach(function (k) {
    PERM_TO_CLASS[CLASS_PERM[k].join(',')] = Number(k);
  });

  // occupant: { RA: electrodeIdAtRAslot, LA: ..., LL: ... } -> class id (0-5).
  function classIdFromOccupant(occupant) {
    return PERM_TO_CLASS[[occupant.RA, occupant.LA, occupant.LL].join(',')];
  }

  // class id (0-5) -> occupant mapping, the inverse of classIdFromOccupant.
  function occupantFromClassId(classId) {
    var perm = CLASS_PERM[classId] || CLASS_PERM[0];
    return { RA: perm[0], LA: perm[1], LL: perm[2] };
  }

  function el(tag, attrs) {
    var e = document.createElementNS('http://www.w3.org/2000/svg', tag);
    for (var k in attrs) e.setAttribute(k, attrs[k]);
    return e;
  }

  function svgPoint(svg, clientX, clientY) {
    var pt = svg.createSVGPoint();
    pt.x = clientX; pt.y = clientY;
    var ctm = svg.getScreenCTM();
    if (!ctm) return { x: 0, y: 0 };
    var loc = pt.matrixTransform(ctm.inverse());
    return { x: loc.x, y: loc.y };
  }

  // Create the diagram. classId: the swap depicted at the start (0 = none).
  // onChange(isCorrected): called only when the full arrangement transitions
  // into or out of "corrected" (every electrode on its true home slot).
  // Returns { node, isCorrected(), reset() }.
  function create(classId, onChange) {
    classId = CLASS_PERM[classId] ? classId : 0;
    var perm = CLASS_PERM[classId];

    function startSlotOf(e) {
      return e === 'RL' ? 'RL' : LIMB_SLOTS[perm.indexOf(e)];
    }

    var svg = el('svg', {
      viewBox: '0 0 200 240', width: '100%',
      role: 'img', 'aria-label': 'Drag the electrodes to their correct anatomical positions'
    });
    svg.style.maxWidth = '260px';
    svg.style.display = 'block';
    svg.style.margin = '0 auto';
    svg.style.touchAction = 'none';
    svg.style.userSelect = 'none';

    var body = el('path', {
      d: 'M100 20 ' +
         'C120 20 132 32 132 50 C132 62 126 70 120 74 ' +
         'L150 92 C170 104 176 120 176 150 L168 150 ' +
         'C168 128 160 116 146 108 L140 150 L150 220 L120 220 L108 150 ' +
         'L92 150 L80 220 L50 220 L60 150 L54 108 ' +
         'C40 116 32 128 32 150 L24 150 C24 120 30 104 50 92 ' +
         'L80 74 C74 70 68 62 68 50 C68 32 80 20 100 20 Z',
      fill: 'rgba(148,163,184,0.10)', stroke: 'rgba(148,163,184,0.35)', 'stroke-width': '1.5'
    });
    svg.appendChild(body);

    var linesLayer = el('g', {});
    svg.appendChild(linesLayer);

    var occupant = {};   // slot name -> electrode identity currently there
    var slotOf = {};     // electrode identity -> slot name it currently occupies
    ['RA', 'LA', 'LL', 'RL'].forEach(function (e) {
      var s = startSlotOf(e);
      occupant[s] = e; slotOf[e] = s;
    });

    function isCorrected() {
      return LIMB_SLOTS.every(function (s) { return occupant[s] === s; });
    }

    function currentOccupant() {
      return { RA: occupant.RA, LA: occupant.LA, LL: occupant.LL };
    }

    function updateVisual(e) {
      var grp = groups[e];
      var loc = LOC[slotOf[e]];
      grp.g.setAttribute('transform', 'translate(' + loc.x + ',' + loc.y + ')');
      var atHome = e === 'RL' || slotOf[e] === e;
      grp.ring.setAttribute('stroke', atHome ? (e === 'RL' ? LOC.RL.color : '#34d399') : '#f87171');
      grp.ring.setAttribute('fill', atHome ? (e === 'RL' ? '#1b2440' : '#0f2e24') : '#5b1a1f');
      grp.ring.setAttribute('stroke-width', atHome ? '2' : '3');
    }

    function redrawLines() {
      while (linesLayer.firstChild) linesLayer.removeChild(linesLayer.firstChild);
      var displaced = LIMB_SLOTS.filter(function (s) { return occupant[s] !== s; });
      for (var a = 0; a < displaced.length; a++) {
        for (var b = a + 1; b < displaced.length; b++) {
          var la = LOC[displaced[a]], lb = LOC[displaced[b]];
          linesLayer.appendChild(el('line', {
            x1: la.x, y1: la.y, x2: lb.x, y2: lb.y,
            stroke: '#f87171', 'stroke-width': '2', 'stroke-dasharray': '4 4', opacity: '0.6'
          }));
        }
      }
    }

    var groups = {};
    var dragState = null;

    ['RA', 'LA', 'LL', 'RL'].forEach(function (e) {
      var g = el('g', { transform: 'translate(0,0)' });
      g.style.transition = 'transform 0.5s cubic-bezier(0.22, 1, 0.36, 1)';
      if (e !== 'RL') g.style.cursor = 'grab';

      var ring = el('circle', { r: '15', 'stroke-width': '2' });
      ring.style.transition = 'stroke 0.3s ease, fill 0.3s ease';

      var txt = el('text', {
        x: '0', y: '4', 'text-anchor': 'middle',
        'font-size': '12', 'font-weight': '700',
        fill: '#eef2ff', 'font-family': 'system-ui, sans-serif'
      });
      txt.textContent = e;   // label = the electrode's true identity, travels with it

      g.appendChild(ring); g.appendChild(txt); svg.appendChild(g);
      groups[e] = { g: g, ring: ring };

      if (e !== 'RL') {
        g.addEventListener('pointerdown', function (evt) {
          evt.preventDefault();
          g.setPointerCapture(evt.pointerId);
          g.style.cursor = 'grabbing';
          g.style.transition = 'none';
          dragState = { e: e, pointerId: evt.pointerId };
          svg.appendChild(g);   // bring to front while dragging
        });
      }
    });

    svg.addEventListener('pointermove', function (evt) {
      if (!dragState || dragState.pointerId !== evt.pointerId) return;
      var p = svgPoint(svg, evt.clientX, evt.clientY);
      groups[dragState.e].g.setAttribute('transform', 'translate(' + p.x + ',' + p.y + ')');
    });

    function endDrag(evt) {
      if (!dragState || dragState.pointerId !== evt.pointerId) return;
      var e = dragState.e;
      var g = groups[e].g;
      g.style.transition = 'transform 0.5s cubic-bezier(0.22, 1, 0.36, 1)';
      g.style.cursor = 'grab';
      dragState = null;

      var p = svgPoint(svg, evt.clientX, evt.clientY);
      var nearest = LIMB_SLOTS[0], best = Infinity;
      LIMB_SLOTS.forEach(function (s) {
        var d = Math.hypot(LOC[s].x - p.x, LOC[s].y - p.y);
        if (d < best) { best = d; nearest = s; }
      });

      var fromSlot = slotOf[e];
      var changed = nearest !== fromSlot;
      if (changed) {
        var other = occupant[nearest];
        occupant[fromSlot] = other; slotOf[other] = fromSlot;
        occupant[nearest] = e; slotOf[e] = nearest;
        updateVisual(other);
      }
      updateVisual(e);
      redrawLines();

      if (changed && onChange) onChange(currentOccupant());
    }
    svg.addEventListener('pointerup', endDrag);
    svg.addEventListener('pointercancel', endDrag);

    ['RA', 'LA', 'LL', 'RL'].forEach(updateVisual);
    redrawLines();

    // "Reset" jumps straight to the LA <-> LL swap arrangement (not back to the
    // starting layout) — a one-tap shortcut to the swap type this demo cares about.
    function reset() {
      occupant = { RA: 'RA', LA: 'LL', LL: 'LA', RL: 'RL' };
      slotOf = { RA: 'RA', LA: 'LL', LL: 'LA', RL: 'RL' };
      ['RA', 'LA', 'LL', 'RL'].forEach(updateVisual);
      redrawLines();
      if (onChange) onChange(currentOccupant());
    }

    return { node: svg, isCorrected: isCorrected, getOccupant: currentOccupant, reset: reset };
  }

  global.BodyDiagram = {
    create: create,
    classIdFromOccupant: classIdFromOccupant,
    occupantFromClassId: occupantFromClassId
  };
})(window);
