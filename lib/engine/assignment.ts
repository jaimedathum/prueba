/**
 * Asignación óptima de jugadores a huecos de una formación.
 *
 * Se resuelve con flujo de coste mínimo, que da el **óptimo exacto**:
 *
 *     origen → jugador (cap 1) → posición (cap 1, coste −EP) → destino (cap = huecos)
 *
 * Cuando cada jugador solo puede ocupar su posición, esto se reduce a coger
 * los N de más puntos esperados de cada posición, que es lo que uno haría a
 * mano. La gracia es que si un jugador es elegible en varias posiciones el
 * problema deja de ser separable y elegir por posición ya no es óptimo — y
 * este algoritmo sigue dando la respuesta correcta sin cambiar nada.
 */

interface Edge {
  to: number;
  capacity: number;
  cost: number;
  /** Índice de la arista inversa en la lista del nodo destino. */
  reverse: number;
}

class MinCostFlow {
  private readonly graph: Edge[][];

  constructor(nodes: number) {
    this.graph = Array.from({ length: nodes }, () => []);
  }

  addEdge(from: number, to: number, capacity: number, cost: number): void {
    this.graph[from]!.push({
      to,
      capacity,
      cost,
      reverse: this.graph[to]!.length,
    });
    this.graph[to]!.push({
      to: from,
      capacity: 0,
      cost: -cost,
      reverse: this.graph[from]!.length - 1,
    });
  }

  /**
   * Flujo de coste mínimo hasta `maxFlow` unidades. Usa Bellman-Ford (SPFA)
   * porque hay costes negativos: los potenciales de Dijkstra no valen aquí sin
   * una inicialización aparte, y a esta escala no compensa la complejidad.
   */
  run(source: number, sink: number, maxFlow: number): { flow: number; cost: number } {
    let flow = 0;
    let cost = 0;
    const n = this.graph.length;

    while (flow < maxFlow) {
      const dist = new Array<number>(n).fill(Infinity);
      const inQueue = new Array<boolean>(n).fill(false);
      const prevNode = new Array<number>(n).fill(-1);
      const prevEdge = new Array<number>(n).fill(-1);

      dist[source] = 0;
      const queue: number[] = [source];
      inQueue[source] = true;

      while (queue.length > 0) {
        const node = queue.shift()!;
        inQueue[node] = false;

        const edges = this.graph[node]!;
        for (let i = 0; i < edges.length; i++) {
          const edge = edges[i]!;
          if (edge.capacity <= 0) continue;
          const candidate = dist[node]! + edge.cost;
          if (candidate < dist[edge.to]! - 1e-12) {
            dist[edge.to] = candidate;
            prevNode[edge.to] = node;
            prevEdge[edge.to] = i;
            if (!inQueue[edge.to]) {
              inQueue[edge.to] = true;
              queue.push(edge.to);
            }
          }
        }
      }

      if (dist[sink] === Infinity) break; // No hay más camino: red saturada.

      // Cuello de botella del camino encontrado.
      let bottleneck = maxFlow - flow;
      for (let node = sink; node !== source; node = prevNode[node]!) {
        const edge = this.graph[prevNode[node]!]![prevEdge[node]!]!;
        bottleneck = Math.min(bottleneck, edge.capacity);
      }

      for (let node = sink; node !== source; node = prevNode[node]!) {
        const edge = this.graph[prevNode[node]!]![prevEdge[node]!]!;
        edge.capacity -= bottleneck;
        this.graph[edge.to]![edge.reverse]!.capacity += bottleneck;
      }

      flow += bottleneck;
      cost += bottleneck * dist[sink]!;
    }

    return { flow, cost };
  }

  /** Aristas jugador→posición que han quedado con flujo. */
  usedEdges(playerOffset: number, playerCount: number): Array<[number, number]> {
    const used: Array<[number, number]> = [];
    for (let i = 0; i < playerCount; i++) {
      const node = playerOffset + i;
      for (const edge of this.graph[node]!) {
        // Capacidad consumida en una arista hacia adelante = está en uso.
        if (edge.capacity === 0 && edge.to !== 0 && edge.cost <= 0) {
          used.push([i, edge.to]);
        }
      }
    }
    return used;
  }
}

export interface AssignmentInput {
  /** Puntos esperados de cada jugador y posiciones en las que puede jugar. */
  players: Array<{ value: number; eligiblePositions: number[] }>;
  /** Huecos por posición. */
  slots: Map<number, number>;
}

export interface AssignmentResult {
  /** Índice de jugador → posición asignada. */
  assignment: Map<number, number>;
  totalValue: number;
  /** Falso si no hay jugadores suficientes para cubrir la formación. */
  feasible: boolean;
}

export function solveAssignment(input: AssignmentInput): AssignmentResult {
  const positions = [...input.slots.keys()];
  const totalSlots = [...input.slots.values()].reduce((a, b) => a + b, 0);

  const source = 0;
  const playerOffset = 1;
  const positionOffset = playerOffset + input.players.length;
  const sink = positionOffset + positions.length;

  const flow = new MinCostFlow(sink + 1);
  const positionNode = new Map<number, number>(
    positions.map((positionId, index) => [positionId, positionOffset + index]),
  );

  for (let i = 0; i < input.players.length; i++) {
    flow.addEdge(source, playerOffset + i, 1, 0);
    for (const positionId of input.players[i]!.eligiblePositions) {
      const node = positionNode.get(positionId);
      if (node === undefined) continue;
      // Coste negativo porque el algoritmo minimiza y aquí se quiere maximizar.
      flow.addEdge(playerOffset + i, node, 1, -input.players[i]!.value);
    }
  }

  for (const positionId of positions) {
    flow.addEdge(
      positionNode.get(positionId)!,
      sink,
      input.slots.get(positionId)!,
      0,
    );
  }

  const { flow: achieved, cost } = flow.run(source, sink, totalSlots);

  const nodeToPosition = new Map<number, number>(
    [...positionNode.entries()].map(([positionId, node]) => [node, positionId]),
  );

  const assignment = new Map<number, number>();
  for (const [playerIndex, node] of flow.usedEdges(
    playerOffset,
    input.players.length,
  )) {
    const positionId = nodeToPosition.get(node);
    if (positionId !== undefined) assignment.set(playerIndex, positionId);
  }

  return {
    assignment,
    totalValue: -cost,
    feasible: achieved === totalSlots,
  };
}
