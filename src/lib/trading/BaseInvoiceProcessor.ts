/**
 * ============================================================
 * PATRÓN: TEMPLATE METHOD — BaseInvoiceProcessor
 * ============================================================
 * Problema: el sistema necesita generar facturas (invoices) para
 * diferentes tipos de transacciones de energía (consumidor final,
 * productor renovable, operador de baterías).
 *
 * Aunque el flujo general de facturación es siempre idéntico:
 *   1. Validar transacción (match)
 *   2. Calcular importe base
 *   3. Aplicar impuestos específicos
 *   4. Aplicar descuentos o incentivos verdes
 *   5. Calcular comisión de la plataforma
 *   6. Estructurar y emitir el comprobante final
 *
 * Los detalles de cada paso varían según el rol:
 *   - Los consumidores pagan impuestos estándar de red y comisión estándar.
 *   - Los productores verdes gozan de deducciones fiscales y comisión reducida.
 *   - Los operadores de almacenamiento de baterías tienen tarifas dinámicas y
 *     créditos por estabilización de red.
 *
 * Solución: definir el esqueleto del algoritmo de facturación en una
 * clase base abstracta (`BaseInvoiceProcessor`) y delegar los pasos variables
 * (impuestos, incentivos, comisiones) a subclases concretas.
 *
 * Participantes GoF:
 *   AbstractClass → BaseInvoiceProcessor
 *   ConcreteClass → ConsumerInvoiceProcessor, ProducerInvoiceProcessor,
 *                  StorageOperatorInvoiceProcessor
 * ============================================================
 */

import { type MatchResult } from "@/lib/trading/OrderMatchingStrategy";

export interface Invoice {
    readonly invoiceNumber:   string;
    readonly buyOrderId:      string;
    readonly sellOrderId:     string;
    readonly energySource:    string;
    readonly matchedKwh:      number;
    readonly pricePerKwh:     number;
    readonly baseAmount:      number;
    readonly taxAmount:       number;
    readonly discountAmount:  number;
    readonly platformFee:     number;
    readonly totalDueUsd:     number;
    readonly processedAt:     Date;
    readonly processorType:   string;
    readonly notes:           string;
}

/**
 * AbstractClass — Define el "Template Method" y declara
 * las operaciones primitivas (tanto abstractas como hooks).
 */
export abstract class BaseInvoiceProcessor {
    protected constructor(public readonly processorType: string) {}

    /**
     * El TEMPLATE METHOD.
     * Define de manera inalterable (final en concepto) el esqueleto
     * del algoritmo para generar la factura.
     */
    public processInvoice(match: MatchResult): Invoice {
        // Step 1: Validar (operación por defecto)
        this.validateMatch(match);

        // Step 2: Calcular importe base (operación por defecto)
        const baseAmount = this.calculateBaseAmount(match);

        // Step 3: Aplicar impuestos (método abstracto, lo decide la subclase)
        const taxAmount = this.applyTaxes(baseAmount);

        // Step 4: Aplicar descuentos/incentivos (hook, opcional de sobrescribir)
        const discountAmount = this.applyDiscountsOrIncentives(match, baseAmount);

        // Step 5: Calcular comisión de la plataforma (método abstracto)
        const platformFee = this.calculatePlatformFee(match, baseAmount);

        // Step 6: Generar número de folio (operación por defecto / hook)
        const invoiceNumber = this.generateInvoiceNumber(match);

        // Step 7: Calcular total final
        const totalDueUsd = parseFloat(
            (baseAmount + taxAmount - discountAmount + platformFee).toFixed(4)
        );

        // Step 8: Redactar observaciones (hook)
        const notes = this.generateNotes(match, discountAmount);

        // Step 9: Retornar factura
        return {
            invoiceNumber,
            buyOrderId:     match.buyOrderId,
            sellOrderId:    match.sellOrderId,
            energySource:   match.energySource,
            matchedKwh:     match.matchedKwh,
            pricePerKwh:    match.pricePerKwh,
            baseAmount,
            taxAmount,
            discountAmount,
            platformFee,
            totalDueUsd,
            processedAt:    new Date(),
            processorType:  this.processorType,
            notes,
        };
    }

    // ── Operaciones concretas (compartidas y no modificables) ──────

    protected validateMatch(match: MatchResult): void {
        if (!match.buyOrderId || !match.sellOrderId) {
            throw new Error("[InvoiceProcessor] Error de validación: ID de orden ausente.");
        }
        if (match.matchedKwh <= 0 || match.pricePerKwh <= 0) {
            throw new Error("[InvoiceProcessor] Error de validación: Volumen o precio inválidos.");
        }
    }

    protected calculateBaseAmount(match: MatchResult): number {
        return parseFloat((match.matchedKwh * match.pricePerKwh).toFixed(4));
    }

    // ── Operaciones abstractas (deben ser implementadas por subclases) ──

    /** Calcula el impuesto aplicable sobre el monto base */
    protected abstract applyTaxes(baseAmount: number): number;

    /** Calcula la comisión por uso del mercado */
    protected abstract calculatePlatformFee(match: MatchResult, baseAmount: number): number;

