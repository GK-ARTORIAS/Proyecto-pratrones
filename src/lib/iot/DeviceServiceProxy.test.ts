/**
 * Tests: Patrón PROXY — DeviceServiceProxy
 */
import {
    DeviceServiceProxy,
    RealDeviceService,
    createDeviceService,
    type IDeviceService,
    type Device,
} from "@/lib/iot/DeviceServiceProxy";

// ── Mock de Supabase ──────────────────────────────────────────
jest.mock("@/lib/supabase/supabaseClient", () => ({
    getSupabaseClient: () => ({
        from: () => ({
            select: () => ({
                eq: async () => ({
                    data: [
                        { id: "D1", name: "Panel A", type: "SOLAR", status: "ONLINE", user_id: "U1" },
                        { id: "D2", name: "Turbina", type: "WIND",  status: "ONLINE", user_id: "U1" },
                    ],
                    error: null,
                }),
            }),
        }),
    }),
    getSupabaseAdmin: () => ({
        from: () => ({
            insert: async () => ({ error: null }),
            update: () => ({ eq: async () => ({ error: null }) }),
            delete: () => ({ eq: async () => ({ error: null }) }),
        }),
    }),
}));

const USER_ID = "00000000-0000-0000-0000-000000000001";

// ── Tests de Protection Proxy (roles) ─────────────────────────

describe("DeviceServiceProxy — Protection Proxy (roles)", () => {

    test("VIEWER puede leer dispositivos", async () => {
        const proxy = new DeviceServiceProxy({ userId: USER_ID, role: "VIEWER" });
        const devices = await proxy.getDevices(USER_ID);
        expect(devices).toHaveLength(2);
    });

    test("VIEWER NO puede agregar dispositivos", async () => {
        const proxy = new DeviceServiceProxy({ userId: USER_ID, role: "VIEWER" });
        const result = await proxy.addDevice({ name: "X", type: "SOLAR", user_id: USER_ID });
        expect(result.ok).toBe(false);
        expect(result.error).toContain("denegado");
    });

    test("VIEWER NO puede eliminar dispositivos", async () => {
        const proxy = new DeviceServiceProxy({ userId: USER_ID, role: "VIEWER" });
        const result = await proxy.deleteDevice("D1");
        expect(result.ok).toBe(false);
        expect(result.error).toContain("ADMIN");
    });

    test("OPERATOR puede agregar dispositivos", async () => {
        const proxy = new DeviceServiceProxy({ userId: USER_ID, role: "OPERATOR" });
        const result = await proxy.addDevice({ name: "Y", type: "WIND", user_id: USER_ID });
        expect(result.ok).toBe(true);
    });

    test("OPERATOR NO puede eliminar dispositivos", async () => {
        const proxy = new DeviceServiceProxy({ userId: USER_ID, role: "OPERATOR" });
        const result = await proxy.deleteDevice("D1");
        expect(result.ok).toBe(false);
        expect(result.error).toContain("ADMIN");
    });

    test("ADMIN puede hacer todas las operaciones", async () => {
        const proxy = new DeviceServiceProxy({ userId: USER_ID, role: "ADMIN" });
        const add    = await proxy.addDevice({ name: "Z", type: "BATTERY", user_id: USER_ID });
        const update = await proxy.updateReading("D1", { value_kwh: 12.5, timestamp: new Date().toISOString() });
        const del    = await proxy.deleteDevice("D1");
        expect(add.ok).toBe(true);
        expect(update.ok).toBe(true);
        expect(del.ok).toBe(true);
    });
});

// ── Tests de Caching Proxy ────────────────────────────────────

describe("DeviceServiceProxy — Caching Proxy", () => {

    test("la segunda llamada a getDevices viene de caché (misma referencia)", async () => {
        const proxy   = new DeviceServiceProxy({ userId: USER_ID, role: "VIEWER", cacheTTLSeconds: 30 });
        const first   = await proxy.getDevices(USER_ID);
        const second  = await proxy.getDevices(USER_ID);
        // Si vienen de caché, son el mismo array
        expect(first).toBe(second);
    });

    test("clearCache() fuerza nueva llamada al real", async () => {
        const proxy  = new DeviceServiceProxy({ userId: USER_ID, role: "VIEWER" });
        const first  = await proxy.getDevices(USER_ID);
        proxy.clearCache();
        const second = await proxy.getDevices(USER_ID);
        // Después de limpiar caché → nuevo array (diferente referencia)
        expect(first).not.toBe(second);
    });

    test("addDevice() invalida el caché de getDevices", async () => {
        const proxy  = new DeviceServiceProxy({ userId: USER_ID, role: "ADMIN" });
        const first  = await proxy.getDevices(USER_ID);
        await proxy.addDevice({ name: "New", type: "SOLAR", user_id: USER_ID });
        const second = await proxy.getDevices(USER_ID);
        expect(first).not.toBe(second); // caché se invalidó
    });
});

