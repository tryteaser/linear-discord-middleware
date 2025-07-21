import { type Request, type Response, type NextFunction } from "express";
import { config } from "./config.js";

/**
 * Security middleware for enhanced protection
 */
export class SecurityMiddleware {
	/**
	 * Minimal security headers for webhook middleware
	 */
	static securityHeaders(req: Request, res: Response, next: NextFunction): void {
		// Remove server header to avoid revealing technology stack
		res.removeHeader('X-Powered-By');
		
		// Cache control for webhook and monitoring endpoints (prevent sensitive data caching)
		if (req.path.includes('webhook') || req.path.startsWith('/health') || req.path.startsWith('/metrics')) {
			res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, private');
		}
		
		next();
	}

	/**
	 * Request size limiter middleware
	 */
	static requestSizeLimit(req: Request, res: Response, next: NextFunction): void {
		const contentLength = parseInt(req.headers['content-length'] || '0', 10);
		
		if (contentLength > config.linear.maxPayloadSize) {
			console.warn(`⚠️  Request too large: ${contentLength} bytes (max: ${config.linear.maxPayloadSize})`);
			res.status(413).json({
				error: 'Payload Too Large',
				message: `Request payload exceeds maximum size of ${config.linear.maxPayloadSize} bytes`,
			});
			return;
		}
		
		next();
	}

	/**
	 * Request validation middleware for webhook endpoints
	 */
	static webhookValidation(req: Request, res: Response, next: NextFunction): void {
		// Check Content-Type
		const contentType = req.headers['content-type'];
		if (!contentType || !contentType.includes('application/json')) {
			console.warn(`⚠️  Invalid Content-Type: ${contentType || 'missing'}`);
			res.status(400).json({
				error: 'Invalid Content-Type',
				message: 'Content-Type must be application/json',
			});
			return;
		}

		// Check for required Linear webhook headers
		if (req.path.includes('linear-webhook')) {
			const userAgent = req.headers['user-agent'];
			const linearSignature = req.headers['linear-signature'];
			
			// Log webhook attempt details
			console.log(`🔍 Linear webhook attempt from User-Agent: ${userAgent || 'unknown'}`);
			
			// If signature verification is enabled, require the signature header
			if (config.security.enableSignatureVerification && config.linearWebhookSecret) {
				if (!linearSignature) {
					console.warn('⚠️  Missing Linear-Signature header');
					res.status(400).json({
						error: 'Missing Signature',
						message: 'Linear-Signature header is required',
					});
					return;
				}
			}
		}
		
		next();
	}

	/**
	 * Request logging middleware with security considerations
	 */
	static securityLogger(req: Request, res: Response, next: NextFunction): void {
		const timestamp = new Date().toISOString();
		const method = req.method;
		const url = req.url;
		const userAgent = req.headers['user-agent'] || 'unknown';
		const clientIp = SecurityMiddleware.getClientIP(req);
		
		// Log the request (be careful not to log sensitive data)
		console.log(`[${timestamp}] ${method} ${url} from ${clientIp} (${userAgent})`);
		
		// Track response time and status
		const startTime = Date.now();
		
		// Override res.end to log response details
		const originalEnd = res.end.bind(res);
		res.end = function(chunk?: any, encoding?: any, cb?: () => void) {
			const duration = Date.now() - startTime;
			const statusCode = res.statusCode;
			
			console.log(`[${timestamp}] ${method} ${url} - ${statusCode} (${duration}ms)`);
			
			// Log suspicious activities
			if (statusCode === 401 || statusCode === 403) {
				console.warn(`🚨 Security alert: ${statusCode} response for ${clientIp} on ${url}`);
			}
			
			if (statusCode === 429) {
				console.warn(`⚠️  Rate limit hit by ${clientIp} on ${url}`);
			}
			
			return originalEnd(chunk, encoding, cb);
		};
		
		next();
	}

	/**
	 * Error handling middleware with security considerations
	 */
	static errorHandler(error: any, req: Request, res: Response, _next: NextFunction): void {
		const timestamp = new Date().toISOString();
		const clientIp = SecurityMiddleware.getClientIP(req);
		
		// Log error details (be careful not to expose sensitive information)
		console.error(`[${timestamp}] Error processing ${req.method} ${req.url} from ${clientIp}:`, {
			message: error.message || 'Unknown error',
			name: error.name || 'Error',
			// Don't log error stack in production to avoid information disclosure
			...(config.nodeEnv !== 'production' && { stack: error.stack }),
		});
		
		// Send generic error response (don't expose internal error details)
		if (config.nodeEnv === 'production') {
			res.status(500).json({
				error: 'Internal Server Error',
				message: 'An unexpected error occurred',
				timestamp,
			});
		} else {
			// In development, provide more details for debugging
			res.status(500).json({
				error: error.name || 'Error',
				message: error.message || 'An unexpected error occurred',
				timestamp,
				...(error.stack && { stack: error.stack }),
			});
		}
	}

	/**
	 * Health check endpoint with basic system information
	 */
	static healthCheck(_req: Request, res: Response): void {
		const uptime = process.uptime();
		const memoryUsage = process.memoryUsage();
		
		res.status(200).json({
			status: 'healthy',
			timestamp: new Date().toISOString(),
			uptime: `${Math.floor(uptime / 60)}m ${Math.floor(uptime % 60)}s`,
			environment: config.nodeEnv,
			version: process.version,
			memory: {
				rss: `${Math.round(memoryUsage.rss / 1024 / 1024)}MB`,
				heapUsed: `${Math.round(memoryUsage.heapUsed / 1024 / 1024)}MB`,
				heapTotal: `${Math.round(memoryUsage.heapTotal / 1024 / 1024)}MB`,
			},
			security: {
				rateLimitingEnabled: config.security.enableRateLimiting,
				signatureVerificationEnabled: config.security.enableSignatureVerification,
			},
		});
	}

	/**
	 * Get client IP address considering proxies and load balancers
	 */
	private static getClientIP(req: Request): string {
		// Check various headers set by proxies and load balancers
		const forwarded = req.headers['x-forwarded-for'] as string;
		const realIp = req.headers['x-real-ip'] as string;
		const clientIp = req.headers['x-client-ip'] as string;
		
		if (forwarded) {
			// x-forwarded-for can contain multiple IPs, get the first one
			return forwarded.split(',')[0].trim();
		}
		
		if (realIp) {
			return realIp;
		}
		
		if (clientIp) {
			return clientIp;
		}
		
		// Fallback to socket remote address
		return req.socket.remoteAddress || 'unknown';
	}

	/**
	 * Request timeout middleware
	 */
	static requestTimeout(timeoutMs: number = 30000) {
		return (req: Request, res: Response, next: NextFunction): void => {
			// Set timeout for the request
			req.setTimeout(timeoutMs, () => {
				console.warn(`⚠️  Request timeout (${timeoutMs}ms) for ${req.method} ${req.url}`);
				if (!res.headersSent) {
					res.status(408).json({
						error: 'Request Timeout',
						message: `Request timed out after ${timeoutMs}ms`,
					});
				}
			});
			
			next();
		};
	}
}