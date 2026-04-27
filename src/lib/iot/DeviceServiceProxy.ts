/**
 * ============================================================
 * PATRÓN: PROXY — DeviceServiceProxy
 * ============================================================
 * Problema: el acceso directo a Supabase para operaciones IoT
 * no tiene:
 *   - Control de acceso por rol (¿puede este usuario borrar?)
 *   - Caché (getDevices se llama en cada render, hits Supabase siempre)
 *   - Auditoría (quién hizo qué y cuándo)
 *   - Rate limiting (protege contra lecturas masivas accidentales)
 *
 * Solución: DeviceServiceProxy implementa la misma interfaz
 * IDeviceService que el servicio real pero intercepta las llamadas
 * para añadir esos comportamientos sin tocar el servicio real.
 *
 * Participantes GoF:
 *   Subject       → IDeviceService (interfaz común)
 *   RealSubject   → RealDeviceService (acceso directo a Supabase)
 *   Proxy         → DeviceServiceProxy (intercepta + añade comportamiento)
 *   Client        → Páginas IoT, Facade, etc.
 *
 * Tipos de Proxy combinados:
 *   - Virtual Proxy:    crea RealDeviceService solo cuando se necesita
 *   - Protection Proxy: verifica roles antes de operaciones destructivas
 *   - Caching Proxy:    cachea getDevices() durante N segundos
 *   - Logging Proxy:    audita todas las operaciones con timestamp
 * ============================================================
 */

import { getSupabaseAdmin, getSupabaseClient } from "@/lib/supabase/supabaseClient";

// ── Tipos del dominio ─────────────────────────────────────────

export type UserRole = "VIEWER" | "OPERATOR" | "ADMIN";

export interface Device {
    id:         string;
    name:       string;
    type:       string;
    status:     string;
    user_id:    string;
    location?:  string;
    last_reading?: number;
}

export interface DeviceInput {
    name:      string;
    type:      string;
    location?: string;
    user_id:   string;
}

export interface ReadingInput {
    value_kwh: number;
    timestamp: string;
}

export interface AuditEntry {
    timestamp:  Date;
    operation:  string;
    userId:     string;
    role:       UserRole;
    deviceId?:  string;
    success:    boolean;
    durationMs: number;
    error?:     string;
}

// ── SUBJECT (interfaz común) ──────────────────────────────────

/**
 * IDeviceService: contrato que comparten el servicio real y el proxy.
 * El cliente siempre programa contra esta interfaz.
 */
export interface IDeviceService {
    getDevices(userId: string): Promise<Device[]>;
    addDevice(device: DeviceInput): Promise<{ ok: boolean; id?: string; error?: string }>;
    updateReading(deviceId: string, reading: ReadingInput): Promise<{ ok: boolean; error?: string }>;
    deleteDevice(deviceId: string): Promise<{ ok: boolean; error?: string }>;
    getStats(): Record<string, unknown>;
}

// ── REAL SUBJECT ──────────────────────────────────────────────

/**
 * RealDeviceService: implementación real que llama a Supabase.
 * No sabe nada de caché, auditoría ni control de acceso.
 */
export class RealDeviceService implements IDeviceService {
    async getDevices(userId: string): Promise<Device[]> {
        const { data, error } = await getSupabaseClient()
            .from("iot_devices")
            .select("*")
            .eq("user_id", userId);
        if (error) throw new Error(error.message);
        return (data ?? []) as Device[];
    }

    async addDevice(input: DeviceInput): Promise<{ ok: boolean; id?: string; error?: string }> {
        const id = `DEV-${Date.now().toString(36).toUpperCase()}`;
        const { error } = await getSupabaseAdmin().from("iot_devices").insert({
            id,
            ...input,
            status: "ONLINE",
            current_reading_kwh: 0,
        });
        return error ? { ok: false, error: error.message } : { ok: true, id };
    }

    async updateReading(deviceId: string, reading: ReadingInput): Promise<{ ok: boolean; error?: string }> {
        const { error } = await getSupabaseAdmin()
            .from("iot_devices")
            .update({ current_reading_kwh: reading.value_kwh, updated_at: reading.timestamp })
            .eq("id", deviceId);
        return error ? { ok: false, error: error.message } : { ok: true };
    }

