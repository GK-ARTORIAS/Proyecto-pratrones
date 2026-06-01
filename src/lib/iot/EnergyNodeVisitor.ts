/**
 * ============================================================
 * PATRÓN: VISITOR — EnergyNodeVisitor
 * ============================================================
 * Problema: el árbol Composite (EnergyDevice / EnergyGroup) es
 * estable y no debe modificarse. Pero el sistema necesita aplicar
 * operaciones diversas sobre sus nodos sin contaminar las clases:
 *   - Auditoría: generar un reporte de cumplimiento por nodo
 *   - Fiscalidad: calcular el impuesto según el tipo de dispositivo
 *   - Eficiencia: recopilar métricas de rendimiento del parque
 *
 * Sin Visitor: o bien se añaden métodos a IEnergyNode (viola OCP
 * porque cada nueva operación modifica todas las clases), o bien
 * se usa instanceof en el cliente (viola SRP y es frágil).
 *
 * DEMO REDUCIDO: las clases existentes (EnergyDevice, EnergyGroup)
 * NO se modifican. El patrón se implementa con un mecanismo
 * "accept-externo" (EnergyNodeAcceptor) que envuelve cualquier
 * IEnergyNode y delega la visita correcta según el tipo concreto.
 * Este enfoque es idiomático en TypeScript cuando no se puede
 * tocar las clases del Elemento.
 *
 * Participantes GoF:
 *   Visitor         → IEnergyVisitor
 *   ConcreteVisitor → AuditReportVisitor, TaxCalculationVisitor,
 *                     EfficiencyReportVisitor
 *   Element         → IEnergyNode (existente, NO modificado)
 *   Acceptor        → EnergyNodeAcceptor  (wrapper externo)
 * ============================================================
 */

import {
    type IEnergyNode,
    EnergyDevice,
    EnergyGroup,
} from "@/lib/iot/EnergyComposite";

// ── VISITOR — interfaz común ──────────────────────────────────

/**
 * IEnergyVisitor: define una operación de visita por cada tipo
 * concreto de nodo que existe en el árbol Composite.
 * Agregar un nuevo Visitor = nueva clase, sin tocar los nodos.
 */
export interface IEnergyVisitor {
    readonly visitorName: string;

    visitDevice(device: EnergyDevice): void;
    visitGroup(group: EnergyGroup): void;
}

// ── ACCEPTOR EXTERNO ──────────────────────────────────────────

/**
 * EnergyNodeAcceptor: wrapper que añade la capacidad de aceptar
 * visitantes a cualquier IEnergyNode sin modificar sus clases.
 *
 * Usa discriminación de tipos (instanceof) una sola vez aquí,
 * aislando esa lógica del resto del código cliente.
 */
export function acceptVisitor(node: IEnergyNode, visitor: IEnergyVisitor): void {
    if (node instanceof EnergyDevice) {
        visitor.visitDevice(node);
    } else if (node instanceof EnergyGroup) {
        visitor.visitGroup(node);
        // Recorre los hijos recursivamente (traversal externo)
        for (const child of node.getChildren()) {
            acceptVisitor(child, visitor);
        }
    }
}

// ── CONCRETE VISITORS ─────────────────────────────────────────

// ─── Visitor 1: AuditReportVisitor ───────────────────────────

export interface AuditEntry {
    nodeType:   "DEVICE" | "GROUP";
    name:       string;
    status:     string;
    totalKwh:   number;
    peakKw:     number;
    compliant:  boolean;
    issue?:     string;
}

/**
 * AuditReportVisitor: genera un reporte de cumplimiento normativo.
 * Un dispositivo es "compliant" si está ONLINE y genera > 0 kWh.
 * Un grupo es "compliant" si todos sus hijos están en ONLINE.
 */
export class AuditReportVisitor implements IEnergyVisitor {
    readonly visitorName = "AuditReport";
    private readonly _entries: AuditEntry[] = [];

    visitDevice(device: EnergyDevice): void {
        const online    = device.getStatus() === "ONLINE";
        const producing = device.getTotalKwh() > 0;
        const compliant = online && producing;

        this._entries.push({
            nodeType:  "DEVICE",
            name:      device.getName(),
            status:    device.getStatus(),
            totalKwh:  device.getTotalKwh(),
            peakKw:    device.getPeakPowerKw(),
            compliant,
            issue: !online
                ? "Dispositivo fuera de línea"
                : !producing
                    ? "Sin generación registrada"
                    : undefined,
        });
    }

    visitGroup(group: EnergyGroup): void {
        const compliant = group.getStatus() === "ONLINE";
        this._entries.push({
            nodeType:  "GROUP",
            name:      group.getName(),
            status:    group.getStatus(),
            totalKwh:  group.getTotalKwh(),
            peakKw:    group.getPeakPowerKw(),
            compliant,
            issue: !compliant
                ? `Grupo en estado ${group.getStatus()} — revisar hijos`
                : undefined,
        });
    }

