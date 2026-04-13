/**
 * ============================================================
 * PATRÓN: BRIDGE — NotificationBridge
 * ============================================================
 * Problema: el sistema genera notificaciones de 3 tipos distintos
 * (precio, orden, dispositivo) y necesita entregarlas por múltiples
 * canales (consola, in-app, email, webhook). Sin Bridge, habría
 * 3×4=12 clases: PriceEmailNotifier, PriceSmsNotifier, OrderEmailNotifier…
 *
 * Solución: separar la jerarquía de ABSTRACCIONES (qué se notifica)
 * de la jerarquía de IMPLEMENTACIONES (cómo se entrega).
 * Ambas crecen de forma independiente.
 *
 * Participantes GoF:
 *   Abstraction         → Notifier (compone con INotificationChannel)
 *   RefinedAbstraction  → PriceAlertNotifier, OrderNotifier, DeviceNotifier
 *   Implementor         → INotificationChannel
 *   ConcreteImplementor → ConsoleChannel, InAppChannel, EmailChannel, WebhookChannel
 *
 * Flujo:
 *   PriceAlertNotifier → formatea el mensaje específico del precio
 *   .send() delega al canal elegido (INotificationChannel)
 *   el canal entrega el mensaje (consola, DB, HTTP, etc.)
 * ============================================================
 */

// ── Tipos de datos de notificación ───────────────────────────

export type NotificationLevel = "INFO" | "WARNING" | "CRITICAL";

export interface Notification {
  id:        string;
  title:     string;
  body:      string;
  level:     NotificationLevel;
  source:    string;
  timestamp: Date;
  metadata?: Record<string, unknown>;
}

// ── IMPLEMENTOR: INotificationChannel ────────────────────────

/** Interfaz base de implementación — cómo se entrega el mensaje */
export interface INotificationChannel {
  readonly name: string;
  deliver(notification: Notification): Promise<void>;
}

// ── ConcreteImplementors ──────────────────────────────────────

/** Canal 1: Consola — útil para desarrollo y logging */
export class ConsoleChannel implements INotificationChannel {
  readonly name = "Console";

  async deliver(n: Notification): Promise<void> {
    const icon = n.level === "CRITICAL" ? "🔴" : n.level === "WARNING" ? "🟡" : "🔵";
    console.log(
      `${icon} [${n.level}] [${n.source}] ${n.title}\n   ${n.body}\n   @ ${n.timestamp.toISOString()}`
    );
  }
}

/** Canal 2: In-App — almacena notificaciones en memoria para mostrar en UI */
export class InAppChannel implements INotificationChannel {
  readonly name = "InApp";
  private readonly _store: Notification[] = [];
  private static _instance: InAppChannel | null = null;

  // Singleton para que la UI acceda al mismo store
  static getInstance(): InAppChannel {
    if (!InAppChannel._instance) InAppChannel._instance = new InAppChannel();
    return InAppChannel._instance;
  }

  async deliver(n: Notification): Promise<void> {
    this._store.unshift(n); // más reciente primero
    if (this._store.length > 50) this._store.pop(); // limite de 50
  }

  getAll(): Notification[] { return [...this._store]; }
  getCritical(): Notification[] { return this._store.filter((n) => n.level === "CRITICAL"); }
  clear(): void { this._store.length = 0; }
}

/** Canal 3: Email (simulado) — en producción llamaría a SendGrid/Resend */
export class EmailChannel implements INotificationChannel {
  readonly name = "Email";
  private readonly _sent: Notification[] = [];

  constructor(private readonly toEmail: string = "ops@energytrade.dev") {}

  async deliver(n: Notification): Promise<void> {
    // En producción: await fetch('https://api.sendgrid.com/...', { body: … })
    console.info(`📧 Email → ${this.toEmail} | [${n.level}] ${n.title}`);
    this._sent.push(n);
  }

  getSent(): Notification[] { return [...this._sent]; }
}

/** Canal 4: Webhook (simulado) — envía POST a un endpoint externo */
export class WebhookChannel implements INotificationChannel {
  readonly name = "Webhook";
  private readonly _log: Array<{ url: string; payload: Notification }> = [];

  constructor(private readonly endpointUrl: string = "https://hooks.example.com/energy") {}

  async deliver(n: Notification): Promise<void> {
    // En producción: await fetch(this.endpointUrl, { method:'POST', body: JSON.stringify(n) })
    console.info(`🔗 Webhook → ${this.endpointUrl} | ${n.title}`);
    this._log.push({ url: this.endpointUrl, payload: n });
  }

  getLog() { return [...this._log]; }
}

// ── ABSTRACTION: Notifier ─────────────────────────────────────

let _seq = 0;
function nextId() { return `NOTIF-${Date.now()}-${++_seq}`; }

/**
 * Clase base abstracta — compone (no hereda) el canal.
 * Las subclases refinan QUÉ se dice; el canal decide CÓMO se entrega.
 */
export abstract class Notifier {
  constructor(protected channel: INotificationChannel) {}

  /** Cambia el canal en tiempo de ejecución (otro beneficio del Bridge) */
  setChannel(channel: INotificationChannel): void {
    this.channel = channel;
  }

