/**
 * Tests: Patrón OBSERVER — MarketEventBus
 */
import {
    MarketEventBus,
    PriceLogObserver,
    AlertObserver,
    OrderMatchingObserver,
    UIFeedObserver,
    type IMarketObserver,
    type MarketEvent,
    type MarketEventType,
    type PricePayload,
    type DevicePayload,
} from "@/lib/market/MarketEventBus";

// Mock del Bridge de notificaciones
jest.mock("@/lib/notifications/NotificationBridge", () => ({
    InAppChannel: { getInstance: () => ({ send: jest.fn() }) },
    PriceAlertNotifier: jest.fn().mockImplementation(() => ({
        alertPriceSpike: jest.fn(),
        alertPriceDrop:  jest.fn(),
    })),
    DeviceNotifier: jest.fn().mockImplementation(() => ({
        notifyDeviceOffline: jest.fn(),
    })),
    OrderNotifier: jest.fn(),
}));

beforeEach(() => MarketEventBus.reset());

// ── Tests de MarketEventBus (Subject) ─────────────────────────

describe("MarketEventBus — Subject (Observer Pattern)", () => {

    test("subscribe() registra un observer", () => {
        const bus      = MarketEventBus.getInstance();
        const observer = new PriceLogObserver();
        bus.subscribe(observer);
        expect(bus.isSubscribed("price-log")).toBe(true);
        expect(bus.getObserverCount()).toBe(1);
    });

    test("unsubscribe() elimina el observer", () => {
        const bus = MarketEventBus.getInstance();
        bus.subscribe(new PriceLogObserver());
        bus.unsubscribe("price-log");
        expect(bus.isSubscribed("price-log")).toBe(false);
        expect(bus.getObserverCount()).toBe(0);
    });

    test("emit() notifica solo a observers interesados en ese tipo", async () => {
        const bus = MarketEventBus.getInstance();

        const receivedA: MarketEvent[] = [];
        const receivedB: MarketEvent[] = [];

        const obsA: IMarketObserver = {
            observerId: "A", observerName: "A",
            interestedIn: ["PRICE_SPIKE"],
            onEvent: (e) => { receivedA.push(e); },
        };
        const obsB: IMarketObserver = {
            observerId: "B", observerName: "B",
            interestedIn: ["ORDER_MATCHED"],
            onEvent: (e) => { receivedB.push(e); },
        };

        bus.subscribe(obsA);
        bus.subscribe(obsB);

        await bus.emit("PRICE_SPIKE", { pricePerKwh: 0.20 }, "test");

        expect(receivedA).toHaveLength(1);  // A recibió PRICE_SPIKE
        expect(receivedB).toHaveLength(0);  // B no le interesa PRICE_SPIKE
    });

    test("emit() notifica a múltiples observers interesados en el mismo tipo", async () => {
        const bus = MarketEventBus.getInstance();
        let count = 0;

        const mkObs = (id: string): IMarketObserver => ({
            observerId: id, observerName: id,
            interestedIn: ["PRICE_UPDATED"],
            onEvent: () => { count++; },
        });

        bus.subscribe(mkObs("O1"));
        bus.subscribe(mkObs("O2"));
        bus.subscribe(mkObs("O3"));

        await bus.emit("PRICE_UPDATED", { pricePerKwh: 0.10 }, "test");
        expect(count).toBe(3);
    });

    test("emit() guarda el evento en el log interno", async () => {
        const bus = MarketEventBus.getInstance();
        await bus.emit("ORDER_MATCHED", { orderId: "ORD-001" }, "test");
        expect(bus.getLog()).toHaveLength(1);
        expect(bus.getEmitCount()).toBe(1);
    });

    test("getLogByType() filtra eventos por tipo", async () => {
        const bus = MarketEventBus.getInstance();
        await bus.emit("PRICE_SPIKE",   { pricePerKwh: 0.20 }, "test");
        await bus.emit("PRICE_UPDATED", { pricePerKwh: 0.10 }, "test");
        await bus.emit("PRICE_SPIKE",   { pricePerKwh: 0.22 }, "test");
        expect(bus.getLogByType("PRICE_SPIKE")).toHaveLength(2);
        expect(bus.getLogByType("PRICE_UPDATED")).toHaveLength(1);
    });

    test("emitPriceUpdate() emite PRICE_SPIKE cuando supera el umbral", async () => {
        const bus = MarketEventBus.getInstance();
        await bus.emitPriceUpdate({ source: "OMIE", pricePerKwh: 0.20, trend: "UP", threshold: 0.15 });
        expect(bus.getLogByType("PRICE_SPIKE")).toHaveLength(1);
        expect(bus.getLogByType("PRICE_UPDATED")).toHaveLength(0);
    });

    test("emitPriceUpdate() emite PRICE_UPDATED cuando está dentro del umbral", async () => {
        const bus = MarketEventBus.getInstance();
        await bus.emitPriceUpdate({ source: "OMIE", pricePerKwh: 0.10, trend: "STABLE", threshold: 0.15 });
        expect(bus.getLogByType("PRICE_UPDATED")).toHaveLength(1);
        expect(bus.getLogByType("PRICE_SPIKE")).toHaveLength(0);
    });

    test("el Subject (bus) no sabe qué hace cada Observer con el evento", async () => {
        // Este test verifica el desacoplamiento: el bus no tiene referencia
        // a ningún método específico de los observers
        const bus = MarketEventBus.getInstance();
        bus.subscribe(new PriceLogObserver());
        bus.subscribe(new UIFeedObserver());
        // Si este test pasa sin errores, el bus delegó correctamente
        await expect(bus.emit("PRICE_UPDATED", { pricePerKwh: 0.10, trend: "STABLE" }, "test"))
            .resolves.toBeUndefined();
    });
});