    // ── Resultados ────────────────────────────────────────────

    getEntries():     AuditEntry[] { return [...this._entries]; }
    getCompliant():   AuditEntry[] { return this._entries.filter((e) => e.compliant); }
    getNonCompliant():AuditEntry[] { return this._entries.filter((e) => !e.compliant); }
    getComplianceRate(): number {
        if (this._entries.length === 0) return 0;
        return parseFloat(
            ((this.getCompliant().length / this._entries.length) * 100).toFixed(1)
        );
    }

    generateReport(): string {
        const lines = [
            "═══════════════════════════════════════",
            "   REPORTE DE AUDITORÍA — ENERGÍA IoT  ",
            "═══════════════════════════════════════",
            `Nodos auditados:   ${this._entries.length}`,
            `Conformes:         ${this.getCompliant().length}`,
            `No conformes:      ${this.getNonCompliant().length}`,
            `Tasa de cumpl.:    ${this.getComplianceRate()}%`,
            "───────────────────────────────────────",
        ];

        for (const e of this._entries) {
            const icon = e.compliant ? "✅" : "❌";
            const type = e.nodeType === "GROUP" ? "[GRUPO]" : "[DISP.]";
            lines.push(`${icon} ${type} ${e.name} — ${e.totalKwh.toFixed(2)} kWh`);
            if (e.issue) lines.push(`     ⚠️  ${e.issue}`);
        }

        lines.push("═══════════════════════════════════════");
        return lines.join("\n");
    }
}

// ─── Visitor 2: TaxCalculationVisitor ────────────────────────

export interface TaxEntry {
    name:         string;
    nodeType:     "DEVICE" | "GROUP";
    taxableKwh:   number;
    taxRatePercent: number;
    taxAmountUsd: number;
    exemption?:   string;
}

const TAX_RATES: Record<string, number> = {
    SOLAR_PANEL:     0.00,   // Exento (energía renovable)
    WIND_TURBINE:    0.00,   // Exento (energía renovable)
    BATTERY_STORAGE: 0.02,   // 2% — almacenamiento
    SMART_METER:     0.05,   // 5% — medición de consumo de red
    GROUP:           0.00,   // Los grupos no tributan directamente
};
const PRICE_PER_KWH_USD = 0.12; // precio de referencia fiscal

/**
 * TaxCalculationVisitor: calcula la carga fiscal por dispositivo.
 * Solo los dispositivos ONLINE y con kWh > 0 son gravables.
 * Las fuentes renovables (Solar, Eólica) están exentas.
 */
export class TaxCalculationVisitor implements IEnergyVisitor {
    readonly visitorName = "TaxCalculation";
    private readonly _entries: TaxEntry[] = [];

    visitDevice(device: EnergyDevice): void {
        if (device.getStatus() !== "ONLINE" || device.getTotalKwh() === 0) return;

        const kind     = device.getKind();
        const rate     = TAX_RATES[kind] ?? 0.03;
        const taxable  = device.getTotalKwh();
        const taxAmt   = parseFloat((taxable * PRICE_PER_KWH_USD * rate).toFixed(4));

        this._entries.push({
            name:           device.getName(),
            nodeType:       "DEVICE",
            taxableKwh:     taxable,
            taxRatePercent: rate * 100,
            taxAmountUsd:   taxAmt,
            exemption: rate === 0
                ? `Exento por tipo ${kind} (energía renovable)`
                : undefined,
        });
    }

    visitGroup(group: EnergyGroup): void {
        // Los grupos no tributan directamente — solo sus dispositivos hoja
        this._entries.push({
            name:           group.getName(),
            nodeType:       "GROUP",
            taxableKwh:     group.getTotalKwh(),
            taxRatePercent: 0,
            taxAmountUsd:   0,
            exemption:      "Los grupos no son sujeto fiscal directo",
        });
    }

    // ── Resultados ────────────────────────────────────────────

    getEntries():        TaxEntry[] { return [...this._entries]; }
    getTotalTaxUsd():    number {
        return parseFloat(
            this._entries.reduce((s, e) => s + e.taxAmountUsd, 0).toFixed(4)
        );
    }
    getDeviceEntries():  TaxEntry[] { return this._entries.filter((e) => e.nodeType === "DEVICE"); }

    generateReport(): string {
        const lines = [
            "═══════════════════════════════════════",
            "    LIQUIDACIÓN FISCAL — GENERACIÓN    ",
            "═══════════════════════════════════════",
        ];
        for (const e of this._entries.filter((e) => e.nodeType === "DEVICE")) {
            const exempt = e.exemption ? ` (${e.exemption})` : "";
            lines.push(
                `• ${e.name}: ${e.taxableKwh.toFixed(2)} kWh × ` +
                `${e.taxRatePercent}% = $${e.taxAmountUsd.toFixed(4)} USD${exempt}`
            );
        }
        lines.push("───────────────────────────────────────");
        lines.push(`  TOTAL FISCAL: $${this.getTotalTaxUsd().toFixed(4)} USD`);
        lines.push("═══════════════════════════════════════");
        return lines.join("\n");
    }
}

