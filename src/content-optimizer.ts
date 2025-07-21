import { type DiscordEmbed, type DiscordWebhookPayload } from "./discord-client.js";
import { config } from "./config.js";

/**
 * Discord content optimizer for better message formatting and limits
 */
export class ContentOptimizer {
	// Discord limits
	private static readonly LIMITS = {
		CONTENT_MAX: 2000,
		EMBED_TITLE_MAX: 256,
		EMBED_DESCRIPTION_MAX: 4096,
		EMBED_FIELD_NAME_MAX: 256,
		EMBED_FIELD_VALUE_MAX: 1024,
		EMBED_FOOTER_TEXT_MAX: 2048,
		EMBED_TOTAL_MAX: 6000, // Total characters across all embed fields
		EMBEDS_MAX: 10, // Max embeds per message
		FIELDS_MAX: 25, // Max fields per embed
	};

	/**
	 * Optimizes a Discord webhook payload for better formatting and compliance with limits
	 */
	static optimizePayload(payload: DiscordWebhookPayload): DiscordWebhookPayload {
		const optimized: DiscordWebhookPayload = {
			username: payload.username,
			avatar_url: payload.avatar_url,
			content: this.optimizeContent(payload.content),
			embeds: payload.embeds.map(embed => this.optimizeEmbed(embed)).slice(0, this.LIMITS.EMBEDS_MAX),
		};

		// Ensure total embed size is within limits
		optimized.embeds = this.ensureTotalEmbedSize(optimized.embeds);

		return optimized;
	}

	/**
	 * Optimizes content message with better formatting
	 */
	private static optimizeContent(content: string): string {
		if (!content) return "";

		// Apply text enhancements
		let optimized = content;

		// Enhance markdown formatting for better readability
		optimized = this.enhanceMarkdown(optimized);

		// Truncate if too long
		if (optimized.length > this.LIMITS.CONTENT_MAX) {
			optimized = this.truncateText(optimized, this.LIMITS.CONTENT_MAX - 3) + "...";
		}

		return optimized;
	}

	/**
	 * Optimizes a Discord embed for better formatting and compliance with limits
	 */
	private static optimizeEmbed(embed: DiscordEmbed): DiscordEmbed {
		const optimized: DiscordEmbed = {
			title: this.optimizeTitle(embed.title),
			url: embed.url,
			description: this.optimizeDescription(embed.description),
			color: embed.color,
			timestamp: embed.timestamp,
		};

		// Optimize fields
		if (embed.fields && embed.fields.length > 0) {
			optimized.fields = embed.fields
				.slice(0, this.LIMITS.FIELDS_MAX)
				.map(field => ({
					name: this.truncateText(field.name || "Field", this.LIMITS.EMBED_FIELD_NAME_MAX),
					value: this.optimizeFieldValue(field.value || "Empty"),
					inline: field.inline,
				}))
				.filter(field => field.name && field.value); // Remove empty fields
		}

		// Optimize footer
		if (embed.footer) {
			optimized.footer = {
				text: this.truncateText(embed.footer.text, this.LIMITS.EMBED_FOOTER_TEXT_MAX),
				icon_url: embed.footer.icon_url,
			};
		}

		return optimized;
	}

	/**
	 * Optimizes embed title with better formatting
	 */
	private static optimizeTitle(title: string): string {
		if (!title) return "";

		let optimized = title;

		// Add emoji enhancements for better visual appeal
		optimized = this.addTitleEmojis(optimized);

		// Truncate if too long
		if (optimized.length > this.LIMITS.EMBED_TITLE_MAX) {
			optimized = this.truncateText(optimized, this.LIMITS.EMBED_TITLE_MAX - 3) + "...";
		}

		return optimized;
	}