    async deleteDevice(deviceId: string): Promise<{ ok: boolean; error?: string }> {
        const { error } = await getSupabaseAdmin()
            .from("iot_devices")
            .delete()
            .eq("id", deviceId);
        return error ? { ok: false, error: error.message } : { ok: true };
    }

    getStats(): Record<string, unknown> {
        return { type: "RealDeviceService", directAccess: true };
    }
}

// ── PROXY ─────────────────────────────────────────────────────

interface CacheEntry {
    data:      Device[];
    expiresAt: Date;
}

interface RateLimitEntry {
    count:      number;
    windowStart: Date;
}

/**
 * DeviceServiceProxy: intercepta todas las llamadas a IDeviceService.
 * Añade caché, auditoría, control de acceso y rate limiting
 * sin modificar RealDeviceService.
 */
export class DeviceServiceProxy implements IDeviceService {
    // Virtual Proxy: el real se crea solo cuando hace falta
    private _real: RealDeviceService | null = null;
    private get real(): RealDeviceService {
        if (!this._real) this._real = new RealDeviceService();
        return this._real;
    }

    // Caching Proxy
    private readonly _cache = new Map<string, CacheEntry>();
    private readonly _cacheTTLMs: number;

    // Logging Proxy
    private readonly _auditLog: AuditEntry[] = [];

    // Rate limiting
    private readonly _rateLimits = new Map<string, RateLimitEntry>();
    private readonly _maxOpsPerWindow: number;
    private readonly _windowMs: number;

    // Protection Proxy
    private readonly _userId: string;
    private readonly _role:   UserRole;

    constructor(options: {
        userId:           string;
        role:             UserRole;
        cacheTTLSeconds?: number;
        maxOpsPerMinute?: number;
    }) {
        this._userId           = options.userId;
        this._role             = options.role;
        this._cacheTTLMs       = (options.cacheTTLSeconds ?? 30) * 1000;
        this._maxOpsPerWindow  = options.maxOpsPerMinute  ?? 60;
        this._windowMs         = 60_000;
    }

    // ── Helpers internos ──────────────────────────────────────

    private _hasRole(...required: UserRole[]): boolean {
        const hierarchy: Record<UserRole, number> = { VIEWER: 0, OPERATOR: 1, ADMIN: 2 };
        return required.some((r) => hierarchy[this._role] >= hierarchy[r]);
    }

    private _checkRateLimit(operation: string): boolean {
        const key  = `${this._userId}:${operation}`;
        const now  = new Date();
        const entry = this._rateLimits.get(key);

        if (!entry || (now.getTime() - entry.windowStart.getTime()) > this._windowMs) {
            this._rateLimits.set(key, { count: 1, windowStart: now });
            return true;
        }
        if (entry.count >= this._maxOpsPerWindow) return false;
        entry.count++;
        return true;
    }

    private _audit(entry: Omit<AuditEntry, "userId" | "role">): void {
        this._auditLog.push({ ...entry, userId: this._userId, role: this._role });
        if (this._auditLog.length > 200) this._auditLog.shift(); // ventana de 200 entradas
    }

    private _getCached(key: string): Device[] | null {
        const entry = this._cache.get(key);
        if (!entry) return null;
        if (new Date() > entry.expiresAt) { this._cache.delete(key); return null; }
        return entry.data;
    }

    private _setCache(key: string, data: Device[]): void {
        this._cache.set(key, {
            data,
            expiresAt: new Date(Date.now() + this._cacheTTLMs),
        });
    }

    // ── IDeviceService ────────────────────────────────────────

    /** Protection: cualquier rol puede ver dispositivos | Caching: TTL configurable */
    async getDevices(userId: string): Promise<Device[]> {
        const start  = Date.now();
        const cacheKey = `devices:${userId}`;

        // Caching Proxy: devuelve caché si vigente
        const cached = this._getCached(cacheKey);
        if (cached) {
            this._audit({ operation: "getDevices", success: true, durationMs: 0, timestamp: new Date() });
            return cached;
        }

        try {
            const data = await this.real.getDevices(userId);
            this._setCache(cacheKey, data);
            this._audit({ operation: "getDevices", success: true, durationMs: Date.now() - start, timestamp: new Date() });
            return data;
        } catch (e) {
            this._audit({ operation: "getDevices", success: false, durationMs: Date.now() - start, timestamp: new Date(), error: String(e) });
            throw e;
        }
    }

