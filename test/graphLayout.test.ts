import { assert } from "chai";
import { clusterForce, components, type LayoutNode } from "../src/graph/layout";

/** Pure tests for the network layout's cluster separation. */
describe("graph cluster layout", function () {
  it("splits nodes into connected components, largest first", function () {
    const groups = components(
      [1, 2, 3, 4, 5, 6],
      [
        { source: 1, target: 2 },
        { source: 3, target: 2 },
        { source: 4, target: 5 },
        { source: 1, target: 99 }, // end outside the node set is ignored
      ],
    );
    assert.deepEqual(
      groups.map((g) => [...g].sort()),
      [[1, 2, 3], [4, 5], [6]],
    );
  });

  // Runs the force alone like d3 does: apply, then move by velocity.
  const settle = (
    nodes: LayoutNode[],
    groups: number[][],
    gap: number,
    spacing = 0,
  ): void => {
    const force = clusterForce({
      gap: () => gap,
      nodeRadius: () => 5,
      spacing: () => spacing,
    });
    force.initialize(nodes);
    force.groups(groups);
    for (let i = 0, alpha = 1; i < 300; i++, alpha *= 0.98) {
      force(alpha);
      for (const n of nodes) {
        n.vx = (n.vx ?? 0) * 0.6;
        n.vy = (n.vy ?? 0) * 0.6;
        n.x = (n.x ?? 0) + n.vx;
        n.y = (n.y ?? 0) + n.vy;
      }
    }
  };

  it("pushes overlapping clusters apart and keeps their shape", function () {
    const nodes: LayoutNode[] = [
      { id: 1, x: 0, y: 0 },
      { id: 2, x: 20, y: 0 },
      { id: 3, x: 5, y: 5 },
      { id: 4, x: 15, y: 5 },
    ];
    settle(
      nodes,
      [
        [1, 2],
        [3, 4],
      ],
      30,
    );
    const [a1, a2, b1, b2] = nodes;
    // Each pair keeps its own distance (moved as a whole) …
    assert.approximately(Math.hypot(a2.x! - a1.x!, a2.y! - a1.y!), 20, 1e-6);
    assert.approximately(Math.hypot(b2.x! - b1.x!, b2.y! - b1.y!), 10, 1e-6);
    // … and the discs (radius = half span + node radius) end up apart.
    const ca = { x: (a1.x! + a2.x!) / 2, y: (a1.y! + a2.y!) / 2 };
    const cb = { x: (b1.x! + b2.x!) / 2, y: (b1.y! + b2.y!) / 2 };
    assert.isAbove(Math.hypot(ca.x - cb.x, ca.y - cb.y), 15 + 10 + 30 - 1);
  });

  it("keeps nodes of one cluster apart by radius plus spacing", function () {
    const nodes: LayoutNode[] = [
      { id: 1, x: 0, y: 0 },
      { id: 2, x: 0, y: 0 },
      { id: 3, x: 1, y: 0 },
    ];
    settle(nodes, [[1, 2, 3]], 0, 20);
    for (let i = 0; i < nodes.length; i++) {
      for (let j = i + 1; j < nodes.length; j++) {
        const d = Math.hypot(
          nodes[i].x! - nodes[j].x!,
          nodes[i].y! - nodes[j].y!,
        );
        assert.isAbove(d, 5 + 5 + 20 - 1);
      }
    }
  });
});
