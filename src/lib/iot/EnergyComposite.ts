/**
 * ============================================================
 * PATRÓN: COMPOSITE — EnergyComposite
 * ============================================================
 * Problema: la red de energía tiene dispositivos individuales
 * (un panel solar) y grupos (granja solar = N paneles,
 * portfolio = N granjas). Se quiere operar sobre cualquier
 * nivel de la jerarquía con la MISMA interfaz.
 *
 * Sin Composite: el cliente tendría que saber si está tratando
 * con un dispositivo o con un grupo, y hacer lógica diferente.
 *
 * Solución: tanto el dispositivo individual (Leaf) como el grupo
 * (Composite) implementan IEnergyNode. El cliente llama a
 * getTotalKwh() sin importar si hay 1 o 1000 dispositivos abajo.
 *
 * Participantes GoF:
 *   Component  → IEnergyNode
 *   Leaf       → EnergyDevice (un dispositivo físico)
 *   Composite  → EnergyGroup  (granja, zona, portfolio)
 *   Client     → Cualquier código que use IEnergyNode
 * ============================================================
 */

export type NodeStatus    = "ONLINE" | "PARTIAL" | "OFFLINE";
export type DeviceKind    = "SOLAR_PANEL" | "WIND_TURBINE" | "BATTERY_STORAGE" | "SMART_METER";

// ── COMPONENT ─────────────────────────────────────────────────

/**
 * Interfaz común para dispositivos individuales y grupos.
 * El cliente siempre habla con IEnergyNode, nunca con EnergyDevice
 * o EnergyGroup directamente.
 */
export interface IEnergyNode {
    getName():        string;
    getTotalKwh():    number;         // energía acumulada
    getPeakPowerKw(): number;         // potencia pico
    getStatus():      NodeStatus;     // estado del nodo/grupo
    getChildCount():  number;         // 0 si es Leaf, N si es Composite
    describe(indent?: number): string; // árbol visual en texto
}

// ── LEAF — dispositivo individual ─────────────────────────────

export interface DeviceSnapshot {
    name:          string;
    kind:          DeviceKind;
    energyKwh:     number;
    peakPowerKw:   number;
    efficiency:    number;   // 0-1
    status:        NodeStatus;
    location?:     string;
}

/**
 * Leaf: nodo hoja — no tiene hijos.
 * Representa un dispositivo IoT físico (un panel, una turbina…).
 */
export class EnergyDevice implements IEnergyNode {
    constructor(private readonly snap: DeviceSnapshot) {}

    getName():        string     { return this.snap.name; }
    getTotalKwh():    number     { return this.snap.energyKwh; }
    getPeakPowerKw(): number     { return this.snap.peakPowerKw; }
    getStatus():      NodeStatus { return this.snap.status; }
    getChildCount():  number     { return 0; }   // ← Leaf: siempre 0
    getKind():        DeviceKind { return this.snap.kind; }
    getEfficiency():  number     { return this.snap.efficiency; }
    getLocation():    string     { return this.snap.location ?? "–"; }

    describe(indent = 0): string {
        const pad  = "  ".repeat(indent);
        const icon = {
            SOLAR_PANEL:     "☀️",
            WIND_TURBINE:    "💨",
            BATTERY_STORAGE: "🔋",
            SMART_METER:     "📊",
        }[this.snap.kind] ?? "⚡";
        const st = this.snap.status === "ONLINE" ? "✅" : this.snap.status === "PARTIAL" ? "⚠️" : "❌";
        return `${pad}${st} ${icon} ${this.snap.name} — ${this.snap.energyKwh.toFixed(2)} kWh | ${this.snap.peakPowerKw} kW`;
    }
}

// ── COMPOSITE — grupo de nodos ─────────────────────────────────

export type GroupKind = "FARM" | "ZONE" | "PORTFOLIO" | "MICROGRID";

/**
 * Composite: nodo rama — contiene hijos (Leaves u otros Composites).
 * getTotalKwh(), getPeakPowerKw(), getStatus() = agregación de hijos.
 */
export class EnergyGroup implements IEnergyNode {
    private readonly _children: IEnergyNode[] = [];

    constructor(
        private readonly _name: string,
        private readonly _kind: GroupKind = "FARM",
    ) {}

    // ── Gestión de hijos ───────────────────────────────────────

    add(node: IEnergyNode): this {
        this._children.push(node);
        return this;
    }

    remove(name: string): boolean {
        const idx = this._children.findIndex((c) => c.getName() === name);
        if (idx === -1) return false;
        this._children.splice(idx, 1);
        return true;
    }

    getChildren(): IEnergyNode[] { return [...this._children]; }

    // ── IEnergyNode ────────────────────────────────────────────

    getName(): string { return this._name; }

    /** Suma recursiva de todos los nodos en el subárbol */
    getTotalKwh(): number {
        return this._children.reduce((sum, c) => sum + c.getTotalKwh(), 0);
    }

    /** Suma de la potencia pico de todos los hijos */
    getPeakPowerKw(): number {
        return this._children.reduce((sum, c) => sum + c.getPeakPowerKw(), 0);
    }

    /** ONLINE si todos online; PARTIAL si alguno online; OFFLINE si ninguno */
    getStatus(): NodeStatus {
        if (this._children.length === 0) return "OFFLINE";
        const statuses = this._children.map((c) => c.getStatus());
        const allOnline = statuses.every((s) => s === "ONLINE");
        const anyOnline = statuses.some ((s) => s === "ONLINE");
        return allOnline ? "ONLINE" : anyOnline ? "PARTIAL" : "OFFLINE";
    }

