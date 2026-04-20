/**
 * Tests: Patrón COMPOSITE — EnergyComposite
 */
import {
    EnergyDevice,
    EnergyGroup,
    createDemoPortfolio,
    type IEnergyNode,
} from "@/lib/iot/EnergyComposite";

// ── Tests de EnergyDevice (Leaf) ──────────────────────────────

describe("EnergyDevice — Leaf (Composite Pattern)", () => {

    const device = new EnergyDevice({
        name: "Panel A-1", kind: "SOLAR_PANEL",
        energyKwh: 42.5, peakPowerKw: 5, efficiency: 0.92, status: "ONLINE",
    });

    test("implementa IEnergyNode (Component interface)", () => {
        expect(typeof device.getName).toBe("function");
        expect(typeof device.getTotalKwh).toBe("function");
        expect(typeof device.getStatus).toBe("function");
    });

    test("getChildCount() siempre devuelve 0 (es un Leaf)", () => {
        expect(device.getChildCount()).toBe(0);
    });

    test("getTotalKwh() devuelve su propio valor", () => {
        expect(device.getTotalKwh()).toBe(42.5);
    });

    test("getPeakPowerKw() devuelve su potencia", () => {
        expect(device.getPeakPowerKw()).toBe(5);
    });

    test("getStatus() devuelve el estado configurado", () => {
        expect(device.getStatus()).toBe("ONLINE");
    });

    test("describe() incluye nombre y kWh", () => {
        const desc = device.describe();
        expect(desc).toContain("Panel A-1");
        expect(desc).toContain("42.50 kWh");
    });
});

// ── Tests de EnergyGroup (Composite) ─────────────────────────

describe("EnergyGroup — Composite (Composite Pattern)", () => {

    function makeGroup() {
        return new EnergyGroup("Granja Test", "FARM")
            .add(new EnergyDevice({ name: "D1", kind: "SOLAR_PANEL", energyKwh: 10, peakPowerKw: 5, efficiency: 0.9, status: "ONLINE"  }))
            .add(new EnergyDevice({ name: "D2", kind: "SOLAR_PANEL", energyKwh: 20, peakPowerKw: 5, efficiency: 0.8, status: "ONLINE"  }))
            .add(new EnergyDevice({ name: "D3", kind: "SOLAR_PANEL", energyKwh: 5,  peakPowerKw: 5, efficiency: 0.5, status: "PARTIAL" }));
    }

    test("implementa IEnergyNode (Component interface)", () => {
        const group: IEnergyNode = makeGroup();
        expect(typeof group.getTotalKwh).toBe("function");
    });

    test("getTotalKwh() suma recursivamente todos los hijos", () => {
        expect(makeGroup().getTotalKwh()).toBe(35); // 10 + 20 + 5
    });

    test("getPeakPowerKw() suma la potencia de todos los hijos", () => {
        expect(makeGroup().getPeakPowerKw()).toBe(15); // 3 × 5kW
    });

    test("getChildCount() cuenta todos los nodos del subárbol", () => {
        expect(makeGroup().getChildCount()).toBe(3);
    });

    test("getStatus() = ONLINE si todos online", () => {
        const g = new EnergyGroup("G", "FARM")
            .add(new EnergyDevice({ name: "D1", kind: "SOLAR_PANEL", energyKwh: 1, peakPowerKw: 1, efficiency: 1, status: "ONLINE" }))
            .add(new EnergyDevice({ name: "D2", kind: "SOLAR_PANEL", energyKwh: 1, peakPowerKw: 1, efficiency: 1, status: "ONLINE" }));
        expect(g.getStatus()).toBe("ONLINE");
    });

    test("getStatus() = PARTIAL si alguno online y otro no", () => {
        expect(makeGroup().getStatus()).toBe("PARTIAL");
    });

    test("getStatus() = OFFLINE si ninguno online", () => {
        const g = new EnergyGroup("G", "FARM")
            .add(new EnergyDevice({ name: "D1", kind: "SOLAR_PANEL", energyKwh: 0, peakPowerKw: 1, efficiency: 0, status: "OFFLINE" }));
        expect(g.getStatus()).toBe("OFFLINE");
    });

    test("remove() elimina un hijo por nombre", () => {
        const g = makeGroup();
        g.remove("D2");
        expect(g.getTotalKwh()).toBe(15); // 10 + 5
        expect(g.getChildCount()).toBe(2);
    });

    test("remove() devuelve false si no encuentra el hijo", () => {
        expect(makeGroup().remove("Inexistente")).toBe(false);
    });

    test("find() localiza un nodo por nombre (búsqueda en profundidad)", () => {
        const g = makeGroup();
        expect(g.find("D2")?.getName()).toBe("D2");
    });

    test("find() devuelve null si no existe el nodo", () => {
        expect(makeGroup().find("D99")).toBeNull();
    });

    test("getLeavesByStatus() filtra correctamente", () => {
        const online = makeGroup().getLeavesByStatus("ONLINE");
        expect(online).toHaveLength(2);
    });

    test("describe() produce árbol indentado de texto", () => {
        const desc = makeGroup().describe();
        expect(desc).toContain("Granja Test");
        expect(desc).toContain("D1");
        expect(desc).toContain("D2");
    });
});

