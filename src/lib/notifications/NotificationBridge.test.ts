/**
 * ============================================================
 * Tests: Patrón BRIDGE — NotificationBridge
 * ============================================================
 */

import {
  ConsoleChannel,
  InAppChannel,
  EmailChannel,
  WebhookChannel,
  MultiChannelBroadcaster,
  PriceAlertNotifier,
  OrderNotifier,
  DeviceNotifier,
  type Notification,
} from "@/lib/notifications/NotificationBridge";

// ── Tests de canales (Implementors) ──────────────────────────

describe("ConsoleChannel — ConcreteImplementor", () => {
  test("implementa la interfaz INotificationChannel", async () => {
    const ch = new ConsoleChannel();
    expect(ch.name).toBe("Console");
    expect(typeof ch.deliver).toBe("function");
  });

  test("deliver() no lanza error con datos válidos", async () => {
    const ch = new ConsoleChannel();
    const n: Notification = {
      id: "T1", title: "Test", body: "Cuerpo", level: "INFO",
      source: "test", timestamp: new Date(),
    };
    await expect(ch.deliver(n)).resolves.toBeUndefined();
  });
});

describe("InAppChannel — ConcreteImplementor + Singleton", () => {
  let ch: InAppChannel;
  beforeEach(() => { ch = InAppChannel.getInstance(); ch.clear(); });

  test("es un Singleton (misma instancia)", () => {
    expect(InAppChannel.getInstance()).toBe(InAppChannel.getInstance());
  });

  test("almacena notificaciones entregadas", async () => {
    await ch.deliver({ id: "N1", title: "A", body: "b", level: "INFO", source: "s", timestamp: new Date() });
    await ch.deliver({ id: "N2", title: "B", body: "b", level: "CRITICAL", source: "s", timestamp: new Date() });
    expect(ch.getAll()).toHaveLength(2);
  });

  test("getAll() retorna más reciente primero (unshift)", async () => {
    await ch.deliver({ id: "old", title: "Old", body: "", level: "INFO", source: "s", timestamp: new Date() });
    await ch.deliver({ id: "new", title: "New", body: "", level: "INFO", source: "s", timestamp: new Date() });
    expect(ch.getAll()[0].id).toBe("new");
  });

  test("getCritical() filtra solo nivel CRITICAL", async () => {
    await ch.deliver({ id: "W", title: "Warn", body: "", level: "WARNING", source: "s", timestamp: new Date() });
    await ch.deliver({ id: "C", title: "Crit", body: "", level: "CRITICAL", source: "s", timestamp: new Date() });
    const critical = ch.getCritical();
    expect(critical).toHaveLength(1);
    expect(critical[0].level).toBe("CRITICAL");
  });

  test("limita a 50 notificaciones", async () => {
    for (let i = 0; i < 55; i++) {
      await ch.deliver({ id: `N${i}`, title: `N${i}`, body: "", level: "INFO", source: "s", timestamp: new Date() });
    }
    expect(ch.getAll().length).toBeLessThanOrEqual(50);
  });
});

describe("EmailChannel — ConcreteImplementor", () => {
  test("registra los emails enviados", async () => {
    const ch = new EmailChannel("test@test.com");
    await ch.deliver({ id: "E1", title: "Ok", body: "b", level: "WARNING", source: "s", timestamp: new Date() });
    expect(ch.getSent()).toHaveLength(1);
  });
});

describe("WebhookChannel — ConcreteImplementor", () => {
  test("registra las llamadas en el log", async () => {
    const ch = new WebhookChannel("https://api.test.com");
    await ch.deliver({ id: "W1", title: "Ok", body: "b", level: "CRITICAL", source: "s", timestamp: new Date() });
    expect(ch.getLog()).toHaveLength(1);
    expect(ch.getLog()[0].url).toBe("https://api.test.com");
  });
});

// ── Tests de Abstracciones (Notifiers) ───────────────────────

