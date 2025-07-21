import { z } from "zod";
import dotenv from "dotenv";

// Initialize environment variables
dotenv.config();

// Configuration schema with comprehensive validation
const ConfigSchema = z.object({
	// Server configuration
	port: z.coerce.number().min(1).max(65535).default(3000),
	
	// Required Discord configuration
	discordWebhookUrl: z.url({
		message: "DISCORD_WEBHOOK_URL must be a valid URL"
	}),
	
	// Optional Linear webhook secret (for signature verification)
	linearWebhookSecret: z.string().optional(),
	
	// Environment configuration
	nodeEnv: z.enum(["development", "production", "test"]).default("development"),
	
	// Logging configuration
	logLevel: z.enum(["debug", "info", "warn", "error"]).default("info"),
	
	// Discord webhook configuration
	discord: z.object({
		maxRetries: z.coerce.number().min(0).max(10).default(3),
		retryDelay: z.coerce.number().min(100).max(30000).default(1000), // ms
		timeout: z.coerce.number().min(1000).max(60000).default(30000), // ms
		rateLimitBuffer: z.coerce.number().min(0).max(1000).default(100), // ms buffer
	}),
	
	// Linear webhook configuration
	linear: z.object({
		signatureTimeWindow: z.coerce.number().min(30).max(600).default(60), // seconds
		maxPayloadSize: z.coerce.number().min(1024).max(10485760).default(1048576), // 1MB default
	}),
	
	// Security configuration
	security: z.object({
		enableSignatureVerification: z.coerce.boolean().default(true),
		enableRateLimiting: z.coerce.boolean().default(true),
		maxRequestsPerMinute: z.coerce.number().min(1).max(1000).default(60),
		enableDetailedHealthCheck: z.coerce.boolean().default(false), // Detailed health info (debug only)
		enableMetricsEndpoints: z.coerce.boolean().default(false), // Metrics endpoints (debug only)
	}),
});

// Parse and validate configuration
function loadConfig() {
	const rawConfig = {
		port: process.env.PORT,
		discordWebhookUrl: process.env.DISCORD_WEBHOOK_URL,
		linearWebhookSecret: process.env.LINEAR_WEBHOOK_SECRET,
		nodeEnv: process.env.NODE_ENV,
		logLevel: process.env.LOG_LEVEL,
		
		// Discord configuration
		discord: {
			maxRetries: process.env.DISCORD_MAX_RETRIES,
			retryDelay: process.env.DISCORD_RETRY_DELAY,
			timeout: process.env.DISCORD_TIMEOUT,
			rateLimitBuffer: process.env.DISCORD_RATE_LIMIT_BUFFER,
		},
		
		// Linear configuration
		linear: {
			signatureTimeWindow: process.env.LINEAR_SIGNATURE_TIME_WINDOW,
			maxPayloadSize: process.env.LINEAR_MAX_PAYLOAD_SIZE,
		},
		
		// Security configuration
		security: {
			enableSignatureVerification: process.env.ENABLE_SIGNATURE_VERIFICATION,
			enableRateLimiting: process.env.ENABLE_RATE_LIMITING,
			maxRequestsPerMinute: process.env.MAX_REQUESTS_PER_MINUTE,
			enableDetailedHealthCheck: process.env.ENABLE_DETAILED_HEALTH_CHECK,
			enableMetricsEndpoints: process.env.ENABLE_METRICS_ENDPOINTS,
		},
	};

	try {
		const config = ConfigSchema.parse(rawConfig);
		
		// Validate configuration consistency
		validateConfigurationConsistency(config);
		
		return config;
	} catch (error) {
		if (error instanceof z.ZodError) {
			console.error("❌ Configuration validation failed:");
			error.issues.forEach((issue) => {
				const path = issue.path.join('.');
				console.error(`  • ${path}: ${issue.message}`);
			});
			console.error("\n📝 Required environment variables:");
			console.error("  • DISCORD_WEBHOOK_URL (required)");
			console.error("  • LINEAR_WEBHOOK_SECRET (recommended)");
			console.error("\n🔧 Optional environment variables:");
			console.error("  • PORT (default: 3000)");
			console.error("  • NODE_ENV (default: development)");
			console.error("  • LOG_LEVEL (default: info)");
			console.error("  • DISCORD_MAX_RETRIES (default: 3)");
			console.error("  • DISCORD_RETRY_DELAY (default: 1000)");
			console.error("  • DISCORD_TIMEOUT (default: 30000)");
			console.error("  • LINEAR_SIGNATURE_TIME_WINDOW (default: 60)");
			console.error("  • ENABLE_SIGNATURE_VERIFICATION (default: true)");
			console.error("  • ENABLE_RATE_LIMITING (default: true)");
			console.error("  • MAX_REQUESTS_PER_MINUTE (default: 60)");
			console.error("  • ENABLE_DETAILED_HEALTH_CHECK (default: false, security risk if enabled)");
			console.error("  • ENABLE_METRICS_ENDPOINTS (default: false, debug only)");
		} else {
			console.error("❌ Unexpected configuration error:", error);
		}
		
		process.exit(1);
	}
}

// Validate configuration consistency and warn about potential issues
function validateConfigurationConsistency(config: Config) {
	// Warn if signature verification is disabled
	if (!config.linearWebhookSecret || !config.security.enableSignatureVerification) {
		console.warn("⚠️  WARNING: Linear webhook signature verification is disabled!");
		console.warn("   This makes your webhook endpoint vulnerable to spoofed requests.");
		console.warn("   Set LINEAR_WEBHOOK_SECRET environment variable to enable verification.");
	}
	
	// Warn about development configuration in production
	if (config.nodeEnv === "production") {
		if (config.logLevel === "debug") {
			console.warn("⚠️  WARNING: Debug logging enabled in production environment.");
		}
		if (!config.security.enableRateLimiting) {
			console.warn("⚠️  WARNING: Rate limiting disabled in production environment.");
		}
		if (config.security.enableDetailedHealthCheck) {
			console.warn("⚠️  SECURITY WARNING: Detailed health check enabled in production! This exposes system information.");
		}
		if (config.security.enableMetricsEndpoints) {
			console.warn("⚠️  SECURITY WARNING: Metrics endpoints enabled in production! This should only be used for debugging.");
		}
	}
	
	// Info about current configuration
	console.log("✅ Configuration loaded successfully:");
	console.log(`   • Environment: ${config.nodeEnv}`);
	console.log(`   • Port: ${config.port}`);
	console.log(`   • Log Level: ${config.logLevel}`);
	console.log(`   • Signature Verification: ${config.security.enableSignatureVerification ? 'enabled' : 'disabled'}`);
	console.log(`   • Rate Limiting: ${config.security.enableRateLimiting ? 'enabled' : 'disabled'}`);
	console.log(`   • Detailed Health Check: ${config.security.enableDetailedHealthCheck ? '⚠️  enabled' : 'disabled'}`);
	console.log(`   • Metrics Endpoints: ${config.security.enableMetricsEndpoints ? '⚠️  enabled' : 'disabled'}`);
	console.log(`   • Discord Max Retries: ${config.discord.maxRetries}`);
}

// Export the configuration
export const config = loadConfig();

// Export the configuration type
export type Config = z.infer<typeof ConfigSchema>;

// Export individual configuration sections for easier imports
export const { port, discordWebhookUrl, linearWebhookSecret, nodeEnv, logLevel } = config;
export const { discord, linear, security } = config;