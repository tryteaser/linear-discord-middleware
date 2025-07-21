import axios, { type AxiosError, type AxiosResponse } from "axios";
import { config } from "./config.js";

export interface DiscordWebhookPayload {
	username?: string;
	avatar_url?: string;
	content: string;
	embeds: DiscordEmbed[];
}

export interface DiscordEmbed {
	title: string;
	url?: string;
	description: string;
	color: number;
	fields?: Array<{
		name: string;
		value: string;
		inline?: boolean;
	}>;
	author?: {
		name: string;
		icon_url?: string;
		url?: string;
	};
	footer?: {
		text: string;
		icon_url?: string;
	};
	timestamp?: string;
}

interface RetryableError extends Error {
	retryAfter?: number; // seconds
	status?: number;
}

interface DiscordRateLimitInfo {
	limit?: number;
	remaining?: number;
	reset?: number;
	resetAfter?: number;
	bucket?: string;
	scope?: string;
}

class DiscordClient {
	private lastRequestTime = 0;
	private rateLimitInfo: DiscordRateLimitInfo = {};

	/**
	 * Sends a Discord webhook with exponential backoff retry logic
	 */
	async sendWebhook(url: string, payload: DiscordWebhookPayload): Promise<void> {
		let attempt = 0;
		let lastError: RetryableError | null = null;

		while (attempt <= config.discord.maxRetries) {
			try {
				// Apply rate limiting buffer before request
				await this.applyRateLimitBuffer();

				const response = await this.makeRequest(url, payload);
				
				// Update rate limit information from response headers
				this.updateRateLimitInfo(response);
				
				// Success - log and return
				console.log(`✅ Discord webhook sent successfully (attempt ${attempt + 1})`);
				return;

			} catch (error) {
				attempt++;
				lastError = this.parseError(error as AxiosError);

				console.warn(`⚠️  Discord webhook attempt ${attempt} failed:`, lastError.message);

				// Don't retry on certain errors
				if (!this.isRetryableError(lastError)) {
					throw lastError;
				}

				// Don't retry if we've exhausted our attempts
				if (attempt > config.discord.maxRetries) {
					break;
				}

				// Calculate delay with exponential backoff
				const delay = this.calculateDelay(attempt, lastError.retryAfter);
				console.log(`🔄 Retrying Discord webhook in ${delay}ms (attempt ${attempt + 1}/${config.discord.maxRetries + 1})`);
				
				await this.sleep(delay);
			}
		}

		// All retries exhausted
		throw new Error(
			`Discord webhook failed after ${config.discord.maxRetries + 1} attempts. Last error: ${lastError?.message}`
		);
	}

	/**
	 * Makes the actual HTTP request to Discord
	 */
	private async makeRequest(url: string, payload: DiscordWebhookPayload): Promise<AxiosResponse> {
		return axios.post(url, payload, {
			timeout: config.discord.timeout,
			headers: {
				'Content-Type': 'application/json',
				'User-Agent': 'Linear-Discord-Middleware/1.0',
			},
			// Don't throw on 4xx/5xx status codes - handle them ourselves
			validateStatus: () => true,
		});
	}

	/**
	 * Applies rate limiting buffer to prevent hitting Discord's rate limits
	 */
	private async applyRateLimitBuffer(): Promise<void> {
		const now = Date.now();
		const timeSinceLastRequest = now - this.lastRequestTime;
		
		// If we have rate limit information and we're close to the limit
		if (this.rateLimitInfo.remaining !== undefined && this.rateLimitInfo.remaining <= 1) {
			const resetTime = this.rateLimitInfo.reset ? this.rateLimitInfo.reset * 1000 : now + 1000;
			const waitTime = Math.max(0, resetTime - now + config.discord.rateLimitBuffer);
			
			if (waitTime > 0) {
				console.log(`⏳ Rate limit buffer: waiting ${waitTime}ms before Discord request`);
				await this.sleep(waitTime);
			}
		} else if (timeSinceLastRequest < config.discord.rateLimitBuffer) {
			// Basic rate limiting buffer
			const waitTime = config.discord.rateLimitBuffer - timeSinceLastRequest;
			console.log(`⏳ Basic rate limit buffer: waiting ${waitTime}ms`);
			await this.sleep(waitTime);
		}

		this.lastRequestTime = Date.now();
	}

