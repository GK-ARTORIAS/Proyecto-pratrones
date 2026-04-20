/**
 * ============================================================
 * PATRÓN: FACADE — EnergyTradingFacade
 * ============================================================
 * Problema: el sistema tiene múltiples subsistemas independientes:
 *   - TradeOrderBuilder  (Builder)
 *   - OrderTemplateRegistry (Prototype)
 *   - ExternalPriceAdapter + PriceDecorator (Adapter + Decorator)
 *   - NotificationBridge (Bridge)
 *   - Supabase (persistencia)
 *
 * Para UNA acción como "crear y publicar una orden" el cliente
 * necesita conocer y coordinar 5 subsistemas distintos.
 *
 * Solución: EnergyTradingFacade expone operaciones de alto nivel
 * que internamente coordinan todos los subsistemas. El cliente
 * solo llama a la Facade y obtiene el resultado.
 *
 * Participantes GoF:
 *   Facade  → EnergyTradingFacade
 *   Subsistemas → TradeOrderBuilder, OrderTemplateRegistry,
 *                 AdapterFactory, PipelineBuilder, NotificationBridge,
 *                 SupabaseAdmin
 * ============================================================
 */

import { TradeOrderBuilder, type OrderType, type EnergySource, type PricingMode, type OrderPriority }
    from "@/lib/trading/TradeOrderBuilder";
import { OrderTemplateRegistry, type OrderOverrides }
    from "@/lib/trading/OrderTemplate";
import { createPriceAdapter, type AdapterType, type PriceQuote }
    from "@/lib/market/ExternalPriceAdapter";
import { buildPricePipeline, type CachingDecorator }
    from "@/lib/market/PriceDecorator";
import { OrderNotifier, PriceAlertNotifier, InAppChannel }
    from "@/lib/notifications/NotificationBridge";
import { getSupabaseAdmin, getSupabaseClient }
    from "@/lib/supabase/supabaseClient";
import { DEMO_USER_ID }
    from "@/lib/supabase/demoUser";

// ── DTOs de entrada (lo que el cliente pasa a la Facade) ─────

export interface CreateOrderParams {
    type:          OrderType;
    amountKwh:     number;
    pricePerKwh:   number;
    energySource?: EnergySource;
    pricingMode?:  PricingMode;
    priority?:     OrderPriority;
    expiresInMin?: number;
    note?:         string;
    allowPartial?: boolean;
    greenOnly?:    boolean;
}

export interface MarketSummary {
    timestamp:    Date;
    quotes:       Array<{
        provider:     AdapterType;
        source:       string;
        pricePerKwh:  number;
        trend:        string;
        validForMins: number;
    }>;
    cheapest:     AdapterType | null;
    avgPrice:     number;
    cacheStats:   { hits: number; misses: number; ratio: number };
}

export interface PortfolioStatus {
    openOrders:    number;
    filledOrders:  number;
    totalDevices:  number;
    onlineDevices: number;
    totalValueUsd: number;
}

export interface FacadeResult<T> {
    ok:    boolean;
    data?: T;
    error?: string;
}

// ── FACADE ────────────────────────────────────────────────────

export class EnergyTradingFacade {

    // Pipelines de precios cacheados (se crean una vez)
    private static _pipelines = new Map<AdapterType, ReturnType<typeof buildPricePipeline>>();

    private static getPipeline(type: AdapterType) {
        if (!EnergyTradingFacade._pipelines.has(type)) {
            EnergyTradingFacade._pipelines.set(
                type,
                buildPricePipeline(createPriceAdapter(type), {
                    cacheTTLMinutes: 2,
                    spikeThreshold:  0.20,
                    enableLogging:   true,
                })
            );
        }
        return EnergyTradingFacade._pipelines.get(type)!;
    }