// ── Tests de Logging / Auditoría Proxy ───────────────────────

describe("DeviceServiceProxy — Logging Proxy", () => {

    test("getDevices() genera entrada en el audit log", async () => {
        const proxy = new DeviceServiceProxy({ userId: USER_ID, role: "VIEWER" });
        await proxy.getDevices(USER_ID);
        const log = proxy.getAuditLog();
        expect(log).toHaveLength(1);
        expect(log[0].operation).toBe("getDevices");
        expect(log[0].success).toBe(true);
    });

    test("operación denegada genera entrada de error en el log", async () => {
        const proxy = new DeviceServiceProxy({ userId: USER_ID, role: "VIEWER" });
        await proxy.addDevice({ name: "X", type: "SOLAR", user_id: USER_ID });
        const failed = proxy.getFailedOps();
        expect(failed).toHaveLength(1);
        expect(failed[0].error).toBe("FORBIDDEN");
    });

    test("getAuditBy() filtra por operación", async () => {
        const proxy = new DeviceServiceProxy({ userId: USER_ID, role: "ADMIN" });
        await proxy.getDevices(USER_ID);
        await proxy.addDevice({ name: "X", type: "SOLAR", user_id: USER_ID });
        await proxy.getDevices(USER_ID);
        const gets = proxy.getAuditBy("getDevices");
        expect(gets).toHaveLength(2);
    });

    test("el log registra el rol del usuario", async () => {
        const proxy = new DeviceServiceProxy({ userId: USER_ID, role: "OPERATOR" });
        await proxy.updateReading("D1", { value_kwh: 5, timestamp: new Date().toISOString() });
        const entry = proxy.getAuditLog()[0];
        expect(entry.role).toBe("OPERATOR");
        expect(entry.userId).toBe(USER_ID);
    });
});

// ── Tests de Rate Limiting ────────────────────────────────────

describe("DeviceServiceProxy — Rate Limiting", () => {

    test("superar el límite de operaciones devuelve error de rate limit", async () => {
        const proxy = new DeviceServiceProxy({
            userId:         USER_ID,
            role:           "ADMIN",
            maxOpsPerMinute: 3, // muy bajo para el test
        });
        await proxy.addDevice({ name: "A", type: "SOLAR", user_id: USER_ID });
        await proxy.addDevice({ name: "B", type: "SOLAR", user_id: USER_ID });
        await proxy.addDevice({ name: "C", type: "SOLAR", user_id: USER_ID });
        const blocked = await proxy.addDevice({ name: "D", type: "SOLAR", user_id: USER_ID });
        expect(blocked.ok).toBe(false);
        expect(blocked.error).toContain("Rate limit");
    });
});

// ── Tests de Virtual Proxy (lazy init) ────────────────────────

describe("DeviceServiceProxy — Virtual Proxy (lazy initialization)", () => {

    test("el RealDeviceService no se crea hasta la primera llamada", async () => {
        // Si el proxy se crea sin errores y no accede a Supabase hasta
        // que se llame a un método, la lazy init funciona.
        const proxy = new DeviceServiceProxy({ userId: USER_ID, role: "VIEWER" });
        expect(proxy.getStats()).toMatchObject({ type: "DeviceServiceProxy" });
        // No lanza ni conecta hasta aquí
        await proxy.getDevices(USER_ID); // ahora sí crea el real
        expect(proxy.getAuditLog()).toHaveLength(1);
    });
});

// ── Tests de createDeviceService (factory) ────────────────────

describe("createDeviceService() — factory", () => {

    test("devuelve IDeviceService independientemente del rol", () => {
        const viewer   = createDeviceService(USER_ID, "VIEWER");
        const operator = createDeviceService(USER_ID, "OPERATOR");
        const admin    = createDeviceService(USER_ID, "ADMIN");
        expect(typeof viewer.getDevices).toBe("function");
        expect(typeof operator.addDevice).toBe("function");
        expect(typeof admin.deleteDevice).toBe("function");
    });

    test("la interfaz del proxy y el real son idénticas (polimorfismo)", async () => {
        const subjects: IDeviceService[] = [
            createDeviceService(USER_ID, "VIEWER"),
        ];
        for (const s of subjects) {
            const devices = await s.getDevices(USER_ID);
            expect(Array.isArray(devices)).toBe(true);
        }
    });
});