// ── Tests de árbol anidado (Composite dentro de Composite) ────

describe("EnergyGroup anidado — Composite recursivo", () => {

    test("getTotalKwh() agrega a través de múltiples niveles", () => {
        const farm1 = new EnergyGroup("Farm1", "FARM")
            .add(new EnergyDevice({ name: "P1", kind: "SOLAR_PANEL", energyKwh: 10, peakPowerKw: 5, efficiency: 1, status: "ONLINE" }));

        const farm2 = new EnergyGroup("Farm2", "FARM")
            .add(new EnergyDevice({ name: "P2", kind: "SOLAR_PANEL", energyKwh: 20, peakPowerKw: 5, efficiency: 1, status: "ONLINE" }))
            .add(new EnergyDevice({ name: "P3", kind: "SOLAR_PANEL", energyKwh: 30, peakPowerKw: 5, efficiency: 1, status: "ONLINE" }));

        const portfolio = new EnergyGroup("Portfolio", "PORTFOLIO")
            .add(farm1)
            .add(farm2);

        expect(portfolio.getTotalKwh()).toBe(60); // 10 + 20 + 30
    });

    test("getChildCount() cuenta todos los nodos (Composites + Leaves)", () => {
        const farm = new EnergyGroup("Farm", "FARM")
            .add(new EnergyDevice({ name: "P1", kind: "SOLAR_PANEL", energyKwh: 1, peakPowerKw: 1, efficiency: 1, status: "ONLINE" }))
            .add(new EnergyDevice({ name: "P2", kind: "SOLAR_PANEL", energyKwh: 1, peakPowerKw: 1, efficiency: 1, status: "ONLINE" }));

        const portfolio = new EnergyGroup("Portfolio", "PORTFOLIO").add(farm);
        // portfolio → farm (1) → P1 (1) + P2 (1) = 3 nodos
        expect(portfolio.getChildCount()).toBe(3);
    });

    test("el cliente trata Leaf y Composite de forma idéntica (transparencia)", () => {
        const leaf:  IEnergyNode = new EnergyDevice({ name: "X", kind: "SOLAR_PANEL", energyKwh: 5, peakPowerKw: 3, efficiency: 0.9, status: "ONLINE" });
        const group: IEnergyNode = new EnergyGroup("G", "FARM")
            .add(new EnergyDevice({ name: "A", kind: "SOLAR_PANEL", energyKwh: 2, peakPowerKw: 1, efficiency: 1, status: "ONLINE" }))
            .add(new EnergyDevice({ name: "B", kind: "SOLAR_PANEL", energyKwh: 3, peakPowerKw: 2, efficiency: 1, status: "ONLINE" }));

        // El cliente llama a la misma interfaz en ambos casos
        expect(leaf.getTotalKwh()).toBe(5);
        expect(group.getTotalKwh()).toBe(5);
        expect(leaf.getStatus()).toBe("ONLINE");
        expect(group.getStatus()).toBe("ONLINE");
    });
});

// ── Tests del portfolio de demo ───────────────────────────────

describe("createDemoPortfolio() — jerarquía de 3 niveles", () => {
    const portfolio = createDemoPortfolio();

    test("el portfolio tiene el nombre correcto", () => {
        expect(portfolio.getName()).toBe("Portfolio Energético");
    });

    test("getTotalKwh() agrega todos los dispositivos (3 niveles)", () => {
        // 42.5 + 38.1 + 11.2 + 120 + 0 + 85 + 297 = 593.8
        expect(portfolio.getTotalKwh()).toBeCloseTo(593.8, 1);
    });

    test("el portfolio tiene 3 grupos hijo directos", () => {
        expect(portfolio.getChildren()).toHaveLength(3);
    });

    test("getChildCount() cuenta todos los nodos del árbol", () => {
        // 3 grupos + 7 devices = 10 nodos
        expect(portfolio.getChildCount()).toBe(10);
    });

    test("getStatus() = PARTIAL (hay offline devices)", () => {
        expect(portfolio.getStatus()).toBe("PARTIAL");
    });

    test("find() localiza nodos en cualquier nivel", () => {
        expect(portfolio.find("Panel A-1")?.getName()).toBe("Panel A-1");
        expect(portfolio.find("Turbina W-2")?.getName()).toBe("Turbina W-2");
        expect(portfolio.find("Inexistente")).toBeNull();
    });

    test("getLeavesByStatus(OFFLINE) devuelve Turbina W-2", () => {
        const offline = portfolio.getLeavesByStatus("OFFLINE");
        expect(offline.map((d) => d.getName())).toContain("Turbina W-2");
    });

    test("describe() genera árbol completo con 3 niveles de indentación", () => {
        const tree = portfolio.describe();
        expect(tree).toContain("Portfolio Energético");
        expect(tree).toContain("Granja Solar Norte");
        expect(tree).toContain("Panel A-1");     // nivel 3
    });
});
