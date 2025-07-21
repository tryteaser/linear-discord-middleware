import crypto from "node:crypto";
import bodyParser from "body-parser";
import express, { type Request, type Response } from "express";
import { z } from "zod";

import { type LinearIssue, type LinearComment, type LinearWebhookPayload, LinearWebhookPayloadSchema } from "./schemas.js";
import { config, port, discordWebhookUrl, linearWebhookSecret } from "./config.js";
import { discordClient, type DiscordWebhookPayload, type DiscordEmbed } from "./discord-client.js";
import { EmbedFactory } from "./embed-factory.js";
import { rateLimiter } from "./rate-limiter.js";
import { SecurityMiddleware } from "./security.js";
import { ContentOptimizer } from "./content-optimizer.js";
import { MetricsCollector, StructuredLogger, MonitoringController } from "./monitoring.js";

// Initialize Express app
const app = express();

// --- Security Middleware (applied first) ---
app.use(SecurityMiddleware.securityHeaders);
app.use(SecurityMiddleware.securityLogger);
app.use(SecurityMiddleware.requestTimeout(config.discord.timeout));

// --- Rate Limiting ---
app.use(rateLimiter.middleware);

// --- Request Validation ---
app.use(SecurityMiddleware.requestSizeLimit);

// Middleware for raw body parsing (for webhook signature verification)
app.use("/linear-webhook", SecurityMiddleware.webhookValidation);
app.use("/linear-webhook", bodyParser.raw({ type: "application/json" }));

// Use JSON parser for all other routes
app.use(bodyParser.json());


/**
 * Verifies the Linear webhook signature.
 */
function verifySignature(
	signature: string,
	payload: string,
	secret: string,
	webhookTimestamp: number,
): boolean {
	if (!secret || !config.security.enableSignatureVerification) {
		if (config.nodeEnv === "production") {
			console.warn(
				"⚠️  WARNING: Linear webhook signature verification is disabled in production!",
			);
		}
		return true; // If no secret is set or verification disabled, skip verification
	}

	try {
		// Check if the timestamp is recent (configurable time window) to prevent replay attacks
		const now = Date.now();
		const timeWindow = config.linear.signatureTimeWindow * 1000; // Convert to milliseconds
		if (Math.abs(now - webhookTimestamp) > timeWindow) {
			console.error(`Webhook timestamp is too old. Potential replay attack. Time window: ${config.linear.signatureTimeWindow}s`);
			return false;
		}

		// Calculate HMAC-SHA256 hash of the raw payload
		const hmac = crypto.createHmac("sha256", secret);
		hmac.update(payload);
		const digest = hmac.digest("hex");

		// Compare the calculated signature with the received signature
		// Use crypto.timingSafeEqual to prevent timing attacks
		const signatureBuffer = Buffer.from(signature);
		const digestBuffer = Buffer.from(digest);

		if (signatureBuffer.length !== digestBuffer.length) {
			return false;
		}

		return crypto.timingSafeEqual(signatureBuffer, digestBuffer);
	} catch (error) {
		console.error("Error verifying signature:", error);
		return false;
	}
}