describe("PriceAlertNotifier — RefinedAbstraction", () => {
  let ch: InAppChannel;
  let notifier: PriceAlertNotifier;

  beforeEach(() => { ch = InAppChannel.getInstance(); ch.clear(); notifier = new PriceAlertNotifier(ch); });

  test("alertPriceSpike genera notificación WARNING si price entre threshold y 1.2x", async () => {
    await notifier.alertPriceSpike("SOLAR", 0.15, 0.14);
    const notifs = ch.getAll();
    expect(notifs).toHaveLength(1);
    expect(notifs[0].level).toBe("WARNING");
    expect(notifs[0].title).toContain("SOLAR");
  });

  test("alertPriceSpike genera CRITICAL si supera 1.2× el umbral", async () => {
    await notifier.alertPriceSpike("WIND", 0.20, 0.14);
    expect(ch.getAll()[0].level).toBe("CRITICAL");
  });

  test("alertPriceDrop genera INFO con mención de oportunidad", async () => {
    await notifier.alertPriceDrop("GRID", 0.08, 0.12);
    const n = ch.getAll()[0];
    expect(n.level).toBe("INFO");
    expect(n.body.toLowerCase()).toContain("compra");
  });

  test("setChannel() cambia el canal en tiempo de ejecución (Bridge)", async () => {
    const email = new EmailChannel();
    notifier.setChannel(email);
    await notifier.alertPriceSpike("SOLAR", 0.20, 0.14);
    expect(email.getSent()).toHaveLength(1);
    expect(ch.getAll()).toHaveLength(0); // el InApp ya no recibe
  });
});

describe("OrderNotifier — RefinedAbstraction", () => {
  let ch: InAppChannel;
  let notifier: OrderNotifier;

  beforeEach(() => { ch = InAppChannel.getInstance(); ch.clear(); notifier = new OrderNotifier(ch); });

  test("notifyOrderFilled genera INFO con monto total", async () => {
    await notifier.notifyOrderFilled("ORD-001", 10, 0.12);
    const n = ch.getAll()[0];
    expect(n.level).toBe("INFO");
    expect(n.body).toContain("$1.20 USD");
  });

  test("notifyOrderExpired genera WARNING", async () => {
    await notifier.notifyOrderExpired("ORD-002", "sin contrapartes");
    expect(ch.getAll()[0].level).toBe("WARNING");
  });

  test("notifyOrderCancelled genera INFO", async () => {
    await notifier.notifyOrderCancelled("ORD-003");
    expect(ch.getAll()[0].level).toBe("INFO");
  });
});

describe("DeviceNotifier — RefinedAbstraction", () => {
  let ch: InAppChannel;
  let notifier: DeviceNotifier;

  beforeEach(() => { ch = InAppChannel.getInstance(); ch.clear(); notifier = new DeviceNotifier(ch); });

  test("notifyDeviceOffline genera CRITICAL", async () => {
    await notifier.notifyDeviceOffline("DEV-1", "Panel Norte");
    expect(ch.getAll()[0].level).toBe("CRITICAL");
  });

  test("notifyHighReading genera WARNING o CRITICAL según magnitud", async () => {
    await notifier.notifyHighReading("DEV-2", "Inversor", 12, 10);
    expect(["WARNING", "CRITICAL"]).toContain(ch.getAll()[0].level);
  });

  test("notifyDeviceOnline genera INFO", async () => {
    await notifier.notifyDeviceOnline("DEV-3", "Panel Sur");
    expect(ch.getAll()[0].level).toBe("INFO");
  });
});

// ── Tests del Bridge: combinación libre abstracción × canal ──

describe("Bridge — combinación libre de abstracciones y canales", () => {
  test("OrderNotifier puede usar EmailChannel sin cambiar código", async () => {
    const email    = new EmailChannel("ops@test.com");
    const notifier = new OrderNotifier(email);
    await notifier.notifyOrderFilled("ORD-X", 5, 0.11);
    expect(email.getSent()).toHaveLength(1);
  });

  test("PriceAlertNotifier puede usar WebhookChannel", async () => {
    const webhook  = new WebhookChannel("https://hooks.test.com");
    const notifier = new PriceAlertNotifier(webhook);
    await notifier.alertPriceSpike("SOLAR", 0.20, 0.14);
    expect(webhook.getLog()).toHaveLength(1);
  });

  test("MultiChannelBroadcaster entrega a todos los canales", async () => {
    const inApp   = InAppChannel.getInstance(); inApp.clear();
    const email   = new EmailChannel();
    const webhook = new WebhookChannel();
    const multi   = new MultiChannelBroadcaster([inApp, email, webhook]);
    const notifier = new OrderNotifier(multi);
    await notifier.notifyOrderFilled("ORD-MULTI", 20, 0.13);
    expect(inApp.getAll()).toHaveLength(1);
    expect(email.getSent()).toHaveLength(1);
    expect(webhook.getLog()).toHaveLength(1);
  });
});
