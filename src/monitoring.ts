import { type Request, type Response } from "express";
import { config } from "./config.js";
import { rateLimiter } from "./rate-limiter.js";
import { discordClient } from "./discord-client.js";

/**
 * Metrics collector for monitoring system performance and health
 */
export class MetricsCollector {
	private static readonly startTime = Date.now();
	private static metrics = {
		webhooks: {
			total: 0,
			successful: 0,
			failed: 0,
			byType: new Map<string, number>(),
			byAction: new Map<string, number>(),
			processingTimes: [] as number[],
		},
		discord: {
			total: 0,
			successful: 0,
			failed: 0,
			retries: 0,
			rateLimitHits: 0,
			averageResponseTime: 0,
			responseTimes: [] as number[],
		},
		security: {
			signatureVerificationFailed: 0,
			rateLimitHits: 0,
			invalidPayloads: 0,
			oversizedRequests: 0,
		},
		system: {
			uptime: 0,
			memoryUsage: {} as NodeJS.MemoryUsage,
			cpuUsage: {} as NodeJS.CpuUsage,
		},
	};

	/**
	 * Record webhook processing metrics
	 */
	static recordWebhook(type: string, action: string, processingTime: number, success: boolean): void {
		this.metrics.webhooks.total++;
		
		if (success) {
			this.metrics.webhooks.successful++;
		} else {
			this.metrics.webhooks.failed++;
		}

		// Track by type and action
		const typeCount = this.metrics.webhooks.byType.get(type) || 0;
		this.metrics.webhooks.byType.set(type, typeCount + 1);

		const actionCount = this.metrics.webhooks.byAction.get(action) || 0;
		this.metrics.webhooks.byAction.set(action, actionCount + 1);

		// Track processing times (keep last 100)
		this.metrics.webhooks.processingTimes.push(processingTime);
		if (this.metrics.webhooks.processingTimes.length > 100) {
			this.metrics.webhooks.processingTimes.shift();
		}
	}

	/**
	 * Record Discord delivery metrics
	 */
	static recordDiscordDelivery(success: boolean, responseTime: number, retryCount: number = 0, rateLimited: boolean = false): void {
		this.metrics.discord.total++;
		
		if (success) {
			this.metrics.discord.successful++;
		} else {
			this.metrics.discord.failed++;
		}

		if (retryCount > 0) {
			this.metrics.discord.retries += retryCount;
		}

		if (rateLimited) {
			this.metrics.discord.rateLimitHits++;
		}

		// Track response times (keep last 100)
		this.metrics.discord.responseTimes.push(responseTime);
		if (this.metrics.discord.responseTimes.length > 100) {
			this.metrics.discord.responseTimes.shift();
		}

		// Update average response time
		if (this.metrics.discord.responseTimes.length > 0) {
			const sum = this.metrics.discord.responseTimes.reduce((a, b) => a + b, 0);
			this.metrics.discord.averageResponseTime = Math.round(sum / this.metrics.discord.responseTimes.length);
		}
	}

	/**
	 * Record security event metrics
	 */
	static recordSecurityEvent(type: 'signature_failed' | 'rate_limited' | 'invalid_payload' | 'oversized_request'): void {
		switch (type) {
			case 'signature_failed':
				this.metrics.security.signatureVerificationFailed++;
				break;
			case 'rate_limited':
				this.metrics.security.rateLimitHits++;
				break;
			case 'invalid_payload':
				this.metrics.security.invalidPayloads++;
				break;
			case 'oversized_request':
				this.metrics.security.oversizedRequests++;
				break;
		}
	}

	/**
	 * Update system metrics
	 */
	private static updateSystemMetrics(): void {
		this.metrics.system.uptime = Date.now() - this.startTime;
		this.metrics.system.memoryUsage = process.memoryUsage();
		this.metrics.system.cpuUsage = process.cpuUsage();
	}

	/**
	 * Get comprehensive metrics data
	 */
	static getMetrics(): typeof MetricsCollector.metrics & { timestamp: number } {
		this.updateSystemMetrics();
		
		return {
			...this.metrics,
			timestamp: Date.now(),
		};
	}