// --- Webhook Endpoint ---
app.post("/linear-webhook", async (req: Request, res: Response) => {
	const startTime = Date.now();
	let webhookType = "unknown";
	let webhookAction = "unknown";
	
	try {
		const linearSignature = req.headers["linear-signature"] as string;

		// Since we're using bodyParser.raw for this route, req.body is a Buffer
		const rawBody = req.body.toString();
		const body = JSON.parse(rawBody);

		// Extract type and action early for logging
		webhookType = body.type || "unknown";
		webhookAction = body.action || "unknown";

		// Verify the signature before parsing the payload
		if (
			linearWebhookSecret &&
			!verifySignature(
				linearSignature,
				rawBody,
				linearWebhookSecret,
				body.webhookTimestamp,
			)
		) {
			MetricsCollector.recordSecurityEvent('signature_failed');
			StructuredLogger.logSecurityEvent('signature_verification_failed', 
				req.socket.remoteAddress || 'unknown',
				req.headers['user-agent'] || 'unknown',
				{ type: webhookType, action: webhookAction }
			);
			return res.status(401).send("Invalid signature");
		}

		// Log raw payload for debugging
		console.log("Raw webhook payload structure:", JSON.stringify(body, null, 2));

		// Parse and validate the payload with Zod
		const parsedPayload = LinearWebhookPayloadSchema.safeParse(body);

		if (!parsedPayload.success) {
			const processingTime = Date.now() - startTime;
			MetricsCollector.recordSecurityEvent('invalid_payload');
			MetricsCollector.recordWebhook(webhookType, webhookAction, processingTime, false);
			
			StructuredLogger.error("Invalid Linear webhook payload", {
				webhook: { type: webhookType, action: webhookAction, processingTime },
				validation: z.treeifyError(parsedPayload.error),
				payload: body,
			});
			
			return res.status(400).send({
				message: "Invalid webhook payload.",
				errors: z.treeifyError(parsedPayload.error),
			});
		}

		// Extract validated data
		const { action, data, updatedFrom, url, type } = parsedPayload.data;
		
		// Use url from payload or construct a fallback
		const entityUrl = url || EmbedFactory.constructFallbackUrl(type, data);

		// Create Discord embed and content using the factory
		let discordEmbed: DiscordEmbed;
		let discordMessageContent: string;

		// Handle different Linear entity types using the factory
		if (type === "Issue") {
			const issueData = data as LinearIssue;
			discordEmbed = EmbedFactory.createIssueEmbed(action, issueData, entityUrl, updatedFrom as Partial<LinearIssue>);
			discordMessageContent = EmbedFactory.generateContentMessage(type, action, issueData);
		} else if (type === "Comment") {
			const commentData = data as LinearComment;
			discordEmbed = EmbedFactory.createCommentEmbed(action, commentData, entityUrl);
			discordMessageContent = EmbedFactory.generateContentMessage(type, action, commentData);
		} else {
			// Handle other entity types with the factory
			discordEmbed = EmbedFactory.createEntityEmbed(type, action, data, entityUrl);
			discordMessageContent = EmbedFactory.generateContentMessage(type, action, data);
		}

		// Send Discord notification
		if (discordWebhookUrl) {
			const discordStartTime = Date.now();
			try {
				// Create initial payload
				const initialPayload: DiscordWebhookPayload = {
					username: "Linear Bot",
					avatar_url: "https://linear.app/static/linear-logo.png",
					content: discordMessageContent,
					embeds: [discordEmbed],
				};

				// Optimize content for Discord limits and better formatting
				const optimizedPayload = ContentOptimizer.optimizePayload(initialPayload);
				
				// Log optimization stats in debug mode
				if (config.logLevel === 'debug') {
					const stats = ContentOptimizer.getOptimizationStats(initialPayload, optimizedPayload);
					StructuredLogger.debug('Discord content optimization', {
						contentReduced: stats.contentReduced,
						embedsReduced: stats.embedsReduced,
						sizeSaved: `${stats.totalSizeReduction} chars`,
						originalSize: stats.originalSize,
						optimizedSize: stats.optimizedSize,
					});
				}

				await discordClient.sendWebhook(discordWebhookUrl, optimizedPayload);
				
				const discordResponseTime = Date.now() - discordStartTime;
				const processingTime = Date.now() - startTime;
				
				// Record successful metrics
				MetricsCollector.recordDiscordDelivery(true, discordResponseTime);
				MetricsCollector.recordWebhook(type, action, processingTime, true);
				
				StructuredLogger.logWebhookEvent(type, action, processingTime, true, {
					discordResponseTime,
					entityId: data.id,
				});
				
				res.status(200).send("Webhook processed and Discord notified.");
			} catch (error) {
				const discordResponseTime = Date.now() - discordStartTime;
				const processingTime = Date.now() - startTime;
				
				// Record failed metrics
				MetricsCollector.recordDiscordDelivery(false, discordResponseTime);
				MetricsCollector.recordWebhook(type, action, processingTime, false);
				
				StructuredLogger.logDiscordEvent(false, discordResponseTime, 0, {
					error: error instanceof Error ? error.message : String(error),
					entityType: type,
					entityId: data.id,
				});
				
				res.status(500).send("Failed to send Discord notification.");
			}
		} else {
			const processingTime = Date.now() - startTime;
			MetricsCollector.recordWebhook(type, action, processingTime, true);
			
			StructuredLogger.warn("Discord webhook URL not configured", {
				webhook: { type, action, processingTime },
			});
			
			res.status(200).send("Webhook processed but no Discord URL configured.");
		}
	} catch (error) {
		const processingTime = Date.now() - startTime;
		
		// Record failure metrics
		MetricsCollector.recordWebhook(webhookType, webhookAction, processingTime, false);
		
		// Structured error logging
		StructuredLogger.error("Webhook processing error", {
			webhook: { type: webhookType, action: webhookAction, processingTime },
			error: {
				message: error instanceof Error ? error.message : 'Unknown error',
				name: error instanceof Error ? error.name : 'Error',
				stack: config.nodeEnv !== 'production' && error instanceof Error ? error.stack : undefined,
			},
			request: {
				method: req.method,
				url: req.url,
				userAgent: req.headers['user-agent'],
				clientIp: req.socket.remoteAddress,
			},
		});
		
		res.status(500).send("Internal server error processing webhook");
	}
});

// Health check endpoints (secure by default)
app.get("/health", MonitoringController.healthCheck);

// Detailed health check (debug only - controlled by environment variable)
app.get("/health/detailed", MonitoringController.detailedHealthCheck);

// Debug/monitoring endpoints (disabled by default for security)
app.get("/metrics", MonitoringController.detailedMetrics);
app.get("/status/rate-limiter", MonitoringController.rateLimiterStatus);
app.get("/status/config", MonitoringController.configStatus);

// Add error handling middleware (should be last)
app.use(SecurityMiddleware.errorHandler);

// Start the server
app.listen(port, () => {
	console.log(`🚀 Linear Discord Middleware listening on port ${port}`);
	console.log(`📊 Environment: ${config.nodeEnv}`);
	console.log(`🔒 Security features:`);
	console.log(`   • Signature verification: ${config.security.enableSignatureVerification ? '✅ enabled' : '❌ disabled'}`);
	console.log(`   • Rate limiting: ${config.security.enableRateLimiting ? '✅ enabled' : '❌ disabled'}`);
});