	/**
	 * Optimizes embed description with better formatting
	 */
	private static optimizeDescription(description: string): string {
		if (!description) return "";

		let optimized = description;

		// Enhance markdown and formatting
		optimized = this.enhanceMarkdown(optimized);
		optimized = this.optimizeLineBreaks(optimized);

		// Truncate if too long
		if (optimized.length > this.LIMITS.EMBED_DESCRIPTION_MAX) {
			optimized = this.truncateText(optimized, this.LIMITS.EMBED_DESCRIPTION_MAX - 3) + "...";
		}

		return optimized;
	}

	/**
	 * Optimizes field value with better formatting
	 */
	private static optimizeFieldValue(value: string): string {
		if (!value) return "N/A";

		let optimized = value;

		// Enhance markdown
		optimized = this.enhanceMarkdown(optimized);

		// Truncate if too long
		if (optimized.length > this.LIMITS.EMBED_FIELD_VALUE_MAX) {
			optimized = this.truncateText(optimized, this.LIMITS.EMBED_FIELD_VALUE_MAX - 3) + "...";
		}

		return optimized;
	}

	/**
	 * Adds contextual emojis to embed titles for better visual appeal
	 */
	private static addTitleEmojis(title: string): string {
		// Only add emojis in development or if explicitly enabled
		if (config.nodeEnv === "production") {
			return title;
		}

		// Map common actions to emojis
		const emojiMap: Record<string, string> = {
			"created": "🆕",
			"updated": "📝",
			"deleted": "🗑️",
			"removed": "🗑️",
			"comment": "💬",
			"issue": "🎫",
			"project": "📂",
			"team": "👥",
			"user": "👤",
			"cycle": "🔄",
			"label": "🏷️",
		};

		for (const [keyword, emoji] of Object.entries(emojiMap)) {
			if (title.toLowerCase().includes(keyword) && !title.includes(emoji)) {
				return `${emoji} ${title}`;
			}
		}

		return title;
	}