    // ── 1. CREAR Y PUBLICAR UNA ORDEN ─────────────────────────
    /**
     * Orquesta: Builder → validación → Supabase insert → Notificación.
     * El cliente no sabe nada de ningún subsistema.
     */
    async createAndPublishOrder(params: CreateOrderParams): Promise<FacadeResult<string>> {
        try {
            // Subsistema 1: Builder
            const builder = new TradeOrderBuilder()
                .ofType(params.type)
                .withAmount(params.amountKwh)
                .atPrice(params.pricePerKwh);

            if (params.energySource) builder.fromSource(params.energySource);
            if (params.pricingMode)  builder.withPricingMode(params.pricingMode);
            if (params.priority)     builder.withPriority(params.priority);
            if (params.expiresInMin) builder.expiresInMinutes(params.expiresInMin);
            if (params.note)         builder.withNote(params.note);
            if (params.allowPartial) builder.allowPartialFill();
            if (params.greenOnly)    builder.requireGreenCertified();

            const order = builder.build();

            // Subsistema 2: Supabase
            const { error } = await getSupabaseAdmin().from("energy_orders").insert({
                id:              order.id,
                user_id:         DEMO_USER_ID,
                type:            order.type,
                amount_kwh:      order.amountKwh,
                price_per_kwh:   order.pricePerKwh,
                energy_source:   order.energySource === "UNKNOWN" ? "GRID" : order.energySource,
                pricing_mode:    order.pricingMode,
                priority:        order.priority,
                status:          "OPEN",
                note:            order.note ?? null,
                expires_at:      order.expiresAt?.toISOString() ?? null,
                conditions:      order.conditions,
                max_slippage_percent: order.maxSlippagePercent,
                total_value_usd: order.totalValueUsd,
            });

            if (error) return { ok: false, error: error.message };

            // Subsistema 3: NotificationBridge
            await new OrderNotifier(InAppChannel.getInstance())
                .notifyOrderFilled(order.id, order.amountKwh, order.pricePerKwh);

            return { ok: true, data: order.id };

        } catch (e) {
            return { ok: false, error: e instanceof Error ? e.message : String(e) };
        }
    }

    // ── 2. CLONAR PLANTILLA Y PUBLICAR ────────────────────────
    /**
     * Orquesta: Prototype (Registry.cloneFrom) → Supabase → Notificación.
     */
    async cloneTemplateAndPublish(
        templateName: string,
        overrides: OrderOverrides = {}
    ): Promise<FacadeResult<string>> {
        try {
            // Subsistema 1: Prototype
            const registry = OrderTemplateRegistry.getInstance();
            const order    = registry.cloneFrom(templateName, overrides);
            if (!order) return { ok: false, error: `Template "${templateName}" no existe` };

            // Subsistema 2: Supabase
            const { error } = await getSupabaseAdmin().from("energy_orders").insert({
                id:              order.id,
                user_id:         DEMO_USER_ID,
                type:            order.type,
                amount_kwh:      order.amountKwh,
                price_per_kwh:   order.pricePerKwh,
                energy_source:   order.energySource === "UNKNOWN" ? "GRID" : order.energySource,
                pricing_mode:    order.pricingMode,
                priority:        order.priority,
                status:          "OPEN",
                note:            order.note ?? null,
                expires_at:      order.expiresAt?.toISOString() ?? null,
                conditions:      order.conditions,
                max_slippage_percent: order.maxSlippagePercent,
                total_value_usd: order.totalValueUsd,
            });

            if (error) return { ok: false, error: error.message };

            // Subsistema 3: Notificación
            await new OrderNotifier(InAppChannel.getInstance())
                .notifyOrderFilled(order.id, order.amountKwh, order.pricePerKwh);

            return { ok: true, data: order.id };

        } catch (e) {
            return { ok: false, error: e instanceof Error ? e.message : String(e) };
        }
    }