  /** Las subclases construyen la notificación; esta clase la entrega */
  protected async send(notification: Notification): Promise<void> {
    await this.channel.deliver(notification);
  }
}

// ── RefinedAbstractions ───────────────────────────────────────

/**
 * Abstracción refinada 1: alertas de precio de energía.
 * Formatea mensajes específicos de mercado.
 */
export class PriceAlertNotifier extends Notifier {
  constructor(channel: INotificationChannel) { super(channel); }

  async alertPriceSpike(source: string, price: number, threshold: number): Promise<void> {
    await this.send({
      id:        nextId(),
      title:     `⚡ Precio de ${source} sobre umbral`,
      body:      `El precio actual ($${price.toFixed(4)}/kWh) superó el umbral de $${threshold.toFixed(4)}/kWh. Revisa tus órdenes abiertas.`,
      level:     price > threshold * 1.2 ? "CRITICAL" : "WARNING",
      source:    `mercado-${source.toLowerCase()}`,
      timestamp: new Date(),
      metadata:  { price, threshold, source },
    });
  }

  async alertPriceDrop(source: string, price: number, avg: number): Promise<void> {
    await this.send({
      id:        nextId(),
      title:     `📉 Precio de ${source} en mínimo`,
      body:      `El precio ($${price.toFixed(4)}/kWh) está ${((1 - price / avg) * 100).toFixed(1)}% bajo el promedio. Oportunidad de compra.`,
      level:     "INFO",
      source:    `mercado-${source.toLowerCase()}`,
      timestamp: new Date(),
      metadata:  { price, avg, source },
    });
  }
}

/**
 * Abstracción refinada 2: estado de órdenes de trading.
 */
export class OrderNotifier extends Notifier {
  constructor(channel: INotificationChannel) { super(channel); }

  async notifyOrderFilled(orderId: string, amountKwh: number, priceUsd: number): Promise<void> {
    await this.send({
      id:        nextId(),
      title:     "✅ Orden ejecutada",
      body:      `La orden ${orderId} fue completada: ${amountKwh} kWh a $${priceUsd.toFixed(4)}/kWh. Total: $${(amountKwh * priceUsd).toFixed(2)} USD.`,
      level:     "INFO",
      source:    "trading-engine",
      timestamp: new Date(),
      metadata:  { orderId, amountKwh, priceUsd },
    });
  }

  async notifyOrderExpired(orderId: string, reason: string): Promise<void> {
    await this.send({
      id:        nextId(),
      title:     "⏰ Orden expirada",
      body:      `La orden ${orderId} expiró sin ejecutarse. Motivo: ${reason}.`,
      level:     "WARNING",
      source:    "trading-engine",
      timestamp: new Date(),
      metadata:  { orderId, reason },
    });
  }

  async notifyOrderCancelled(orderId: string): Promise<void> {
    await this.send({
      id:        nextId(),
      title:     "🚫 Orden cancelada",
      body:      `La orden ${orderId} fue cancelada manualmente.`,
      level:     "INFO",
      source:    "trading-engine",
      timestamp: new Date(),
      metadata:  { orderId },
    });
  }
}

/**
 * Abstracción refinada 3: estado de dispositivos IoT.
 */
export class DeviceNotifier extends Notifier {
  constructor(channel: INotificationChannel) { super(channel); }

  async notifyDeviceOffline(deviceId: string, deviceName: string): Promise<void> {
    await this.send({
      id:        nextId(),
      title:     "📡 Dispositivo desconectado",
      body:      `El dispositivo "${deviceName}" (${deviceId}) dejó de reportar datos. Verifica la conexión.`,
      level:     "CRITICAL",
      source:    `iot-${deviceId}`,
      timestamp: new Date(),
      metadata:  { deviceId, deviceName },
    });
  }

  async notifyHighReading(deviceId: string, deviceName: string, kwh: number, limit: number): Promise<void> {
    await this.send({
      id:        nextId(),
      title:     "⚠️ Lectura elevada detectada",
      body:      `"${deviceName}" reportó ${kwh.toFixed(2)} kWh — por encima del límite de ${limit} kWh. Posible sobrecarga.`,
      level:     kwh > limit * 1.5 ? "CRITICAL" : "WARNING",
      source:    `iot-${deviceId}`,
      timestamp: new Date(),
      metadata:  { deviceId, deviceName, kwh, limit },
    });
  }

  async notifyDeviceOnline(deviceId: string, deviceName: string): Promise<void> {
    await this.send({
      id:        nextId(),
      title:     "🟢 Dispositivo en línea",
      body:      `"${deviceName}" (${deviceId}) se reconectó y está reportando datos normalmente.`,
      level:     "INFO",
      source:    `iot-${deviceId}`,
      timestamp: new Date(),
    });
  }
}

// ── Multi-channel broadcaster (bonus) ────────────────────────

/**
 * Broadcaster: entrega la misma notificación a múltiples canales.
 * No es un participante GoF estricto, pero demuestra la flexibilidad del Bridge.
 */
export class MultiChannelBroadcaster implements INotificationChannel {
  readonly name = "MultiChannel";
  constructor(private readonly channels: INotificationChannel[]) {}

  async deliver(n: Notification): Promise<void> {
    await Promise.all(this.channels.map((ch) => ch.deliver(n)));
  }
}

// _Bridge
