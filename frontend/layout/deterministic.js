(function () {
  "use strict";

  // Topology-aware deterministic placement for the single-wire view.
  //
  // The graph is classified once as radial (a tree or forest) or meshed (a
  // genuine loop: two distinct paths between the same pair of buses) and each
  // class gets the layout that reads best for it. Parallel branches and
  // self-loops are collapsed first: a second cable on the same route, or a
  // device with both ports on one bus, adds no second path, and the renderer
  // already fans parallel branches into their own lanes.
  //
  // * radial   -> tidy hierarchical tree, Buchheim/Junger/Leipert's linear-time
  //               improvement of Walker's algorithm (GD 2002). Parents are
  //               centred over their children and sibling subtrees never
  //               overlap. Tree depth becomes the topology rank (X) and the
  //               sibling spread becomes the lane (Y).
  // * meshed   -> layered ranks from the feeder root with one barycentric
  //               ordering sweep per rank to reduce crossings.
  // * on request -> stress layout: PivotMDS (Brandes & Pich, GD 2006) refined
  //               by SMACOF stress majorisation (Gansner, Koren & North,
  //               GD 2004) on small components. Free-form, but deterministic:
  //               fixed pivots, no random seeds, no animated simulation.
  //
  // Every routine here is pure: it reads the canonical index plus explicit
  // layout options and returns geometry, exactly as ADR 0004 requires.

  const MODULE_VERSION = "deterministic-layout-v3";
  const MIN_BUS_GAP = 64;
  const LAYER_STEP = 190;
  const CANVAS_PADDING = { left: 70, top: 86, right: 90, bottom: 82 };
  const COMPONENT_GAP_LANES = 2;
  const STRESS_PIVOTS = 50;
  const STRESS_SMACOF_MAX_NODES = 400;
  const STRESS_SMACOF_ITERATIONS = 30;
  const STRESS_EDGE_LENGTH = 145;
  const STRESS_COMPONENT_GAP = 2;

  // --- topology -------------------------------------------------------------

  // Disjoint-set over bus ids. union() returns false when both ends were
  // already connected, which is exactly the edge that closes a cycle.
  function createUnionFind() {
    const parent = new Map();
    function add(id) { if (!parent.has(id)) parent.set(id, id); }
    function find(id) {
      add(id);
      let root = id;
      while (parent.get(root) !== root) root = parent.get(root);
      let cursor = id;
      while (cursor !== root) { const next = parent.get(cursor); parent.set(cursor, root); cursor = next; }
      return root;
    }
    function union(a, b) {
      const rootA = find(a); const rootB = find(b);
      if (rootA === rootB) return false;
      parent.set(rootA, rootB);
      return true;
    }
    return { add, find, union };
  }

  // Expects simple edges: one entry per connected bus pair, no self-loops. Any
  // edge that joins two already-connected buses then closes a real loop.
  function classifyTopology(nodes, edges) {
    if (!nodes.length) return "empty";
    const groups = createUnionFind();
    nodes.forEach((id) => groups.add(id));
    const seen = new Set();
    for (const [from, to] of edges) {
      if (from === to) continue;
      const pair = from < to ? `${from}|${to}` : `${to}|${from}`;
      if (seen.has(pair)) continue;
      seen.add(pair);
      if (!groups.union(from, to)) return "meshed";
    }
    return "radial";
  }

  // Connected components in bus order, so the first member of each component is
  // its lowest-index bus and the whole placement stays reproducible.
  function componentsOf(nodes, adjacency) {
    const seen = new Set();
    const components = [];
    for (const id of nodes) {
      if (seen.has(id)) continue;
      const members = [];
      const queue = [id];
      seen.add(id);
      for (let cursor = 0; cursor < queue.length; cursor += 1) {
        const current = queue[cursor];
        members.push(current);
        for (const next of adjacency.get(current) || []) if (!seen.has(next)) { seen.add(next); queue.push(next); }
      }
      components.push(members);
    }
    return components;
  }

  function hopDistances(adjacency, source) {
    const distance = new Map([[source, 0]]);
    const queue = [source];
    for (let cursor = 0; cursor < queue.length; cursor += 1) {
      const current = queue[cursor];
      const next = distance.get(current) + 1;
      for (const neighbour of adjacency.get(current) || []) {
        if (!distance.has(neighbour)) { distance.set(neighbour, next); queue.push(neighbour); }
      }
    }
    return distance;
  }

  // --- tidy tree (radial) ---------------------------------------------------

  function createTreeNode(id) {
    const node = { id, parent: null, children: [], siblingIndex: 0, number: 1, x: 0, mod: 0, shift: 0, change: 0, depth: 0, thread: null, ancestor: null };
    node.ancestor = node;
    return node;
  }

  const leftContour = (node) => (node.children.length ? node.children[0] : node.thread);
  const rightContour = (node) => (node.children.length ? node.children[node.children.length - 1] : node.thread);
  const leftBrother = (node) => (node.parent && node.siblingIndex > 0 ? node.parent.children[node.siblingIndex - 1] : null);
  const leftmostSibling = (node) => (node.parent && node.siblingIndex > 0 ? node.parent.children[0] : null);

  // Spans the component reachable from rootId into a tree by breadth-first
  // search. Neighbours are visited in bus order, so the drawing is stable.
  function buildTree(rootId, adjacency, claimed) {
    const root = createTreeNode(rootId);
    claimed.add(rootId);
    const queue = [root];
    for (let cursor = 0; cursor < queue.length; cursor += 1) {
      const node = queue[cursor];
      for (const id of adjacency.get(node.id) || []) {
        if (claimed.has(id)) continue;
        claimed.add(id);
        const child = createTreeNode(id);
        child.parent = node;
        child.siblingIndex = node.children.length;
        child.number = node.children.length + 1;
        node.children.push(child);
        queue.push(child);
      }
    }
    return root;
  }

  function forEachTreeNode(root, visit) {
    const stack = [root];
    while (stack.length) {
      const node = stack.pop();
      visit(node);
      for (const child of node.children) stack.push(child);
    }
  }

  // The Buchheim passes are written iteratively: distribution feeders are often
  // long single-path chains whose tree depth equals the bus count, which would
  // overflow the call stack on a recursive walk.
  function firstWalk(root, distance) {
    const order = [];
    const stack = [root];
    while (stack.length) {
      const node = stack.pop();
      order.push(node);
      for (const child of node.children) stack.push(child);
    }
    // Children are pushed left to right and popped right to left, so reversing
    // the traversal finalises every node after its children and after the
    // subtrees of all its left siblings — what apportion() assumes.
    for (let i = order.length - 1; i >= 0; i -= 1) firstWalkNode(order[i], distance);
  }

  function firstWalkNode(node, distance) {
    if (!node.children.length) {
      const brother = leftBrother(node);
      node.x = leftmostSibling(node) ? brother.x + distance : 0;
      return;
    }
    let defaultAncestor = node.children[0];
    for (const child of node.children) defaultAncestor = apportion(child, defaultAncestor, distance);
    executeShifts(node);
    const midpoint = (node.children[0].x + node.children[node.children.length - 1].x) / 2;
    const brother = leftBrother(node);
    if (brother) { node.x = brother.x + distance; node.mod = node.x - midpoint; }
    else node.x = midpoint;
  }

  function apportion(node, defaultAncestor, distance) {
    const brother = leftBrother(node);
    let ancestor = defaultAncestor;
    if (!brother) return ancestor;
    let insideRight = node; let outsideRight = node;
    let insideLeft = brother; let outsideLeft = leftmostSibling(node);
    let shiftInsideRight = node.mod; let shiftOutsideRight = node.mod;
    let shiftInsideLeft = insideLeft.mod; let shiftOutsideLeft = outsideLeft.mod;
    while (rightContour(insideLeft) && leftContour(insideRight)) {
      insideLeft = rightContour(insideLeft);
      insideRight = leftContour(insideRight);
      outsideLeft = leftContour(outsideLeft);
      outsideRight = rightContour(outsideRight);
      outsideRight.ancestor = node;
      const shift = (insideLeft.x + shiftInsideLeft) - (insideRight.x + shiftInsideRight) + distance;
      if (shift > 0) {
        moveSubtree(ancestorOf(insideLeft, node, ancestor), node, shift);
        shiftInsideRight += shift;
        shiftOutsideRight += shift;
      }
      shiftInsideLeft += insideLeft.mod;
      shiftInsideRight += insideRight.mod;
      shiftOutsideLeft += outsideLeft.mod;
      shiftOutsideRight += outsideRight.mod;
    }
    if (rightContour(insideLeft) && !rightContour(outsideRight)) {
      outsideRight.thread = rightContour(insideLeft);
      outsideRight.mod += shiftInsideLeft - shiftOutsideRight;
    } else {
      if (leftContour(insideRight) && !leftContour(outsideLeft)) {
        outsideLeft.thread = leftContour(insideRight);
        outsideLeft.mod += shiftInsideRight - shiftOutsideLeft;
      }
      ancestor = node;
    }
    return ancestor;
  }

  function moveSubtree(left, right, shift) {
    const subtrees = right.number - left.number;
    right.change -= shift / subtrees;
    right.shift += shift;
    left.change += shift / subtrees;
    right.x += shift;
    right.mod += shift;
  }

  function executeShifts(node) {
    let shift = 0; let change = 0;
    for (let i = node.children.length - 1; i >= 0; i -= 1) {
      const child = node.children[i];
      child.x += shift;
      child.mod += shift;
      change += child.change;
      shift += child.shift + change;
    }
  }

  function ancestorOf(insideLeft, node, defaultAncestor) {
    if (node.parent && node.parent.children.includes(insideLeft.ancestor)) return insideLeft.ancestor;
    return defaultAncestor;
  }

  function secondWalk(root) {
    const stack = [{ node: root, mod: 0, depth: 0 }];
    while (stack.length) {
      const frame = stack.pop();
      frame.node.x += frame.mod;
      frame.node.depth = frame.depth;
      for (const child of frame.node.children) stack.push({ node: child, mod: frame.mod + frame.node.mod, depth: frame.depth + 1 });
    }
  }

  // Places every component as its own tidy tree and packs the forest into
  // adjacent lane bands. Returns bus id -> { column: rank, lane: sibling spread }.
  function tidyTreePlacement(components, adjacency, seedsFor) {
    const placement = new Map();
    const claimed = new Set();
    let laneCursor = 0;
    for (const members of components) {
      const root = buildTree(seedsFor(members)[0], adjacency, claimed);
      firstWalk(root, 1);
      secondWalk(root);
      let minLane = Infinity; let maxLane = -Infinity;
      forEachTreeNode(root, (node) => { minLane = Math.min(minLane, node.x); maxLane = Math.max(maxLane, node.x); });
      const shift = laneCursor - minLane;
      forEachTreeNode(root, (node) => placement.set(node.id, { column: node.depth, lane: node.x + shift }));
      laneCursor += (maxLane - minLane) + COMPONENT_GAP_LANES;
    }
    return placement;
  }

  // --- layered ranks (meshed) -----------------------------------------------

  // Breadth-first ranks outward from the feeder root, then a single barycentric
  // ordering sweep per rank so branches leave their parents without crossing.
  function layeredPlacement(components, adjacency, seedsFor, indexOf) {
    const placement = new Map();
    let laneBase = 0;
    for (const members of components) {
      const rankOf = new Map();
      const queue = [];
      for (const seed of seedsFor(members)) if (!rankOf.has(seed)) { rankOf.set(seed, 0); queue.push(seed); }
      for (let cursor = 0; cursor < queue.length; cursor += 1) {
        const current = queue[cursor];
        const rank = rankOf.get(current) + 1;
        for (const next of adjacency.get(current) || []) if (!rankOf.has(next)) { rankOf.set(next, rank); queue.push(next); }
      }
      const byRank = new Map();
      for (const id of members) {
        const rank = rankOf.get(id) || 0;
        if (!byRank.has(rank)) byRank.set(rank, []);
        byRank.get(rank).push(id);
      }
      const ranks = [...byRank.keys()].sort((a, b) => a - b);
      const orderInRank = new Map();
      let bandWidth = 0;
      for (const rank of ranks) {
        const row = byRank.get(rank);
        if (rank === 0) row.sort((a, b) => indexOf(a) - indexOf(b));
        else {
          const barycentre = new Map(row.map((id) => {
            const parents = (adjacency.get(id) || []).filter((other) => rankOf.get(other) === rank - 1 && orderInRank.has(other));
            return [id, parents.length ? parents.reduce((sum, other) => sum + orderInRank.get(other), 0) / parents.length : indexOf(id)];
          }));
          row.sort((a, b) => barycentre.get(a) - barycentre.get(b) || indexOf(a) - indexOf(b));
        }
        row.forEach((id, position) => orderInRank.set(id, position));
        bandWidth = Math.max(bandWidth, row.length);
      }
      for (const rank of ranks) {
        const row = byRank.get(rank);
        const centring = (bandWidth - row.length) / 2;
        row.forEach((id, position) => placement.set(id, { column: rank, lane: laneBase + centring + position }));
      }
      laneBase += bandWidth + COMPONENT_GAP_LANES;
    }
    return placement;
  }

  function toCanvasPositions(placement, direction) {
    const positions = new Map();
    if (!placement.size) return positions;
    let minLane = Infinity; let maxColumn = 0;
    for (const spot of placement.values()) { minLane = Math.min(minLane, spot.lane); maxColumn = Math.max(maxColumn, spot.column); }
    for (const [id, spot] of placement) {
      const column = direction === "load-to-source" ? maxColumn - spot.column : spot.column;
      positions.set(id, [CANVAS_PADDING.left + column * LAYER_STEP, CANVAS_PADDING.top + (spot.lane - minLane) * MIN_BUS_GAP]);
    }
    return positions;
  }

  // --- stress layout (PivotMDS + SMACOF) ------------------------------------

  // Pivot selection by farthest-first traversal (a k-centers heuristic), seeded
  // at the lowest-index bus so the same case always picks the same pivots.
  function selectPivots(nodes, adjacency, count, indexOf) {
    if (!nodes.length || count <= 0) return [];
    const chosen = [];
    const inChosen = new Set();
    const minDistance = new Map(nodes.map((id) => [id, Infinity]));
    let next = nodes[0];
    while (chosen.length < count) {
      chosen.push(next);
      inChosen.add(next);
      for (const [id, hops] of hopDistances(adjacency, next)) {
        if (minDistance.has(id) && hops < minDistance.get(id)) minDistance.set(id, hops);
      }
      minDistance.set(next, 0);
      let best = null; let bestDistance = -1; let bestIndex = Infinity;
      for (const id of nodes) {
        if (inChosen.has(id)) continue;
        const hops = minDistance.get(id); const index = indexOf(id);
        if (hops > bestDistance || (hops === bestDistance && index < bestIndex)) { best = id; bestDistance = hops; bestIndex = index; }
      }
      if (!best) break;
      next = best;
    }
    return chosen;
  }

  // Full symmetric eigendecomposition by cyclic Jacobi rotation. Robust for the
  // small Gram matrices PivotMDS builds, including the equal top eigenvalues of
  // a symmetric feeder, where power iteration cannot separate the axes.
  function jacobiEigen(input) {
    const size = input.length;
    const matrix = input.map((row) => [...row]);
    const vectors = Array.from({ length: size }, (_, i) => Array.from({ length: size }, (_, j) => (i === j ? 1 : 0)));
    for (let sweep = 0; sweep < 100; sweep += 1) {
      let off = 0;
      for (let p = 0; p < size; p += 1) for (let q = p + 1; q < size; q += 1) off += matrix[p][q] * matrix[p][q];
      if (off < 1e-22) break;
      for (let p = 0; p < size; p += 1) {
        for (let q = p + 1; q < size; q += 1) {
          if (Math.abs(matrix[p][q]) < 1e-20) continue;
          const phi = 0.5 * Math.atan2(2 * matrix[p][q], matrix[p][p] - matrix[q][q]);
          const cosine = Math.cos(phi); const sine = Math.sin(phi);
          for (let i = 0; i < size; i += 1) {
            const ip = matrix[i][p]; const iq = matrix[i][q];
            matrix[i][p] = cosine * ip - sine * iq;
            matrix[i][q] = sine * ip + cosine * iq;
          }
          for (let i = 0; i < size; i += 1) {
            const pi = matrix[p][i]; const qi = matrix[q][i];
            matrix[p][i] = cosine * pi - sine * qi;
            matrix[q][i] = sine * pi + cosine * qi;
          }
          for (let i = 0; i < size; i += 1) {
            const ip = vectors[i][p]; const iq = vectors[i][q];
            vectors[i][p] = cosine * ip - sine * iq;
            vectors[i][q] = sine * ip + cosine * iq;
          }
        }
      }
    }
    return {
      values: Array.from({ length: size }, (_, i) => matrix[i][i]),
      vectors: Array.from({ length: size }, (_, column) => Array.from({ length: size }, (_, i) => vectors[i][column]))
    };
  }

  // Classical multidimensional scaling on the distances to a few pivot buses.
  function pivotMds(nodes, adjacency, indexOf) {
    const count = nodes.length;
    const pivots = selectPivots(nodes, adjacency, Math.min(STRESS_PIVOTS, count), indexOf);
    const pivotCount = pivots.length;
    const distanceMaps = pivots.map((pivot) => hopDistances(adjacency, pivot));
    const squared = Array.from({ length: count }, (_, i) => Array.from({ length: pivotCount }, (_, j) => {
      const hops = distanceMaps[j].has(nodes[i]) ? distanceMaps[j].get(nodes[i]) : count;
      return hops * hops;
    }));
    const columnMean = new Array(pivotCount).fill(0);
    const rowMean = new Array(count).fill(0);
    let grandMean = 0;
    for (let i = 0; i < count; i += 1) {
      for (let j = 0; j < pivotCount; j += 1) { columnMean[j] += squared[i][j]; rowMean[i] += squared[i][j]; grandMean += squared[i][j]; }
    }
    for (let j = 0; j < pivotCount; j += 1) columnMean[j] /= count;
    for (let i = 0; i < count; i += 1) rowMean[i] /= pivotCount;
    grandMean /= count * pivotCount;
    const centred = Array.from({ length: count }, (_, i) => Array.from({ length: pivotCount }, (_, j) => -0.5 * (squared[i][j] - columnMean[j] - rowMean[i] + grandMean)));
    const gram = Array.from({ length: pivotCount }, (_, a) => Array.from({ length: pivotCount }, (_, b) => {
      let sum = 0;
      for (let i = 0; i < count; i += 1) sum += centred[i][a] * centred[i][b];
      return sum;
    }));
    const eigen = jacobiEigen(gram);
    const order = Array.from({ length: pivotCount }, (_, i) => i).sort((a, b) => eigen.values[b] - eigen.values[a]);
    const first = eigen.vectors[order[0]];
    const second = pivotCount > 1 ? eigen.vectors[order[1]] : new Array(pivotCount).fill(0);
    const positions = new Map();
    for (let i = 0; i < count; i += 1) {
      let x = 0; let y = 0;
      for (let j = 0; j < pivotCount; j += 1) { x += centred[i][j] * first[j]; y += centred[i][j] * second[j]; }
      positions.set(nodes[i], [x, y]);
    }
    return positions;
  }

  // SMACOF stress majorisation against the full hop-distance matrix. Only used
  // on small components: the matrix and each iteration are O(n^2).
  function smacof(nodes, adjacency, positions) {
    const count = nodes.length;
    if (count < 3) return;
    const target = nodes.map((id) => {
      const hops = hopDistances(adjacency, id);
      return nodes.map((other) => (hops.has(other) ? hops.get(other) : count));
    });
    let x = nodes.map((id) => positions.get(id)[0]);
    let y = nodes.map((id) => positions.get(id)[1]);
    for (let iteration = 0; iteration < STRESS_SMACOF_ITERATIONS; iteration += 1) {
      const nextX = new Array(count).fill(0);
      const nextY = new Array(count).fill(0);
      for (let i = 0; i < count; i += 1) {
        let diagonal = 0; let sumX = 0; let sumY = 0;
        for (let j = 0; j < count; j += 1) {
          if (i === j) continue;
          const dx = x[i] - x[j]; const dy = y[i] - y[j];
          const distance = Math.hypot(dx, dy);
          const weight = distance > 1e-9 ? -target[i][j] / distance : 0;
          diagonal -= weight;
          sumX += weight * x[j];
          sumY += weight * y[j];
        }
        nextX[i] = (diagonal * x[i] + sumX) / count;
        nextY[i] = (diagonal * y[i] + sumY) / count;
      }
      let centreX = 0; let centreY = 0;
      for (let i = 0; i < count; i += 1) { centreX += nextX[i]; centreY += nextY[i]; }
      centreX /= count; centreY /= count;
      for (let i = 0; i < count; i += 1) { nextX[i] -= centreX; nextY[i] -= centreY; }
      x = nextX; y = nextY;
    }
    nodes.forEach((id, i) => positions.set(id, [x[i], y[i]]));
  }

  // Rescales an embedding so one graph hop is roughly one layout unit. The MDS
  // axes carry an arbitrary scale, so components must be normalised before they
  // are packed side by side.
  function normaliseToHopLength(nodes, adjacency, positions) {
    const lengths = [];
    const seen = new Set();
    for (const id of nodes) {
      for (const other of adjacency.get(id) || []) {
        const key = id < other ? `${id}|${other}` : `${other}|${id}`;
        if (seen.has(key)) continue;
        seen.add(key);
        const from = positions.get(id); const to = positions.get(other);
        if (from && to) lengths.push(Math.hypot(to[0] - from[0], to[1] - from[1]));
      }
    }
    lengths.sort((a, b) => a - b);
    const median = lengths.length ? lengths[Math.floor(lengths.length / 2)] : 0;
    if (!(median > 1e-9)) return;
    for (const [id, point] of positions) positions.set(id, [point[0] / median, point[1] / median]);
  }

  // MDS axes are arbitrary up to rotation, so turn the embedding until its
  // principal axis lies along X. A feeder then reads left to right instead of
  // diagonally, and the drawing keeps a sensible aspect ratio. The rotation is
  // rigid, so packed components cannot start overlapping.
  function orientEmbedding(points) {
    if (points.length < 2) return;
    let centreX = 0; let centreY = 0;
    for (const point of points) { centreX += point[0]; centreY += point[1]; }
    centreX /= points.length; centreY /= points.length;
    let xx = 0; let yy = 0; let xy = 0;
    for (const point of points) {
      const dx = point[0] - centreX; const dy = point[1] - centreY;
      xx += dx * dx; yy += dy * dy; xy += dx * dy;
    }
    const angle = 0.5 * Math.atan2(2 * xy, xx - yy);
    const cosine = Math.cos(-angle); const sine = Math.sin(-angle);
    for (const point of points) {
      const dx = point[0] - centreX; const dy = point[1] - centreY;
      point[0] = centreX + dx * cosine - dy * sine;
      point[1] = centreY + dx * sine + dy * cosine;
    }
  }

  function stressPlacement(components, adjacency, indexOf) {
    const placement = new Map();
    let xCursor = 0;
    for (const members of components) {
      const local = members.length === 1 ? new Map([[members[0], [0, 0]]]) : pivotMds(members, adjacency, indexOf);
      if (members.length > 1 && members.length <= STRESS_SMACOF_MAX_NODES) smacof(members, adjacency, local);
      normaliseToHopLength(members, adjacency, local);
      let minX = Infinity; let maxX = -Infinity; let minY = Infinity;
      for (const [x, y] of local.values()) { minX = Math.min(minX, x); maxX = Math.max(maxX, x); minY = Math.min(minY, y); }
      for (const [id, point] of local) placement.set(id, [point[0] - minX + xCursor, point[1] - minY]);
      xCursor += (maxX - minX) + STRESS_COMPONENT_GAP;
    }
    return placement;
  }

  function createDeterministicLayout(dependencies) {
    const getIndex = dependencies.getIndex;
    const getLayout = dependencies.getLayout;

    // Undirected bus graph of the case. A device with several ports (including
    // an n-winding transformer) contributes a spoke from its first port to each
    // remaining port, matching what the single-wire renderer draws.
    function graph() {
      const index = getIndex();
      const buses = index?.buses || [];
      const order = new Map(buses.map((bus, position) => [bus.ref.id, position]));
      const neighbours = new Map(buses.map((bus) => [bus.ref.id, new Set()]));
      for (const item of index?.assets || []) {
        const ports = item.ports || [];
        if (ports.length < 2) continue;
        const anchor = ports[0].busId;
        if (!order.has(anchor)) continue;
        for (const port of ports.slice(1)) {
          if (!order.has(port.busId) || anchor === port.busId) continue;
          neighbours.get(anchor).add(port.busId);
          neighbours.get(port.busId).add(anchor);
        }
      }
      // Neighbour lists in bus order keep every traversal reproducible.
      const adjacency = new Map([...neighbours].map(([id, set]) => [id, [...set].sort((a, b) => order.get(a) - order.get(b))]));
      // The simple edge list the classifier needs: the adjacency has already
      // collapsed parallel branches and self-loops, so read each pair once.
      const edges = [];
      for (const [id, list] of adjacency) {
        for (const other of list) if (order.get(id) < order.get(other)) edges.push([id, other]);
      }
      return { buses, adjacency, edges, order, nodes: buses.map((bus) => bus.ref.id) };
    }

    // Feeder roots for a component: the explicitly selected root when it lives
    // there, otherwise every voltage source in it, otherwise its lowest-index
    // bus, so a forest of islands never piles up on rank 0.
    function createSeedSelector(index, layout, order) {
      const configured = typeof layout.root === "string" && layout.root !== "auto" && order.has(layout.root) ? layout.root : null;
      const sources = [...new Set((index?.assets || [])
        .filter((item) => item.ref.kind === "voltage_source" && item.ports?.[0] && order.has(item.ports[0].busId))
        .map((item) => item.ports[0].busId))].sort((a, b) => order.get(a) - order.get(b));
      return (members) => {
        const inComponent = new Set(members);
        if (configured && inComponent.has(configured)) return [configured];
        const found = sources.filter((id) => inComponent.has(id));
        return found.length ? found : [members[0]];
      };
    }

    function autoPlacement() {
      const index = getIndex();
      const layout = getLayout() || {};
      const { buses, adjacency, edges, order, nodes } = graph();
      const topology = classifyTopology(nodes, edges);
      if (topology === "empty") return { topology, strategy: "empty", placement: new Map() };
      const components = componentsOf(nodes, adjacency);
      const seedsFor = createSeedSelector(index, layout, order);
      const indexOf = (id) => (order.has(id) ? order.get(id) : buses.length);
      return topology === "radial"
        ? { topology, strategy: "tidy-tree", placement: tidyTreePlacement(components, adjacency, seedsFor) }
        : { topology, strategy: "layered", placement: layeredPlacement(components, adjacency, seedsFor, indexOf) };
    }

    // Topology-aware placement: tidy tree for radial feeders, layered ranks for
    // meshed networks.
    function singleAutoPositions() {
      const layout = getLayout() || {};
      return toCanvasPositions(autoPlacement().placement, layout.direction);
    }

    // Deterministic stress embedding, offered as the explicit exploratory mode
    // for dense or meshed networks. Mirrored, when needed, so the feeder root
    // still reads on the side the chosen direction implies.
    function singleStressPositions() {
      const index = getIndex();
      const layout = getLayout() || {};
      const { buses, adjacency, order, nodes } = graph();
      if (!nodes.length) return new Map();
      const components = componentsOf(nodes, adjacency);
      const seedsFor = createSeedSelector(index, layout, order);
      const indexOf = (id) => (order.has(id) ? order.get(id) : buses.length);
      const placement = stressPlacement(components, adjacency, indexOf);
      const points = [...placement.values()];
      orientEmbedding(points);
      const root = seedsFor(components[0])[0];
      const meanX = points.reduce((sum, point) => sum + point[0], 0) / points.length;
      const rootX = placement.get(root)?.[0] ?? meanX;
      const towardsLoad = layout.direction !== "load-to-source";
      const mirror = towardsLoad ? rootX > meanX : rootX < meanX;
      let minX = Infinity; let minY = Infinity;
      for (const point of points) {
        if (mirror) point[0] = -point[0];
        minX = Math.min(minX, point[0]);
        minY = Math.min(minY, point[1]);
      }
      const positions = new Map();
      for (const [id, point] of placement) {
        positions.set(id, [
          CANVAS_PADDING.left + (point[0] - minX) * STRESS_EDGE_LENGTH,
          CANVAS_PADDING.top + (point[1] - minY) * STRESS_EDGE_LENGTH
        ]);
      }
      return positions;
    }

    function lockedPositions(layout) {
      return new Map(Object.entries(layout.locked || {})
        .filter(([, point]) => Array.isArray(point) && point.length === 2 && point.every(Number.isFinite))
        .map(([id, point]) => [id, [point[0], point[1]]]));
    }

    function singlePositions() {
      const layout = getLayout() || {};
      const locked = lockedPositions(layout);
      const expectedBuses = getIndex()?.buses?.length || 0;
      // "force" is the pre-v3 identifier for the same explicit engine; profiles
      // saved under it keep restoring their persisted positions.
      const explicitEngine = layout.engine === "stress" || layout.engine === "force";
      const positions = explicitEngine && expectedBuses > 0 && locked.size === expectedBuses ? locked : singleAutoPositions();
      for (const [id, point] of locked) positions.set(id, point);
      return positions;
    }

    // What the status line reports: the classification and the strategy it
    // selected, without recomputing the whole placement.
    function singleLayoutInfo() {
      const layout = getLayout() || {};
      const { edges, nodes } = graph();
      const topology = classifyTopology(nodes, edges);
      const engine = layout.engine === "force" ? "stress" : layout.engine;
      const strategy = engine === "elk" ? "elk"
        : engine === "stress" ? "stress"
        : topology === "radial" ? "tidy-tree"
        : topology === "empty" ? "empty"
        : "layered";
      return { topology, strategy, engine: engine || "deterministic" };
    }

    function singleBounds(positions) {
      const points = [...(positions || new Map()).values()].filter((point) => Array.isArray(point) && point.length === 2 && point.every(Number.isFinite));
      const maxX = Math.max(670, ...points.map((point) => point[0]));
      const maxY = Math.max(360, ...points.map((point) => point[1]));
      return {
        width: Math.ceil(maxX + CANVAS_PADDING.right),
        height: Math.max(500, Math.ceil(maxY + CANVAS_PADDING.bottom)),
        minBusGap: MIN_BUS_GAP
      };
    }

    return Object.freeze({ MODULE_VERSION, singlePositions, singleAutoPositions, singleStressPositions, singleLayoutInfo, singleBounds });
  }

  globalThis.BMOPFLayouts = Object.freeze({ MODULE_VERSION, createDeterministicLayout, classifyTopology });
})();