	/**
	 * Updates rate limit information from Discord response headers
	 */
	private updateRateLimitInfo(response: AxiosResponse): void {
		const headers = response.headers;
		
		this.rateLimitInfo = {
			limit: headers['x-ratelimit-limit'] ? parseInt(headers['x-ratelimit-limit']) : undefined,
			remaining: headers['x-ratelimit-remaining'] ? parseInt(headers['x-ratelimit-remaining']) : undefined,
			reset: headers['x-ratelimit-reset'] ? parseInt(headers['x-ratelimit-reset']) : undefined,
			resetAfter: headers['x-ratelimit-reset-after'] ? parseFloat(headers['x-ratelimit-reset-after']) : undefined,
			bucket: headers['x-ratelimit-bucket'] || undefined,
			scope: headers['x-ratelimit-scope'] || undefined,
		};

		// Log rate limit info in debug mode
		if (config.logLevel === 'debug') {
			console.log('📊 Discord rate limit info:', this.rateLimitInfo);
		}
	}

	/**
	 * Parses axios errors into our internal error format
	 */
	private parseError(error: AxiosError): RetryableError {
		if (error.response) {
			// Server responded with error status
			const response = error.response;
			const retryableError = new Error(
				`Discord API error ${response.status}: ${response.statusText}`
			) as RetryableError;
			
			retryableError.status = response.status;

			// Handle rate limit (429) responses
			if (response.status === 429) {
				const retryAfter = response.headers['retry-after'];
				retryableError.retryAfter = retryAfter ? parseInt(retryAfter) : undefined;
				retryableError.message = `Discord rate limited. Retry after: ${retryAfter || 'unknown'}s`;
			}

			// Include response body if available for debugging
			if (response.data && config.logLevel === 'debug') {
				console.log('📝 Discord error response:', response.data);
			}

			return retryableError;
		} else if (error.code) {
			// Network error
			const networkError = new Error(`Network error: ${error.code}`) as RetryableError;
			return networkError;
		} else {
			// Unknown error
			const unknownError = new Error(`Unknown error: ${error.message}`) as RetryableError;
			return unknownError;
		}
	}

	/**
	 * Determines if an error is retryable
	 */
	private isRetryableError(error: RetryableError): boolean {
		// Always retry rate limits
		if (error.status === 429) {
			return true;
		}

		// Retry server errors (5xx)
		if (error.status && error.status >= 500 && error.status < 600) {
			return true;
		}

		// Retry network errors
		if (!error.status) {
			return true;
		}

		// Don't retry client errors (4xx except 429)
		if (error.status && error.status >= 400 && error.status < 500) {
			return false;
		}

		// Default to retrying for unknown cases
		return true;
	}

	/**
	 * Calculates exponential backoff delay
	 */
	private calculateDelay(attempt: number, retryAfter?: number): number {
		// If Discord tells us exactly when to retry, use that
		if (retryAfter) {
			return retryAfter * 1000 + config.discord.rateLimitBuffer;
		}

		// Exponential backoff: base delay * 2^attempt with jitter
		const baseDelay = config.discord.retryDelay;
		const exponentialDelay = baseDelay * Math.pow(2, attempt - 1);
		
		// Add jitter (±25%) to prevent thundering herd
		const jitter = exponentialDelay * 0.25 * (Math.random() * 2 - 1);
		const finalDelay = Math.max(baseDelay, exponentialDelay + jitter);
		
		// Cap at maximum reasonable delay (30 seconds)
		return Math.min(finalDelay, 30000);
	}

	/**
	 * Sleep utility
	 */
	private sleep(ms: number): Promise<void> {
		return new Promise(resolve => setTimeout(resolve, ms));
	}

	/**
	 * Gets current rate limit information
	 */
	getRateLimitInfo(): DiscordRateLimitInfo {
		return { ...this.rateLimitInfo };
	}
}

// Export singleton instance
export const discordClient = new DiscordClient();