    /** Protection: solo OPERATOR o ADMIN pueden agregar | Rate limit */
    async addDevice(input: DeviceInput): Promise<{ ok: boolean; id?: string; error?: string }> {
        const start = Date.now();

        // Protection Proxy
        if (!this._hasRole("OPERATOR", "ADMIN")) {
            this._audit({ operation: "addDevice", success: false, durationMs: 0, timestamp: new Date(), error: "FORBIDDEN" });
            return { ok: false, error: "Acceso denegado: se requiere rol OPERATOR o superior" };
        }
        // Rate limiting
        if (!this._checkRateLimit("addDevice")) {
            return { ok: false, error: "Límite de operaciones alcanzado — espera un momento" };
        }

        // Invalidar caché de dispositivos
        this._cache.delete(`devices:${input.user_id}`);

        try {
            const result = await this.real.addDevice(input);
            this._audit({
                operation: "addDevice", success: result.ok,
                durationMs: Date.now() - start, timestamp: new Date(),
                ...(result.error ? { error: result.error } : {}),
            });
            return result;
        } catch (e) {
            this._audit({ operation: "addDevice", success: false, durationMs: Date.now() - start, timestamp: new Date(), error: String(e) });
            return { ok: false, error: String(e) };
        }
    }

    /** Protection: solo OPERATOR o ADMIN | Rate limit estricto */
    async updateReading(deviceId: string, reading: ReadingInput): Promise<{ ok: boolean; error?: string }> {
        const start = Date.now();

        if (!this._hasRole("OPERATOR", "ADMIN")) {
            return { ok: false, error: "Acceso denegado: se requiere rol OPERATOR o superior" };
        }
        if (!this._checkRateLimit("updateReading")) {
            return { ok: false, error: "Rate limit: demasiadas actualizaciones por minuto" };
        }

        try {
            const result = await this.real.updateReading(deviceId, reading);
            this._audit({ operation: "updateReading", success: result.ok, deviceId, durationMs: Date.now() - start, timestamp: new Date() });
            return result;
        } catch (e) {
            this._audit({ operation: "updateReading", success: false, deviceId, durationMs: Date.now() - start, timestamp: new Date(), error: String(e) });
            return { ok: false, error: String(e) };
        }
    }

    /** Protection: solo ADMIN puede borrar dispositivos */
    async deleteDevice(deviceId: string): Promise<{ ok: boolean; error?: string }> {
        const start = Date.now();

        if (!this._hasRole("ADMIN")) {
            this._audit({ operation: "deleteDevice", success: false, deviceId, durationMs: 0, timestamp: new Date(), error: "FORBIDDEN" });
            return { ok: false, error: "Acceso denegado: solo ADMIN puede eliminar dispositivos" };
        }

        try {
            const result = await this.real.deleteDevice(deviceId);
            this._audit({ operation: "deleteDevice", success: result.ok, deviceId, durationMs: Date.now() - start, timestamp: new Date() });
            // Invalida toda la caché — un dispositivo eliminado invalida lecturas relacionadas
            this._cache.clear();
            return result;
        } catch (e) {
            this._audit({ operation: "deleteDevice", success: false, deviceId, durationMs: Date.now() - start, timestamp: new Date(), error: String(e) });
            return { ok: false, error: String(e) };
        }
    }

    getStats(): Record<string, unknown> {
        return {
            type:          "DeviceServiceProxy",
            role:          this._role,
            userId:        this._userId,
            cacheEntries:  this._cache.size,
            auditEntries:  this._auditLog.length,
            cacheTTLSecs:  this._cacheTTLMs / 1000,
            maxOpsPerMin:  this._maxOpsPerWindow,
        };
    }

    // ── Acceso al log de auditoría ────────────────────────────
    getAuditLog(): AuditEntry[]                        { return [...this._auditLog]; }
    getAuditBy(operation: string): AuditEntry[]        { return this._auditLog.filter((e) => e.operation === operation); }
    getFailedOps(): AuditEntry[]                       { return this._auditLog.filter((e) => !e.success); }
    clearCache(): void                                 { this._cache.clear(); }
}

// ── Factory de proxy según rol ────────────────────────────────
export function createDeviceService(userId: string, role: UserRole): IDeviceService {
    return new DeviceServiceProxy({ userId, role, cacheTTLSeconds: 30, maxOpsPerMinute: 120 });
}

// _Proxy