    /** Cantidad TOTAL de nodos en el subárbol (recursivo) */
    getChildCount(): number {
        return this._children.reduce(
            (sum, c) => sum + 1 + c.getChildCount(),
            0
        );
    }

    getKind(): GroupKind { return this._kind; }

    /** Genera un árbol indentado de texto para visualización */
    describe(indent = 0): string {
        const pad  = "  ".repeat(indent);
        const icon = { FARM: "🌾", ZONE: "🗺️", PORTFOLIO: "💼", MICROGRID: "⚡" }[this._kind];
        const st   = this.getStatus() === "ONLINE" ? "🟢" : this.getStatus() === "PARTIAL" ? "🟡" : "🔴";
        const header = `${pad}${st} ${icon} ${this._name} [${this._kind}]` +
            ` — ${this.getTotalKwh().toFixed(2)} kWh total | ${this.getPeakPowerKw()} kW pico`;

        const childLines = this._children.map((c) => c.describe(indent + 1)).join("\n");
        return childLines ? `${header}\n${childLines}` : header;
    }

    // ── Utilidades de consulta ─────────────────────────────────

    /** Busca un nodo por nombre (búsqueda en profundidad) */
    find(name: string): IEnergyNode | null {
        for (const child of this._children) {
            if (child.getName() === name) return child;
            if (child instanceof EnergyGroup) {
                const found = child.find(name);
                if (found) return found;
            }
        }
        return null;
    }

    /** Filtra nodos hoja por estado */
    getLeavesByStatus(status: NodeStatus): EnergyDevice[] {
        const leaves: EnergyDevice[] = [];
        for (const child of this._children) {
            if (child instanceof EnergyDevice) {
                if (child.getStatus() === status) leaves.push(child);
            } else if (child instanceof EnergyGroup) {
                leaves.push(...child.getLeavesByStatus(status));
            }
        }
        return leaves;
    }

    /** Eficiencia promedio ponderada por kWh de todos los dispositivos */
    getWeightedEfficiency(): number {
        const leaves = this.getLeavesByStatus("ONLINE");
        if (leaves.length === 0) return 0;
        const totalKwh = leaves.reduce((s, d) => s + d.getTotalKwh(), 0);
        if (totalKwh === 0) return 0;
        return leaves.reduce((s, d) => s + d.getEfficiency() * d.getTotalKwh(), 0) / totalKwh;
    }
}

// ── Factory de portfolios de demo ─────────────────────────────

/**
 * Crea una jerarquía de ejemplo realista:
 *   Portfolio
 *     ├── Granja Solar Norte (FARM)
 *     │     ├── Panel A-1 (SOLAR_PANEL) ✅
 *     │     ├── Panel A-2 (SOLAR_PANEL) ✅
 *     │     └── Panel A-3 (SOLAR_PANEL) ⚠️
 *     ├── Parque Eólico Sur (FARM)
 *     │     ├── Turbina W-1 (WIND_TURBINE) ✅
 *     │     └── Turbina W-2 (WIND_TURBINE) ❌
 *     └── Centro de Almacenamiento (ZONE)
 *           ├── Batería B-1 (BATTERY_STORAGE) ✅
 *           └── Medidor M-1 (SMART_METER)   ✅
 */
export function createDemoPortfolio(): EnergyGroup {
    // Granja Solar Norte
    const solarFarm = new EnergyGroup("Granja Solar Norte", "FARM")
        .add(new EnergyDevice({ name: "Panel A-1", kind: "SOLAR_PANEL",     energyKwh: 42.5,  peakPowerKw: 5,  efficiency: 0.92, status: "ONLINE"  }))
        .add(new EnergyDevice({ name: "Panel A-2", kind: "SOLAR_PANEL",     energyKwh: 38.1,  peakPowerKw: 5,  efficiency: 0.89, status: "ONLINE"  }))
        .add(new EnergyDevice({ name: "Panel A-3", kind: "SOLAR_PANEL",     energyKwh: 11.2,  peakPowerKw: 5,  efficiency: 0.41, status: "PARTIAL" }));

    // Parque Eólico Sur
    const windFarm = new EnergyGroup("Parque Eólico Sur", "FARM")
        .add(new EnergyDevice({ name: "Turbina W-1", kind: "WIND_TURBINE",  energyKwh: 120.0, peakPowerKw: 50, efficiency: 0.88, status: "ONLINE"  }))
        .add(new EnergyDevice({ name: "Turbina W-2", kind: "WIND_TURBINE",  energyKwh: 0,     peakPowerKw: 50, efficiency: 0,    status: "OFFLINE" }));

    // Centro de almacenamiento
    const storage = new EnergyGroup("Centro de Almacenamiento", "ZONE")
        .add(new EnergyDevice({ name: "Batería B-1", kind: "BATTERY_STORAGE", energyKwh: 85.0, peakPowerKw: 30, efficiency: 0.95, status: "ONLINE" }))
        .add(new EnergyDevice({ name: "Medidor M-1", kind: "SMART_METER",    energyKwh: 297.0, peakPowerKw: 0,  efficiency: 1.00, status: "ONLINE" }));

    // Portfolio raíz
    return new EnergyGroup("Portfolio Energético", "PORTFOLIO")
        .add(solarFarm)
        .add(windFarm)
        .add(storage);
}

// _Composite