// ── Tests de PriceLogObserver ─────────────────────────────────

describe("PriceLogObserver — ConcreteObserver", () => {
    let bus: MarketEventBus;
    let obs: PriceLogObserver;

    beforeEach(() => {
        MarketEventBus.reset();
        bus = MarketEventBus.getInstance();
        obs = new PriceLogObserver();
        bus.subscribe(obs);
    });

    test("recibe eventos PRICE_UPDATED y PRICE_SPIKE", async () => {
        await bus.emit("PRICE_UPDATED", { source: "OMIE", pricePerKwh: 0.10, trend: "STABLE" } as PricePayload, "t");
        await bus.emit("PRICE_SPIKE",   { source: "OMIE", pricePerKwh: 0.20, trend: "UP"     } as PricePayload, "t");
        expect(obs.getLog()).toHaveLength(2);
    });

    test("NO recibe eventos que no le interesan (ORDER_MATCHED)", async () => {
        await bus.emit("ORDER_MATCHED", { orderId: "X" }, "t");
        expect(obs.getLog()).toHaveLength(0);
    });

    test("getAvgPrice() calcula el promedio de precios recibidos", async () => {
        await bus.emit("PRICE_UPDATED", { source: "A", pricePerKwh: 0.10, trend: "STABLE" } as PricePayload, "t");
        await bus.emit("PRICE_UPDATED", { source: "B", pricePerKwh: 0.20, trend: "UP"     } as PricePayload, "t");
        expect(obs.getAvgPrice()).toBeCloseTo(0.15, 4);
    });

    test("getSpikes() devuelve solo los eventos de spike", async () => {
        await bus.emit("PRICE_UPDATED", { source: "A", pricePerKwh: 0.10, trend: "STABLE" } as PricePayload, "t");
        await bus.emit("PRICE_SPIKE",   { source: "A", pricePerKwh: 0.20, trend: "UP"     } as PricePayload, "t");
        expect(obs.getSpikes()).toHaveLength(1);
    });

    test("getLatest() devuelve el evento más reciente", async () => {
        await bus.emit("PRICE_UPDATED", { source: "A", pricePerKwh: 0.10, trend: "STABLE" } as PricePayload, "t");
        await bus.emit("PRICE_UPDATED", { source: "B", pricePerKwh: 0.18, trend: "UP"     } as PricePayload, "t");
        expect(obs.getLatest()!.event.payload.pricePerKwh).toBe(0.18);
    });
});

// ── Tests de OrderMatchingObserver ────────────────────────────

describe("OrderMatchingObserver — ConcreteObserver", () => {

    test("se activa cuando el precio cambia más del umbral configurado", async () => {
        MarketEventBus.reset();
        const bus = MarketEventBus.getInstance();
        const obs = new OrderMatchingObserver(2); // 2% threshold
        bus.subscribe(obs);

        await bus.emit("PRICE_UPDATED", { source: "A", pricePerKwh: 0.10, trend: "STABLE" } as PricePayload, "t");
        await bus.emit("PRICE_UPDATED", { source: "A", pricePerKwh: 0.105, trend: "UP"    } as PricePayload, "t"); // +5%
        expect(obs.getTriggeredCount()).toBe(2);
    });

    test("NO se activa si el cambio de precio es menor que el umbral", async () => {
        MarketEventBus.reset();
        const bus = MarketEventBus.getInstance();
        const obs = new OrderMatchingObserver(5); // 5% threshold
        bus.subscribe(obs);

        await bus.emit("PRICE_UPDATED", { source: "A", pricePerKwh: 0.10,  trend: "STABLE" } as PricePayload, "t");
        await bus.emit("PRICE_UPDATED", { source: "A", pricePerKwh: 0.101, trend: "UP"     } as PricePayload, "t"); // +1%
        expect(obs.getTriggeredCount()).toBe(1); // solo el primero
    });
});

// ── Tests de UIFeedObserver ───────────────────────────────────

describe("UIFeedObserver — ConcreteObserver", () => {

    test("recibe todos los tipos de eventos", async () => {
        MarketEventBus.reset();
        const bus = MarketEventBus.getInstance();
        const obs = new UIFeedObserver();
        bus.subscribe(obs);

        const types: MarketEventType[] = ["PRICE_UPDATED", "ORDER_MATCHED", "DEVICE_OFFLINE", "ORDER_EXPIRED"];
        for (const t of types) await bus.emit(t, {}, "t");

        expect(obs.getFeed()).toHaveLength(4);
    });

    test("getFeedByType() filtra por tipo de evento", async () => {
        MarketEventBus.reset();
        const bus = MarketEventBus.getInstance();
        const obs = new UIFeedObserver();
        bus.subscribe(obs);

        await bus.emit("PRICE_UPDATED", {}, "t");
        await bus.emit("ORDER_MATCHED", {}, "t");
        await bus.emit("PRICE_SPIKE",   {}, "t");

        expect(obs.getFeedByType("PRICE_UPDATED")).toHaveLength(1);
        expect(obs.getFeedByType("ORDER_MATCHED")).toHaveLength(1);
    });

    test("clear() vacía el feed", async () => {
        MarketEventBus.reset();
        const bus = MarketEventBus.getInstance();
        const obs = new UIFeedObserver();
        bus.subscribe(obs);
        await bus.emit("PRICE_UPDATED", {}, "t");
        obs.clear();
        expect(obs.getFeed()).toHaveLength(0);
    });
});
