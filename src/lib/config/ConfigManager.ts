/**
 * ============================================================
 * PATRÓN: SINGLETON — ConfigManager
 * ============================================================
 * Garantiza una única instancia de la configuración de la app
 * en todo el ciclo de vida de Next.js.
 *
 * Uso:
 *   const config = ConfigManager.getInstance();
 *   config.get('supabaseUrl');
 * ============================================================
 */

export interface AppConfig {
    supabaseUrl: string;
    supabaseAnonKey: string;
    appName: string;
    appEnv: "development" | "staging" | "production";
    auctionWsUrl: string;
    iotServiceUrl: string;
}

export class ConfigManager {
    // ── Instancia única (Singleton) ──────────────────────────
    private static instance: ConfigManager | null = null;

    private readonly config: AppConfig;

    // Constructor privado: nadie puede hacer `new ConfigManager()`
    private constructor() {
        this.config = {
            supabaseUrl: this.requireEnv("NEXT_PUBLIC_SUPABASE_URL"),
            supabaseAnonKey: this.requireEnv("NEXT_PUBLIC_SUPABASE_ANON_KEY"),
            appName:
                process.env.NEXT_PUBLIC_APP_NAME ?? "Energy Trading Platform",
            appEnv: (process.env.NEXT_PUBLIC_APP_ENV as AppConfig["appEnv"]) ?? "development",
            auctionWsUrl:
                process.env.NEXT_PUBLIC_AUCTION_WS_URL ?? "ws://localhost:3003",
            iotServiceUrl:
                process.env.NEXT_PUBLIC_IOT_SERVICE_URL ?? "http://localhost:3004",
        };
    }

    /**
     * Punto de acceso global a la única instancia.
     * Thread-safe en entornos de servidor gracias a JS single-thread.
     */
    public static getInstance(): ConfigManager {
        if (!ConfigManager.instance) {
            ConfigManager.instance = new ConfigManager();
        }
        return ConfigManager.instance;
    }

    /** Retorna un valor de configuración tipado */
    public get<K extends keyof AppConfig>(key: K): AppConfig[K] {
        return this.config[key];
    }

    /** Retorna toda la configuración (solo lectura) */
    public getAll(): Readonly<AppConfig> {
        return Object.freeze({ ...this.config });
    }

    /** Valida que una variable de entorno existe */
    private requireEnv(key: string): string {
        const value = process.env[key];
        if (!value) {
            // En desarrollo muestra advertencia; en producción lanza error
            if (process.env.NEXT_PUBLIC_APP_ENV === "production") {
                throw new Error(`[ConfigManager] Missing required env variable: ${key}`);
            }
            console.warn(`[ConfigManager] ⚠️  Missing env: ${key} — using placeholder`);
            return `MISSING_${key}`;
        }
        return value;
    }

    /** Destruye la instancia (útil para tests) */
    public static reset(): void {
        ConfigManager.instance = null;
    }
}

// _Singleton