    // ── 3. OBTENER RESUMEN DE MERCADO ─────────────────────────
    /**
     * Orquesta: 3 Adapters + Decorator pipeline → estructura resumida.
     * El cliente recibe un único objeto con toda la información de mercado.
     */
    async getMarketSummary(): Promise<FacadeResult<MarketSummary>> {
        try {
            const types: AdapterType[] = ["OMIE", "ENTSO_E", "OCTOPUS"];

            const results = await Promise.allSettled(
                types.map(async (type) => {
                    const { estimator, cache } = EnergyTradingFacade.getPipeline(type);
                    const quote = await estimator.getCurrentQuote();
                    return { type, quote, cache };
                })
            );

            type PipelineResult = { type: AdapterType; quote: PriceQuote; cache: CachingDecorator };

            const quotes = results
                .filter((r): r is PromiseFulfilledResult<PipelineResult> => r.status === "fulfilled")
                .map(({ value: { type, quote, cache } }) => ({
                    provider:     type,
                    source:       quote.source,
                    pricePerKwh:  quote.pricePerKwh,
                    trend:        quote.trend,
                    validForMins: quote.validForMinutes,
                    cacheStats:   cache.getStats(),
                }));

            if (quotes.length === 0) return { ok: false, error: "No se pudo obtener ninguna cotización" };

            const prices  = quotes.map((q) => q.pricePerKwh);
            const avgPrice = prices.reduce((a, b) => a + b, 0) / prices.length;
            const cheapest = quotes.reduce((a, b) => a.pricePerKwh < b.pricePerKwh ? a : b).provider;

            // Alerta si el precio promedio es alto
            if (avgPrice > 0.15) {
                await new PriceAlertNotifier(InAppChannel.getInstance())
                    .alertPriceSpike("MARKET", avgPrice, 0.15);
            }

            const cacheStats = (EnergyTradingFacade.getPipeline("OMIE")).cache.getStats();

            return {
                ok: true,
                data: {
                    timestamp: new Date(),
                    quotes,
                    cheapest,
                    avgPrice: parseFloat(avgPrice.toFixed(5)),
                    cacheStats,
                },
            };
        } catch (e) {
            return { ok: false, error: e instanceof Error ? e.message : String(e) };
        }
    }

    // ── 4. ESTADO DEL PORTAFOLIO ──────────────────────────────
    /**
     * Orquesta: Supabase (energy_orders + iot_devices) → resumen del portafolio.
     * El cliente no necesita saber de tablas ni queries.
     */
    async getPortfolioStatus(): Promise<FacadeResult<PortfolioStatus>> {
        try {
            const supabase = getSupabaseClient();

            const [ordersRes, devicesRes] = await Promise.all([
                supabase.from("energy_orders")
                    .select("status, total_value_usd")
                    .eq("user_id", DEMO_USER_ID),
                supabase.from("iot_devices")
                    .select("status")
                    .eq("user_id", DEMO_USER_ID),
            ]);

            const orders  = (ordersRes.data  ?? []) as Array<{ status: string; total_value_usd: number }>;
            const devices = (devicesRes.data ?? []) as Array<{ status: string }>;

            return {
                ok: true,
                data: {
                    openOrders:    orders.filter((o) => o.status === "OPEN").length,
                    filledOrders:  orders.filter((o) => o.status === "MATCHED").length,
                    totalDevices:  devices.length,
                    onlineDevices: devices.filter((d) => d.status === "ONLINE").length,
                    totalValueUsd: orders.reduce((s, o) => s + (o.total_value_usd ?? 0), 0),
                },
            };
        } catch (e) {
            return { ok: false, error: e instanceof Error ? e.message : String(e) };
        }
    }

    // ── 5. LISTA DE PLANTILLAS ────────────────────────────────
    getAvailableTemplates() {
        return OrderTemplateRegistry.getInstance().list().map((t) => ({
            name:        t.name,
            description: t.description,
            usageCount:  t.usageCount,
            order:       t.getOrder(),
        }));
    }
}

// Singleton de la Facade para uso en páginas
let _facadeInstance: EnergyTradingFacade | null = null;
export function getEnergyFacade(): EnergyTradingFacade {
    if (!_facadeInstance) _facadeInstance = new EnergyTradingFacade();
    return _facadeInstance;
}

// _Facade
