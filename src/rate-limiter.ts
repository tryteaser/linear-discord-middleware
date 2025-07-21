import { type Request, type Response, type NextFunction } from "express";
import { config } from "./config.js";

/**
 * Simple in-memory rate limiter for webhook endpoints
 */
export class RateLimiter {
	private requests: Map<string, number[]> = new Map();
	private readonly windowMs = 60 * 1000; // 1 minute window
	private readonly maxRequests: number;

	constructor(maxRequests?: number) {
		this.maxRequests = maxRequests || config.security.maxRequestsPerMinute;
	}

	/**
	 * Express middleware for rate limiting
	 */
	middleware = (req: Request, res: Response, next: NextFunction): void => {
		if (!config.security.enableRateLimiting) {
			return next();
		}

		const clientId = this.getClientIdentifier(req);
		const now = Date.now();
		
		// Get or create request history for this client
		let requestTimes = this.requests.get(clientId) || [];
		
		// Remove requests outside the time window
		requestTimes = requestTimes.filter(time => now - time < this.windowMs);
		
		// Check if client has exceeded rate limit
		if (requestTimes.length >= this.maxRequests) {
			const oldestRequest = Math.min(...requestTimes);
			const resetTime = oldestRequest + this.windowMs;
			const retryAfter = Math.ceil((resetTime - now) / 1000);

			console.warn(`⚠️  Rate limit exceeded for client ${clientId}. Requests: ${requestTimes.length}/${this.maxRequests}`);
			
			res.set({
				'X-RateLimit-Limit': this.maxRequests.toString(),
				'X-RateLimit-Remaining': '0',
				'X-RateLimit-Reset': Math.ceil(resetTime / 1000).toString(),
				'Retry-After': retryAfter.toString(),
			});
			
			res.status(429).json({
				error: 'Too Many Requests',
				message: `Rate limit exceeded. Maximum ${this.maxRequests} requests per minute allowed.`,
				retryAfter: retryAfter,
			});
			return;
		}
		
		// Add current request time
		requestTimes.push(now);
		this.requests.set(clientId, requestTimes);
		
		// Set rate limit headers
		res.set({
			'X-RateLimit-Limit': this.maxRequests.toString(),
			'X-RateLimit-Remaining': (this.maxRequests - requestTimes.length).toString(),
			'X-RateLimit-Reset': Math.ceil((now + this.windowMs) / 1000).toString(),
		});
		
		// Log rate limiting info in debug mode
		if (config.logLevel === 'debug') {
			console.log(`📊 Rate limit status for ${clientId}: ${requestTimes.length}/${this.maxRequests} requests`);
		}
		
		next();
	};

	/**
	 * Get client identifier for rate limiting
	 */
	private getClientIdentifier(req: Request): string {
		// Try to get client IP, considering proxies
		const forwarded = req.headers['x-forwarded-for'] as string;
		const clientIp = forwarded ? forwarded.split(',')[0].trim() : req.socket.remoteAddress;
		
		// Use IP + User-Agent for better client identification
		const userAgent = req.headers['user-agent'] || 'unknown';
		return `${clientIp}:${userAgent}`.substring(0, 200); // Limit length
	}

	/**
	 * Clean up old entries (call periodically to prevent memory leaks)
	 */
	cleanup(): void {
		const now = Date.now();
		for (const [clientId, requestTimes] of this.requests.entries()) {
			const validRequests = requestTimes.filter(time => now - time < this.windowMs);
			if (validRequests.length === 0) {
				this.requests.delete(clientId);
			} else {
				this.requests.set(clientId, validRequests);
			}
		}
		
		if (config.logLevel === 'debug') {
			console.log(`🧹 Rate limiter cleanup: ${this.requests.size} active clients`);
		}
	}

	/**
	 * Get current rate limit stats
	 */
	getStats(): { totalClients: number; totalRequests: number } {
		let totalRequests = 0;
		for (const requestTimes of this.requests.values()) {
			totalRequests += requestTimes.length;
		}
		
		return {
			totalClients: this.requests.size,
			totalRequests,
		};
	}
}

// Create singleton instance
export const rateLimiter = new RateLimiter();

// Set up periodic cleanup (every 5 minutes)
setInterval(() => {
	rateLimiter.cleanup();
}, 5 * 60 * 1000);