// ─── Visitor 3: EfficiencyReportVisitor ──────────────────────

export interface EfficiencyEntry {
    name:         string;
    nodeType:     "DEVICE" | "GROUP";
    efficiency:   number;      // 0-1
    category:     "OPTIMAL" | "ACCEPTABLE" | "DEGRADED" | "OFFLINE";
    totalKwh:     number;
    potentialKwh: number;      // kWh potenciales a máxima eficiencia
    lossKwh:      number;      // kWh perdidos por ineficiencia
}

/**
 * EfficiencyReportVisitor: recopila métricas de rendimiento.
 * Clasifica dispositivos en OPTIMAL (≥90%), ACCEPTABLE (60-90%),
 * DEGRADED (<60%) u OFFLINE.
 */
export class EfficiencyReportVisitor implements IEnergyVisitor {
    readonly visitorName = "EfficiencyReport";
    private readonly _entries: EfficiencyEntry[] = [];

    visitDevice(device: EnergyDevice): void {
        if (device.getStatus() === "OFFLINE") {
            this._entries.push({
                name:         device.getName(),
                nodeType:     "DEVICE",
                efficiency:   0,
                category:     "OFFLINE",
                totalKwh:     0,
                potentialKwh: 0,
                lossKwh:      0,
            });
            return;
        }

        const eff         = device.getEfficiency();
        const totalKwh    = device.getTotalKwh();
        const potentialKwh = eff > 0 ? parseFloat((totalKwh / eff).toFixed(2)) : totalKwh;
        const lossKwh      = parseFloat((potentialKwh - totalKwh).toFixed(2));
        const category: EfficiencyEntry["category"] =
            eff >= 0.90 ? "OPTIMAL"
            : eff >= 0.60 ? "ACCEPTABLE"
            : "DEGRADED";

        this._entries.push({
            name: device.getName(),
            nodeType: "DEVICE",
            efficiency: eff,
            category,
            totalKwh,
            potentialKwh,
            lossKwh,
        });
    }

    visitGroup(group: EnergyGroup): void {
        const totalKwh = group.getTotalKwh();
        // Para el grupo: eficiencia ponderada calculada en EnergyGroup
        const eff = group instanceof EnergyGroup
            ? group.getWeightedEfficiency()
            : 0;
        const category: EfficiencyEntry["category"] =
            group.getStatus() === "OFFLINE" ? "OFFLINE"
            : eff >= 0.90 ? "OPTIMAL"
            : eff >= 0.60 ? "ACCEPTABLE"
            : "DEGRADED";

        this._entries.push({
            name:         group.getName(),
            nodeType:     "GROUP",
            efficiency:   parseFloat(eff.toFixed(4)),
            category,
            totalKwh,
            potentialKwh: parseFloat((eff > 0 ? totalKwh / eff : totalKwh).toFixed(2)),
            lossKwh:      0,
        });
    }

    // ── Resultados ────────────────────────────────────────────

    getEntries():              EfficiencyEntry[] { return [...this._entries]; }
    getByCategory(c: EfficiencyEntry["category"]): EfficiencyEntry[] {
        return this._entries.filter((e) => e.category === c);
    }
    getTotalLossKwh(): number {
        return parseFloat(
            this._entries.reduce((s, e) => s + e.lossKwh, 0).toFixed(2)
        );
    }

    generateReport(): string {
        const icons: Record<EfficiencyEntry["category"], string> = {
            OPTIMAL:    "🟢",
            ACCEPTABLE: "🟡",
            DEGRADED:   "🔴",
            OFFLINE:    "⚫",
        };
        const lines = [
            "═══════════════════════════════════════",
            "    REPORTE DE EFICIENCIA — PARQUE     ",
            "═══════════════════════════════════════",
        ];
        for (const e of this._entries.filter((e) => e.nodeType === "DEVICE")) {
            lines.push(
                `${icons[e.category]} ${e.name}: ` +
                `${(e.efficiency * 100).toFixed(1)}% — ` +
                `${e.totalKwh.toFixed(2)} kWh generados | ` +
                `${e.lossKwh.toFixed(2)} kWh pérdida`
            );
        }
        lines.push("───────────────────────────────────────");
        lines.push(`  PÉRDIDA TOTAL: ${this.getTotalLossKwh().toFixed(2)} kWh`);
        lines.push(`  ÓPTIMOS:   ${this.getByCategory("OPTIMAL").length}   ` +
            `ACEPTABLES: ${this.getByCategory("ACCEPTABLE").length}   ` +
            `DEGRADADOS: ${this.getByCategory("DEGRADED").length}   ` +
            `OFFLINE: ${this.getByCategory("OFFLINE").length}`);
        lines.push("═══════════════════════════════════════");
        return lines.join("\n");
    }
}

// _Visitor