    // ── Hooks (con comportamiento por defecto, subclases pueden sobrescribir) ──

    /** Aplica beneficios fiscales, subsidios o descuentos ecológicos */
    protected applyDiscountsOrIncentives(_match: MatchResult, _baseAmount: number): number {
        return 0; // Por defecto no hay descuento
    }

    /** Crea un identificador único para el comprobante */
    protected generateInvoiceNumber(match: MatchResult): string {
        const dateStr = match.matchedAt.toISOString().slice(0, 10).replace(/-/g, "");
        const randHex = Math.floor(1000 + Math.random() * 9000).toString(16).toUpperCase();
        return `INV-${this.processorType.substring(0, 3).toUpperCase()}-${dateStr}-${randHex}`;
    }

    /** Añade comentarios o detalles al final de la factura */
    protected generateNotes(match: MatchResult, discountAmount: number): string {
        let msg = `Facturación procesada mediante canal ${this.processorType}.`;
        if (discountAmount > 0) {
            msg += ` Se aplicó un descuento/incentivo verde de $${discountAmount} USD.`;
        }
        return msg;
    }
}

// ── CONCRETE CLASSES ──────────────────────────────────────────

/**
 * ConcreteClass 1 — ConsumerInvoiceProcessor
 * Procesa facturas para los compradores de energía.
 * Impuestos estándar de red e IVA (21% total).
 * Comisión de plataforma del 1.5% del importe base.
 */
export class ConsumerInvoiceProcessor extends BaseInvoiceProcessor {
    constructor() {
        super("CONSUMER");
    }

    protected applyTaxes(baseAmount: number): number {
        const networkTax = 0.05; // 5% peajes de red eléctrica
        const VAT        = 0.16; // 16% IVA estándar
        return parseFloat((baseAmount * (networkTax + VAT)).toFixed(4));
    }

    protected calculatePlatformFee(_match: MatchResult, baseAmount: number): number {
        const standardFeeRate = 0.015; // 1.5% fee
        return parseFloat((baseAmount * standardFeeRate).toFixed(4));
    }
}

/**
 * ConcreteClass 2 — ProducerInvoiceProcessor
 * Procesa facturas para productores de energía (especialmente renovables).
 * Impuesto de generación ultra reducido (2.5%).
 * Descuento/incentivo verde de $0.005 por cada kWh generado con Solar o Eólica.
 * Comisión de plataforma mínima (0.5%) para promover el volcado de energía verde.
 */
export class ProducerInvoiceProcessor extends BaseInvoiceProcessor {
    constructor() {
        super("PRODUCER");
    }

    protected applyTaxes(baseAmount: number): number {
        const generationTax = 0.025; // 2.5% impuesto generación eléctrica
        return parseFloat((baseAmount * generationTax).toFixed(4));
    }

    protected calculatePlatformFee(_match: MatchResult, baseAmount: number): number {
        const greenFeeRate = 0.005; // 0.5% fee de incentivo verde
        return parseFloat((baseAmount * greenFeeRate).toFixed(4));
    }

    // Sobrescribe hook para inyectar incentivo ecológico
    protected override applyDiscountsOrIncentives(match: MatchResult, _baseAmount: number): number {
        const isGreen = ["SOLAR", "WIND"].includes(match.energySource);
        if (isGreen) {
            const greenBonusPerKwh = 0.005; // $0.005 de subsidio por kWh
            return parseFloat((match.matchedKwh * greenBonusPerKwh).toFixed(4));
        }
        return 0;
    }

    protected override generateNotes(match: MatchResult, discountAmount: number): string {
        let baseNotes = super.generateNotes(match, discountAmount);
        if (["SOLAR", "WIND"].includes(match.energySource)) {
            baseNotes += ` ¡Gracias por alimentar la red con energía limpia de tipo ${match.energySource}!`;
        }
        return baseNotes;
    }
}

/**
 * ConcreteClass 3 — StorageOperatorInvoiceProcessor
 * Procesa facturas para operadores de almacenamiento (baterías).
 * Impuestos exentos por reinyección (0% doble imposición).
 * Incentivo variable: si el origen es batería, tiene un descuento del 1%
 * del importe base por su labor de soporte en la estabilidad de frecuencia.
 * Comisión fija baja de $0.01 por transacción, en vez de tasa porcentual.
 */
export class StorageOperatorInvoiceProcessor extends BaseInvoiceProcessor {
    constructor() {
        super("STORAGE_OPERATOR");
    }

    protected applyTaxes(_baseAmount: number): number {
        return 0; // Exención total para baterías (fomenta almacenamiento)
    }

    protected calculatePlatformFee(_match: MatchResult, _baseAmount: number): number {
        return 0.01; // Tasa fija de 1 centavo para almacenamiento
    }

    // Sobrescribe hook
    protected override applyDiscountsOrIncentives(match: MatchResult, baseAmount: number): number {
        if (match.energySource === "BATTERY") {
            const stabilizationCredit = 0.01; // 1% de crédito
            return parseFloat((baseAmount * stabilizationCredit).toFixed(4));
        }
        return 0;
    }
}