	/**
	 * Enhances markdown formatting for better readability
	 */
	private static enhanceMarkdown(text: string): string {
		let enhanced = text;

		// Clean up excessive whitespace
		enhanced = enhanced.replace(/\s+/g, " ").trim();

		// Improve code block formatting
		enhanced = enhanced.replace(/`([^`]+)`/g, "`$1`"); // Ensure single backticks

		// Improve emphasis formatting
		enhanced = enhanced.replace(/\*\*([^*]+)\*\*/g, "**$1**"); // Bold
		enhanced = enhanced.replace(/\*([^*]+)\*/g, "*$1*"); // Italic

		// Improve link formatting
		enhanced = enhanced.replace(/\[([^\]]+)\]\(([^)]+)\)/g, "[$1]($2)");

		return enhanced;
	}

	/**
	 * Optimizes line breaks for better readability
	 */
	private static optimizeLineBreaks(text: string): string {
		// Remove excessive line breaks (more than 2 consecutive)
		let optimized = text.replace(/\n{3,}/g, "\n\n");

		// Ensure proper spacing around important sections
		optimized = optimized.replace(/([.!?])\n([A-Z])/g, "$1\n\n$2");

		return optimized.trim();
	}

	/**
	 * Truncates text intelligently at word boundaries when possible
	 */
	private static truncateText(text: string, maxLength: number): string {
		if (text.length <= maxLength) {
			return text;
		}

		// Try to truncate at word boundary
		const truncated = text.substring(0, maxLength);
		const lastSpace = truncated.lastIndexOf(" ");
		const lastNewline = truncated.lastIndexOf("\n");
		
		// Use the latest boundary (space or newline)
		const boundary = Math.max(lastSpace, lastNewline);
		
		if (boundary > maxLength * 0.8) { // If boundary is reasonably close to limit
			return text.substring(0, boundary);
		}

		// Otherwise, just truncate at character limit
		return truncated;
	}

	/**
	 * Ensures total embed size is within Discord limits
	 */
	private static ensureTotalEmbedSize(embeds: DiscordEmbed[]): DiscordEmbed[] {
		let totalSize = 0;
		const optimizedEmbeds: DiscordEmbed[] = [];

		for (const embed of embeds) {
			const embedSize = this.calculateEmbedSize(embed);
			
			if (totalSize + embedSize <= this.LIMITS.EMBED_TOTAL_MAX) {
				optimizedEmbeds.push(embed);
				totalSize += embedSize;
			} else {
				// Try to fit a smaller version of the embed
				const reducedEmbed = this.reduceEmbedSize(embed, this.LIMITS.EMBED_TOTAL_MAX - totalSize);
				if (reducedEmbed) {
					optimizedEmbeds.push(reducedEmbed);
				}
				break; // Stop adding more embeds
			}
		}

		return optimizedEmbeds;
	}

	/**
	 * Calculates the approximate size of an embed in characters
	 */
	private static calculateEmbedSize(embed: DiscordEmbed): number {
		let size = 0;

		size += embed.title?.length || 0;
		size += embed.description?.length || 0;
		size += embed.footer?.text?.length || 0;

		if (embed.fields) {
			for (const field of embed.fields) {
				size += field.name?.length || 0;
				size += field.value?.length || 0;
			}
		}

		return size;
	}

	/**
	 * Reduces embed size to fit within a size limit
	 */
	private static reduceEmbedSize(embed: DiscordEmbed, maxSize: number): DiscordEmbed | null {
		if (maxSize < 100) return null; // Not enough space for meaningful content

		const reduced: DiscordEmbed = {
			title: embed.title,
			url: embed.url,
			description: embed.description,
			color: embed.color,
			timestamp: embed.timestamp,
			footer: embed.footer,
		};

		// Start by reducing description
		if (reduced.description && reduced.description.length > maxSize * 0.6) {
			reduced.description = this.truncateText(reduced.description, Math.floor(maxSize * 0.6));
		}

		// Then reduce fields
		if (embed.fields) {
			const fieldsSize = Math.floor(maxSize * 0.3);
			const fieldLimit = Math.floor(fieldsSize / Math.max(embed.fields.length, 1));
			
			reduced.fields = embed.fields.slice(0, 5).map(field => ({
				name: this.truncateText(field.name || "", Math.min(fieldLimit / 2, 50)),
				value: this.truncateText(field.value || "", Math.min(fieldLimit, 100)),
				inline: field.inline,
			}));
		}

		// Final check
		const finalSize = this.calculateEmbedSize(reduced);
		return finalSize <= maxSize ? reduced : null;
	}

	/**
	 * Creates a minimal embed for when content needs to be heavily reduced
	 */
	static createMinimalEmbed(title: string, description: string, color: number): DiscordEmbed {
		return {
			title: this.truncateText(title, this.LIMITS.EMBED_TITLE_MAX),
			description: this.truncateText(description, Math.min(this.LIMITS.EMBED_DESCRIPTION_MAX, 500)),
			color: color,
			timestamp: new Date().toISOString(),
		};
	}

	/**
	 * Gets optimization statistics for monitoring
	 */
	static getOptimizationStats(original: DiscordWebhookPayload, optimized: DiscordWebhookPayload): {
		contentReduced: boolean;
		embedsReduced: boolean;
		totalSizeReduction: number;
		originalSize: number;
		optimizedSize: number;
	} {
		const originalSize = this.calculatePayloadSize(original);
		const optimizedSize = this.calculatePayloadSize(optimized);

		return {
			contentReduced: original.content.length > optimized.content.length,
			embedsReduced: original.embeds.length > optimized.embeds.length,
			totalSizeReduction: originalSize - optimizedSize,
			originalSize,
			optimizedSize,
		};
	}

	/**
	 * Calculates total payload size
	 */
	private static calculatePayloadSize(payload: DiscordWebhookPayload): number {
		let size = payload.content.length;
		
		for (const embed of payload.embeds) {
			size += this.calculateEmbedSize(embed);
		}

		return size;
	}
}