	/**
	 * Get metrics summary for health checks
	 */
	static getSummary(): {
		status: string;
		uptime: string;
		webhooks: { total: number; successRate: string; avgProcessingTime: string };
		discord: { total: number; successRate: string; avgResponseTime: string };
		security: { totalIssues: number };
		memory: string;
	} {
		this.updateSystemMetrics();
		
		const uptimeMs = this.metrics.system.uptime;
		const uptimeStr = `${Math.floor(uptimeMs / 3600000)}h ${Math.floor((uptimeMs % 3600000) / 60000)}m ${Math.floor((uptimeMs % 60000) / 1000)}s`;
		
		const webhookSuccessRate = this.metrics.webhooks.total > 0 
			? `${Math.round((this.metrics.webhooks.successful / this.metrics.webhooks.total) * 100)}%`
			: "0%";
		
		const discordSuccessRate = this.metrics.discord.total > 0
			? `${Math.round((this.metrics.discord.successful / this.metrics.discord.total) * 100)}%`
			: "0%";

		const avgProcessingTime = this.metrics.webhooks.processingTimes.length > 0
			? `${Math.round(this.metrics.webhooks.processingTimes.reduce((a, b) => a + b, 0) / this.metrics.webhooks.processingTimes.length)}ms`
			: "0ms";

		const totalSecurityIssues = this.metrics.security.signatureVerificationFailed + 
			this.metrics.security.rateLimitHits + 
			this.metrics.security.invalidPayloads + 
			this.metrics.security.oversizedRequests;

		return {
			status: this.getHealthStatus(),
			uptime: uptimeStr,
			webhooks: {
				total: this.metrics.webhooks.total,
				successRate: webhookSuccessRate,
				avgProcessingTime,
			},
			discord: {
				total: this.metrics.discord.total,
				successRate: discordSuccessRate,
				avgResponseTime: `${this.metrics.discord.averageResponseTime}ms`,
			},
			security: {
				totalIssues: totalSecurityIssues,
			},
			memory: `${Math.round(this.metrics.system.memoryUsage.rss / 1024 / 1024)}MB`,
		};
	}

	/**
	 * Determine overall health status
	 */
	private static getHealthStatus(): string {
		const webhookFailureRate = this.metrics.webhooks.total > 0 
			? this.metrics.webhooks.failed / this.metrics.webhooks.total 
			: 0;
		
		const discordFailureRate = this.metrics.discord.total > 0
			? this.metrics.discord.failed / this.metrics.discord.total
			: 0;

		const memoryUsage = this.metrics.system.memoryUsage.rss / (1024 * 1024 * 1024); // GB

		// Determine status based on failure rates and system resources
		if (webhookFailureRate > 0.5 || discordFailureRate > 0.5 || memoryUsage > 1) {
			return "unhealthy";
		} else if (webhookFailureRate > 0.1 || discordFailureRate > 0.1 || memoryUsage > 0.5) {
			return "degraded";
		} else {
			return "healthy";
		}
	}

	/**
	 * Reset metrics (useful for testing or periodic resets)
	 */
	static reset(): void {
		this.metrics = {
			webhooks: {
				total: 0,
				successful: 0,
				failed: 0,
				byType: new Map<string, number>(),
				byAction: new Map<string, number>(),
				processingTimes: [],
			},
			discord: {
				total: 0,
				successful: 0,
				failed: 0,
				retries: 0,
				rateLimitHits: 0,
				averageResponseTime: 0,
				responseTimes: [],
			},
			security: {
				signatureVerificationFailed: 0,
				rateLimitHits: 0,
				invalidPayloads: 0,
				oversizedRequests: 0,
			},
			system: {
				uptime: 0,
				memoryUsage: {} as NodeJS.MemoryUsage,
				cpuUsage: {} as NodeJS.CpuUsage,
			},
		};
	}
}

/**
 * Structured logger for better log management and analysis
 */
export class StructuredLogger {
	private static logLevel = config.logLevel;

	/**
	 * Log with structured data
	 */
	private static log(level: string, message: string, data?: any): void {
		const timestamp = new Date().toISOString();
		const logEntry = {
			timestamp,
			level: level.toUpperCase(),
			message,
			service: "linear-discord-middleware",
			environment: config.nodeEnv,
			...(data && { data }),
		};

		// Output as JSON in production for better parsing
		if (config.nodeEnv === "production") {
			console.log(JSON.stringify(logEntry));
		} else {
			// Human-readable format in development
			const dataStr = data ? ` | ${JSON.stringify(data, null, 2)}` : "";
			console.log(`[${timestamp}] ${level.toUpperCase()}: ${message}${dataStr}`);
		}
	}

	static info(message: string, data?: any): void {
		if (["debug", "info"].includes(this.logLevel)) {
			this.log("info", message, data);
		}
	}

	static warn(message: string, data?: any): void {
		if (["debug", "info", "warn"].includes(this.logLevel)) {
			this.log("warn", message, data);
		}
	}

	static error(message: string, data?: any): void {
		this.log("error", message, data);
	}

	static debug(message: string, data?: any): void {
		if (this.logLevel === "debug") {
			this.log("debug", message, data);
		}
	}

	/**
	 * Log webhook processing events
	 */
	static logWebhookEvent(type: string, action: string, processingTime: number, success: boolean, data?: any): void {
		const message = `Webhook processed: ${type} ${action} (${processingTime}ms)`;
		const logData = {
			webhook: { type, action, processingTime, success },
			...(data && { details: data }),
		};

		if (success) {
			this.info(message, logData);
		} else {
			this.error(message, logData);
		}
	}

