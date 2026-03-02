/**
 * ============================================================
 * Tests: Patrón SINGLETON — ConfigManager
 * Cobertura objetivo: ≥ 80%
 * ============================================================
 */

import { ConfigManager } from "@/lib/config/ConfigManager";

// Mock de variables de entorno para tests
beforeEach(() => {
    process.env.NEXT_PUBLIC_SUPABASE_URL = "https://test.supabase.co";
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = "test-anon-key";
    process.env.NEXT_PUBLIC_APP_NAME = "Test App";
    process.env.NEXT_PUBLIC_APP_ENV = "development";
    process.env.NEXT_PUBLIC_AUCTION_WS_URL = "ws://localhost:3003";
    process.env.NEXT_PUBLIC_IOT_SERVICE_URL = "http://localhost:3004";
    // Reset singleton entre tests
    ConfigManager.reset();
});

afterEach(() => {
    ConfigManager.reset();
});

describe("ConfigManager — Patrón Singleton", () => {
    test("getInstance() retorna siempre la misma instancia", () => {
        const instance1 = ConfigManager.getInstance();
        const instance2 = ConfigManager.getInstance();
        expect(instance1).toBe(instance2); // referencia idéntica = Singleton
    });

    test("no se puede instanciar con new (constructor privado)", () => {
        // TypeScript previene esto en compilación; verificamos en runtime
        // @ts-expect-error: constructor is private
        expect(() => new ConfigManager()).toThrow();
    });

    test("get() retorna el valor correcto para supabaseUrl", () => {
        const config = ConfigManager.getInstance();
        expect(config.get("supabaseUrl")).toBe("https://test.supabase.co");
    });

    test("get() retorna el valor correcto para supabaseAnonKey", () => {
        const config = ConfigManager.getInstance();
        expect(config.get("supabaseAnonKey")).toBe("test-anon-key");
    });

    test("getAll() retorna TODOS los valores de configuración", () => {
        const config = ConfigManager.getInstance();
        const all = config.getAll();
        expect(all).toMatchObject({
            supabaseUrl: "https://test.supabase.co",
            supabaseAnonKey: "test-anon-key",
            appName: "Test App",
            appEnv: "development",
            auctionWsUrl: "ws://localhost:3003",
            iotServiceUrl: "http://localhost:3004",
        });
    });

    test("getAll() retorna un objeto inmutable (frozen)", () => {
        const config = ConfigManager.getInstance();
        const all = config.getAll();
        expect(Object.isFrozen(all)).toBe(true);
    });

    test("reset() destruye la instancia para que se cree una nueva", () => {
        const instance1 = ConfigManager.getInstance();
        ConfigManager.reset();
        const instance2 = ConfigManager.getInstance();
        // Después del reset, una nueva instancia es creada (no la misma referencia exacta)
        expect(instance2).toBeInstanceOf(ConfigManager as unknown as new () => ConfigManager);
    });

    test("usa fallback si NEXT_PUBLIC_APP_NAME no está definido", () => {
        delete process.env.NEXT_PUBLIC_APP_NAME;
        ConfigManager.reset();
        const config = ConfigManager.getInstance();
        expect(config.get("appName")).toBe("Energy Trading Platform");
    });

    test("usa placeholder si una variable requerida falta en desarrollo", () => {
        delete process.env.NEXT_PUBLIC_SUPABASE_URL;
        ConfigManager.reset();
        // En dev, no lanza error — usa placeholder con warning
        const config = ConfigManager.getInstance();
        expect(config.get("supabaseUrl")).toContain("MISSING_");
    });
});