	/**
	 * Log Discord delivery events
	 */
	static logDiscordEvent(success: boolean, responseTime: number, retryCount: number = 0, data?: any): void {
		const message = `Discord delivery ${success ? 'successful' : 'failed'} (${responseTime}ms, ${retryCount} retries)`;
		const logData = {
			discord: { success, responseTime, retryCount },
			...(data && { details: data }),
		};

		if (success) {
			this.info(message, logData);
		} else {
			this.error(message, logData);
		}
	}

	/**
	 * Log security events
	 */
	static logSecurityEvent(type: string, clientIp: string, userAgent: string, data?: any): void {
		const message = `Security event: ${type}`;
		const logData = {
			security: { type, clientIp, userAgent },
			...(data && { details: data }),
		};

		this.warn(message, logData);
	}
}

/**
 * Monitoring endpoints controller
 */
export class MonitoringController {
	/**
	 * Minimal, secure health check endpoint (safe for production)
	 */
	static healthCheck(_req: Request, res: Response): void {
		const summary = MetricsCollector.getSummary();
		const statusCode = summary.status === "healthy" ? 200 : 
			summary.status === "degraded" ? 206 : 503;

		// Minimal response - only essential status information
		res.status(statusCode).json({
			status: summary.status,
			timestamp: new Date().toISOString(),
			service: "linear-discord-middleware",
		});
	}

	/**
	 * Detailed health check with system information (debug only)
	 */
	static detailedHealthCheck(_req: Request, res: Response): void {
		if (!config.security.enableDetailedHealthCheck) {
			res.status(404).json({
				error: "Not Found",
				message: "Detailed health check is disabled for security reasons.",
			});
			return;
		}

		const summary = MetricsCollector.getSummary();
		const statusCode = summary.status === "healthy" ? 200 : 
			summary.status === "degraded" ? 206 : 503;

		res.status(statusCode).json({
			status: summary.status,
			timestamp: new Date().toISOString(),
			uptime: summary.uptime,
			version: process.version,
			environment: config.nodeEnv,
			service: "linear-discord-middleware",
			metrics: summary,
		});
	}

	/**
	 * Detailed metrics endpoint (debug only)
	 */
	static detailedMetrics(_req: Request, res: Response): void {
		if (!config.security.enableMetricsEndpoints) {
			res.status(404).json({
				error: "Not Found",
				message: "Metrics endpoints are disabled for security reasons.",
			});
			return;
		}

		const metrics = MetricsCollector.getMetrics();
		
		// Convert Maps to objects for JSON serialization
		const serializedMetrics = {
			...metrics,
			webhooks: {
				...metrics.webhooks,
				byType: Object.fromEntries(metrics.webhooks.byType),
				byAction: Object.fromEntries(metrics.webhooks.byAction),
			},
		};

		res.status(200).json({
			service: "linear-discord-middleware",
			environment: config.nodeEnv,
			timestamp: new Date().toISOString(),
			metrics: serializedMetrics,
		});
	}

	/**
	 * Rate limiter status endpoint (debug only)
	 */
	static rateLimiterStatus(_req: Request, res: Response): void {
		if (!config.security.enableMetricsEndpoints) {
			res.status(404).json({
				error: "Not Found",
				message: "Metrics endpoints are disabled for security reasons.",
			});
			return;
		}

		const stats = rateLimiter.getStats();
		const rateLimitInfo = discordClient.getRateLimitInfo();

		res.status(200).json({
			timestamp: new Date().toISOString(),
			rateLimiter: {
				enabled: config.security.enableRateLimiting,
				maxRequestsPerMinute: config.security.maxRequestsPerMinute,
				currentStats: stats,
			},
			discordRateLimit: rateLimitInfo,
		});
	}

	/**
	 * Configuration status endpoint (debug only)
	 */
	static configStatus(_req: Request, res: Response): void {
		if (!config.security.enableMetricsEndpoints) {
			res.status(404).json({
				error: "Not Found",
				message: "Metrics endpoints are disabled for security reasons.",
			});
			return;
		}

		res.status(200).json({
			timestamp: new Date().toISOString(),
			configuration: {
				environment: config.nodeEnv,
				logLevel: config.logLevel,
				port: config.port,
				features: {
					signatureVerification: config.security.enableSignatureVerification,
					rateLimiting: config.security.enableRateLimiting,
					detailedHealthCheck: config.security.enableDetailedHealthCheck,
					metricsEndpoints: config.security.enableMetricsEndpoints,
					discordRetries: config.discord.maxRetries,
					discordTimeout: config.discord.timeout,
				},
				limits: {
					maxRequestsPerMinute: config.security.maxRequestsPerMinute,
					maxPayloadSize: config.linear.maxPayloadSize,
					signatureTimeWindow: config.linear.signatureTimeWindow,
				},
			},
		});
	}
}